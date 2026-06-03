import React from 'react';
import { History, TrendingDown, Layers } from 'lucide-react';

export default function HistoricalContext({ ma200Distance }) {
  // Historical bottoms to display
  const historicalUndershoots = [-18.2, -22.8, -29.0, -38.1, -42.2, -53.5];
  
  // Calculate percentage along the range from -18.2% (shallowest) to -53.5% (deepest)
  const maxUndershoot = -53.5;
  const minUndershoot = -18.2;
  const currentVal = ma200Distance || -27.1; // fallback to report value if not calculated yet
  
  // Cap currentVal within bounds for visualization
  const cappedVal = Math.max(maxUndershoot, Math.min(minUndershoot, currentVal));
  const rangePercentage = ((cappedVal - minUndershoot) / (maxUndershoot - minUndershoot)) * 100;

  return (
    <div className="historical-container">
      {/* MA200 UNDERSHOOT COMPARATOR */}
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title-group">
            <Layers className="icon-cyan" size={18} />
            <h2>MA200 DISTANCE COMPARATOR</h2>
          </div>
          <span className="badge-distance red-glow">
            {currentVal.toFixed(1)}% Below
          </span>
        </div>

        <div className="gauge-wrapper">
          <div className="gauge-labels">
            <span>Shallow Bottom (-18.2%)</span>
            <span>Deep Bottom (-53.5%)</span>
          </div>
          
          <div className="gauge-track">
            {/* Markers for historical extremes */}
            {historicalUndershoots.map((val, idx) => {
              const markerPct = ((val - minUndershoot) / (maxUndershoot - minUndershoot)) * 100;
              return (
                <div 
                  key={idx} 
                  className="gauge-marker" 
                  style={{ left: `${markerPct}%` }}
                  title={`Historical bottom: ${val}%`}
                />
              );
            })}
            
            {/* Current Value pointer */}
            <div 
              className="gauge-pointer" 
              style={{ left: `${rangePercentage}%` }}
            >
              <div className="pointer-dot" />
              <div className="pointer-label">{currentVal.toFixed(1)}%</div>
            </div>
          </div>
          
          <p className="gauge-caption">
            We are roughly midway through the historical range of bear market depth. There is precedent for further decline.
          </p>
        </div>

        <div className="historical-undershoots-list">
          <span className="undershoot-title">Past Bear Market Bottoms:</span>
          <div className="undershoot-badges">
            {historicalUndershoots.map((val, idx) => (
              <span key={idx} className="undershoot-badge">
                {val.toFixed(1)}%
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* HISTORICAL RETURNS TABLE */}
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title-group">
            <History className="icon-purple" size={18} />
            <h2>RSI HISTORICAL PERFORMANCE</h2>
          </div>
          <span className="sample-size">21 Samples</span>
        </div>
        
        <p className="context-description">
          Performance of SOL/USDT when RSI (14) falls in the range of <strong>27.5 ± 3</strong>:
        </p>

        <div className="returns-table">
          <div className="returns-row header-row">
            <span>Period</span>
            <span>Avg Return</span>
            <span>Outlook</span>
          </div>
          
          <div className="returns-row">
            <span className="period-col">7-day</span>
            <span className="return-col return-negative">-2.90%</span>
            <span className="outlook-col text-red"><TrendingDown size={14} /> Bearish</span>
          </div>
          
          <div className="returns-row">
            <span className="period-col">14-day</span>
            <span className="return-col return-negative">-6.36%</span>
            <span className="outlook-col text-red"><TrendingDown size={14} /> Bearish</span>
          </div>
          
          <div className="returns-row">
            <span className="period-col">30-day</span>
            <span className="return-col return-negative">-5.11%</span>
            <span className="outlook-col text-red"><TrendingDown size={14} /> Bearish</span>
          </div>
        </div>

        <div className="info-banner">
          <p>
            Historically, when RSI reaches this level, SOL continues falling on average over the next 2 weeks. <strong>This is not a reliable bottom signal.</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
