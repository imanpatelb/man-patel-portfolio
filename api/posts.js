/* =====================================================================
   /api/posts — blog posts, stored as data/posts.json in the GitHub repo.

   GET    -> { posts, configured }   (live copy, via the GitHub API; used by /admin)
   POST   -> create a post   (Authorization: Bearer <ADMIN_PASSWORD>)
   DELETE -> delete a post   (Authorization: Bearer <ADMIN_PASSWORD>)

   Every publish or delete is a commit, so posts have full history and
   can't vanish with a database. The site serves /data/posts.json live from
   the repo through this handler (cloudflare/worker.js, cached for a minute),
   so new posts appear about a minute after publishing, with no rebuild.

   Environment variables:
     ADMIN_PASSWORD — required; the password used on /admin
     GITHUB_TOKEN   — required for writes; a fine-grained token with
                      Contents: Read and write on this repository only
     GITHUB_REPO    — optional (default imanpatelb/man-patel-portfolio)
     GITHUB_BRANCH  — optional (default main)
   ===================================================================== */

const TOKEN = process.env.GITHUB_TOKEN || "";
const REPO = process.env.GITHUB_REPO || "imanpatelb/man-patel-portfolio";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const FILE = "data/posts.json";
const API = "https://api.github.com/repos/" + REPO + "/contents/" + FILE;
const TAGS = ["risk", "process", "markets", "letter"];

function gh(method, url, body) {
  return fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ManPatelPortfolio",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

// Current posts and the file's sha (null if the file doesn't exist yet).
async function readPosts() {
  const r = await gh("GET", API + "?ref=" + encodeURIComponent(BRANCH));
  if (r.status === 404) return { posts: [], sha: null };
  if (!r.ok) throw new Error("github read " + r.status);
  const j = await r.json();
  let posts = [];
  try { posts = JSON.parse(Buffer.from(j.content, "base64").toString("utf8")); } catch (_) { posts = []; }
  return { posts: Array.isArray(posts) ? posts : [], sha: j.sha };
}

async function writePosts(posts, sha, message) {
  const r = await gh("PUT", API, {
    message,
    content: Buffer.from(JSON.stringify(posts, null, 2) + "\n", "utf8").toString("base64"),
    sha: sha || undefined,
    branch: BRANCH
  });
  if (r.status === 409 || r.status === 422) { const e = new Error("conflict"); e.conflict = true; throw e; }
  if (!r.ok) throw new Error("github write " + r.status + " " + (await r.text().catch(() => "")));
}

// Read-modify-write; if someone else changed the file in between, re-read and retry once.
async function update(change) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { posts, sha } = await readPosts();
    const result = change(posts);
    if (!result) return null; // nothing to change — no commit
    try { await writePosts(result.posts, sha, result.message); return result; }
    catch (e) { if (!e.conflict || attempt === 1) throw e; }
  }
}

function authed(req) {
  const a = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "").trim();
  const pw = process.env.ADMIN_PASSWORD || "";
  return pw.length > 0 && a.length > 0 && a === pw;
}
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "post"; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max); }

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
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    if (!TOKEN) return res.status(200).json({ posts: [], configured: false });
    try { return res.status(200).json({ posts: (await readPosts()).posts, configured: true }); }
    catch (e) { console.error(e.message); return res.status(502).json({ error: "Couldn't read posts from GitHub." }); }
  }

  if (req.method === "POST" || req.method === "DELETE") {
    if (!authed(req)) return res.status(401).json({ error: "Unauthorized" });
    if (!TOKEN) return res.status(500).json({ error: "Blog storage isn't set up yet (GITHUB_TOKEN)." });
    const b = await readBody(req);

    try {
      if (req.method === "POST") {
        const title = clean(b.title, 160), body = clean(b.body, 20000);
        let tag = clean(b.tag, 20).toLowerCase(); if (TAGS.indexOf(tag) < 0) tag = "process";
        if (title.length < 2 || body.length < 2) return res.status(400).json({ error: "Title and body are required." });
        const now = new Date();
        const post = {
          id: crypto.randomUUID(), slug: slugify(title), title, body, tag,
          date: now.toISOString().slice(0, 10), createdAt: now.toISOString()
        };
        await update((posts) => ({ posts: [post].concat(posts), message: "Publish post: " + title }));
        return res.status(200).json({ ok: true, post });
      }

      const id = clean(b.id, 80);
      if (!id) return res.status(400).json({ error: "Missing id." });
      let removed = 0;
      await update((posts) => {
        const gone = posts.find((p) => p.id === id);
        if (!gone) return null; // e.g. /admin's login check — never commits
        removed = 1;
        return { posts: posts.filter((p) => p.id !== id), message: "Delete post: " + gone.title };
      });
      return res.status(200).json({ ok: true, removed });
    } catch (e) {
      console.error("posts write failed", e.message);
      return res.status(502).json({ error: "Couldn't save to GitHub. Check that GITHUB_TOKEN is valid." });
    }
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
};
