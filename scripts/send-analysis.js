import 'dotenv/config';
import nodemailer from 'nodemailer';
import { marked } from 'marked';
import { getDashboardState } from '../src/utils/indicators.js';

// Verify environment variables are present
if (!process.env.DEEPSEEK_API_KEY) {
  console.error('Error: DEEPSEEK_API_KEY is missing in the .env file.');
  process.exit(1);
}
if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.EMAIL_TO) {
  console.error('Error: SMTP user, pass, or recipient email is missing in the .env file.');
  process.exit(1);
}

async function fetchMarketData() {
  console.log('Fetching live spot and futures feeds from Bybit...');
  
  const rawUrls = {
    dailyRes: 'https://api.bybit.com/v5/market/kline?category=spot&symbol=SOLUSDT&interval=D&limit=300',
    fourHourRes: 'https://api.bybit.com/v5/market/kline?category=spot&symbol=SOLUSDT&interval=240&limit=300',
    btcRes: 'https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=240&limit=50',
    fundingRes: 'https://api.bybit.com/v5/market/funding/history?category=linear&symbol=SOLUSDT&limit=1',
    oiRes: 'https://api.bybit.com/v5/market/open-interest?category=linear&symbol=SOLUSDT&intervalTime=1h&limit=48'
  };

  const results = {};
  for (const [key, url] of Object.entries(rawUrls)) {
    try {
      const res = await fetch(url);
      results[key] = {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        url
      };
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        results[key].body = bodyText.slice(0, 300);
      } else {
        results[key].data = await res.json();
      }
    } catch (err) {
      results[key] = {
        ok: false,
        error: err.message,
        url
      };
    }
  }

  const failed = Object.entries(results).filter(([_, info]) => !info.ok);
  if (failed.length > 0) {
    console.error('--- API FETCH DIAGNOSTICS ---');
    for (const [key, info] of Object.entries(results)) {
      console.error(`- ${key}: ok=${info.ok}, status=${info.status || 'N/A'}, err=${info.error || 'None'}, body=${info.body || 'N/A'}`);
    }
    console.error('-----------------------------');
    throw new Error('Failed to retrieve market data from public exchange REST nodes.');
  }

  const bybitDaily = results.dailyRes.data;
  const bybitFourHour = results.fourHourRes.data;
  const bybitBtc = results.btcRes.data;
  const bybitFunding = results.fundingRes.data;
  const bybitOI = results.oiRes.data;

  // Map Bybit spot klines to Binance format: [openTime, open, high, low, close, volume, closeTime]
  // Reversing is REQUIRED because Bybit returns newest first, whereas our math engine expects oldest first (chronological).
  const dailyKlines = [...bybitDaily.result.list].reverse().map(k => [
    parseInt(k[0]), // open time
    k[1], // open
    k[2], // high
    k[3], // low
    k[4], // close
    k[5], // volume
    parseInt(k[0]) + 86400000 // dummy close time
  ]);

  const fourHourKlines = [...bybitFourHour.result.list].reverse().map(k => [
    parseInt(k[0]),
    k[1],
    k[2],
    k[3],
    k[4],
    k[5],
    parseInt(k[0]) + 14400000
  ]);

  const btcKlines = [...bybitBtc.result.list].reverse().map(k => [
    parseInt(k[0]),
    k[1],
    k[2],
    k[3],
    k[4],
    k[5],
    parseInt(k[0]) + 14400000
  ]);
  
  // Map Bybit futures schemas
  const futuresPremiumIndex = {
    lastFundingRate: bybitFunding.result.list[0]?.fundingRate || '0'
  };
  
  const openInterestHist = [...bybitOI.result.list].reverse().map(item => ({
    sumOpenInterest: item.openInterest,
    timestamp: parseInt(item.timestamp)
  }));

  return {
    dailyKlines,
    fourHourKlines,
    futuresPremiumIndex,
    openInterestHist,
    btcKlines
  };
}

async function generateDeepSeekReport(state) {
  console.log('Calling DeepSeek LLM for subjective investor analysis...');
  
  const activeTriggers = Object.values(state.checklist)
    .filter(item => item.active)
    .map(item => `${item.id}) ${item.title}`);
    
  const activeBearCount = Object.values(state.bearSignals).filter(item => item.active).length;

  const scoreLines = state.scoreBreakdown
    ? Object.values(state.scoreBreakdown)
        .map(c => `  ${c.label}: ${c.earned}/${c.max}pts`)
        .join('\n')
    : 'N/A';

  const promptText = `
You are analyzing the market for a swing trader (holding period: days to weeks). Do NOT recommend scalps, micro-trades, or short-term day trading.

Current SOL & BTC Market Data:
SOL Price: $${state.price.toFixed(2)}
SOL Daily RSI: ${state.rsi.toFixed(1)} (${state.rsiPercentile !== null ? state.rsiPercentile + 'th percentile vs 252-day history' : 'percentile N/A'})
SOL Funding Rate: ${state.fundingRate !== null ? state.fundingRate.toFixed(4) + '%' : 'Offline/CORS'}
SOL OI Drawdown: ${state.openInterestDrawdown !== null ? state.openInterestDrawdown.toFixed(1) + '%' : 'Offline/CORS'}
SOL 14d Low: $${state.low14d.toFixed(2)}
SOL MA200 Distance: ${state.ma200Distance.toFixed(1)}% (${state.ma200DistPercentile !== null ? state.ma200DistPercentile + 'th percentile vs 252-day history' : 'percentile N/A'})
SOL Drawdown from Cycle High: ${state.drawdownFromHigh !== null ? state.drawdownFromHigh.toFixed(1) + '%' : 'N/A'}
BTC Price: $${state.btcPrice.toLocaleString()} (vs 4H MA20 $${state.btcMA20.toLocaleString()})
BTC Trend status is: ${state.isBtcTrendBullish ? 'BULLISH (Above 4H MA20)' : 'BEARISH (Below 4H MA20)'}

Weighted Signal Score: ${state.weightedScore ?? 0}/100
Score Breakdown by Cluster:
${scoreLines}

Active Triggers Checklist: ${activeTriggers.join(', ') || 'None'}
Bear Market moving averages: ${activeBearCount}/4 active (Bearish structure)

Provide a sharp, subjective reading of this setup for a swing trader.
1. Decide on a single, clear recommendation: Buy (for a swing position), Hold/Watch (waiting for setup/trend confirmation), or Stay Out (trend is hostile, risk too high).
2. The recommendation MUST be consistent with the weighted score and macro structure. A score below 50 means Stay Out. A score of 50-74 means Watch. A score of 75+ with BTC bullish means Buy. A score of 75+ without BTC support means Muted/Watch.
3. Explain the logic clearly and concisely, pointing out the BTC correlation state, the funding premium sentiment, the OI cleanup status, and what the RSI and MA200 percentile readings tell you about historical extremity.
4. Swearing is permitted when it lands. Output directly in markdown format.
`;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-v4-pro',
      messages: [
        {
          role: 'system',
          content: 'You are an experienced crypto hedge fund manager writing analysis for a swing trader (holding period: days to weeks). You write sharp, direct, high-conviction analyses. No corporate fluff, no hedging, no scalping recommendations.'
        },
        {
          role: 'user',
          content: promptText
        }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API failed with status ${response.status}: ${errText}`);
  }

  const resJson = await response.json();
  return resJson.choices[0].message.content;
}

async function sendEmail(price, btcPrice, reportText) {
  console.log(`Sending email analysis report to ${process.env.EMAIL_TO}...`);
  
  // Parse raw DeepSeek markdown to HTML tags
  const htmlReport = marked(reportText);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_PORT === '465', // true for port 465, false for port 587/others
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: `"SOLtrade Intel" <${process.env.SMTP_USER}>`,
    to: process.env.EMAIL_TO,
    subject: `SOLtrade AI Alert — SOL $${price.toFixed(2)} (BTC $${(btcPrice/1000).toFixed(1)}k)`,
    text: reportText,
    html: `
      <html>
        <head>
          <style>
            body { background-color: #030308; margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            h1, h2, h3, h4 { color: #8c52ff !important; font-weight: 700; margin-top: 22px; margin-bottom: 10px; }
            h3 { font-size: 18px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px; }
            strong { color: #ffffff !important; font-weight: 600; }
            p { margin-bottom: 15px; line-height: 1.6; color: #cbd5e1; font-size: 15px; }
            ul, ol { padding-left: 20px; margin-bottom: 15px; color: #cbd5e1; }
            li { margin-bottom: 8px; line-height: 1.5; font-size: 14.5px; }
            code { background-color: rgba(255,255,255,0.06); padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 13px; color: #00f0ff; }
          </style>
        </head>
        <body>
          <div style="background-color: #080710; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; max-width: 600px; margin: 0 auto; padding: 25px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
            <div style="border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 15px; margin-bottom: 20px;">
              <h2 style="color: #8c52ff; font-weight: 800; margin: 0; font-size: 22px; letter-spacing: -0.02em;">SOLtrade <span style="color: #00f0ff; font-weight: 400;">AI Analysis</span></h2>
            </div>
            <div class="report-content">
              ${htmlReport}
            </div>
            <div style="font-size: 11px; color: #475569; margin-top: 30px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 15px; text-align: center; font-family: monospace;">
              SOL/USDT: $${price.toFixed(2)} | BTC/USDT: $${btcPrice.toLocaleString()} | Live Connection Status: Connected 🟢
            </div>
          </div>
        </body>
      </html>
    `
  };

  await transporter.sendMail(mailOptions);
  console.log('Email sent successfully!');
}

async function main() {
  try {
    const rawData = await fetchMarketData();
    const state = getDashboardState(
      rawData.dailyKlines,
      rawData.fourHourKlines,
      rawData.futuresPremiumIndex,
      rawData.openInterestHist,
      rawData.btcKlines
    );

    if (!state) {
      throw new Error('Failed to evaluate indicators from the fetched datasets.');
    }

    const report = await generateDeepSeekReport(state);
    await sendEmail(state.price, state.btcPrice, report);
    
    console.log('\n--- DEEPSEEK ANALYSIS REPORT ---');
    console.log(report);
    console.log('--------------------------------\n');
  } catch (err) {
    console.error('Execution failed:', err);
    process.exit(1);
  }
}

main();
