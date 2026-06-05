# SOLtrade — Quantitative Swing Trading Indicator Engine

SOLtrade is a quantitative swing trading analysis dashboard and alerting agent built for Solana (SOL) and Bitcoin (BTC) market cycles. It evaluates structural bottoming signals, derivatives positioning, and macro indicators to generate high-conviction swing recommendations for traders holding positions across days to weeks.

---

## Technical Analysis of Pricing & Indicators

The trading engine utilizes a multi-layered evaluation framework combining **spot price structure**, **volume profiles**, **derivatives positioning (leverage context)**, and **macro correlations**.

Below is a detailed breakdown of the mathematical and logical conditions used in our indicator suite:

### 1. Trend and Momentum Indicators

#### Simple Moving Averages (SMA)
Calculated as the arithmetic mean of closing prices over a rolling lookback period ($N$):
$$\text{SMA}_t = \frac{1}{N} \sum_{i=0}^{N-1} \text{Close}_{t-i}$$
* **Indicator Details**:
  * **20-day SMA**: Short-term trend filter. Swing entries are favored when price reclaims the 20-day SMA (`price > ma20`).
  * **50-day & 200-day SMAs**: Macro trend filters. Used to determine structural trend health and calculate distances (e.g., distance to the 200-day SMA).

#### Wilder's Relative Strength Index (RSI)
A momentum oscillator measuring the speed and change of price movements. We implement Wilder's smoothing technique:
1. Calculate individual gains and losses:
   $$\text{Gain}_i = \max(0, \text{Close}_i - \text{Close}_{i-1})$$
   $$\text{Loss}_i = \max(0, \text{Close}_{i-1} - \text{Close}_i)$$
2. For the initial period ($N=14$):
   $$\text{AvgGain} = \frac{1}{N} \sum_{i=1}^{N} \text{Gain}_i, \quad \text{AvgLoss} = \frac{1}{N} \sum_{i=1}^{N} \text{Loss}_i$$
3. For subsequent periods, apply Wilder's smoothing:
   $$\text{AvgGain}_t = \frac{\text{AvgGain}_{t-1} \times (N-1) + \text{Gain}_t}{N}$$
   $$\text{AvgLoss}_t = \frac{\text{AvgLoss}_{t-1} \times (N-1) + \text{Loss}_t}{N}$$
4. Calculate Relative Strength (RS) and RSI:
   $$\text{RS} = \frac{\text{AvgGain}}{\text{AvgLoss}}, \quad \text{RSI} = 100 - \frac{100}{1 + \text{RS}}$$
* **Indicator Details**:
  * **RSI Cross Above 30**: Triggered when the daily RSI crosses from the oversold territory ($\le 30$) above 30, signaling an exit from extreme bearish momentum.

---

### 2. Advanced Candlestick & Volume Patterns

#### Reversal Candlestick Detector
Analyzes individual daily candlestick geometry to identify exhaustion and buying pressure:
* **Bullish Hammer**: Identifies potential trend reversals at local bottoms.
  * *Conditions*: Lower shadow must be at least 2x the body size; upper shadow must be less than 50% of the body size; body must represent less than 35% of the total high-low range.
* **Bullish Marubozu / Strong Green**: Identifies high-conviction buying momentum.
  * *Conditions*: Close exceeds open, and body represents more than 60% of the total candle range.

#### Liquidity Sweep Detector
A proprietary algorithm designed to find instances where market makers swept sell stops below key levels before recovering:
* *Conditions*: The candle's lower shadow must be $\ge 2.5 \times$ the body size, OR for very small-bodied candles (Dojis where body percentage $< 10\%$), the lower shadow must constitute more than 60% of the entire daily trading range. 

#### Volume Capitulation Profile
Validates bottoming structures by verifying whether high-volume sell-offs are ending in positive closed candles.
* *Conditions*: The current day's volume is at least $1.5 \times$ the average volume of the preceding 30 days, AND the day's candle closes positive (green).

---

### 3. Divergence Mechanics

#### Bullish RSI Divergence
Occurs when price registers a structural lower low while the RSI registers a higher low, signaling that the downward price momentum is slowing down despite lower prices.
* *Conditions*:
  1. Identifies the lowest price and corresponding RSI in a lookback window between $t-15$ and $t-3$.
  2. Compares the current price and RSI ($t$).
  3. Activates if:
     $$\text{Price}_t < \text{Price}_{\text{priorLow}} \quad \text{AND} \quad \text{RSI}_t > \text{RSI}_{\text{priorLow}}$$

---

### 4. Derivatives & Market Health (Leverage Indicators)

#### Leverage Flush (Open Interest Drawdown)
Open Interest (OI) represents the total number of outstanding derivative contracts. Rapid liquidations or margin calls result in an "OI Flush", indicating the removal of risky over-leveraged retail traders.
* *Conditions*:
  1. Analyzes the peak Open Interest ($\text{MaxOI}$) over a rolling 48-hour window.
  2. Calculates the percentage change to the current Open Interest ($\text{OI}_t$):
     $$\Delta\text{OI}\% = \frac{\text{OI}_t - \text{MaxOI}}{\text{MaxOI}} \times 100$$
  3. Triggered if $\Delta\text{OI}\% \le -15\%$ AND the price holds structure (defined as daily candle close $\ge$ open on the day of the flush or the preceding day).

#### Short Crowding (Negative Funding Rate)
Perpetual swap funding rates are paid between longs and shorts every 8 hours to align perpetual swap prices with spot prices.
* *Conditions*: Triggered when the funding rate is extremely negative ($< -0.01\%$), indicating that short sellers are paying long holders to maintain positions. This represents extreme crowd pessimism, making a short squeeze highly likely.

---

### 5. Macro Correlation Filter

#### Bitcoin Trend Support
To avoid trading counter to the primary market direction, SOLtrade tracks Bitcoin's momentum:
* *Conditions*: BTC/USDT price on a 4-hour chart must be trading above its 20-period Simple Moving Average ($\text{BTC Price} > \text{BTC SMA20}_{4h}$).

---

### 6. Historical Percentiles & Structural Oversold Score

To prevent regime-dependence and binary false signals, the engine ranks current indicators against their rolling 252-day history:
* **Daily RSI Percentile**: Ranks the current daily RSI relative to its 252-day history ($0 = $ most oversold, $100 = $ most overbought).
* **MA200 Distance Percentile**: Ranks the current percentage distance to the 200-day SMA against its 252-day history.
* **Cycle Drawdown Depth**: Computes current drawdown from the 300-day high and scales it relative to historic bear market depths (max $-85\%$).
* **Structural Oversold Score**: A composite metric ($0\text{--}100$) calculated as:
  $$\text{Structural Oversold Score} = 100 - \text{Average}(\text{RSI Percentile}, \text{MA200 Dist Percentile}, \text{Drawdown Percentile})$$
  A score $\ge 70$ indicates historically rare bottoming territory.

---

## The 100-Point Weighted Scoring Engine

Instead of an equal-weighted binary checklist, swing long entries are determined dynamically using a **100-point Weighted Scoring Engine** split into 5 core clusters.

### Scoring Breakdown

| Cluster | Indicator / Signal | Points | Condition |
|:---|:---|:---:|:---|
| **Macro Regime (25 pts)** | BTC 4H Trend Support | **25** | $\text{BTC Price} > \text{4H 20-period SMA}$ |
| **Derivatives (25 pts)** | Leverage Flush | **15** | $\Delta\text{OI}\% \le -15\%$ AND Price Holds |
| | Short Crowding | **10** | Funding Rate $< -0.01\%$ |
| **Trend Structure (20 pts)** | Price > MA20 | **8** | $\text{SOL Price} > \text{20-day SMA}$ |
| | Price > MA50 | **7** | $\text{SOL Price} > \text{50-day SMA}$ |
| | MA20 > MA50 | **5** | $\text{20-day SMA} > \text{50-day SMA}$ (No Bearish Cross) |
| **RSI Momentum (15 pts)** | RSI Recovery | **8** | $\text{Daily RSI} > 30 \text{ after being } \le 30$ |
| | RSI Historical Extreme | **7** | Daily RSI in bottom percentile ($\le 15\text{th percentile}$) |
| **Candle / Volume (15 pts)** | Volume Capitulation | **7** | $\text{Volume} \ge 1.5 \times \text{Avg30d}$ AND Close $\ge$ Open |
| | Reversal / Wick Sweep | **5** | Bullish Hammer OR Liquidity Sweep Wick |
| | Bullish RSI Divergence | **3** | $\text{Price Lower Low} + \text{RSI Higher Low}$ (15-day window) |

### Recommendation Thresholds
* **Weighted Score $\ge 75$**:
  * **BTC Bullish**: **BUY / ACCUMULATE** (High-conviction swing setup)
  * **BTC Bearish**: **MUTED ACCUMULATION** (BTC Bearish Override)
* **Weighted Score $50\text{--}74$**: **WATCH CLOSELY** (Setup is building, monitor derivatives)
* **Weighted Score $< 50$**: **STAY OUT** (Insufficient signal weight / hostile trend)

### Bear Trend Constraints
If the macro structure shows bearish alignment (SOL below 50-day or 200-day SMAs, MA20 < MA50, or MA50 < MA200), the dashboard warns of a full bearish moving average configuration, and recommendations are strictly capped or downgraded unless the structural oversold score registers extreme historical values.
