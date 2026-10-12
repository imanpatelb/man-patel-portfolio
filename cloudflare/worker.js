/* =====================================================================
   Cloudflare Worker for manpateltrades.com.

   - Pages, styles and data come from the static build (dist/, made by
     cloudflare/build.mjs from an allow-list, so source and secrets never ship).
   - /api/* runs the same handlers in api/, which are written for Node-style
     req/res; runNode() adapts a fetch Request to them and back.
   - Visitors never wait on slow or heavy work. The live Darwinex data is served
     from a stored copy in KV (env.CACHE) and refreshed behind the response
     (ctx.waitUntil), so a slow upstream or the free plan's CPU limit can't hold
     up or break a page view. Blog posts live in the same KV namespace.
   - The daily data check (api/health.js) runs on the cron in wrangler.jsonc.
   ===================================================================== */

import { postPage, notFoundPage, feed, sitemap, slugOf } from "./pages.js";

const API = {
  darwin: () => import("../api/darwin.js"),
  posts: () => import("../api/posts.js"),
  contact: () => import("../api/contact.js"),
  subscribe: () => import("../api/subscribe.js"),
  health: () => import("../api/health.js")
};
const APEX = "manpateltrades.com";
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload"
};

// The handlers read process.env, some of them when first loaded, so copy the
// string bindings (vars and secrets) in before loading them.
function syncEnv(env) { for (const k in env) if (typeof env[k] === "string") process.env[k] = env[k]; }
async function handlerOf(name, env) {
  const m = await API[name](), h = m.default || m;
  if (h.useKV) h.useKV(env.CACHE); // darwin: last good data; posts: the posts; subscribe: pending sign-ups
  return h;
}

/* ----- fetch Request -> Node-style (req, res) -> fetch Response ----- */
async function runNode(handler, request, ctx) {
  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach((v, k) => { headers[k] = v; });
  if (!headers["x-forwarded-for"] && headers["cf-connecting-ip"]) headers["x-forwarded-for"] = headers["cf-connecting-ip"];
  let body;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.text();
    try { body = text ? JSON.parse(text) : {}; } catch (_) { body = text; }
  }
  const req = {
    method: request.method, url: url.pathname + url.search, headers, body,
    query: Object.fromEntries(url.searchParams),
    socket: { remoteAddress: headers["cf-connecting-ip"] || "unknown" },
    waitUntil: ctx ? (p) => ctx.waitUntil(p) : undefined, // lets a handler finish work after responding
    on() {}, destroy() {}
  };
  let status = 200, payload = null;
  const out = new Headers();
  const res = {
    statusCode: 200,
    setHeader(k, v) { out.set(k, String(v)); return res; },
    getHeader(k) { return out.get(k); },
    status(c) { status = c; res.statusCode = c; return res; },
    json(o) { if (!out.has("content-type")) out.set("content-type", "application/json; charset=utf-8"); payload = JSON.stringify(o); return res; },
    send(b) { payload = b; return res; },
    end(b) { if (b != null) payload = b; return res; }
  };
  await handler(req, res);
  for (const k in SECURITY) if (!out.has(k)) out.set(k, SECURITY[k]);
  return new Response(request.method === "HEAD" ? null : payload, { status, headers: out });
}

// _headers only covers files served without the Worker; add the same rules here
function secure(res) {
  const r = new Response(res.body, res);
  for (const k in SECURITY) if (!r.headers.has(k)) r.headers.set(k, SECURITY[k]);
  return r;
}

/* ----- edge cache for /api/darwin: kept here as long as its s-maxage says. Browsers are told not to
   store it (s-maxage and stale-while-revalidate are meant for the edge; passed on, a browser would show
   a day-old copy while it rechecked). ----- */
async function edgeCached(key, ctx, make) {
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) {
    const r = new Response(hit.body, hit);
    r.headers.set("cache-control", "no-store");
    return r;
  }
  const res = await make();
  const m = /s-maxage=(\d+)/.exec(res.headers.get("cache-control") || "");
  if (res.status === 200 && m) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set("cache-control", "public, max-age=" + m[1]);
    ctx.waitUntil(cache.put(key, copy));
  }
  const out = new Response(res.body, res);
  out.headers.set("cache-control", "no-store");
  return out;
}

/* ----- posts: the list /admin keeps in KV; the copy deployed with the site until there is one ----- */
async function posts(request, env) {
  const list = env.CACHE ? await env.CACHE.get("posts:list") : null;
  if (list) return new Response(list, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache", ...SECURITY } });
  return secure(await env.ASSETS.fetch(request));
}

/* ----- post pages, feed and sitemap (cloudflare/pages.js) ----- */
async function postList(env, origin) {
  const list = env.CACHE ? await env.CACHE.get("posts:list", "json") : null;
  if (Array.isArray(list)) return list;
  const r = await env.ASSETS.fetch(new Request(origin + "/data/posts.json"));
  return r.ok ? r.json() : [];
}
async function siteInfo(env, origin) {
  let config = {};
  try { const r = await env.ASSETS.fetch(new Request(origin + "/data/portfolios.json")); if (r.ok) config = (await r.json()).config || {}; } catch (_) { /* defaults below */ }
  let cfd = config.cfdLossPct;
  try { const live = env.CACHE && await env.CACHE.get("darwin:KBAD", "json"); if (live && typeof live.cfdLossPct === "number") cfd = live.cfdLossPct; } catch (_) { /* stored figure */ }
  return { origin, comments: config.comments, x: config.x, cfdPct: typeof cfd === "number" ? cfd.toFixed(2) : "53.84" };
}
function page(body, type, status) {
  return new Response(body, { status: status || 200, headers: { "content-type": type, "cache-control": "public, max-age=60", ...SECURITY } });
}
async function notes(url, env) {
  const origin = url.origin, path = url.pathname;
  if (path === "/notes" || path === "/notes/") return Response.redirect(origin + "/#notes", 301);
  const posts = await postList(env, origin);
  if (path === "/notes/feed.xml") return page(feed(posts, origin), "application/rss+xml; charset=utf-8");
  const m = /^\/notes\/([a-z0-9-]+)\/?$/.exec(path), post = m && posts.find((p) => slugOf(p) === m[1]);
  const info = await siteInfo(env, origin);
  if (!post) return page(notFoundPage(origin, info.cfdPct), "text/html; charset=utf-8", 404);
  return page(postPage(post, posts, info), "text/html; charset=utf-8");
}

async function api(name, request, env, ctx, url) {
  const run = async () => runNode(await handlerOf(name, env), request, ctx);
  if (name === "darwin" && request.method === "GET") return edgeCached(new Request(url.toString()), ctx, run);
  return run();
}

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // one address: https, without www
    if (url.hostname === "www." + APEX || (url.protocol === "http:" && url.hostname === APEX)) {
      url.hostname = APEX; url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    syncEnv(env);
    if (url.pathname === "/data/posts.json") return posts(request, env);
    if (url.pathname === "/notes" || url.pathname.startsWith("/notes/")) return notes(url, env);
    if (url.pathname === "/sitemap.xml") return page(sitemap(await postList(env, url.origin), url.origin), "application/xml; charset=utf-8");
    const m = /^\/api\/([a-z]+)\/?$/.exec(url.pathname);
    if (m && API[m[1]]) return api(m[1], request, env, ctx, url);
    if (url.pathname.startsWith("/api/")) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "content-type": "application/json", ...SECURITY } });
    return secure(await env.ASSETS.fetch(request));
  },

  // Daily: refresh the stored live data, then run the data check. The health handler insists on a
  // bearer secret, so it gets a one-off one. Its "site serves live data" check calls this site's
  // own address; a Worker can't reliably fetch its own domain, so those calls go straight to
  // worker.fetch (the same code visitors hit).
  async scheduled(event, env, ctx) {
    syncEnv(env);
    const darwin = await handlerOf("darwin", env);
    for (const t of darwin.ALLOWED) { try { await darwin.refresh(t); } catch (e) { console.error("refresh failed", t, e.message); } }
    // confirmed sign-ups still waiting for the Resend list (see api/_resend.js syncConfirmed)
    try { const n = await (await import("../api/_resend.js")).default.syncConfirmed(env.CACHE); if (n) console.log("moved", n, "subscriber(s) to the Letters list"); }
    catch (e) { console.error("subscriber sync waiting:", e.message); }
    const secret = crypto.randomUUID(), realFetch = globalThis.fetch;
    process.env.CRON_SECRET = secret;
    globalThis.fetch = (input, init) => {
      const req = new Request(input, init);
      return new URL(req.url).hostname === APEX ? worker.fetch(req, env, ctx) : realFetch(req);
    };
    try {
      const res = await runNode(await handlerOf("health", env), new Request("https://" + APEX + "/api/health", { headers: { authorization: "Bearer " + secret } }), ctx);
      const j = await res.json().catch(() => ({}));
      console.log("health", res.status, JSON.stringify({ ok: j.ok, results: (j.results || []).map((r) => ({ ticker: r.ticker, ok: r.ok, emailed: r.emailed })) }));
    } finally { globalThis.fetch = realFetch; delete process.env.CRON_SECRET; }
  }
};
export default worker;
