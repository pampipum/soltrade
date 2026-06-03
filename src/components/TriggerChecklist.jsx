import React from 'react';
import { CheckCircle2, AlertTriangle, HelpCircle, Activity, ShieldAlert, ArrowDownRight, ArrowUpRight } from 'lucide-react';

export default function TriggerChecklist({ checklist, bearSignals, fourHour, price }) {
  if (!checklist || !bearSignals) {
    return <div className="loading-checklist">Evaluating signals...</div>;
  }

  // Count active signals
  const checklistItems = Object.values(checklist);
  const activeCount = checklistItems.filter(item => item.active).length;
  
  const bearItems = Object.values(bearSignals);
  const activeBearCount = bearItems.filter(item => item.active).length;

  return (
    <div className="checklist-container">
      {/* 1. BUY TRIGGER CHECKLIST */}
      <div className="panel-card pulse-glow-violet">
        <div className="panel-header">
          <div className="panel-title-group">
            <CheckCircle2 className="icon-purple" size={18} />
            <h2>BUY TRIGGER CHECKLIST</h2>
          </div>
          <span className={`checklist-score ${activeCount > 0 ? 'score-active' : 'score-zero'}`}>
            {activeCount}/6 ACTIVE
          </span>
        </div>
        
        <div className="progress-bar-container">
          <div 
            className="progress-bar-fill" 
            style={{ width: `${(activeCount / 6) * 100}%`, backgroundColor: activeCount > 2 ? 'var(--status-green)' : 'var(--sol-purple)' }}
          />
        </div>

        <div className="checklist-grid">
          {checklistItems.map(item => (
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
