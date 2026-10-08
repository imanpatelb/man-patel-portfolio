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

   Caching: the CDN caches each response for an hour, so Darwinex sees at
   most ~24 requests a day. The last good result is also kept in KV and
   served if darwinex.com is unreachable or its page layout changes.

   Environment variables (all optional):
     DARWIN_TICKERS     — comma-separated allowlist (default "KBAD")
     KV_REST_API_URL / KV_REST_API_TOKEN — enables the last-good fallback
   ===================================================================== */

const ALLOWED = (process.env.DARWIN_TICKERS || "KBAD").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const UA = "Mozilla/5.0 (compatible; ManPatelPortfolio/1.0; +https://man-patel-portfolio.vercel.app)";

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

  const ticker = String((req.query && req.query.ticker) || "").toUpperCase();
  if (!ALLOWED.includes(ticker)) return res.status(404).json({ error: "Unknown ticker" });

  const sourceUrl = "https://www.darwinex.com/invest/" + ticker;
  const cacheKey = "darwin:" + ticker;

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 7000);
    const r = await fetch(sourceUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: ac.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error("darwinex " + r.status);

    const series = parseSeries(await r.text());
    const { metrics, monthly } = computeMetrics(series);
    const last = series[series.length - 1];
    const payload = {
      ticker, source: sourceUrl, fetchedAt: new Date().toISOString(),
      inception: series[0].d, asOf: last.d, quote: last.q,
      metrics, monthly,
      series: series.map((p) => [p.d, p.q])
    };

    // awaited: Vercel may freeze the function once the response is sent
    try { await kv(["SET", cacheKey, JSON.stringify(payload)]); } catch (e) { console.error("kv save failed", e.message); }
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json(payload);
  } catch (err) {
    console.error("darwin fetch failed:", ticker, err.message);
    try {
      const saved = await kv(["GET", cacheKey]);
      if (saved) {
        res.setHeader("Cache-Control", "public, s-maxage=300");
        return res.status(200).json(Object.assign(JSON.parse(saved), { stale: true }));
      }
    } catch (e) { console.error("kv read failed", e.message); }
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "Live data unavailable" });
  }
};
