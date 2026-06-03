/**
 * Technical Indicator Calculation Engine for SOLtrade
 */

// Helper to convert Binance klines format to usable objects
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
  
  // Smoothed averages
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

// Detect Reversal Candle Pattern
// Returns { isReversal: boolean, type: string, detail: string }
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
  
  // Bullish Engulfing or simple strong green candle with >60% body
  const isStrongGreen = candle.close > candle.open && bodyPercentage > 0.6;
  if (isStrongGreen) {
    return {
      isReversal: true,
      type: 'Bullish Marubozu / Strong Green',
      detail: `Strong green body (${Math.round(bodyPercentage * 100)}% body)`
    };
  }
  
  // Large red candle (as described in the report)
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
  
  // Look back at recent price lows (last 10 days) and check if they correspond to higher RSI values
  const n = data.length;
  const currentPrice = data[n - 1].close;
  const currentRSI = rsiValues[n - 1];
  
  if (currentRSI === null) return { active: false, detail: 'RSI not calculated' };
  
  // Let's find local lows in the last 15 days
  let lowestPriceIndex = -1;
  let lowestPrice = Infinity;
  
  // Find a prior low between index n-15 and n-3 (a few days ago)
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
      // Divergence: currentPrice is lower than priorPrice, but currentRSI is higher than priorRSI
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
          detail: `No divergence: Price is higher ($${currentPrice.toFixed(2)} vs $${priorPrice.toFixed(2)}) and RSI is higher (${currentRSI.toFixed(1)} vs ${priorRSI.toFixed(1)})`
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

// Calculate the full dashboard state
export function getDashboardState(dailyKlines, fourHourKlines, higherLowThreshold = 76.73) {
  if (!dailyKlines || dailyKlines.length < 200) return null;
  
  const daily = parseKlines(dailyKlines);
  const dailyCloses = daily.map(d => d.close);
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
  
  // 14-day Low (excluding current candle to check true historical low threshold)
  const last14dDaily = daily.slice(len - 15, len - 1);
  const low14d = Math.min(...last14dDaily.map(d => d.low));
  
  // Volume ratio
  const last30dDaily = daily.slice(len - 31, len - 1);
  const avg30dVolume = last30dDaily.reduce((acc, d) => acc + d.volume, 0) / 30;
  const volumeRatio = currentVolume / avg30dVolume;
  const volumeNeeded = avg30dVolume * 1.5;
  
  // Reversal Candle
  const reversalCandleCheck = detectReversalCandle(daily[len - 1]);
  
  // Bullish RSI Divergence
  const bullishDivergenceCheck = detectBullishDivergence(daily, rsiList);
  
  // Checklist evaluations
  const checklist = {
    priceAboveMA20: {
      id: 'a',
      title: 'Price above MA20',
      active: currentPrice > ma20,
      detail: `$${currentPrice.toFixed(2)} vs $${ma20.toFixed(2)}`
    },
    rsiCrossedAbove30: {
      id: 'b',
      title: 'RSI crossed above 30',
      // Check if RSI is above 30 and recently crossed it or turning up
      active: currentRSI > 30 && prevRSI <= 30,
      detail: `${currentRSI?.toFixed(1) || 'N/A'} (prev ${prevRSI?.toFixed(1) || 'N/A'})`
    },
    higherLow: {
      id: 'c',
      title: `Higher low ($${higherLowThreshold.toFixed(2)}+)`,
      active: currentPrice >= higherLowThreshold,
      detail: `$${currentPrice.toFixed(2)} vs threshold $${higherLowThreshold.toFixed(2)}`
    },
    volumeCapitulation: {
      id: 'd',
      title: 'Volume capitulation',
      // Volume > 1.5x of 30d avg on a green candle or massive volume
      active: volumeRatio >= 1.5 && daily[len - 1].close > daily[len - 1].open,
      detail: `${(currentVolume/1e6).toFixed(1)}M vs ${(volumeNeeded/1e6).toFixed(1)}M needed (${volumeRatio.toFixed(2)}x)`
    },
    bullishDivergence: {
      id: 'e',
      title: 'Bullish RSI divergence',
      active: bullishDivergenceCheck.active,
      detail: bullishDivergenceCheck.detail
    },
    reversalCandle: {
      id: 'f',
      title: 'Reversal candle',
      active: reversalCandleCheck.isReversal,
      detail: reversalCandleCheck.detail
    }
  };

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
  
  // Calculate 4h momentum if available
  let fourHourState = null;
  if (fourHourKlines && fourHourKlines.length >= 20) {
    const fh = parseKlines(fourHourKlines);
    const fhCloses = fh.map(k => k.close);
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

  // Under MA200 distance
  const ma200Distance = ((currentPrice - ma200) / ma200) * 100;
  
  return {
    price: currentPrice,
    volume: currentVolume,
    rsi: currentRSI,
    ma20,
    ma50,
    ma200,
    ma200Distance,
    low14d,
    volumeRatio,
    checklist,
    bearSignals,
    fourHour: fourHourState,
    rawDaily: daily,
    rawRsiList: rsiList,
    rawMA20List: ma20List,
    rawMA50List: ma50List,
    rawMA200List: ma200List
  };
}
