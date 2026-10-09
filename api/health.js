/* =====================================================================
   GET /api/health — daily check that the live data still works.

   Run daily by the Cron Trigger in wrangler.jsonc. It checks every source the
   site depends on and emails the owner when a check that affects what
   visitors see fails, so a change to Darwinex's page can't silently leave
   the site showing stale figures. When everything passes, no email.

   Auth: the scheduled run passes a one-off CRON_SECRET as a Bearer token
   (cloudflare/worker.js); any other request is refused, so nobody else can
   trigger alert emails.

   Environment variables:
     CRON_SECRET     — set by the scheduled run
     RESEND_API_KEY  — required to send the alert
     CONTACT_TO / CONTACT_FROM — optional, as for /api/contact
   ===================================================================== */
const darwin = require("./darwin.js");

const TO_DEFAULT = "mptraderx.capital@gmail.com";
const FROM_DEFAULT = "Portfolio Site <onboarding@resend.dev>";
const SITE = process.env.SITE_URL || "https://manpateltrades.com";
const MAX_QUOTE_AGE_DAYS = 4; // covers a weekend plus a market holiday

// critical: a failure changes what visitors see (stale or wrong figures)
function check(name, ok, detail, critical) { return { name, ok: !!ok, detail: String(detail), critical: !!critical }; }

async function runChecks(ticker) {
  const checks = [];
  let p;
  try {
    p = await darwin.buildPayload(ticker);
    checks.push(check("Darwinex page fetched and parsed", true, p.series.length + " daily quotes", true));
  } catch (e) {
    checks.push(check("Darwinex page fetched and parsed", false, e.message, true));
    return checks; // nothing else can be checked without the page
  }
  const age = (Date.now() - Date.parse(p.asOfTime)) / 864e5;
  checks.push(check("Latest quote is recent", age <= MAX_QUOTE_AGE_DAYS, p.asOf + ", " + age.toFixed(1) + " days old", true));
  const a = p.aum;
  checks.push(check("AUM figures found", a && (a.darwinexCapitalEur || a.investorsUsd), a ? "Darwinex capital €" + a.darwinexCapitalEur + ", investors $" + a.investorsUsd : "missing; site falls back to the stored AUM", true));
  checks.push(check("CFD warning figure", typeof p.cfdLossPct === "number", p.cfdLossPct != null ? p.cfdLossPct + "%" : "missing; site shows the stored figure", true));
  checks.push(check("EUR/USD rate (ECB)", a && a.eurUsd, a && a.eurUsd ? a.eurUsd + " on " + a.fxDate : "missing; AUM counts euro capital only", false));
  checks.push(check("Trade stats found", p.activity && p.activity.trades != null, p.activity ? p.activity.trades + " trades" : "missing; card hidden", false));
  checks.push(check("Asset mix found", p.allocation && p.allocation.length, p.allocation ? p.allocation.length + " instruments" : "missing; card hidden", false));
  checks.push(check("Darwinex recognition found", p.recognition && p.recognition.bestRank, p.recognition ? "best rank #" + p.recognition.bestRank : "missing; band hidden", false));
  checks.push(check("Investor fees found", p.fees, p.fees ? p.fees.management + "% management, " + p.fees.performance + "% performance" : "missing; FAQ and factsheet show the stored fees", false));

  checks.push(check("Benchmark data (FRED S&P 500)", p.benchmark && typeof p.benchmark.correlation === "number", p.benchmark ? "correlation " + p.benchmark.correlation.toFixed(2) + ", beta " + p.benchmark.beta.toFixed(2) + " over " + p.benchmark.days + " days" : "missing; market-link figures hidden", false));

  // blog storage: fine-grained GitHub tokens expire, which would silently break publishing
  if (process.env.GITHUB_TOKEN) {
    try {
      const repo = process.env.GITHUB_REPO || "imanpatelb/man-patel-portfolio", branch = process.env.GITHUB_BRANCH || "main";
      const r = await fetch("https://api.github.com/repos/" + repo + "/contents/data/posts.json?ref=" + encodeURIComponent(branch), {
        headers: { Authorization: "Bearer " + process.env.GITHUB_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "ManPatelPortfolio" }
      });
      checks.push(check("Blog storage (GitHub token)", r.ok, r.ok ? "token works" : "HTTP " + r.status + "; publishing from /admin will fail until the token is replaced", true));
    } catch (e) {
      checks.push(check("Blog storage (GitHub token)", false, e.message, true));
    }
  }

  // the site's own endpoint, as visitors hit it
  try {
    const r = await fetch(SITE + "/api/darwin?ticker=" + encodeURIComponent(ticker));
    const j = r.ok ? await r.json() : null;
    checks.push(check("Site serves live data", j && !j.stale && j.asOf, j ? (j.stale ? "serving a stale copy from " + j.asOf : "as of " + j.asOf) : "HTTP " + r.status, true));
  } catch (e) {
    checks.push(check("Site serves live data", false, e.message, true));
  }
  return checks;
}

async function sendAlert(ticker, checks) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const failed = checks.filter((c) => !c.ok);
  const line = (c) => (c.ok ? "✓ " : "✗ ") + c.name + " — " + c.detail;
  const text =
    "The daily check of your site's live Darwinex data found a problem. Until it's fixed, visitors may see older figures.\n\n" +
    "Failed:\n" + failed.map(line).join("\n") + "\n\n" +
    "All checks:\n" + checks.map(line).join("\n") + "\n\n" + SITE;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM || FROM_DEFAULT,
      to: [process.env.CONTACT_TO || TO_DEFAULT],
      subject: "Site data check failed — " + ticker,
      text: text
    })
  });
  if (!r.ok) throw new Error("resend " + r.status + " " + (await r.text().catch(() => "")));
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: "CRON_SECRET is not set" });
  if ((req.headers.authorization || "") !== "Bearer " + secret) return res.status(401).json({ error: "Unauthorized" });

  const results = [];
  for (const ticker of darwin.ALLOWED) {
    const checks = await runChecks(ticker);
    const alert = checks.some((c) => c.critical && !c.ok);
    let emailed = false, emailError = null;
    if (alert) {
      try { await sendAlert(ticker, checks); emailed = true; } catch (e) { emailError = e.message; console.error("health alert failed", e.message); }
    }
    results.push({ ticker, ok: !alert, emailed, emailError, checks });
  }
  return res.status(200).json({ ok: results.every((r) => r.ok), checkedAt: new Date().toISOString(), results });
};
