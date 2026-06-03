import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';

export default function TradingChart({ data, rsiData, ma20Data, ma50Data, ma200Data, timeframe }) {
  const chartContainerRef = useRef();
  const chartRef = useRef(null);

  useEffect(() => {
    if (!data || data.length === 0 || !chartContainerRef.current) return;

    // Clear previous chart if it exists
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    
    // Create new chart
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 480,
      layout: {
        background: { type: ColorType.Solid, color: '#0d0d17' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: "'Roboto Mono', monospace",
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: 1, // Magnet
        vertLine: {
          color: '#8c52ff',
          width: 1,
          style: 3, // Dotted
          labelBackgroundColor: '#8c52ff',
        },
        horzLine: {
          color: '#8c52ff',
          width: 1,
          style: 3,
          labelBackgroundColor: '#8c52ff',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        visible: true,
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // 1. Candlestick Series (Price Pane)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00e676',
      downColor: '#ff3d71',
      borderUpColor: '#00e676',
      borderDownColor: '#ff3d71',
      wickUpColor: '#00e676',
      wickDownColor: '#ff3d71',
      pane: 0,
    });

    // Format candle data
    const chartCandles = data.map(d => ({
      time: d.time / 1000, // lightweight-charts expects Unix timestamp in seconds
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candlestickSeries.setData(chartCandles);

    // 2. Moving Averages (Overlaid on Price Pane)
    const ma20Series = chart.addSeries(LineSeries, {
      color: '#ffb300', // Amber
      lineWidth: 1.5,
      title: 'MA20',
      pane: 0,
    });
    const formattedMA20 = data.map((d, idx) => ({
      time: d.time / 1000,
      value: ma20Data[idx]
    })).filter(item => item.value !== null && item.value !== undefined);
    ma20Series.setData(formattedMA20);

    const ma50Series = chart.addSeries(LineSeries, {
      color: '#00f0ff', // Cyan
      lineWidth: 1.5,
      title: 'MA50',
      pane: 0,
    });
    const formattedMA50 = data.map((d, idx) => ({
      time: d.time / 1000,
      value: ma50Data[idx]
    })).filter(item => item.value !== null && item.value !== undefined);
    ma50Series.setData(formattedMA50);

    const ma200Series = chart.addSeries(LineSeries, {
      color: '#a855f7', // Purple
      lineWidth: 2,
      title: 'MA200',
      pane: 0,
    });
    const formattedMA200 = data.map((d, idx) => ({
      time: d.time / 1000,
      value: ma200Data[idx]
    })).filter(item => item.value !== null && item.value !== undefined);
    ma200Series.setData(formattedMA200);

    // 3. Volume Series (Pane 1 - height configured by weight)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume', // Put on custom volume scale
      pane: 1, // Separate volume pane
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: 0.1,
      },
      visible: true,
      borderColor: 'rgba(255, 255, 255, 0.08)',
    });

    const formattedVolume = data.map(d => ({
      time: d.time / 1000,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(0, 230, 118, 0.4)' : 'rgba(255, 61, 113, 0.4)',
    }));
    volumeSeries.setData(formattedVolume);

    // 4. RSI Series (Pane 2 - separate)
    const rsiSeries = chart.addSeries(LineSeries, {
      color: '#e040fb', // Bright Pink/Magenta
      lineWidth: 1.5,
      title: 'RSI(14)',
      pane: 2,
    });
    
    const formattedRSI = data.map((d, idx) => ({
      time: d.time / 1000,
      value: rsiData[idx]
    })).filter(item => item.value !== null && item.value !== undefined);
    rsiSeries.setData(formattedRSI);

    // Add horizontal lines for RSI (30 and 70)
    rsiSeries.createPriceLine({
      price: 70,
      color: 'rgba(255, 61, 113, 0.3)',
      lineWidth: 1,
      lineStyle: 3, // Dotted
      axisLabelVisible: true,
      title: 'OB 70',
    });
    rsiSeries.createPriceLine({
      price: 30,
      color: 'rgba(0, 230, 118, 0.3)',
      lineWidth: 1,
      lineStyle: 3, // Dotted
      axisLabelVisible: true,
      title: 'OS 30',
    });

    // Apply layout options for panes sizing (if supported in options)
    // Pane heights can be adjusted via scaleMargins or pane configuration
    chart.applyOptions({
      rightPriceScale: {
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
    });

    // Auto-fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({ width: container.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [data, timeframe]); // Re-render when dataset or timeframe changes

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div className="chart-header">
        <div className="chart-title-container">
          <span className="chart-symbol">SOL / USDT</span>
          <span className={`timeframe-badge ${timeframe === '1d' ? 'active' : ''}`}>{timeframe.toUpperCase()}</span>
        </div>
        <div className="chart-legend">
          <span className="legend-item"><span className="legend-dot" style={{ backgroundColor: '#ffb300' }}></span>MA20</span>
          <span className="legend-item"><span className="legend-dot" style={{ backgroundColor: '#00f0ff' }}></span>MA50</span>
          <span className="legend-item"><span className="legend-dot" style={{ backgroundColor: '#a855f7' }}></span>MA200</span>
          <span className="legend-item"><span className="legend-dot" style={{ backgroundColor: '#e040fb' }}></span>RSI(14)</span>
        </div>
      </div>
      <div ref={chartContainerRef} style={{ width: '100%', borderRadius: '8px', overflow: 'hidden' }} />
    </div>
  );
}
