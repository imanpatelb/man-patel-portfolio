/* =====================================================================
   /api/subscribe — sign-ups for letters and notes (double opt-in).

   POST {email}       -> emails a confirmation link; nothing is stored yet
                         beyond the pending link (KV, 7 days)
   GET ?confirm=token -> the link: adds the address to the "Letters" list
                         in Resend (api/_resend.js), tells the owner, and
                         redirects to /?subscribed=1#notes

   Until the list can be used (no KV, or Resend can't send from the
   domain yet), a sign-up falls back to emailing the owner, as before.

   Environment variables:
     RESEND_API_KEY — required; full access for the list and letters
     CONTACT_TO / CONTACT_FROM — owner notification (defaults below)
   ===================================================================== */

const letters = require("./_resend.js");

const TO_DEFAULT = "mptraderx.capital@gmail.com";
const FROM_DEFAULT = "Man Patel website <site@manpateltrades.com>";
const PENDING_TTL = 7 * 24 * 3600; // seconds a confirmation link stays valid
const DAILY_CAP = 80; // confirmation emails a day; Resend's free plan sends 100

let CF_KV = null; // set on Cloudflare (cloudflare/worker.js)

const HITS = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;
function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown";
}
function rateLimited(ip, now) {
  const rec = HITS.get(ip);
  if (!rec || now - rec.start > WINDOW_MS) { HITS.set(ip, { start: now, n: 1 }); return false; }
  rec.n += 1; return rec.n > MAX_PER_WINDOW;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

async function readBody(req) {
  if (req.body) { if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (_) { return {}; } } return req.body; }
  return await new Promise(function (resolve) {
    let data = "";
    req.on("data", c => { data += c; if (data.length > 1e4) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch (_) { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

// the owner hears about every sign-up (confirmed, or the old-style fallback)
async function notifyOwner(email, confirmed) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM || FROM_DEFAULT, to: [process.env.CONTACT_TO || TO_DEFAULT], reply_to: email,
      subject: (confirmed ? "New subscriber confirmed: " : "New subscriber: ") + email,
      html: '<div style="font-family:system-ui,sans-serif;font-size:15px;color:#23201B">' + (confirmed ? "Confirmed and added to the Letters list:" : "New newsletter subscriber:") + "<br><strong>" + esc(email) + "</strong></div>",
      text: (confirmed ? "Confirmed subscriber: " : "New subscriber: ") + email
    })
  });
  return r.ok;
}

// email a confirmation link; false if the list can't be used yet
async function startOptIn(email) {
  if (!CF_KV) return false;
  try {
    if (await CF_KV.get("sub:recent:" + email)) return true; // asked a moment ago: one email is enough
    const dayKey = "sub:sent:" + new Date().toISOString().slice(0, 10);
    const sent = +(await CF_KV.get(dayKey)) || 0;
    if (sent >= DAILY_CAP) { const e = new Error("daily cap"); e.cap = true; throw e; }
    const token = crypto.randomUUID().replace(/-/g, "");
    await CF_KV.put("sub:pending:" + token, JSON.stringify({ email, at: Date.now() }), { expirationTtl: PENDING_TTL });
    try { await letters.sendConfirm(email, token); }
    catch (e) { await CF_KV.delete("sub:pending:" + token); throw e; } // no email, so no link to keep
    await CF_KV.put("sub:recent:" + email, "1", { expirationTtl: 600 });
    await CF_KV.put(dayKey, String(sent + 1), { expirationTtl: 2 * 86400 });
    return true;
  } catch (e) {
    if (e.cap) throw e;
    console.error("confirmation email failed, falling back to notifying the owner:", e.message);
    return false;
  }
}

async function confirm(req, res) {
  const site = process.env.SITE_URL || "https://manpateltrades.com";
  const go = (result) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", site + "/?subscribed=" + result + "#notes");
    return res.status(302).end();
  };
  const token = String(req.query.confirm || "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
  if (!CF_KV || !token) return go("expired");
  const pending = await CF_KV.get("sub:pending:" + token, "json");
  if (!pending || !pending.email) return go("expired");
  // Confirmed either way: if the Resend list can't take them yet (a send-only key, or Resend
  // is down), they wait in KV and api/_resend.js syncConfirmed() moves them across later.
  try { await letters.addSubscriber(pending.email, CF_KV); }
  catch (e) { console.error("list not available, keeping the sign-up in KV:", e.message); await CF_KV.put("sub:confirmed:" + pending.email, JSON.stringify({ at: Date.now() })); }
  await CF_KV.delete("sub:pending:" + token);
  // (Resend's test addresses, used to check the flow, don't email the owner)
  if (!/@resend\.dev$/.test(pending.email)) { try { await notifyOwner(pending.email, true); } catch (_) { /* the subscription itself worked */ } }
  return go("1");
}

async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "GET" && req.query && req.query.confirm) return confirm(req, res);
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  if (rateLimited(clientIp(req), Date.now())) return res.status(429).json({ error: "Too many requests. Please try again shortly." });

  const body = await readBody(req);
  const email = (body.email || "").toString().trim().toLowerCase();
  const honeypot = (body.company || "").toString().trim();
  if (honeypot) return res.status(200).json({ ok: true }); // bot trap
  if (!EMAIL_RE.test(email) || email.length > 200) return res.status(400).json({ error: "Please provide a valid email." });
  if (!process.env.RESEND_API_KEY) { console.error("RESEND_API_KEY not set"); return res.status(500).json({ error: "Subscriptions not configured." }); }

  try {
    if (await startOptIn(email)) return res.status(200).json({ ok: true, pending: true });
    if (await notifyOwner(email, false)) return res.status(200).json({ ok: true });
    return res.status(502).json({ error: "Could not save your subscription. Please try again." });
  } catch (err) {
    if (err.cap) return res.status(429).json({ error: "Sign-ups are busy today. Please try again tomorrow." });
    console.error("subscribe error", err);
    return res.status(500).json({ error: "Unexpected error." });
  }
}

module.exports = handler;
module.exports.useKV = (ns) => { CF_KV = ns || null; };
