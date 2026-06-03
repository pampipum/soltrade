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
  console.log('Fetching live spot and futures feeds from Binance.US and Bybit...');
  
  // Since GitHub Actions runners are blocked by fapi.binance.com and api.binance.com firewalls,
  // we fetch spot candles from Binance.US and derivatives data from Bybit.
  // Both support cloud-IP requests natively and require no API keys or proxies.
  const [dailyRes, fourHourRes, btcRes, fundingRes, oiRes] = await Promise.all([
    fetch('https://api.binance.us/api/v3/klines?symbol=SOLUSDT&interval=1d&limit=300'),
    fetch('https://api.binance.us/api/v3/klines?symbol=SOLUSDT&interval=4h&limit=300'),
    fetch('https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=50'),
    fetch('https://api.bybit.com/v5/market/funding/history?category=linear&symbol=SOLUSDT&limit=1'),
    fetch('https://api.bybit.com/v5/market/open-interest?category=linear&symbol=SOLUSDT&intervalTime=1h&limit=48')
  ]);

  if (!dailyRes.ok || !fourHourRes.ok || !btcRes.ok || !fundingRes.ok || !oiRes.ok) {
    throw new Error('Failed to retrieve market data from public exchange REST nodes.');
  }

  const dailyData = await dailyRes.json();
  const fourHourData = await fourHourRes.json();
  const btcData = await btcRes.json();
  
  const bybitFunding = await fundingRes.json();
  const bybitOI = await oiRes.json();
  
  // Map Bybit to Binance schemas
  const futuresPremiumIndex = {
    lastFundingRate: bybitFunding.result.list[0]?.fundingRate || '0'
  };
  
  // Bybit returns list in reverse order (newest first). Let's reverse it to match Binance (oldest first).
  const openInterestHist = [...bybitOI.result.list].reverse().map(item => ({
    sumOpenInterest: item.openInterest,
    timestamp: parseInt(item.timestamp)
  }));

  return {
    dailyKlines: dailyData,
    fourHourKlines: fourHourData,
    futuresPremiumIndex,
    openInterestHist,
    btcKlines: btcData
  };
}

async function generateDeepSeekReport(state) {
  console.log('Calling DeepSeek LLM for subjective investor analysis...');
  
  const activeTriggers = Object.values(state.checklist)
    .filter(item => item.active)
    .map(item => `${item.id}) ${item.title}`);
    
  const activeBearCount = Object.values(state.bearSignals).filter(item => item.active).length;

  const promptText = `
SOL Price: $${state.price.toFixed(2)}
SOL Daily RSI: ${state.rsi.toFixed(1)}
SOL Funding Rate: ${state.fundingRate !== null ? state.fundingRate.toFixed(4) + '%' : 'Offline/CORS'}
SOL OI Drawdown: ${state.openInterestDrawdown !== null ? state.openInterestDrawdown.toFixed(1) + '%' : 'Offline/CORS'}
SOL 14d Low: $${state.low14d.toFixed(2)}
BTC Price: $${state.btcPrice.toLocaleString()} (vs MA20 $${state.btcMA20.toLocaleString()})
BTC Trend status is: ${state.isBtcTrendBullish ? 'BULLISH (Above 4H MA20)' : 'BEARISH (Below 4H MA20)'}

Active Triggers Checklist: ${activeTriggers.join(', ') || 'None'}
Bear Market moving averages: ${activeBearCount}/4 active (Full Death Cross)

Provide a sharp, subjective reading of the setup as an institutional investor. Pick a side (Buy, Hold/Watch, Stay Out) and explain the logic clearly and concisely. Point out the BTC correlation state, the funding premium sentiment, and the liquidation (OI) cleanup status. Swearing is permitted when it lands. Output directly in markdown format.
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
          content: 'You are an experienced crypto hedge fund manager. You write sharp, direct, high-conviction analyses. No corporate fluff, no hedging.'
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
