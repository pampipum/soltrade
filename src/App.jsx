import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { getDashboardState, parseKlines, calculateRSI, calculateSMA } from './utils/indicators';
import TradingChart from './components/TradingChart';
import TriggerChecklist from './components/TriggerChecklist';
import HistoricalContext from './components/HistoricalContext';
import { RefreshCw, Radio, TrendingDown, ArrowDownRight, ArrowUpRight, Coins } from 'lucide-react';

export default function App() {
  const [dailyKlines, setDailyKlines] = useState([]);
  const [fourHourKlines, setFourHourKlines] = useState([]);
  const [futuresPremiumIndex, setFuturesPremiumIndex] = useState(null);
  const [openInterestHist, setOpenInterestHist] = useState([]);
  const [btcKlines, setBtcKlines] = useState([]);
  const [timeframe, setTimeframe] = useState('1d'); // '1d' or '4h'
  
  const [wsStatus, setWsStatus] = useState('connecting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Track previous price to flash green/red on ticker update
  const [prevPrice, setPrevPrice] = useState(null);
  const [priceFlash, setPriceFlash] = useState(null); // 'up' or 'down' or null
  const flashTimeoutRef = useRef(null);

  // Map WebSocket kline back to Binance REST format
  const mapWsToRestKline = (k) => [
    k.t, // open time
    k.o, // open
    k.h, // high
    k.l, // low
    k.c, // close
    k.v, // volume
    k.T, // close time
    k.q, // asset volume
    k.n, // trades
    k.V, // buy base volume
    k.Q, // buy asset volume
    "0"  // ignored
  ];

  // Helper to update a kline array with fresh WebSocket ticks
  const updateKlinesWithWs = (prev, wsKline) => {
    if (!prev || prev.length === 0) return prev;
    const mapped = mapWsToRestKline(wsKline);
    const updated = [...prev];
    const lastIndex = updated.length - 1;
    
    if (updated[lastIndex][0] === wsKline.t) {
      updated[lastIndex] = mapped; // Update ongoing candle
    } else if (wsKline.t > updated[lastIndex][0]) {
      updated.push(mapped); // New candle opened
      if (updated.length > 300) updated.shift();
    }
    return updated;
  };

  // Fetch initial REST data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Spot data (supports CORS natively and MUST succeed)
      const [dailyRes, fourHourRes, btcRes] = await Promise.all([
        fetch('https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=1d&limit=300'),
        fetch('https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=4h&limit=300'),
        fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=50')
      ]);

      if (!dailyRes.ok || !fourHourRes.ok) {
        throw new Error('Failed to retrieve spot candle data from Binance API.');
      }

      const dailyData = await dailyRes.json();
      const fourHourData = await fourHourRes.json();
      
      let btcData = [];
      if (btcRes && btcRes.ok) {
        btcData = await btcRes.json();
      }

      // 2. Fetch Futures data (blocked by CORS, routed via proxy with absolute try/catch safety)
      let premiumData = null;
      try {
        const premiumRes = await fetch('https://corsproxy.io/?https://fapi.binance.com/fapi/v1/premiumIndex?symbol=SOLUSDT');
        if (premiumRes.ok) {
          premiumData = await premiumRes.json();
        }
      } catch (err) {
        console.warn('CORS or Network block on futures Premium Index:', err);
      }
      
      let oiData = [];
      try {
        const oiRes = await fetch('https://corsproxy.io/?https://fapi.binance.com/futures/data/openInterestHist?symbol=SOLUSDT&period=1h&limit=48');
        if (oiRes.ok) {
          oiData = await oiRes.json();
        }
      } catch (err) {
        console.warn('CORS or Network block on futures Open Interest history:', err);
      }

      setDailyKlines(dailyData);
      setFourHourKlines(fourHourData);
      setFuturesPremiumIndex(premiumData);
      setOpenInterestHist(oiData);
      setBtcKlines(btcData);
      
      const current = parseFloat(dailyData[dailyData.length - 1][4]);
      setPrevPrice(current);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Connection error. Retrying...');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Set up WebSocket listener
  useEffect(() => {
    if (loading || error) return;

    let isMounted = true;
    let ws = null;
    let reconnectTimeout = null;

    const connectWebSocket = () => {
      if (!isMounted) return;
      setWsStatus('connecting');
      ws = new WebSocket('wss://stream.binance.com:9443/stream?streams=solusdt@kline_1d/solusdt@kline_4h');

      ws.onopen = () => {
        if (!isMounted) return;
        setWsStatus('connected');
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        const payload = JSON.parse(event.data);
        const { stream, data } = payload;
        const wsKline = data.k;

        if (stream === 'solusdt@kline_1d') {
          setDailyKlines(prev => {
            const updated = updateKlinesWithWs(prev, wsKline);
            const currentClose = parseFloat(wsKline.c);
            
            // Handle Price flash styling
            setPrevPrice(prevVal => {
              if (prevVal !== null && currentClose !== prevVal) {
                setPriceFlash(currentClose > prevVal ? 'up' : 'down');
                if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
                flashTimeoutRef.current = setTimeout(() => setPriceFlash(null), 400);
              }
              return currentClose;
            });
            
            return updated;
          });
        } else if (stream === 'solusdt@kline_4h') {
          setFourHourKlines(prev => updateKlinesWithWs(prev, wsKline));
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setWsStatus('disconnected');
        reconnectTimeout = setTimeout(connectWebSocket, 5000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (ws) {
        // Remove event handlers before closing to prevent firing events during unmount
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, [loading, error]);

  // Periodic updates for leverage and macro feeds (every 30 seconds)
  useEffect(() => {
    if (loading || error) return;
    
    const pollLeverageFeeds = async () => {
      // 1. Poll spot BTC (native CORS)
      try {
        const btcRes = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=50');
        if (btcRes.ok) {
          const btcData = await btcRes.json();
          setBtcKlines(btcData);
        }
      } catch (err) {
        console.warn('Failed to poll spot BTC feed:', err);
      }

      // 2. Poll futures Premium Index (proxied, fail-safe)
      try {
        const premiumRes = await fetch('https://corsproxy.io/?https://fapi.binance.com/fapi/v1/premiumIndex?symbol=SOLUSDT');
        if (premiumRes.ok) {
          const premiumData = await premiumRes.json();
          setFuturesPremiumIndex(premiumData);
        }
      } catch (err) {
        console.warn('Failed to poll futures Premium Index (CORS/Network):', err);
      }

      // 3. Poll futures Open Interest (proxied, fail-safe)
      try {
        const oiRes = await fetch('https://corsproxy.io/?https://fapi.binance.com/futures/data/openInterestHist?symbol=SOLUSDT&period=1h&limit=48');
        if (oiRes.ok) {
          const oiData = await oiRes.json();
          setOpenInterestHist(oiData);
        }
      } catch (err) {
        console.warn('Failed to poll futures Open Interest (CORS/Network):', err);
      }
    };
    
    const interval = setInterval(pollLeverageFeeds, 30000);
    return () => clearInterval(interval);
  }, [loading, error]);

  // Compute live state
  const dashboardState = getDashboardState(
    dailyKlines,
    fourHourKlines,
    futuresPremiumIndex,
    openInterestHist,
    btcKlines
  );

  if (loading) {
    return (
      <div className="status-screen">
        <div className="loader-ring"></div>
        <p>FETCHING HISTORICAL AND LEVERAGE FEEDS...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="status-screen">
        <div className="error-card">
          <p className="error-text">⚠️ {error}</p>
          <button className="retry-btn" onClick={fetchData}>
            <RefreshCw size={14} /> Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!dashboardState) {
    return (
      <div className="status-screen">
        <p>Crunching technical math models...</p>
      </div>
    );
  }

  const {
    price,
    rsi,
    ma20,
    ma50,
    ma200,
    ma200Distance,
    low14d,
    volumeRatio,
    fundingRate,
    openInterest,
    openInterestDrawdown,
    btcPrice,
    btcMA20,
    isBtcTrendBullish,
    checklist,
    bearSignals,
    fourHour,
    weightedScore,
    scoreBreakdown,
    rsiPercentile,
    ma200DistPercentile,
    drawdownFromHigh,
    rawDaily,
    rawRsiList,
    rawMA20List,
    rawMA50List,
    rawMA200List
  } = dashboardState;

  // Compute 4h indicators for chart view if timeframe is 4h
  const dailyParsed = parseKlines(dailyKlines);
  const fhParsed = parseKlines(fourHourKlines);
  const fhRsiList = calculateRSI(fhParsed, 14);
  const fhMA20List = calculateSMA(fhParsed, 20);
  const fhMA50List = calculateSMA(fhParsed, 50);
  const fhMA200List = calculateSMA(fhParsed, 200);

  const activeCount = Object.values(checklist).filter(item => item.active).length;
  const activeBearCount = Object.values(bearSignals).filter(item => item.active).length;
  const score = weightedScore ?? 0;

  // Recommendation logic — driven by weighted score (0–100)
  let action = {
    class: 'action-red',
    text: 'STAY OUT — Insufficient signal weight',
    desc: `Weighted signal score is ${score}/100. Conditions are not yet favorable for a swing entry. Wait for the score to build across multiple clusters.`
  };

  if (score >= 75) {
    if (isBtcTrendBullish) {
      action = {
        class: 'action-green',
        text: 'BUY / ACCUMULATE — Strong bottoming confirmation',
        desc: `Weighted score: ${score}/100. Multiple clusters are firing with BTC macro support confirmed above 4H MA20. High-conviction swing setup.`
      };
    } else {
      action = {
        class: 'action-yellow',
        text: 'MUTED ACCUMULATION — BTC Bearish Override',
        desc: `Weighted score: ${score}/100. SOL signals are strong but BTC is below 4H MA20 — macro is hostile. Use spot-only, reduce size, or wait for BTC confirmation.`
      };
    }
  } else if (score >= 50) {
    action = {
      class: 'action-yellow',
      text: 'WATCH CLOSELY — Signal building',
      desc: `Weighted score: ${score}/100. Setup is accumulating across clusters but hasn't reached conviction threshold (75+). Monitor derivatives and BTC structure closely.`
    };
  }

  // Calculate 24h percentage change from yesterday's daily close
  const prevDailyClose = rawDaily[rawDaily.length - 2]?.close || price;
  const priceChangePct = ((price - prevDailyClose) / prevDailyClose) * 100;

  return (
    <div className="dashboard-layout">
      {/* HEADER SECTION */}
      <header className="dashboard-header">
        <div className="header-brand">
          <Coins className="icon-purple spin-slow" size={28} />
          <h1>SOL<span>trade</span></h1>
        </div>

        <div className="price-ticker-group">
          <div className="ticker-label">SOL/USDT PRICE</div>
          <div className={`ticker-price font-mono ${priceFlash ? `flash-${priceFlash}` : ''}`}>
            ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={`ticker-change font-mono ${priceChangePct >= 0 ? 'text-green' : 'text-red'}`}>
            {priceChangePct >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {priceChangePct >= 0 ? '+' : ''}{priceChangePct.toFixed(2)}%
          </div>
        </div>

        <div className="status-badges">
          <div className="badge-item">
            <span className="badge-label">BTC Price:</span>
            <span className="badge-val font-mono">
              {btcPrice ? `$${(btcPrice/1000).toFixed(1)}k` : 'Loading...'}
            </span>
          </div>
          <div className="badge-item">
            <span className="badge-label">Funding Rate:</span>
            <span className={`badge-val font-mono ${fundingRate < 0 ? 'text-green' : ''}`}>
              {fundingRate ? `${fundingRate.toFixed(4)}%` : '0.0000%'}
            </span>
          </div>
          <div className="badge-item">
            <span className="badge-label">OI Drawdown:</span>
            <span className={`badge-val font-mono ${openInterestDrawdown <= -15 ? 'text-green' : ''}`}>
              {openInterestDrawdown ? `${openInterestDrawdown.toFixed(1)}%` : '0.0%'}
            </span>
          </div>
          <div className="badge-item">
            <span className="badge-label">14d Low:</span>
            <span className="badge-val font-mono">${low14d.toFixed(2)}</span>
          </div>
          <div className={`connection-badge ${wsStatus}`}>
            <Radio size={12} className={wsStatus === 'connected' ? 'pulse-icon' : ''} />
            <span>{wsStatus.toUpperCase()}</span>
          </div>
        </div>
      </header>

      {/* RECOMMENDATION BANNER */}
      <div className={`recommendation-banner ${action.class}`}>
        <div className="banner-top">
          <span className="banner-badge">ACTION RECOMMENDATION</span>
          <h3>{action.text}</h3>
        </div>
        <p>{action.desc}</p>
      </div>

      {/* MAIN CONTAINER GRID */}
      <main className="dashboard-grid">
        {/* LEFT COLUMN: THE CHART */}
        <section className="grid-left">
          <div className="panel-card chart-card">
            <div className="timeframe-selector">
              <button 
                className={timeframe === '1d' ? 'active' : ''} 
                onClick={() => setTimeframe('1d')}
              >
                1 Day (1D)
              </button>
              <button 
                className={timeframe === '4h' ? 'active' : ''} 
                onClick={() => setTimeframe('4h')}
              >
                4 Hour (4H)
              </button>
            </div>
            
            {timeframe === '1d' ? (
              <TradingChart 
                data={dailyParsed}
                rsiData={rawRsiList}
                ma20Data={rawMA20List}
                ma50Data={rawMA50List}
                ma200Data={rawMA200List}
                timeframe="1d"
              />
            ) : (
              <TradingChart 
                data={fhParsed}
                rsiData={fhRsiList}
                ma20Data={fhMA20List}
                ma50Data={fhMA50List}
                ma200Data={fhMA200List}
                timeframe="4h"
              />
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: INDICATORS AND HISTORICAL CONTEXT */}
        <section className="grid-right">
          <TriggerChecklist 
            checklist={checklist}
            bearSignals={bearSignals}
            fourHour={fourHour}
            price={price}
            weightedScore={weightedScore}
            scoreBreakdown={scoreBreakdown}
          />
          
          <HistoricalContext 
            ma200Distance={ma200Distance}
            rsiPercentile={rsiPercentile}
            ma200DistPercentile={ma200DistPercentile}
            drawdownFromHigh={drawdownFromHigh}
          />
        </section>
      </main>
    </div>
  );
}
