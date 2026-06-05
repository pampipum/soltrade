import React from 'react';
import { History, TrendingDown, Layers, AlertTriangle } from 'lucide-react';

// Structural Oversold Score: average of RSI, MA200 dist, and drawdown percentiles
// Lower percentile = more oversold = higher structural score
function calcStructuralScore(rsiPctile, ma200Pctile, drawdownPctile) {
  const values = [rsiPctile, ma200Pctile, drawdownPctile].filter(v => v !== null && v !== undefined);
  if (values.length === 0) return null;
  // Invert: lower percentile means more extreme/oversold, so score = 100 - avg_percentile
  const avgPctile = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(100 - avgPctile);
}

function PercentileBar({ label, percentile, invertColor = true }) {
  if (percentile === null || percentile === undefined) return null;
  // invertColor=true: lower percentile = greener (more oversold = potential buy signal)
  const displayPct = percentile;
  let color = '#ef4444';
  if (invertColor) {
    if (percentile <= 10) color = '#22c55e';
    else if (percentile <= 25) color = '#f59e0b';
  } else {
    if (percentile >= 75) color = '#22c55e';
    else if (percentile >= 50) color = '#f59e0b';
  }
  return (
    <div className="percentile-bar-row">
      <span className="percentile-bar-label">{label}</span>
      <div className="percentile-bar-track">
        <div
          className="percentile-bar-fill"
          style={{ width: `${displayPct}%`, backgroundColor: color, transition: 'width 0.6s ease' }}
        />
      </div>
      <span className="percentile-bar-value" style={{ color }}>{displayPct}th pctile</span>
    </div>
  );
}

export default function HistoricalContext({
  ma200Distance,
  rsiPercentile,
  ma200DistPercentile,
  drawdownFromHigh
}) {
  const historicalUndershoots = [-18.2, -22.8, -29.0, -38.1, -42.2, -53.5];
  
  const maxUndershoot = -53.5;
  const minUndershoot = -18.2;
  const currentVal = ma200Distance || 0;
  
  const cappedVal = Math.max(maxUndershoot, Math.min(minUndershoot, currentVal));
  const rangePercentage = ((cappedVal - minUndershoot) / (maxUndershoot - minUndershoot)) * 100;

  // Compute drawdown percentile relative to historical bear market depths
  // Uses the known historical drawdown range for context
  const drawdownPctileEstimate = drawdownFromHigh !== undefined && drawdownFromHigh !== null
    ? Math.round(Math.min(100, Math.max(0, ((drawdownFromHigh + 85) / 85) * 100)))
    : null;

  const structuralScore = calcStructuralScore(rsiPercentile, ma200DistPercentile, drawdownPctileEstimate);

  return (
    <div className="historical-container">
      {/* STRUCTURAL OVERSOLD SCORE */}
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title-group">
            <History className="icon-purple" size={18} />
            <h2>STRUCTURAL OVERSOLD SCORE</h2>
          </div>
          {structuralScore !== null && (
            <span className={`badge-distance ${structuralScore >= 70 ? 'green-glow' : structuralScore >= 45 ? 'yellow-glow' : 'red-glow'}`}>
              {structuralScore}/100
            </span>
          )}
        </div>

        <p className="context-description">
          Percentile-based composite: how extreme current conditions are relative to the asset's own 252-day history.
          A high score = deeply oversold across multiple dimensions = historically rare bottoming territory.
        </p>

        <div className="percentile-bars-container">
          <PercentileBar
            label="Daily RSI Percentile"
            percentile={rsiPercentile}
            invertColor={true}
          />
          <PercentileBar
            label="MA200 Distance Percentile"
            percentile={ma200DistPercentile}
            invertColor={true}
          />
          <PercentileBar
            label="Cycle Drawdown Depth"
            percentile={drawdownPctileEstimate}
            invertColor={true}
          />
        </div>

        {drawdownFromHigh !== null && drawdownFromHigh !== undefined && (
          <div className="drawdown-stat-row">
            <span className="drawdown-stat-label">Drawdown from cycle high:</span>
            <span className="drawdown-stat-value" style={{ color: '#ef4444' }}>
              {drawdownFromHigh.toFixed(1)}%
            </span>
          </div>
        )}

        {structuralScore !== null && structuralScore >= 70 && (
          <div className="oi-success-banner">
            <History size={16} />
            <span>Historically extreme territory across RSI, MA200 distance, and cycle drawdown. Rare bottoming zone.</span>
          </div>
        )}

        {structuralScore !== null && structuralScore < 40 && (
          <div className="info-banner">
            <p>Conditions are not historically extreme. The setup does not yet show deep structural oversold readings.</p>
          </div>
        )}
      </div>

      {/* MA200 DISTANCE COMPARATOR */}
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title-group">
            <Layers className="icon-cyan" size={18} />
            <h2>MA200 DISTANCE COMPARATOR</h2>
          </div>
          <span className={`badge-distance ${currentVal < -30 ? 'green-glow' : 'red-glow'}`}>
            {currentVal.toFixed(1)}% {currentVal < 0 ? 'Below' : 'Above'}
            {ma200DistPercentile !== null && (
              <span style={{ opacity: 0.6, fontSize: '10px', marginLeft: '6px' }}>
                ({ma200DistPercentile}th pctile)
              </span>
            )}
          </span>
        </div>

        <div className="gauge-wrapper">
          <div className="gauge-labels">
            <span>Shallow Bottom (-18.2%)</span>
            <span>Deep Bottom (-53.5%)</span>
          </div>
          
          <div className="gauge-track">
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
            
            <div 
              className="gauge-pointer" 
              style={{ left: `${rangePercentage}%` }}
            >
              <div className="pointer-dot" />
              <div className="pointer-label">{currentVal.toFixed(1)}%</div>
            </div>
          </div>
          
          <p className="gauge-caption">
            Markers represent historical bear market bottom distances from the 200-day MA.
            {ma200DistPercentile !== null && (
              <> Current reading is at the <strong>{ma200DistPercentile}th percentile</strong> of the past year's distance history.</>
            )}
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

      {/* CONTEXT NOTE */}
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title-group">
            <AlertTriangle className="icon-yellow" size={18} />
            <h2>CONTEXT NOTE</h2>
          </div>
        </div>
        <div className="info-banner">
          <p>
            Percentile readings show <strong>how unusual</strong> current conditions are, not that a bottom is confirmed.
            Very low RSI percentiles (e.g., 3rd–8th) have historically appeared in bottoming zones, 
            but final lower lows can still occur. Use these readings as context alongside the weighted signal score,
            not as standalone triggers.
          </p>
        </div>
      </div>
    </div>
  );
}
