import React from 'react';
import { CheckCircle2, AlertTriangle, ShieldAlert, Activity, Cpu, TrendingUp, BarChart2 } from 'lucide-react';

const CLUSTER_META = {
  macro:       { label: 'Macro Regime',      icon: Cpu,        color: '#00f0ff', max: 25 },
  derivatives: { label: 'Derivatives',        icon: BarChart2,  color: '#f59e0b', max: 25 },
  trend:       { label: 'Trend Structure',    icon: TrendingUp, color: '#8c52ff', max: 20 },
  momentum:    { label: 'RSI Momentum',       icon: Activity,   color: '#a78bfa', max: 15 },
  candle:      { label: 'Candle / Volume',    icon: BarChart2,  color: '#34d399', max: 15 },
};

function ScoreArc({ score }) {
  // Simple circular gauge using SVG
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const fillRatio = Math.min(score / 100, 1);
  const dashOffset = circumference * (1 - fillRatio);

  let color = '#ef4444'; // red
  if (score >= 75) color = '#22c55e';
  else if (score >= 50) color = '#f59e0b';

  return (
    <div className="score-arc-wrapper">
      <svg width="130" height="130" viewBox="0 0 130 130">
        {/* Track */}
        <circle
          cx="65" cy="65" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="10"
        />
        {/* Fill */}
        <circle
          cx="65" cy="65" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 65 65)"
          style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
        />
        <text x="65" y="60" textAnchor="middle" fill={color} fontSize="22" fontWeight="800" fontFamily="monospace">
          {score}
        </text>
        <text x="65" y="78" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="sans-serif">
          / 100 pts
        </text>
      </svg>
      <span className="score-arc-label" style={{ color }}>
        {score >= 75 ? 'STRONG SETUP' : score >= 50 ? 'WATCH' : 'STAY OUT'}
      </span>
    </div>
  );
}

export default function TriggerChecklist({ checklist, bearSignals, fourHour, price, weightedScore, scoreBreakdown }) {
  if (!checklist || !bearSignals) {
    return <div className="loading-checklist">Evaluating signals...</div>;
  }

  const checklistItems = Object.values(checklist);
  const activeCount = checklistItems.filter(item => item.active).length;

  const bearItems = Object.values(bearSignals);
  const activeBearCount = bearItems.filter(item => item.active).length;

  // Group items by cluster
  const clusters = {};
  checklistItems.forEach(item => {
    if (!clusters[item.cluster]) clusters[item.cluster] = [];
    clusters[item.cluster].push(item);
  });

  return (
    <div className="checklist-container">
      {/* 1. WEIGHTED SCORE PANEL */}
      <div className="panel-card pulse-glow-violet">
        <div className="panel-header">
          <div className="panel-title-group">
            <CheckCircle2 className="icon-purple" size={18} />
            <h2>WEIGHTED SIGNAL SCORE</h2>
          </div>
          <span className={`checklist-score ${activeCount > 0 ? 'score-active' : 'score-zero'}`}>
            {activeCount}/{checklistItems.length} TRIGGERS
          </span>
        </div>

        {/* Arc gauge + cluster bars side by side */}
        <div className="score-layout">
          <ScoreArc score={weightedScore ?? 0} />

          <div className="cluster-bars">
            {scoreBreakdown && Object.entries(scoreBreakdown).map(([key, cluster]) => {
              const meta = CLUSTER_META[key] || {};
              const pct = (cluster.earned / cluster.max) * 100;
              return (
                <div key={key} className="cluster-bar-row">
                  <span className="cluster-bar-label" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  <div className="cluster-bar-track">
                    <div
                      className="cluster-bar-fill"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: meta.color,
                        transition: 'width 0.6s ease'
                      }}
                    />
                  </div>
                  <span className="cluster-bar-pts">{cluster.earned}/{cluster.max}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Clustered trigger items */}
        {Object.entries(clusters).map(([clusterKey, items]) => {
          const meta = CLUSTER_META[clusterKey] || { label: clusterKey, color: '#fff' };
          const Icon = meta.icon || CheckCircle2;
          const sb = scoreBreakdown?.[clusterKey];
          return (
            <div key={clusterKey} className="cluster-group">
              <div className="cluster-header">
                <Icon size={13} style={{ color: meta.color }} />
                <span style={{ color: meta.color }}>{meta.label}</span>
                {sb && (
                  <span className="cluster-pts-badge" style={{ borderColor: meta.color, color: meta.color }}>
                    {sb.earned}/{sb.max}pts
                  </span>
                )}
              </div>
              <div className="checklist-grid">
                {items.map(item => (
                  <div key={item.id} className={`checklist-item ${item.active ? 'active-row' : ''}`}>
                    <div className="checklist-meta">
                      <span className="checklist-letter">{item.id})</span>
                      <span className="checklist-text">{item.title}</span>
                    </div>
                    <div className="checklist-status">
                      <span className="checklist-detail">{item.detail}</span>
                      {item.active ? (
                        <span className="badge-active">🟢 Active</span>
                      ) : (
                        <span className="badge-pending">⏳ Pending</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {checklist.btcTrendSupport && !checklist.btcTrendSupport.active && (
          <div className="btc-warning-banner">
            <AlertTriangle size={16} />
            <span>BTC Bearish Override: SOL buy setups have low probability until BTC reclaims its 4H MA20.</span>
          </div>
        )}

        {checklist.leverageFlush && checklist.leverageFlush.active && (
          <div className="oi-success-banner">
            <CheckCircle2 size={16} />
            <span>Leverage Flushed: OI drawdown confirmed with price holding structure.</span>
          </div>
        )}
      </div>

      {/* 2. BEAR MARKET SIGNALS */}
      <div className="panel-card">
        <div className="panel-header">
          <div className="panel-title-group">
            <ShieldAlert className="icon-red" size={18} />
            <h2>BEAR MARKET SIGNALS</h2>
          </div>
          <span className={`checklist-score ${activeBearCount === 4 ? 'score-bearish' : 'score-neutral'}`}>
            {activeBearCount}/4 ACTIVE
          </span>
        </div>

        <div className="bear-signals-grid">
          {bearItems.map((item, index) => (
            <div key={index} className="bear-signal-row">
              <span className="bear-signal-text">{item.title}</span>
              {item.active ? (
                <span className="badge-bearish">🔴 Bearish</span>
              ) : (
                <span className="badge-bullish">🟢 Bullish</span>
              )}
            </div>
          ))}
        </div>
        
        {activeBearCount === 4 && (
          <div className="warning-banner">
            <AlertTriangle size={16} />
            <span>Full Death Cross Configuration. All MAs stacked bearishly.</span>
          </div>
        )}
      </div>

      {/* 3. 4-HOUR MOMENTUM */}
      {fourHour && (
        <div className="panel-card">
          <div className="panel-header">
            <div className="panel-title-group">
              <Activity className="icon-cyan" size={18} />
              <h2>4-HOUR MOMENTUM</h2>
            </div>
          </div>
          <div className="momentum-grid">
            <div className="momentum-card">
              <span className="momentum-label">4h RSI</span>
              <span className={`momentum-value ${fourHour.rsi < 30 ? 'text-oversold' : ''}`}>
                {fourHour.rsi ? fourHour.rsi.toFixed(1) : 'N/A'}
              </span>
              <span className="momentum-sub">
                {fourHour.rsi < 30 ? 'Deeply Oversold' : 'Neutral'}
              </span>
            </div>
            
            <div className="momentum-card">
              <span className="momentum-label">4h vs MA20</span>
              <span className={`momentum-value ${fourHour.vsMA20 === 'above' ? 'text-green' : 'text-red'}`}>
                {fourHour.vsMA20.toUpperCase()}
              </span>
              <span className="momentum-sub">
                MA20: ${fourHour.ma20 ? fourHour.ma20.toFixed(2) : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
