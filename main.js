// GenAI Finance course - Lidia's GenAI Finance Hub
// Stock price data, MACD technical indicators, and AI research notes.

const form = document.getElementById('ticker-form');
const results = document.getElementById('results');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const ticker = document.getElementById('ticker').value.trim().toUpperCase();
  const twelveDataKey = document.getElementById('twelvedata-key').value.trim();
  const openRouterKey = document.getElementById('openrouter-key').value.trim();

  results.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Fetching price data and calculating MACD indicators for <strong>${ticker}</strong>...</p>
    </div>
  `;

  try {
    const priceData = await fetchPriceData(ticker, twelveDataKey);
    const macdInfo = calculateMACD(priceData);

    let note = '';
    if (openRouterKey) {
      try {
        note = await getResearchNote(ticker, priceData, macdInfo, openRouterKey);
      } catch (aiErr) {
        note = `<em>(AI Note fallback due to OpenRouter notice: ${aiErr.message})</em><br><br>${generateLocalNote(ticker, priceData, macdInfo)}`;
      }
    } else {
      note = generateLocalNote(ticker, priceData, macdInfo);
    }

    renderResults(ticker, priceData, macdInfo, note);
  } catch (err) {
    results.innerHTML = `<p class="error">⚠️ Unable to complete request: ${err.message}</p>`;
  }
});

// Twelve Data daily price history.
async function fetchPriceData(ticker, apiKey) {
  const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1day&outputsize=90&apikey=${apiKey}`;
  const response = await fetch(url);

  const body = await response.text();
  let raw;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new Error(body.trim() || 'Price fetch failed');
  }

  if (raw && raw.status === 'error') throw new Error(raw.message || 'Price fetch failed');
  if (!response.ok) throw new Error('Price fetch failed');

  const values = raw.values ?? [];
  if (!values.length) throw new Error(`No price data returned for ${ticker}`);

  return values
    .map((b) => ({
      date: b.datetime,
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      volume: Number(b.volume)
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Calculates Exponential Moving Average (EMA)
 */
function calculateEMA(values, period) {
  if (values.length < period) return new Array(values.length).fill(null);

  const k = 2 / (period + 1);
  const emaArray = new Array(values.length).fill(null);

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  let prevEma = sum / period;
  emaArray[period - 1] = prevEma;

  for (let i = period; i < values.length; i++) {
    const currentEma = values[i] * k + prevEma * (1 - k);
    emaArray[i] = currentEma;
    prevEma = currentEma;
  }

  return emaArray;
}

/**
 * Calculates MACD (12, 26, 9) and Traffic Light Recommendation Signal
 */
function calculateMACD(priceData) {
  const closes = priceData.map((b) => b.close);
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  const macdValues = priceData.map((_, i) => {
    if (ema12[i] !== null && ema26[i] !== null) {
      return ema12[i] - ema26[i];
    }
    return null;
  });

  // Extract non-null MACD values to compute 9-day Signal line EMA
  const validMacdStartIndex = macdValues.findIndex((val) => val !== null);
  const validMacdValues = macdValues.slice(validMacdStartIndex);
  const signalEma = calculateEMA(validMacdValues, 9);

  const signalLine = priceData.map((_, i) => {
    if (i < validMacdStartIndex) return null;
    const relativeIndex = i - validMacdStartIndex;
    return signalEma[relativeIndex];
  });

  const histogram = priceData.map((_, i) => {
    if (macdValues[i] !== null && signalLine[i] !== null) {
      return macdValues[i] - signalLine[i];
    }
    return null;
  });

  const lastIdx = priceData.length - 1;
  const prevIdx = lastIdx - 1;

  const latestMacd = macdValues[lastIdx];
  const latestSignal = signalLine[lastIdx];
  const latestHist = histogram[lastIdx];
  const prevHist = histogram[prevIdx];

  let trafficLight = 'HOLD'; // 'BUY', 'SELL', 'HOLD'
  let statusText = 'HOLD / NEUTRAL';
  let statusSubtext = 'MACD and Signal lines are hovering near equilibrium.';

  if (latestHist !== null && prevHist !== null) {
    const isBullish = latestHist > 0;
    const isCrossOver = (latestHist > 0 && prevHist <= 0) || (latestHist < 0 && prevHist >= 0);
    const isExpanding = isBullish ? latestHist > prevHist : latestHist < prevHist;

    if (isCrossOver && isBullish) {
      trafficLight = 'BUY';
      statusText = 'STRONG BUY';
      statusSubtext = '🚀 Bullish MACD Crossover! MACD line crossed above Signal line.';
    } else if (isCrossOver && !isBullish) {
      trafficLight = 'SELL';
      statusText = 'STRONG SELL';
      statusSubtext = '📉 Bearish MACD Crossover! MACD line crossed below Signal line.';
    } else if (isBullish && isExpanding) {
      trafficLight = 'BUY';
      statusText = 'BUY / BULLISH';
      statusSubtext = '🟢 Positive momentum: MACD above Signal line with widening histogram.';
    } else if (!isBullish && isExpanding) {
      trafficLight = 'SELL';
      statusText = 'SELL / BEARISH';
      statusSubtext = '🔴 Negative momentum: MACD below Signal line with widening negative histogram.';
    } else {
      trafficLight = 'HOLD';
      statusText = 'HOLD / NEUTRAL';
      statusSubtext = isBullish
        ? '🟡 MACD is above Signal, but momentum is slowing down. Hold position or monitor.'
        : '🟡 MACD is below Signal, but selling pressure is easing. Await clearer crossover.';
    }
  }

  return {
    latest: {
      macd: latestMacd,
      signal: latestSignal,
      histogram: latestHist,
      ema12: ema12[lastIdx],
      ema26: ema26[lastIdx]
    },
    previous: {
      macd: macdValues[prevIdx],
      signal: signalLine[prevIdx],
      histogram: prevHist
    },
    trafficLight,
    statusText,
    statusSubtext
  };
}

function generateLocalNote(ticker, priceData, macdInfo) {
  const first = priceData[0];
  const latest = priceData[priceData.length - 1];
  const pctChange = ((latest.close - first.close) / first.close) * 100;
  const direction = pctChange >= 0 ? 'upward' : 'downward';

  return `
    <strong>Automated Technical Briefing:</strong> Over the past ${priceData.length} trading days (${first.date} to ${latest.date}), 
    <strong>${ticker}</strong> moved in a <strong>${direction}</strong> trajectory of <strong>${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%</strong> 
    (from $${first.close.toFixed(2)} to $${latest.close.toFixed(2)}). 
    The 12-day EMA ($${macdInfo.latest.ema12?.toFixed(2)}) relative to the 26-day EMA ($${macdInfo.latest.ema26?.toFixed(2)}) 
    yields a MACD reading of <strong>${macdInfo.latest.macd?.toFixed(2)}</strong> versus a Signal reading of <strong>${macdInfo.latest.signal?.toFixed(2)}</strong>. 
    ${macdInfo.statusSubtext}
  `;
}

// OpenRouter call handed summarized price data + MACD
async function getResearchNote(ticker, priceData, macdInfo, apiKey) {
  const first = priceData[0];
  const latest = priceData[priceData.length - 1];
  const pctChange = ((latest.close - first.close) / first.close) * 100;

  const summary =
    `${ticker} daily closes from ${first.date} to ${latest.date}: ` +
    `start $${first.close.toFixed(2)}, latest $${latest.close.toFixed(2)}, ` +
    `change ${pctChange.toFixed(2)}% over ${priceData.length} trading days. ` +
    `MACD (12,26,9) Indicators: MACD Line = ${macdInfo.latest.macd?.toFixed(2)}, ` +
    `Signal Line = ${macdInfo.latest.signal?.toFixed(2)}, Histogram = ${macdInfo.latest.histogram?.toFixed(2)}. ` +
    `Traffic Light Recommendation: ${macdInfo.trafficLight} (${macdInfo.statusSubtext}).`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-5',
      max_tokens: 2000,
      reasoning: { enabled: false },
      messages: [
        {
          role: 'system',
          content: 'You are a senior financial analyst providing executive technical research notes for Lidia Singla.'
        },
        {
          role: 'user',
          content: `${summary}\n\nWrite a concise one-paragraph research note for ${ticker} analyzing the recent price performance, the MACD technical indicators, and explaining why the Traffic Light signal is ${macdInfo.trafficLight}.`
        }
      ]
    })
  });

  if (!response.ok) throw new Error(await readOpenRouterError(response));
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? generateLocalNote(ticker, priceData, macdInfo);
}

async function readOpenRouterError(response) {
  let message = '';
  try {
    const body = await response.json();
    const err = body.error ?? body;
    message = err.message || '';
    const provider = err.metadata?.provider_name;
    const raw = err.metadata?.raw;
    if (provider) message += ` [provider: ${provider}]`;
    if (raw) message += ` ${typeof raw === 'string' ? raw : JSON.stringify(raw)}`;
  } catch {}
  const hint = {
    401: 'Your API key looks invalid or missing',
    402: 'This model is paid and your OpenRouter account is out of credits',
    429: 'Rate limited, wait a moment and try again'
  }[response.status];
  return [`(HTTP ${response.status})`, hint, message].filter(Boolean).join(' ');
}

function renderResults(ticker, priceData, macdInfo, note) {
  const latest = priceData[priceData.length - 1];
  const light = macdInfo.trafficLight; // 'BUY', 'HOLD', 'SELL'

  results.innerHTML = `
    <div class="ticker-header">
      <h2>${ticker}</h2>
      <span class="price">Latest Close (${latest.date}): $${latest.close.toFixed(2)}</span>
    </div>

    <!-- Traffic Light Signal Section -->
    <div class="traffic-light-card traffic-light-${light.toLowerCase()}">
      <div class="traffic-light-box">
        <div class="lamp red ${light === 'SELL' ? 'active' : ''}"></div>
        <div class="lamp yellow ${light === 'HOLD' ? 'active' : ''}"></div>
        <div class="lamp green ${light === 'BUY' ? 'active' : ''}"></div>
      </div>
      <div class="traffic-light-details">
        <div class="signal-badge badge-${light.toLowerCase()}">${macdInfo.statusText}</div>
        <p class="signal-subtext">${macdInfo.statusSubtext}</p>
      </div>
    </div>

    <!-- MACD Indicator Breakdown -->
    <div class="macd-metrics-grid">
      <div class="metric-card">
        <span class="metric-label">MACD Line (12,26)</span>
        <span class="metric-value ${macdInfo.latest.macd >= 0 ? 'pos' : 'neg'}">
          ${macdInfo.latest.macd !== null ? (macdInfo.latest.macd >= 0 ? '+' : '') + macdInfo.latest.macd.toFixed(3) : 'N/A'}
        </span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Signal Line (9)</span>
        <span class="metric-value ${macdInfo.latest.signal >= 0 ? 'pos' : 'neg'}">
          ${macdInfo.latest.signal !== null ? (macdInfo.latest.signal >= 0 ? '+' : '') + macdInfo.latest.signal.toFixed(3) : 'N/A'}
        </span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Histogram</span>
        <span class="metric-value ${macdInfo.latest.histogram >= 0 ? 'pos' : 'neg'}">
          ${macdInfo.latest.histogram !== null ? (macdInfo.latest.histogram >= 0 ? '+' : '') + macdInfo.latest.histogram.toFixed(3) : 'N/A'}
        </span>
      </div>
    </div>

    <div class="note-container">
      <h3>AI Research & Indicator Analysis</h3>
      <p class="note">${note}</p>
    </div>
  `;
}

