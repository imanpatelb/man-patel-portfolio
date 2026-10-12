/* =====================================================================
   Pages the Worker builds from the post list (KV "posts:list"):
     /notes/<slug>     — one post, with its own title, description and
                         share card (Open Graph / X), comments and subscribe
     /notes/feed.xml   — RSS of every post
     /sitemap.xml      — the site's pages plus every post
   ===================================================================== */

const SITE_NAME = "Man Patel";
const STYLES = "/assets/css/styles.css?v=24";
const POST_JS = "/assets/js/post.js?v=1";
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DISCLAIMER = "Capital at risk. Past performance is not indicative of future results. This is a personal note about my own trading, not investment advice or an offer to invest.";

export function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// the slug a post is reached by (older posts may predate stored slugs)
export function slugOf(p) {
  return p.slug || String(p.title || "post").toLowerCase().replace(/['’‘`]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "post";
}

// the post's light markup: blank line = paragraph, "## " = subheading, **bold**
export function bodyHtml(t) {
  return esc(t).split(/\n{2,}/).map((blk) => {
    blk = blk.trim();
    if (!blk) return "";
    if (/^##\s+/.test(blk)) return "<h2>" + blk.replace(/^##\s+/, "") + "</h2>";
    return "<p>" + blk.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>") + "</p>";
  }).join("\n");
}
// first paragraph as plain text, cut at a word near `max` characters
export function excerpt(t, max = 160) {
  const first = String(t || "").split(/\n{2,}/).map((b) => b.trim()).find((b) => b && !/^##\s/.test(b)) || "";
  const plain = first.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ").trim();
  if (plain.length <= max) return plain;
  return plain.slice(0, plain.lastIndexOf(" ", max - 1) > 60 ? plain.lastIndexOf(" ", max - 1) : max - 1).replace(/[,;:.\s]+$/, "") + "…";
}
function longDate(iso) { const [y, m, d] = String(iso).split("-").map(Number); return d + " " + MO[m - 1] + " " + y; }
function rfc822(p) { return new Date(p.createdAt || p.date + "T12:00:00Z").toUTCString(); }

const THEME_EARLY = '<script>(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})();</script>';
const ICON = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23F4F1E9'/%3E%3Ccircle cx='16' cy='16' r='5' fill='%233F5648'/%3E%3C/svg%3E">`;
const FONTS = '<link rel="preload" href="/assets/fonts/fraunces-latin.woff2" as="font" type="font/woff2" crossorigin>\n<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>';
const THEME_BTN = `<button class="theme-btn" id="themeBtn" type="button" aria-label="Switch to dark theme"><svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/></svg><svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/></svg></button>`;

function shell({ title, description, url, head = "", body, origin }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#F4F1E9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#161411" media="(prefers-color-scheme: dark)">
${THEME_EARLY}
${ICON}
<link rel="alternate" type="application/rss+xml" title="${SITE_NAME} — Notes" href="${origin}/notes/feed.xml">
${FONTS}
<link rel="stylesheet" href="${STYLES}">
${head}
</head>
<body>
${body}
<script src="${POST_JS}" defer></script>
</body>
</html>`;
}

function topbar() {
  return `<header id="hdr"><div class="legal-top post-top"><a class="brand" href="/"><span class="dot"></span>${SITE_NAME}</a><div class="post-top-r"><a href="/#notes">&larr; All notes</a>${THEME_BTN}</div></div></header>`;
}
function footer(cfdPct) {
  return `<footer><div class="wrap post-foot">
<p class="disclosure cfd-warn">CFDs are complex instruments and come with a high risk of losing money rapidly due to leverage. <span class="cfd-pct">${esc(cfdPct)}</span>% of retail investor accounts lose money when trading CFDs with Darwinex. You should consider whether you understand how CFDs work and whether you can afford to take the high risk of losing your money.</p>
<p class="disclosure">Capital at risk. Past performance is not indicative of future results. Man Patel is an individual trader and is not a regulated entity, investment adviser, or fund manager. Nothing on this website constitutes investment advice, a solicitation, or an offer to buy or sell any financial instrument.</p>
<p class="copy">&copy; ${new Date().getUTCFullYear()} Man Patel &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="/notes/feed.xml">RSS</a></p>
</div></footer>`;
}
const SUBSCRIBE = `<div class="subscribe post-sub">
  <div class="sub-wrap">
    <div class="sub-h">Letters &amp; notes</div>
    <div class="sub-p">New writing on the process and the markets, by email, occasionally. Unsubscribe anytime &mdash; see the <a href="/privacy">privacy policy</a>.</div>
  </div>
  <form class="sub-form" id="subForm" novalidate>
    <label for="subEmail" class="sr-only">Email</label>
    <input id="subEmail" name="email" type="email" autocomplete="email" placeholder="you@email.com" required>
    <input class="hp" id="subCompany" name="company" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button class="btn" id="subBtn" type="submit">Subscribe</button>
  </form>
  <div class="form-status" id="subStatus" role="status" aria-live="polite" style="flex-basis:100%"></div>
</div>`;

export function postPage(post, all, { origin, comments, cfdPct, x }) {
  const slug = slugOf(post), url = origin + "/notes/" + slug, desc = excerpt(post.body) || DISCLAIMER;
  const img = origin + "/assets/img/og.png", handle = (String(x || "").match(/x\.com\/([A-Za-z0-9_]+)/) || [])[1];
  const ld = { "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title, description: desc, datePublished: post.createdAt || post.date, mainEntityOfPage: url, url, image: img, author: { "@type": "Person", name: SITE_NAME, url: origin + "/" }, publisher: { "@type": "Person", name: SITE_NAME } };
  const head = `<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(post.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${img}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Man Patel — Recorded, not promised.">
<meta property="article:published_time" content="${esc(post.createdAt || post.date)}">
<meta name="twitter:card" content="summary_large_image">
${handle ? `<meta name="twitter:site" content="@${esc(handle)}">\n<meta name="twitter:creator" content="@${esc(handle)}">\n` : ""}<meta name="twitter:title" content="${esc(post.title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
  const more = all.filter((p) => slugOf(p) !== slug).slice(0, 3);
  const giscus = comments && comments.repo && comments.repoId && comments.categoryId
    ? `<div id="giscus" data-term="${esc(slug)}" data-repo="${esc(comments.repo)}" data-repo-id="${esc(comments.repoId)}" data-category="${esc(comments.category || "Announcements")}" data-category-id="${esc(comments.categoryId)}"></div>`
    : `<p class="pm-cnote faint">Comments open soon.</p>`;
  const share = "https://x.com/intent/tweet?text=" + encodeURIComponent(post.title) + "&url=" + encodeURIComponent(url) + (handle ? "&via=" + handle : "");
  const body = `${topbar()}
<main class="post">
  <article>
    <div class="post-meta"><time datetime="${esc(post.date)}">${esc(longDate(post.date))}</time><span class="post-tag">${esc(post.tag)}</span></div>
    <h1>${esc(post.title)}</h1>
    <div class="post-body">
${bodyHtml(post.body)}
    </div>
    <div class="post-share">
      <span class="ps-k">Share</span>
      <a href="${esc(share)}" target="_blank" rel="noopener">X</a>
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}" target="_blank" rel="noopener">LinkedIn</a>
      <button type="button" id="copyLink" data-url="${esc(url)}">Copy link</button>
    </div>
    <p class="post-disc">${esc(DISCLAIMER)}</p>
  </article>
  ${SUBSCRIBE}
  <section class="post-comments" aria-label="Comments">
    <h2 class="pm-ch">Comments</h2>
    ${giscus}
  </section>
  ${more.length ? `<section class="post-more" aria-label="More notes"><h2 class="pm-ch">More notes</h2>${more.map((p) => `<a class="note note-link" href="/notes/${esc(slugOf(p))}"><span class="nd">${esc(longDate(p.date).replace(/ (\d{2})(\d{2})$/, " $2"))}</span><span class="nt">${esc(p.title)}</span><span class="ntag">${esc(p.tag)}</span></a>`).join("")}</section>` : ""}
</main>
${footer(cfdPct)}`;
  return shell({ title: post.title + " — " + SITE_NAME, description: desc, url, head, body, origin });
}

export function notFoundPage(origin, cfdPct) {
  const body = `${topbar()}
<main class="post post-404">
  <div class="post-meta"><span>404</span></div>
  <h1>That note isn&rsquo;t here.</h1>
  <p class="post-lead">It may have been moved or taken down. Every note is listed on the <a href="/#notes">home page</a>.</p>
</main>
${footer(cfdPct)}`;
  return shell({ title: "Not found — " + SITE_NAME, description: "This page doesn't exist.", url: origin + "/", head: '<meta name="robots" content="noindex">', body, origin });
}

function cdata(s) { return "<![CDATA[" + String(s).replace(/]]>/g, "]]]]><![CDATA[>") + "]]>"; }
export function feed(posts, origin) {
  const items = posts.map((p) => {
    const url = origin + "/notes/" + slugOf(p);
    return `  <item>
    <title>${esc(p.title)}</title>
    <link>${url}</link>
    <guid isPermaLink="true">${url}</guid>
    <pubDate>${rfc822(p)}</pubDate>
    <category>${esc(p.tag)}</category>
    <description>${esc(excerpt(p.body, 280))}</description>
    <content:encoded>${cdata(bodyHtml(p.body) + "<p><em>" + esc(DISCLAIMER) + "</em></p>")}</content:encoded>
  </item>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>${SITE_NAME} — Notes</title>
  <link>${origin}/#notes</link>
  <atom:link href="${origin}/notes/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Notes on the process and the markets from a discretionary multi-asset trader. Not investment advice.</description>
  <language>en</language>
  <lastBuildDate>${posts.length ? rfc822(posts[0]) : new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>
`;
}

export function sitemap(posts, origin) {
  const page = (path, freq, pri, mod) => `  <url>\n    <loc>${origin}${path}</loc>${mod ? `\n    <lastmod>${mod}</lastmod>` : ""}\n    <changefreq>${freq}</changefreq>\n    <priority>${pri}</priority>\n  </url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[page("/", "daily", "1.0", posts[0] && posts[0].date), page("/factsheet", "daily", "0.6"), ...posts.map((p) => page("/notes/" + slugOf(p), "monthly", "0.7", p.date)), page("/privacy", "yearly", "0.3"), page("/terms", "yearly", "0.3")].join("\n")}
</urlset>
`;
}
