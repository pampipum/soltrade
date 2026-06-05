/**
 * Technical Indicator Calculation Engine for SOLtrade
 * v2 — Weighted scoring, percentile context, tighter thresholds
 */

// Helper to convert klines format to usable objects
export function parseKlines(klines) {
  return klines.map(k => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6]
  }));
}

// Calculate Simple Moving Average (SMA)
export function calculateSMA(data, period) {
  if (data.length < period) return null;
  const sma = [];
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  sma[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    sum = sum - data[i - period].close + data[i].close;
    sma[i] = sum / period;
  }
  return sma;
}

// Calculate Wilder's Relative Strength Index (RSI)
export function calculateRSI(data, period = 14) {
  if (data.length <= period) return new Array(data.length).fill(null);
  
  const rsi = new Array(data.length).fill(null);
  const gains = [];
  const losses = [];
  
  for (let i = 1; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  
  // First average gain/loss
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  if (avgLoss === 0) {
    rsi[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    rsi[period] = 100 - 100 / (1 + rs);
  }
  
  // Smoothed averages (Wilder's method)
  for (let i = period + 1; i < data.length; i++) {
    const currentGain = gains[i - 1];
    const currentLoss = losses[i - 1];
    
    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
    
    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - 100 / (1 + rs);
    }
  }
  
  return rsi;
}

// Calculate Average True Range (ATR) for dynamic thresholds
export function calculateATR(data, period = 14) {
  if (data.length < period + 1) return null;
  const trValues = [];
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trValues.push(tr);
  }
  // Wilder smoothing for ATR
  let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
  }
  return atr;
}

/**
 * Rank a value within a history array (ascending). Returns 0–100 percentile.
 * A return of 5 means "only 5% of historical values are lower than current."
 */
export function calculatePercentile(value, history) {
  if (!history || history.length === 0) return null;
  const validHistory = history.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (validHistory.length === 0) return null;
  const below = validHistory.filter(v => v < value).length;
  return Math.round((below / validHistory.length) * 100);
}

// Detect Reversal Candle Pattern
export function detectReversalCandle(candle) {
  if (!candle) return { isReversal: false, type: 'None', detail: 'No candle data' };
  
  const bodySize = Math.abs(candle.close - candle.open);
  const totalSize = candle.high - candle.low;
  
  if (totalSize === 0) return { isReversal: false, type: 'None', detail: 'Doji / No action' };
  
  const upperShadow = candle.high - Math.max(candle.close, candle.open);
  const lowerShadow = Math.min(candle.close, candle.open) - candle.low;
  const bodyPercentage = bodySize / totalSize;
  
  // Bullish Hammer: small body, long lower shadow (at least 2x body), little/no upper shadow
  const isHammer = lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5 && bodyPercentage < 0.35;
  if (isHammer) {
    return {
      isReversal: true,
      type: 'Bullish Hammer',
      detail: `Long lower wick (${Math.round(lowerShadow / totalSize * 100)}% of candle)`
    };
  }
  
  // Bullish Marubozu / strong green candle with >60% body
  const isStrongGreen = candle.close > candle.open && bodyPercentage > 0.6;
  if (isStrongGreen) {
    return {
      isReversal: true,
      type: 'Bullish Marubozu / Strong Green',
      detail: `Strong green body (${Math.round(bodyPercentage * 100)}% body)`
    };
  }
  
  // Large red candle — bearish continuation
  if (candle.close < candle.open && bodyPercentage > 0.8) {
    return {
      isReversal: false,
      type: 'None',
      detail: `Strong red candle (${Math.round(bodyPercentage * 100)}% body) - Bearish continuation`
    };
  }
  
  return {
    isReversal: false,
    type: 'None',
    detail: 'No reversal candle pattern detected'
  };
}

// Check Bullish RSI Divergence: Price hits lower low, but RSI hits higher low
export function detectBullishDivergence(data, rsiValues) {
  if (data.length < 15 || rsiValues.length < 15) return { active: false, detail: 'Insufficient data' };
  
  const n = data.length;
  const currentPrice = data[n - 1].close;
  const currentRSI = rsiValues[n - 1];
  
  if (currentRSI === null) return { active: false, detail: 'RSI not calculated' };
  
  // Find a prior swing low between t-15 and t-3
  let lowestPriceIndex = -1;
  let lowestPrice = Infinity;
  
  for (let i = n - 15; i < n - 3; i++) {
    if (data[i].close < lowestPrice) {
      lowestPrice = data[i].close;
      lowestPriceIndex = i;
    }
  }
  
  if (lowestPriceIndex !== -1) {
    const priorPrice = data[lowestPriceIndex].close;
    const priorRSI = rsiValues[lowestPriceIndex];
    
    if (priorRSI !== null) {
      const isPriceLower = currentPrice < priorPrice;
      const isRSIHigher = currentRSI > priorRSI;
      
      if (isPriceLower && isRSIHigher) {
        return {
          active: true,
          detail: `Bullish Divergence: Price lower ($${currentPrice.toFixed(2)} vs $${priorPrice.toFixed(2)}), RSI higher (${currentRSI.toFixed(1)} vs ${priorRSI.toFixed(1)})`
        };
      } else if (!isPriceLower && !isRSIHigher) {
        return {
          active: false,
          detail: `No divergence: Price higher ($${currentPrice.toFixed(2)} vs $${priorPrice.toFixed(2)}) and RSI higher (${currentRSI.toFixed(1)} vs ${priorRSI.toFixed(1)})`
        };
      } else {
        return {
          active: false,
          detail: `Price and RSI moving in sync ($${currentPrice.toFixed(2)} vs $${priorPrice.toFixed(2)}, RSI ${currentRSI.toFixed(1)} vs ${priorRSI.toFixed(1)})`
        };
      }
    }
  }
  
  return { active: false, detail: 'No clear swing lows' };
}

// Detect liquidity sweep (very long lower shadow)
export function detectLiquiditySweep(candle) {
  if (!candle) return { active: false, detail: 'No candle data' };
  const body = Math.abs(candle.close - candle.open);
  const lowerShadow = Math.min(candle.close, candle.open) - candle.low;
  
  const totalRange = candle.high - candle.low;
  if (totalRange === 0) return { active: false, detail: 'No range' };
  
  const isSweep = lowerShadow >= body * 2.5 || (body < 0.1 && lowerShadow > totalRange * 0.6);
  
  if (isSweep) {
    return {
      active: true,
      detail: `Wicked to $${candle.low.toFixed(2)} (${Math.round(lowerShadow / totalRange * 100)}% lower shadow)`
    };
  }
  
  return {
    active: false,
    detail: `Wick too short (${Math.round(lowerShadow / totalRange * 100)}% shadow)`
  };
}

// Calculate forward returns after a signal
export function calculateForwardReturns(data, rsiValues, currentRSI) {
  if (!data || data.length === 0 || !rsiValues || rsiValues.length === 0) {
    return { bulls: null, bears: null, bullThreshold: currentRSI, bearThreshold: 100 - currentRSI };
  }
  
  // If current RSI is extremely low (e.g., 18), we clamp the threshold to 30 to ensure a valid historical sample.
  const bullThreshold = Math.max(currentRSI, 30);
  const bearThreshold = Math.min(100 - currentRSI, 70);
  
  const forwardPeriods = [
    { label: '3m', days: 90 },
    { label: '6m', days: 180 },
    { label: '9m', days: 270 },
    { label: '12m', days: 365 }
  ];

  const getMetrics = (isBull) => {
    const results = {};
    forwardPeriods.forEach(p => {
      results[p.label] = { gains: [], losses: [] };
    });

    for (let i = 0; i < data.length; i++) {
      const rsi = rsiValues[i];
      if (rsi === null) continue;

      const isMatch = isBull ? (rsi <= bullThreshold) : (rsi >= bearThreshold);
      if (!isMatch) continue;

      const basePrice = data[i].close;
      if (basePrice <= 0) continue;

      forwardPeriods.forEach(p => {
        if (i + p.days < data.length) {
          const futurePrice = data[i + p.days].close;
          const returnPct = ((futurePrice - basePrice) / basePrice) * 100;
          if (returnPct >= 0) {
            results[p.label].gains.push(returnPct);
          } else {
            results[p.label].losses.push(returnPct);
          }
        }
      });
    }

    const aggregated = {};
    forwardPeriods.forEach(p => {
      const g = results[p.label].gains;
      const l = results[p.label].losses;
      aggregated[p.label] = {
        avgGain: g.length > 0 ? g.reduce((a, b) => a + b, 0) / g.length : null,
        avgLoss: l.length > 0 ? l.reduce((a, b) => a + b, 0) / l.length : null,
        count: g.length + l.length
      };
    });

    return aggregated;
  };

  return {
    bulls: getMetrics(true),
    bears: getMetrics(false),
    bullThreshold,
    bearThreshold
  };
}


// Calculate the full dashboard state (v2 — weighted scoring + percentile context)
export function getDashboardState(
  dailyKlines,
  fourHourKlines,
  futuresPremiumIndex = null,
  openInterestHist = null,
  btcKlines = null
) {
  if (!dailyKlines || dailyKlines.length < 200) return null;
  
  const daily = parseKlines(dailyKlines);
  const len = daily.length;
  
  // Current values
  const currentPrice = daily[len - 1].close;
  const currentVolume = daily[len - 1].volume;
  
  // SMAs
  const ma20List = calculateSMA(daily, 20);
  const ma50List = calculateSMA(daily, 50);
  const ma200List = calculateSMA(daily, 200);
  
  const ma20 = ma20List[len - 1];
  const ma50 = ma50List[len - 1];
  const ma200 = ma200List[len - 1];
  
  // RSI
  const rsiList = calculateRSI(daily, 14);
  const currentRSI = rsiList[len - 1];
  const prevRSI = rsiList[len - 2];
  
  // ATR-14 for dynamic threshold
  const atr14 = calculateATR(daily, 14);

  // 14-day Low (excluding current candle)
  const last14dDaily = daily.slice(len - 15, len - 1);
  const low14d = Math.min(...last14dDaily.map(d => d.low));
  
  // Dynamic higher low threshold: 14d low + 0.5 ATR buffer
  const dynamicHigherLowThreshold = atr14 ? low14d + (atr14 * 0.5) : low14d;

  // Volume ratio
  const last30dDaily = daily.slice(len - 31, len - 1);
  const avg30dVolume = last30dDaily.reduce((acc, d) => acc + d.volume, 0) / 30;
  const volumeRatio = currentVolume / avg30dVolume;
  const volumeNeeded = avg30dVolume * 1.5;
  
  // Reversal Candle & Liquidity Sweep
  const reversalCandleCheck = detectReversalCandle(daily[len - 1]);
  const sweepCheck = detectLiquiditySweep(daily[len - 1]);
  const prevSweepCheck = detectLiquiditySweep(daily[len - 2]);
  
  const isLiquiditySweep = sweepCheck.active || prevSweepCheck.active;
  const liquiditySweepDetail = sweepCheck.active 
    ? sweepCheck.detail 
    : (prevSweepCheck.active ? `Yesterday: ${prevSweepCheck.detail}` : 'Wicks are short');
  
  // Bullish RSI Divergence
  const bullishDivergenceCheck = detectBullishDivergence(daily, rsiList);

  // --- PERCENTILE CONTEXT (rolling 252-day window) ---
  const historyWindow = Math.min(len, 252);
  const rsiHistory = rsiList.slice(len - historyWindow, len - 1).filter(v => v !== null);
  const rsiPercentile = calculatePercentile(currentRSI, rsiHistory);
  
  // MA200 distance history
  const ma200DistHistory = [];
  for (let i = len - historyWindow; i < len - 1; i++) {
    if (ma200List[i] && ma200List[i] > 0) {
      ma200DistHistory.push(((daily[i].close - ma200List[i]) / ma200List[i]) * 100);
    }
  }
  const ma200Distance = ((currentPrice - ma200) / ma200) * 100;
  const ma200DistPercentile = calculatePercentile(ma200Distance, ma200DistHistory);

  // Drawdown from 300-day high (cycle context)
  const lookbackHigh = Math.max(...daily.slice(0, len - 1).map(d => d.high));
  const drawdownFromHigh = ((currentPrice - lookbackHigh) / lookbackHigh) * 100;

  // --- DERIVATIVES ---
  // 1. Funding Rate — requires extreme reading, not just any negative value
  let fundingRate = null;
  if (futuresPremiumIndex && futuresPremiumIndex.lastFundingRate !== undefined) {
    fundingRate = parseFloat(futuresPremiumIndex.lastFundingRate) * 100;
  }
  const isFundingExtreme = fundingRate !== null && fundingRate < -0.01; // -0.01% is meaningful extreme

  // 2. OI Drawdown + directional context (price held on flush day)
  let oiChangePct = null;
  let maxOI = 0;
  let currentOI = 0;
  let oiFlushDayPriceHeld = false;
  if (openInterestHist && Array.isArray(openInterestHist) && openInterestHist.length > 0) {
    // Sort by timestamp ascending
    const sortedOI = [...openInterestHist].sort((a, b) => a.timestamp - b.timestamp);
    const oiValues = sortedOI.map(o => parseFloat(o.sumOpenInterest)).filter(v => !isNaN(v));
    if (oiValues.length > 0) {
      maxOI = Math.max(...oiValues);
      currentOI = oiValues[oiValues.length - 1];
      oiChangePct = maxOI > 0 ? ((currentOI - maxOI) / maxOI) * 100 : 0;
      
      // Check if price held on the day of max OI (i.e., when the flush happened)
      // Proxy: check if yesterday and today's closes are >= opens (price holding)
      const prevCandle = daily[len - 2];
      const currCandle = daily[len - 1];
      oiFlushDayPriceHeld = (currCandle.close >= currCandle.open) || (prevCandle.close >= prevCandle.open);
    }
  }
  
  const isOIFlush = oiChangePct !== null && oiChangePct <= -15 && oiFlushDayPriceHeld;
  const oiFlushDetail = oiChangePct !== null
    ? `${oiChangePct.toFixed(1)}% from peak (${(currentOI/1e6).toFixed(0)}M vs ${(maxOI/1e6).toFixed(0)}M peak)${oiChangePct <= -15 && !oiFlushDayPriceHeld ? ' — price not holding' : ''}`
    : 'Offline (CORS)';

  // 3. BTC 4H Trend
  let btcPrice = 0;
  let btcMA20 = 0;
  let isBtcTrendBullish = false;
  if (btcKlines && Array.isArray(btcKlines) && btcKlines.length >= 20) {
    const btcParsed = parseKlines(btcKlines);
    const btcMA20List = calculateSMA(btcParsed, 20);
    if (btcMA20List && btcMA20List.length > 0) {
      btcPrice = btcParsed[btcParsed.length - 1].close;
      btcMA20 = btcMA20List[btcMA20List.length - 1];
      isBtcTrendBullish = btcPrice > btcMA20;
    }
  }

  // RSI at historical extreme (below 15th percentile of own 252-day history)
  const isRSIAtHistoricExtreme = rsiPercentile !== null && rsiPercentile <= 15;

  // --- CHECKLIST (keeps backward compat, items now reference updated logic) ---
  const checklist = {
    priceAboveMA20: {
      id: 'a',
      title: 'Price above MA20',
      active: currentPrice > ma20,
      detail: `$${currentPrice.toFixed(2)} vs $${ma20.toFixed(2)}`,
      cluster: 'trend'
    },
    rsiCrossedAbove30: {
      id: 'b',
      title: 'RSI crossed above 30',
      active: currentRSI > 30 && prevRSI <= 30,
      detail: `${currentRSI?.toFixed(1) || 'N/A'} (prev ${prevRSI?.toFixed(1) || 'N/A'})`,
      cluster: 'momentum'
    },
    higherLow: {
      id: 'c',
      title: `Higher low (dynamic: $${dynamicHigherLowThreshold.toFixed(2)}+)`,
      active: currentPrice >= dynamicHigherLowThreshold,
      detail: `$${currentPrice.toFixed(2)} vs floor $${dynamicHigherLowThreshold.toFixed(2)} (14d low + 0.5 ATR)`,
      cluster: 'trend'
    },
    volumeCapitulation: {
      id: 'd',
      title: 'Volume capitulation',
      active: volumeRatio >= 1.5 && daily[len - 1].close > daily[len - 1].open,
      detail: `${(currentVolume/1e6).toFixed(1)}M vs ${(volumeNeeded/1e6).toFixed(1)}M needed (${volumeRatio.toFixed(2)}x)`,
      cluster: 'candle'
    },
    bullishDivergence: {
      id: 'e',
      title: 'Bullish RSI divergence',
      active: bullishDivergenceCheck.active,
      detail: bullishDivergenceCheck.detail,
      cluster: 'candle'
    },
    reversalCandle: {
      id: 'f',
      title: 'Reversal candle / Wick sweep',
      active: reversalCandleCheck.isReversal || isLiquiditySweep,
      detail: reversalCandleCheck.isReversal ? reversalCandleCheck.detail : liquiditySweepDetail,
      cluster: 'candle'
    },
    leverageFlush: {
      id: 'g',
      title: 'Leverage Flush (OI Drawdown + price hold)',
      active: isOIFlush,
      detail: oiFlushDetail,
      cluster: 'derivatives'
    },
    negativeFunding: {
      id: 'h',
      title: 'Short Crowding (Funding < -0.01%)',
      active: isFundingExtreme,
      detail: fundingRate !== null ? `${fundingRate.toFixed(4)}% (threshold: -0.01%)` : 'Offline (CORS)',
      cluster: 'derivatives'
    },
    btcTrendSupport: {
      id: 'i',
      title: 'BTC 4H Trend Support',
      active: isBtcTrendBullish,
      detail: `BTC $${(btcPrice/1e3).toFixed(1)}k vs MA20 $${(btcMA20/1e3).toFixed(1)}k`,
      cluster: 'macro'
    }
  };

  // --- WEIGHTED SCORE ENGINE ---
  const scoreBreakdown = {
    macro: {
      label: 'Macro Regime',
      max: 25,
      earned: isBtcTrendBullish ? 25 : 0
    },
    derivatives: {
      label: 'Derivatives',
      max: 25,
      earned: (isOIFlush ? 15 : 0) + (isFundingExtreme ? 10 : 0)
    },
    trend: {
      label: 'Trend Structure',
      max: 20,
      earned:
        (currentPrice > ma20 ? 8 : 0) +
        (currentPrice > ma50 ? 7 : 0) +
        (ma20 > ma50 ? 5 : 0)
    },
    momentum: {
      label: 'RSI Momentum',
      max: 15,
      earned:
        (currentRSI > 30 && prevRSI <= 30 ? 8 : 0) +
        (isRSIAtHistoricExtreme ? 7 : 0)
    },
    candle: {
      label: 'Candle / Volume',
      max: 15,
      earned:
        (volumeRatio >= 1.5 && daily[len - 1].close > daily[len - 1].open ? 7 : 0) +
        (reversalCandleCheck.isReversal || isLiquiditySweep ? 5 : 0) +
        (bullishDivergenceCheck.active ? 3 : 0)
    }
  };

  const weightedScore = Object.values(scoreBreakdown).reduce((acc, c) => acc + c.earned, 0);

  const bearSignals = {
    priceBelowMA50: {
      title: 'Price below MA50',
      active: currentPrice < ma50
    },
    priceBelowMA200: {
      title: 'Price below MA200',
      active: currentPrice < ma200
    },
    ma20BelowMA50: {
      title: 'MA20 below MA50',
      active: ma20 < ma50
    },
    ma50BelowMA200: {
      title: 'MA50 below MA200',
      active: ma50 < ma200
    }
  };
  
  // 4h momentum
  let fourHourState = null;
  if (fourHourKlines && fourHourKlines.length >= 20) {
    const fh = parseKlines(fourHourKlines);
    const fhLen = fh.length;
    const fhRsiList = calculateRSI(fh, 14);
    const fhRsi = fhRsiList[fhLen - 1];
    const fhMa20List = calculateSMA(fh, 20);
    const fhMa20 = fhMa20List[fhLen - 1];
    const fhPrice = fh[fhLen - 1].close;
    fourHourState = {
      rsi: fhRsi,
      vsMA20: fhPrice > fhMa20 ? 'above' : 'below',
      ma20: fhMa20,
      price: fhPrice
    };
  }

  const forwardReturns = calculateForwardReturns(daily, rsiList, currentRSI);

  return {
    price: currentPrice,
    volume: currentVolume,
    rsi: currentRSI,
    ma20,
    ma50,
    ma200,
    ma200Distance,
    low14d,
    dynamicHigherLowThreshold,
    volumeRatio,
    fundingRate,
    openInterest: currentOI,
    openInterestDrawdown: oiChangePct,
    btcPrice,
    btcMA20,
    isBtcTrendBullish,
    checklist,
    bearSignals,
    fourHour: fourHourState,
    forwardReturns,
    // Weighted scoring
    weightedScore,
    scoreBreakdown,
    // Percentile context
    rsiPercentile,
    ma200DistPercentile,
    drawdownFromHigh,
    isRSIAtHistoricExtreme,
    // Raw data for chart rendering
    rawDaily: daily,
    rawRsiList: rsiList,
    rawMA20List: ma20List,
    rawMA50List: ma50List,
    rawMA200List: ma200List
  };
}
