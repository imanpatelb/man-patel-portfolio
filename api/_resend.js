/* =====================================================================
   Resend helpers shared by /api/subscribe and /api/posts: the mailing
   list (contacts in a "Letters" segment) and the letters sent to it.

   Needs a full-access RESEND_API_KEY and manpateltrades.com verified in
   Resend (Domains). The underscore keeps Vercel from treating this file
   as an endpoint.

   Environment variables (all optional):
     LETTERS_FROM — sender (default "Man Patel <letters@manpateltrades.com>")
     CONTACT_TO   — where replies go (default mptraderx.capital@gmail.com)
     SITE_URL     — the site's address (default https://manpateltrades.com)
   ===================================================================== */

const API = "https://api.resend.com";
const SEGMENT_NAME = "Letters";
const site = () => process.env.SITE_URL || "https://manpateltrades.com";
const from = () => process.env.LETTERS_FROM || "Man Patel <letters@manpateltrades.com>";
const replyTo = () => process.env.CONTACT_TO || "mptraderx.capital@gmail.com";
const DISCLAIMER = "Capital at risk. Past performance is not indicative of future results. This is a personal letter about my own trading, not investment advice or an offer to invest.";

async function call(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  let j = null;
  try { j = await r.json(); } catch (_) { /* empty body */ }
  return { ok: r.ok, status: r.status, j };
}
function fail(r, what) {
  const e = new Error(what + ": " + r.status + " " + ((r.j && (r.j.message || r.j.name)) || ""));
  e.status = r.status;
  return e;
}

// The list's segment id: found or created once, then remembered in KV.
async function segmentId(kv) {
  const known = kv && await kv.get("letters:segment");
  if (known) return known;
  let r = await call("GET", "/segments");
  if (!r.ok) throw fail(r, "list segments");
  let seg = ((r.j && r.j.data) || []).find((s) => s.name === SEGMENT_NAME);
  if (!seg) {
    r = await call("POST", "/segments", { name: SEGMENT_NAME });
    if (!r.ok) throw fail(r, "create segment");
    seg = r.j;
  }
  if (kv) await kv.put("letters:segment", seg.id);
  return seg.id;
}

async function addSubscriber(email, kv) {
  const seg = await segmentId(kv);
  let r = await call("POST", "/contacts", { email, unsubscribed: false, segments: [{ id: seg }] });
  if (r.ok) return;
  // already a contact (say, subscribing again after unsubscribing): opt back in and join the list
  const who = "/contacts/" + encodeURIComponent(email);
  r = await call("PATCH", who, { unsubscribed: false });
  if (!r.ok) throw fail(r, "update contact");
  r = await call("POST", who + "/segments/" + seg);
  if (!r.ok && r.status !== 409 && r.status !== 422) throw fail(r, "add to segment");
}

/* ----- email bodies ----- */
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const INK = "#23201B", SOFT = "#5F584C", FAINT = "#6E665A", SAGE = "#3F5648", LINE = "#E2DCCF", PAPER = "#F4F1E9", CARD = "#FBF9F4";
const SERIF = "Georgia,'Times New Roman',serif", SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

// the post's light markup (blank line = paragraph, "## " = heading, **bold**), as email HTML
function bodyHtml(t) {
  return esc(t).split(/\n{2,}/).map((blk) => {
    blk = blk.trim();
    if (!blk) return "";
    if (/^##\s+/.test(blk)) return `<h2 style="font-family:${SERIF};font-weight:400;font-size:21px;line-height:1.3;color:${INK};margin:28px 0 10px">${blk.replace(/^##\s+/, "")}</h2>`;
    return `<p style="margin:0 0 16px">${blk.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</p>`;
  }).join("");
}
function bodyText(t) { return String(t).replace(/^##\s+/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1"); }

function shell(inner, foot) {
  return `<!doctype html><html><body style="margin:0;background:${PAPER}">
<div style="max-width:600px;margin:0 auto;padding:32px 20px">
<div style="font-family:${SERIF};font-size:17px;color:${INK};margin-bottom:22px">&#9679; Man Patel</div>
<div style="background:${CARD};border:1px solid ${LINE};border-radius:6px;padding:32px 30px;font-family:${SANS};font-size:16px;line-height:1.7;color:${INK}">${inner}</div>
<div style="font-family:${SANS};font-size:12px;line-height:1.6;color:${FAINT};padding:18px 4px 0">${foot}</div>
</div></body></html>`;
}

// a post as a letter; `unsub` is the unsubscribe link (Resend fills it in for broadcasts)
function letter(post, unsub) {
  const url = site() + (post.slug ? "/notes/" + post.slug : "/#notes");
  const html = shell(
    `<div style="font-family:${SANS};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${SAGE};margin-bottom:10px">${esc(post.tag || "letter")}</div>
<h1 style="font-family:${SERIF};font-weight:400;font-size:28px;line-height:1.2;color:${INK};margin:0 0 22px">${esc(post.title)}</h1>
${bodyHtml(post.body || "")}
<p style="margin:26px 0 0"><a href="${url}" style="color:${SAGE}">${post.slug ? "Read on manpateltrades.com" : "Visit manpateltrades.com"}</a></p>`,
    `${esc(DISCLAIMER)}<br><br>You're receiving this because you subscribed at manpateltrades.com. Reply to write back. <a href="${unsub}" style="color:${FAINT}">Unsubscribe</a>`
  );
  const text = `${post.title}\n\n${bodyText(post.body || "")}\n\n${post.slug ? "Read on the site" : "Visit the site"}: ${url}\n\n--\n${DISCLAIMER}\nYou're receiving this because you subscribed at manpateltrades.com. Unsubscribe: ${unsub}`;
  return { html, text };
}

async function sendLetter(post, kv) {
  const seg = await segmentId(kv);
  const m = letter(post, "{{{RESEND_UNSUBSCRIBE_URL}}}");
  const r = await call("POST", "/broadcasts", { segment_id: seg, from: from(), reply_to: replyTo(), subject: post.title, html: m.html, text: m.text, name: "Post: " + post.title, send: true });
  if (!r.ok) throw fail(r, "send broadcast");
  return r.j && r.j.id;
}

// the same letter to one address, for a preview before publishing
async function sendTest(post, to) {
  const m = letter(post, site() + "/#notes");
  const r = await call("POST", "/emails", { from: from(), to: [to], reply_to: replyTo(), subject: "[Test] " + post.title, html: m.html, text: m.text });
  if (!r.ok) throw fail(r, "send test");
}

async function sendConfirm(email, token) {
  const link = site() + "/api/subscribe?confirm=" + token;
  const html = shell(
    `<h1 style="font-family:${SERIF};font-weight:400;font-size:26px;line-height:1.25;color:${INK};margin:0 0 16px">Confirm your subscription</h1>
<p style="margin:0 0 22px;color:${SOFT}">Please confirm you'd like my letters and notes on the process and the markets, by email, occasionally.</p>
<p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;background:${INK};color:${PAPER};text-decoration:none;font-size:15px;padding:12px 22px;border-radius:2px">Confirm subscription</a></p>
<p style="margin:0;font-size:13px;color:${FAINT}">If you didn't ask for this, ignore this email and you won't hear from me. The link works for 7 days.</p>`,
    "Sent because this address was entered at manpateltrades.com."
  );
  const text = `Confirm your subscription to Man Patel's letters and notes:\n${link}\n\nIf you didn't ask for this, ignore this email. The link works for 7 days.`;
  const r = await call("POST", "/emails", { from: from(), to: [email], reply_to: replyTo(), subject: "Confirm your subscription", html, text });
  if (!r.ok) throw fail(r, "send confirmation");
}

// Confirmed sign-ups that couldn't join the Resend list yet (say, the key was send-only)
// wait in KV under "sub:confirmed:<email>"; this moves them across once it works.
async function syncConfirmed(kv) {
  if (!kv || !kv.list) return 0;
  let moved = 0, cursor;
  do {
    const page = await kv.list({ prefix: "sub:confirmed:", cursor });
    for (const k of page.keys) {
      await addSubscriber(k.name.slice("sub:confirmed:".length), kv); // throws while the key lacks access
      await kv.delete(k.name);
      moved++;
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return moved;
}

module.exports = { segmentId, addSubscriber, syncConfirmed, sendLetter, sendTest, sendConfirm, letter };
