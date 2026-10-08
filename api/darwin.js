/* =====================================================================
   GET /api/darwin?ticker=KBAD — live DARWIN track record.

   Source: the DARWIN's public page on darwinex.com (/invest/<TICKER>),
   which embeds the full daily quote series (index, base 100). No login,
   no credentials. Stats are computed with the same conventions Darwinex
   uses (validated against the Darwinex Zero figures):
     annualised = (1+R)^(365/calendarDays) - 1
     volatility = sample stdev of daily returns * sqrt(252)
     sharpe     = annualised / volatility
     sortino    = annualised / (sample stdev of negative days * sqrt(252))
     win rate   = winning days / days with a non-zero move
   Max drawdown is measured on daily closes; Darwinex measures intraday,
   so the site applies a configured floor (see data/portfolios.json).

   AUM = Darwinex's invested capital (EUR) + investors' AuM (USD on the
   page), converted at the ECB euro reference rate.

   Caching: the latest result is kept in KV and reused for an hour, so
   darwinex.com sees at most ~24 requests a day however the endpoint is
   called; the CDN caches responses on top of that. If darwinex.com is
   unreachable or its page layout changes, the last good result is served.

   Environment variables (all optional):
     DARWIN_TICKERS     — comma-separated allowlist (default "KBAD")
     KV_REST_API_URL / KV_REST_API_TOKEN — enables the last-good fallback
   ===================================================================== */

const ALLOWED = (process.env.DARWIN_TICKERS || "KBAD").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const UA = "Mozilla/5.0 (compatible; ManPatelPortfolio/1.0; +https://man-patel-portfolio.vercel.app)";
const FRESH_MS = 60 * 60 * 1000; // quotes update daily; refetch at most hourly
const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

async function kv(cmd) {
  if (!KV_URL || !KV_TOKEN) return null;
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + KV_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd)
  });
  if (!r.ok) throw new Error("kv " + r.status);
  return (await r.json()).result;
}

// Pull the daily [timestamp, quote] series out of the page's embedded config.
// Parsed with a regex + JSON.parse — the page's script is never executed.
function parseSeries(html) {
  const m = html.match(/"ALL"\s*:\s*(\[\s*\[[\s\S]*?\]\s*\])/);
  if (!m) throw new Error("quote series not found on page");
  const raw = JSON.parse(m[1]);
  const byDate = new Map();
  for (const pt of raw) {
    if (!Array.isArray(pt) || typeof pt[0] !== "number" || typeof pt[1] !== "number" || !(pt[1] > 0)) continue;
    byDate.set(new Date(pt[0]).toISOString().slice(0, 10), { t: pt[0], q: pt[1] }); // UTC trading date; last wins
  }
  const series = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, v]) => ({ d, t: v.t, q: v.q }));
  if (series.length < 2) throw new Error("quote series too short");
  return series;
}

// Capital figures from the page's rendered text: Darwinex's own allocation
// (EUR) and real investors' AuM (Darwinex always shows it in USD).
function parseAum(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const num = (s) => parseFloat(s.replace(/,/g, ""));
  const cap = text.match(/Darwinex Invested Capital\s*([\d,]+(?:\.\d+)?)\s*€/);
  const inv = text.match(/With \$\s*([\d,]+(?:\.\d+)?)\s*AuM/);
  const cnt = text.match(/Join ([\d,]+) investors?/) || text.match(/Already in ([\d,]+) portfolios?/);
  if (!cap && !inv) return null; // layout changed — the site keeps its stored figure
  return { darwinexCapitalEur: cap ? num(cap[1]) : 0, investorsUsd: inv ? num(inv[1]) : 0, investors: cnt ? num(cnt[1]) : 0 };
}

// Trade statistics from the page's rendered text, e.g.
// "Number of trades 2,152 Average trade duration 12H14M Winning trades 56.18%".
function parseActivity(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const trades = text.match(/Number of trades\s*([\d,]+)/);
  const dur = text.match(/Average trade duration\s*((?:\d+\s*[DHMS]\s*)+)/i);
  const win = text.match(/Winning trades\s*([\d.]+)\s*%/);
  if (!trades && !dur && !win) return null;
  return {
    trades: trades ? parseInt(trades[1].replace(/,/g, ""), 10) : null,
    avgDuration: dur ? dur[1].replace(/\s+/g, "").toUpperCase() : null, // e.g. "12H14M"
    winningTrades: win ? parseFloat(win[1]) / 100 : null
  };
}

// Instrument mix from the embedded config: data: [ { name: "NI225", y: 34.53 }, ... ]
function parseAllocation(html) {
  const block = html.match(/tradingAllocation\s*:\s*\{\s*data\s*:\s*\[([\s\S]*?)\]/);
  if (!block) return null;
  const out = [];
  for (const m of block[1].matchAll(/name\s*:\s*"([^"]+)"\s*,\s*y\s*:\s*([\d.]+)/g)) out.push({ name: m[1], pct: parseFloat(m[2]) / 100 });
  return out.length ? out.sort((a, b) => b.pct - a.pct) : null;
}

// ECB euro reference rate (USD per 1 EUR). Never rejects.
async function fetchEurUsd() {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 4000);
    const r = await fetch(ECB_URL, { headers: { "User-Agent": UA }, signal: ac.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const xml = await r.text();
    const rate = xml.match(/currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/);
    const date = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/);
    return rate ? { rate: parseFloat(rate[1]), date: date ? date[1] : null } : null;
  } catch (_) { return null; }
}

function buildAum(parts, fx) {
  if (!parts) return null;
  // without a rate, count only the euro capital rather than guess a conversion
  const investorsEur = fx ? Math.round(parts.investorsUsd / fx.rate) : null;
  return Object.assign(parts, {
    investorsEur, eurUsd: fx ? fx.rate : null, fxDate: fx ? fx.date : null,
    totalEur: Math.round(parts.darwinexCapitalEur + (investorsEur || 0))
  });
}

function sampleSd(xs) {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}

function computeMetrics(series) {
  const q = series.map((p) => p.q);
  const rets = [];
  for (let i = 1; i < q.length; i++) rets.push(q[i] / q[i - 1] - 1);

  const total = q[q.length - 1] / q[0] - 1;
  const days = (series[series.length - 1].t - series[0].t) / 864e5;
  const ann = days > 0 ? Math.pow(1 + total, 365 / days) - 1 : 0;
  const vol = sampleSd(rets) * Math.sqrt(252);
  const downVol = sampleSd(rets.filter((r) => r < 0)) * Math.sqrt(252);
  const moved = rets.filter((r) => r !== 0).length;

  let peak = q[0], mdd = 0;
  for (const v of q) { if (v > peak) peak = v; const dd = v / peak - 1; if (dd < mdd) mdd = dd; }

  const monthEnd = new Map();
  for (const p of series) monthEnd.set(p.d.slice(0, 7), p.q);
  const monthly = [];
  let prev = q[0];
  for (const [m, v] of monthEnd) { monthly.push({ m, r: v / prev - 1 }); prev = v; }
  const mr = monthly.map((o) => o.r);

  return {
    metrics: {
      return: total,
      annReturn: ann,
      maxDrawdown: mdd,
      sharpe: vol ? ann / vol : 0,
      sortino: downVol ? ann / downVol : 0,
      volatility: vol,
      winRate: moved ? rets.filter((r) => r > 0).length / moved : 0,
      bestMonth: Math.max(...mr),
      worstMonth: Math.min(...mr)
    },
    monthly
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }

  // one canonical URL per ticker, so cache-busting params can't bypass the CDN
  if (Object.keys(req.query || {}).some((k) => k !== "ticker")) return res.status(400).json({ error: "Unexpected parameters" });

  const ticker = String((req.query && req.query.ticker) || "").toUpperCase();
  if (!ALLOWED.includes(ticker)) return res.status(404).json({ error: "Unknown ticker" });

  const sourceUrl = "https://www.darwinex.com/invest/" + ticker;
  const cacheKey = "darwin:" + ticker;

  // KV is the shared cache: whatever URL is requested and whichever CDN region
  // misses, darwinex.com is contacted at most once per FRESH_MS worldwide.
  let saved = null;
  try { const v = await kv(["GET", cacheKey]); saved = v ? JSON.parse(v) : null; } catch (e) { console.error("kv read failed", e.message); }
  if (saved && Date.now() - Date.parse(saved.fetchedAt) < FRESH_MS) {
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json(saved);
  }

  try {
    const fx = fetchEurUsd(); // in parallel with the page fetch
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 7000);
    const r = await fetch(sourceUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: ac.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error("darwinex " + r.status);

    const html = await r.text();
    const series = parseSeries(html);
    const { metrics, monthly } = computeMetrics(series);
    const last = series[series.length - 1];
    const payload = {
      ticker, source: sourceUrl, fetchedAt: new Date().toISOString(),
      inception: series[0].d, asOf: last.d, asOfTime: new Date(last.t).toISOString(), quote: last.q,
      aum: buildAum(parseAum(html), await fx),
      activity: parseActivity(html),
      allocation: parseAllocation(html),
      metrics, monthly,
      series: series.map((p) => [p.d, p.q])
    };

    // awaited: Vercel may freeze the function once the response is sent
    try { await kv(["SET", cacheKey, JSON.stringify(payload)]); } catch (e) { console.error("kv save failed", e.message); }
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json(payload);
  } catch (err) {
    console.error("darwin fetch failed:", ticker, err.message);
    if (saved) {
      res.setHeader("Cache-Control", "public, s-maxage=300");
      return res.status(200).json(Object.assign(saved, { stale: true }));
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "Live data unavailable" });
  }
};
