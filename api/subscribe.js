/* =====================================================================
   POST /api/subscribe — capture an email for letters/updates.

   Stores the subscriber in a Resend Audience when RESEND_AUDIENCE_ID is
   set, and always notifies the owner by email. Uses native fetch — no
   dependencies. Reuses the same RESEND_API_KEY as /api/contact.

   Environment variables:
     RESEND_API_KEY      — required (re_...)
     RESEND_AUDIENCE_ID  — optional; create an Audience in Resend and paste its id
     CONTACT_TO          — optional; owner notification recipient (default below)
     CONTACT_FROM        — optional; verified sender (default below)
   ===================================================================== */

const TO_DEFAULT = "mptraderx.capital@gmail.com";
const FROM_DEFAULT = "Portfolio Site <onboarding@resend.dev>";

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

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  if (rateLimited(clientIp(req), Date.now())) return res.status(429).json({ error: "Too many requests. Please try again shortly." });

  const body = await readBody(req);
  const email = (body.email || "").toString().trim().toLowerCase();
  const honeypot = (body.company || "").toString().trim();
  if (honeypot) return res.status(200).json({ ok: true }); // bot trap
  if (!EMAIL_RE.test(email) || email.length > 200) return res.status(400).json({ error: "Please provide a valid email." });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.error("RESEND_API_KEY not set"); return res.status(500).json({ error: "Subscriptions not configured." }); }
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const to = process.env.CONTACT_TO || TO_DEFAULT;
  const from = process.env.CONTACT_FROM || FROM_DEFAULT;

  let stored = false;
  try {
    // 1) Add to Resend Audience if configured (the durable subscriber list)
    if (audienceId) {
      const r = await fetch("https://api.resend.com/audiences/" + audienceId + "/contacts", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, unsubscribed: false })
      });
      stored = r.ok || r.status === 409; // 409 = already a contact
      if (!r.ok && r.status !== 409) console.error("Resend audience error", r.status, await r.text().catch(() => ""));
    }

    // 2) Always notify the owner so no signup is missed
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: from, to: [to], reply_to: email,
        subject: "New subscriber: " + email,
        html: '<div style="font-family:system-ui,sans-serif;font-size:15px;color:#23201B">New newsletter subscriber:<br><strong>' + esc(email) + "</strong></div>",
        text: "New subscriber: " + email
      })
    }).then(r => { if (r.ok) stored = true; });

    if (!stored) return res.status(502).json({ error: "Could not save your subscription. Please try again." });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("subscribe error", err);
    return res.status(500).json({ error: "Unexpected error." });
  }
};
