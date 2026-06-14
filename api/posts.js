/* =====================================================================
   /api/posts — blog posts store (owner-only writes).

   GET    -> { posts: [...] }                      (public)
   POST   -> create a post   (Authorization: Bearer <ADMIN_PASSWORD>)
   DELETE -> delete a post   (Authorization: Bearer <ADMIN_PASSWORD>)

   Storage: Upstash Redis REST (Vercel KV / Marketplace). No SDK — uses
   the REST command API via native fetch.

   Environment variables:
     ADMIN_PASSWORD       — required; the password you use on /admin
     KV_REST_API_URL      — from the Vercel/Upstash integration
     KV_REST_API_TOKEN    — from the Vercel/Upstash integration
     (UPSTASH_REDIS_REST_URL / _TOKEN are also accepted)
   ===================================================================== */

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const KEY = "posts";

async function kv(cmd) {
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + KV_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd)
  });
  if (!r.ok) throw new Error("kv " + r.status + " " + (await r.text().catch(() => "")));
  const j = await r.json();
  return j.result;
}
async function getPosts() { const v = await kv(["GET", KEY]); try { return v ? JSON.parse(v) : []; } catch (_) { return []; } }
async function setPosts(arr) { await kv(["SET", KEY, JSON.stringify(arr)]); }

function authed(req) {
  const a = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "").trim();
  const pw = process.env.ADMIN_PASSWORD || "";
  return pw.length > 0 && a.length > 0 && a === pw;
}
function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "post";
}
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max); }
const TAGS = ["risk", "process", "markets", "letter"];

async function readBody(req) {
  if (req.body) { if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (_) { return {}; } } return req.body; }
  return await new Promise(function (resolve) {
    let d = "";
    req.on("data", c => { d += c; if (d.length > 2e5) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch (_) { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET") {
    if (!KV_URL) return res.status(200).json({ posts: [] }); // not configured yet -> site falls back to static notes
    try { return res.status(200).json({ posts: await getPosts() }); }
    catch (e) { console.error(e); return res.status(200).json({ posts: [] }); }
  }

  // writes require auth + storage
  if (req.method === "POST" || req.method === "DELETE") {
    if (!authed(req)) return res.status(401).json({ error: "Unauthorized" });
    if (!KV_URL) return res.status(500).json({ error: "Storage not configured (KV env vars missing)." });

    if (req.method === "POST") {
      const b = await readBody(req);
      const title = clean(b.title, 160), body = clean(b.body, 20000);
      let tag = clean(b.tag, 20).toLowerCase(); if (TAGS.indexOf(tag) < 0) tag = "process";
      if (title.length < 2 || body.length < 2) return res.status(400).json({ error: "Title and body are required." });
      const now = new Date();
      const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.round(Math.random() * 1e6).toString(36));
      const post = {
        id: id, slug: slugify(title), title: title, body: body, tag: tag,
        date: now.toISOString().slice(0, 10), createdAt: now.toISOString()
      };
      const posts = await getPosts();
      posts.unshift(post);
      await setPosts(posts);
      return res.status(200).json({ ok: true, post: post });
    }

    // DELETE
    const b = await readBody(req);
    const id = clean(b.id, 80);
    if (!id) return res.status(400).json({ error: "Missing id." });
    const posts = await getPosts();
    const next = posts.filter(p => p.id !== id);
    await setPosts(next);
    return res.status(200).json({ ok: true, removed: posts.length - next.length });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
};
