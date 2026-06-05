import React from 'react';
import { LineChart, BarChart2, AlertCircle } from 'lucide-react';

export default function ForwardReturns({ forwardReturns }) {
  if (!forwardReturns) return null;

  const { bulls, bears, bullThreshold, bearThreshold } = forwardReturns;

  const renderMetrics = (metrics, title, icon, isBull) => {
    if (!metrics) return null;

    const periods = ['3m', '6m', '9m', '12m'];

    return (
      <div className="panel-card" style={{ marginTop: '16px' }}>
        <div className="panel-header">
          <div className="panel-title-group">
            {icon}
            <h2>{title}</h2>
          </div>
        </div>
        
        <p className="context-description" style={{ marginBottom: '16px' }}>
          Historical performance when RSI was {isBull ? '<=' : '>='} {isBull ? bullThreshold?.toFixed(1) : bearThreshold?.toFixed(1)}.
        </p>

        <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {periods.map(p => {
            const data = metrics[p];
            if (!data || data.count === 0) {
              return (
                <div key={p} className="metric-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>{p.toUpperCase()}</div>
                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '6px' }}>No Data</div>
                </div>
              );
            }

            return (
              <div key={p} className="metric-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '6px' }}>
                  {p.toUpperCase()} <span style={{fontSize:'10px', opacity: 0.5}}>({data.count})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 700 }}>
                    {data.avgLoss !== null ? `${data.avgLoss.toFixed(1)}%` : '-'}
                  </span>
                  <span style={{ color: '#22c55e', fontSize: '12px', fontWeight: 700 }}>
                    {data.avgGain !== null ? `+${data.avgGain.toFixed(1)}%` : '-'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="forward-returns-wrapper">
      {renderMetrics(bulls, "BULLS: OVERSOLD ANALOGS", <BarChart2 color="#22c55e" size={18} />, true)}
      {renderMetrics(bears, "BEARS: OVERBOUGHT ANALOGS", <LineChart color="#ef4444" size={18} />, false)}
      
      <div className="panel-card" style={{ marginTop: '16px' }}>
        <div className="panel-header" style={{ paddingBottom: '0', borderBottom: 'none' }}>
          <div className="panel-title-group">
            <AlertCircle color="#f59e0b" size={14} />
            <h2 style={{ fontSize: '11px', color: '#94a3b8' }}>FORWARD RETURNS CONTEXT</h2>
          </div>
        </div>
        <div style={{ padding: '0 16px 16px 16px', fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>
          Displays average positive return (green) and average negative return (red) for historical instances matching current RSI extremes. N counts indicate the number of matching historical samples that had enough forward data to resolve.
        </div>
      </div>
    </div>
  );
}
