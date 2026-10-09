/* =====================================================================
   POST /api/contact  — serverless function (runs in cloudflare/worker.js)
   Receives the enquiry form, validates it, and emails it to the owner
   via Resend (https://resend.com). No dependencies — uses native fetch.

   Required secret (Cloudflare → Worker → Settings → Variables and Secrets):
     RESEND_API_KEY   — your Resend API key (re_...)
   Optional environment variables:
     CONTACT_TO       — recipient (default mptraderx.capital@gmail.com)
     CONTACT_FROM     — verified sender (default onboarding@resend.dev)
   See README.md for setup.
   ===================================================================== */

const TO_DEFAULT = "mptraderx.capital@gmail.com";
// onboarding@resend.dev works out of the box and can send to the
// Resend account owner's own address. Use a verified domain for production.
const FROM_DEFAULT = "Portfolio Site <onboarding@resend.dev>";

// naive in-memory rate limit (per warm instance) — light abuse guard
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
  rec.n += 1;
  return rec.n > MAX_PER_WINDOW;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

async function readBody(req) {
  if (req.body) {
    if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (_) { return {}; } }
    return req.body;
  }
  return await new Promise(function (resolve) {
    let data = "";
    req.on("data", function (c) { data += c; if (data.length > 1e5) req.destroy(); });
    req.on("end", function () { try { resolve(JSON.parse(data || "{}")); } catch (_) { resolve({}); } });
    req.on("error", function () { resolve({}); });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const now = Date.now();
  if (rateLimited(clientIp(req), now)) {
    return res.status(429).json({ error: "Too many requests. Please try again shortly." });
  }

  const body = await readBody(req);
  const name = (body.name || "").toString().trim();
  const email = (body.email || "").toString().trim();
  const message = (body.message || "").toString().trim();
  const honeypot = (body.company || "").toString().trim();

  // bot trap: silently accept so bots don't learn anything
  if (honeypot) return res.status(200).json({ ok: true });

  if (name.length < 2 || !EMAIL_RE.test(email) || message.length < 5) {
    return res.status(400).json({ error: "Please provide a valid name, email, and message." });
  }
  if (name.length > 120 || email.length > 200 || message.length > 5000) {
    return res.status(400).json({ error: "One of the fields is too long." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Misconfigured — let the front-end fall back to mailto gracefully.
    console.error("RESEND_API_KEY is not set");
    return res.status(500).json({ error: "Email service not configured." });
  }

  const to = process.env.CONTACT_TO || TO_DEFAULT;
  const from = process.env.CONTACT_FROM || FROM_DEFAULT;

  const html =
    '<div style="font-family:system-ui,sans-serif;font-size:15px;color:#23201B;line-height:1.6">' +
    '<h2 style="font-weight:600;margin:0 0 12px">New enquiry via your site</h2>' +
    '<p style="margin:0 0 4px"><strong>Name:</strong> ' + esc(name) + "</p>" +
    '<p style="margin:0 0 4px"><strong>Email:</strong> ' + esc(email) + "</p>" +
    '<p style="margin:12px 0 4px"><strong>Message:</strong></p>' +
    '<p style="margin:0;white-space:pre-wrap;padding:12px;background:#F4F1E9;border-radius:6px">' + esc(message) + "</p>" +
    "</div>";

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: from,
        to: [to],
        reply_to: email,
        subject: "Enquiry from " + name + " — via site",
        html: html,
        text: "Name: " + name + "\nEmail: " + email + "\n\n" + message
      })
    });

    if (!r.ok) {
      const detail = await r.text().catch(function () { return ""; });
      console.error("Resend error", r.status, detail);
      return res.status(502).json({ error: "Could not send the email. Please email me directly." });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("contact handler error", err);
    return res.status(500).json({ error: "Unexpected error sending the email." });
  }
};
