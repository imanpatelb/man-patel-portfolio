/* =====================================================================
   Pages the Worker builds from the post list (KV "posts:list"):
     /notes/<slug>     — one post, with its own title, description and
                         share card (Open Graph / X), comments and subscribe
     /notes/feed.xml   — RSS of every post
     /sitemap.xml      — the site's pages plus every post
   ===================================================================== */

const SITE_NAME = "Man Patel";
// the header monogram (same markup as index.html: the P is stored once, drawn, and cut out of the M)
const MARK = '<svg class="mono" viewBox="-.5 -.5 65.82 41" aria-hidden="true"><defs><path id="mpP" d="M64.63 13.28Q64.18 16.26 62.74 18.64Q61.3 21.02 59.07 22.7Q56.83 24.37 53.96 25.25Q51.09 26.14 47.72 26.14Q45 26.14 43.2 25.66Q41.4 25.17 39.6 24.22L40.21 23.01Q41.84 23.94 43.44 24.35Q45.04 24.76 46.83 24.76Q50.01 24.76 52.47 23.47Q54.94 22.18 56.55 19.55Q58.17 16.92 58.79 12.9Q59.42 8.92 58.55 6.37Q57.68 3.81 55.64 2.58Q53.61 1.35 50.7 1.35Q49.07 1.35 48.13 1.95Q47.2 2.55 46.78 3.88Q46.65 4.31 46.17 6.15Q45.68 7.98 44.95 10.74Q44.21 13.5 43.36 16.73Q42.5 19.95 41.65 23.19Q40.8 26.43 40.06 29.25Q39.32 32.06 38.82 33.98Q38.32 35.91 38.17 36.47Q37.96 37.31 38.17 37.74Q38.38 38.18 38.95 38.27L41.84 38.62Q42.23 38.69 42.41 38.85Q42.6 39.02 42.6 39.26Q42.6 39.59 42.33 39.8Q42.06 40 41.55 40H27.98Q27.51 40 27.31 39.83Q27.11 39.66 27.11 39.37Q27.11 39.06 27.35 38.86Q27.58 38.67 28.01 38.59L30.04 38.29Q30.88 38.17 31.29 37.79Q31.7 37.4 31.99 36.57Q32.18 36.02 32.72 34.1Q33.26 32.18 34.03 29.37Q34.8 26.56 35.68 23.3Q36.56 20.05 37.42 16.78Q38.29 13.52 39.03 10.69Q39.77 7.86 40.27 5.9Q40.77 3.95 40.9 3.35Q41.04 2.66 40.82 2.27Q40.59 1.88 39.98 1.77L37.77 1.39Q37.35 1.28 37.18 1.13Q37.01 .97 37.01 .72Q37.01 .35 37.29 .17Q37.58 0 38.13 0H51.74Q55.04 0 57.63 .95Q60.23 1.9 61.95 3.66Q63.68 5.42 64.4 7.86Q65.11 10.3 64.63 13.28Z"/><mask id="mpCut" maskUnits="userSpaceOnUse" x="-2" y="-2" width="68.82" height="44"><rect x="-2" y="-2" width="68.82" height="44" fill="#fff"/><use href="#mpP" stroke="#000" stroke-width="3.2" stroke-linejoin="round"/><path d="M43.06-2H90V42H33.73z"/></mask></defs><path id="mpM" class="m" d="M25.15 29.33 23.33 30.75 41.2 1.79Q41.88 .69 42.57 .35Q43.27 0 44.14 0H50.63Q51.12 0 51.29 .16Q51.47 .32 51.45 .61Q51.43 .94 51.2 1.13Q50.97 1.32 50.58 1.41L48.18 1.84Q47.64 1.95 47.27 2.34Q46.9 2.73 46.75 3.46Q46.47 4.9 46.01 7.09Q45.56 9.27 45.01 11.92Q44.45 14.57 43.86 17.44Q43.26 20.31 42.68 23.15Q42.1 25.98 41.58 28.56Q41.06 31.13 40.66 33.18Q40.27 35.22 40.06 36.48Q39.93 37.18 40.12 37.65Q40.32 38.11 40.92 38.24L43.39 38.63Q43.73 38.71 43.9 38.87Q44.08 39.02 44.05 39.29Q44.03 39.63 43.78 39.82Q43.53 40 43.05 40H30.14Q29.66 40 29.46 39.82Q29.25 39.63 29.26 39.32Q29.29 38.99 29.53 38.83Q29.77 38.67 30.08 38.59L32.41 38.22Q33.07 38.1 33.5 37.67Q33.92 37.24 34.09 36.4Q34.54 34.23 35.05 31.79Q35.57 29.35 36.14 26.7Q36.71 24.05 37.3 21.28Q37.88 18.52 38.47 15.7Q39.05 12.88 39.59 10.09Q40.14 7.3 40.62 4.63L41.47 4.12L22.82 34.54Q22.33 35.26 21.97 35.57Q21.6 35.88 21.09 35.88Q20.68 35.88 20.41 35.49Q20.14 35.09 20.03 34.49Q19.74 32.34 19.43 29.94Q19.12 27.53 18.79 24.96Q18.47 22.39 18.12 19.75Q17.78 17.1 17.43 14.45Q17.08 11.8 16.72 9.24Q16.37 6.68 16.01 4.32L16.84 4.1L7.73 33.9Q7.14 35.97 7.58 36.98Q8.03 38 9.39 38.3L10.88 38.61Q11.54 38.82 11.5 39.27Q11.47 39.61 11.18 39.81Q10.9 40 10.39 40H.93Q.42 40 .2 39.81Q-.02 39.62 0 39.32Q.02 38.98 .26 38.8Q.51 38.62 .91 38.52L2.15 38.28Q3.02 38.09 3.76 37.59Q4.5 37.08 5.13 36.03Q5.76 34.97 6.28 33.16L15.22 3.75Q15.48 2.91 15.28 2.43Q15.09 1.95 14.44 1.83L12.01 1.39Q11.63 1.27 11.48 1.11Q11.32 .95 11.35 .68Q11.37 .35 11.64 .18Q11.91 0 12.35 0H19.25Q20.12 0 20.65 .41Q21.18 .82 21.35 1.9Q21.64 3.86 21.92 6.01Q22.2 8.16 22.5 10.43Q22.8 12.7 23.11 15.06Q23.43 17.41 23.75 19.81Q24.08 22.2 24.44 24.59Q24.79 26.99 25.15 29.33Z" mask="url(#mpCut)"/><use class="p" href="#mpP"/></svg>';
const STYLES = "/assets/css/styles.css?v=27";
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
const ICON = `<link rel="icon" href="/favicon.ico?v=2" sizes="any">
<link rel="icon" href="/assets/img/icon-48.png" type="image/png" sizes="48x48">
<link rel="apple-touch-icon" href="/assets/img/icon-180.png">`;
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
  return `<header id="hdr"><div class="legal-top post-top"><a class="brand" href="/">${MARK}<span class="brand-sep"></span><span class="wm"><span>${SITE_NAME}</span></span></a><div class="post-top-r"><a href="/#notes">&larr; All notes</a>${THEME_BTN}</div></div></header>`;
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
  const img = origin + "/assets/img/og-4.png", handle = (String(x || "").match(/x\.com\/([A-Za-z0-9_]+)/) || [])[1];
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
