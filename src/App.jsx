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
      // Fetch 300 daily candles and 300 4h candles
      const [dailyRes, fourHourRes] = await Promise.all([
        fetch('https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=1d&limit=300'),
        fetch('https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=4h&limit=300')
      ]);

      if (!dailyRes.ok || !fourHourRes.ok) {
        throw new Error('Failed to retrieve candle data from Binance API.');
      }

      const dailyData = await dailyRes.json();
      const fourHourData = await fourHourRes.json();

      setDailyKlines(dailyData);
      setFourHourKlines(fourHourData);
      
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

  // Compute live state
  const dashboardState = getDashboardState(dailyKlines, fourHourKlines);

  if (loading) {
    return (
      <div className="status-screen">
        <div className="loader-ring"></div>
        <p>FETCHING HISTORICAL CANDLES...</p>
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
    checklist,
    bearSignals,
    fourHour,
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

  // Dynamic recommendation logic
  let action = {
    class: 'action-red',
    text: 'STAY OUT — Too early, downtrend intact',
    desc: 'The setup is actively worsening. Do not attempt to catch falling knives. Reversal technicals are not confirmed.'
  };

  if (activeCount >= 3 && activeBearCount < 4) {
    action = {
      class: 'action-green',
      text: 'BUY TRIGGER ACTIVE — Technical bottoming signs',
      desc: 'Significant triggers are active. Reversal candles or bullish divergences indicate momentum rotation. Build size.'
    };
  } else if (activeCount >= 1 && activeBearCount < 4) {
    action = {
      class: 'action-yellow',
      text: 'WATCH CLOSELY — Initial signs of exhaustion',
      desc: 'Accumulating triggers are visible. Check RSI levels and watch 4h candles for structure shifts. Prepare entry order.'
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
            <span className="badge-label">14d Low:</span>
            <span className="badge-val font-mono">${low14d.toFixed(2)}</span>
          </div>
          <div className="badge-item">
            <span className="badge-label">Volume Ratio:</span>
            <span className="badge-val font-mono">{volumeRatio.toFixed(2)}x</span>
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
          />
          
          <HistoricalContext 
            ma200Distance={ma200Distance}
          />
        </section>
      </main>
    </div>
  );
}
