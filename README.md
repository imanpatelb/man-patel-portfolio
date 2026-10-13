# Man Patel — Discretionary Trader

The site at **https://manpateltrades.com**: a live track record (KBAD on Darwinex),
approach, notes and enquiries. Static pages plus a few serverless functions, hosted
on **Cloudflare Workers** (free plan). No framework, and no build beyond copying
the public files.

```
.
├── index.html, privacy.html, terms.html, factsheet.html, admin.html
├── assets/
│   ├── css/styles.css      # all styling (fonts are self-hosted, see assets/fonts)
│   ├── js/main.js          # data, charts, forms
│   ├── js/motion.js        # rolling numbers, reveals, hero line field, pointer effects
│   ├── js/factsheet.js     # the A4 factsheet
│   ├── js/post.js          # post pages: comments, subscribe, copy link
│   ├── fonts/              # Fraunces, Inter, IBM Plex Mono (SIL Open Font License)
│   └── img/                # og-3.png (social share image), seal-mail.png (the seal in emails), icons
├── data/portfolios.json    # config + stored fallback snapshot
├── data/posts.json         # blog posts (written by /admin through the GitHub API)
├── api/                    # functions: darwin, posts, contact, subscribe, health
├── cloudflare/
│   ├── worker.js           # entry point: routes /api/*, caching, posts, daily cron
│   ├── pages.js            # post pages, RSS feed, sitemap
│   ├── build.mjs           # copies the public files (an allow-list) into dist/
│   └── _headers            # security and cache headers for static files
├── wrangler.jsonc          # Cloudflare config: domain, KV store, cron
└── vercel.json             # the old *.vercel.app address: redirects here
```

---

## Deploy

```bash
npx wrangler login     # once per machine
npx wrangler deploy    # builds dist/ and deploys to manpateltrades.com
```

`cloudflare/build.mjs` copies only the listed public files into `dist/`, so source,
config and `.env.local` can never be published. Local preview: `npx wrangler dev`.

> **After editing `styles.css`, `main.js`, `motion.js` or `factsheet.js`, bump the
> `?v=N` on their tags** (in every page that loads them), because those files are
> cached for a year.

**Secrets** (Cloudflare → Workers & Pages → man-patel-portfolio → Settings →
Variables and Secrets, or `npx wrangler secret put NAME`):

| Secret | What for |
|---|---|
| `RESEND_API_KEY` | sending enquiry, subscribe and alert emails |
| `ADMIN_PASSWORD` | logging in at `/admin` (a copy is in the local, git-ignored `.env.local`) |

`CONTACT_TO` / `CONTACT_FROM` default to the values in `api/contact.js`.

---

## Live Darwinex data

`/api/darwin?ticker=KBAD` reads the DARWIN's public page (darwinex.com/invest/KBAD),
which embeds the daily quote series, with no login involved, and computes the stats
with Darwinex's own formulas:

| Stat | Formula |
|---|---|
| Annualised | (1 + return)^(365 / calendar days) − 1 |
| Volatility | sample stdev of daily returns × √252 |
| Sharpe | annualised ÷ volatility |
| Sortino | annualised ÷ (stdev of negative days × √252) |
| Win rate | winning days ÷ days with a non-zero move |

**Visitors never wait on Darwinex.** The latest result is kept in a KV store and the
edge cache. When it's over an hour old, a visitor still gets it instantly, and the
refetch happens behind the response. This also keeps every request well inside the
free plan's CPU limit. If Darwinex is unreachable, the last good copy is served
(flagged stale after 48 hours). If there is no copy at all, the stored snapshot in
`data/portfolios.json` is shown, labelled "as of" its date.

AUM is Darwinex's invested capital (EUR) plus investors' capital (USD, converted at
the ECB euro reference rate). The one manual number is `maxDrawdownFloor` in
`data/portfolios.json`: Darwinex measures drawdown intraday, which is deeper than
daily closes, and the site shows the deeper of the two.

**Daily data check.** A Cron Trigger (07:00 UTC) refreshes the stored data, then
runs `api/health.js`: it re-checks every source and emails `CONTACT_TO` only if
something visitors see has broken. The HTTP endpoint refuses outside requests.

To add another DARWIN: add it to `portfolios` with `"live": true` and set a
`DARWIN_TICKERS` variable (comma-separated; default `KBAD`).

---

## Forms and letters

Enquiries (`/api/contact`) are emailed to `CONTACT_TO` via [Resend](https://resend.com);
if sending fails, the form falls back to opening the visitor's email app.

**Letters** (`/api/subscribe`, `api/_resend.js`) use double opt-in. A sign-up gets a
confirmation email, and the link adds the address to the **Letters** segment of
contacts in Resend (free up to 1,000). In `/admin`, **Send as** picks *Post only*, *Post & email* or *Email only*.
Emails go out as a Resend broadcast, with an unsubscribe link and the risk disclaimer,
from `letters@manpateltrades.com` (replies go to `CONTACT_TO`). *Email only* doesn't
publish anything; its letter links to the home page.
*Send me a test* emails a preview to `CONTACT_TO` without publishing. manpateltrades.com is verified in Resend (2026-10-12), so all site mail comes from
the domain. Adding people to the list and sending letters needs a **full-access**
`RESEND_API_KEY`. With a send-only key, confirmed sign-ups wait in KV
(`sub:confirmed:<email>`) and move to the list automatically, during the daily run
or before a letter is sent, once the key has full access. Confirmation emails are capped at 80 a
day, inside Resend's free 100.

Spam protection: a honeypot field, validation on both sides, and rate limiting.

---

## Posts and comments

Posts are written at **`/admin`** (password: `ADMIN_PASSWORD`) and stored in the
Worker's KV namespace under `posts:list`. The site serves `/data/posts.json` from
there, so a new post is live within about a minute, with no redeploy and no token.
The `data/posts.json` file in the repo is only the fallback copy shown if KV has no
list. To back the posts up (or refresh that fallback), run:

```bash
npx wrangler kv key get --binding CACHE "posts:list" --remote > data/posts.json
```

(`api/posts.js` can also store posts in this GitHub repo, one commit per change,
when it runs anywhere other than Cloudflare and `GITHUB_TOKEN` is set.)

Each post has its own page at **`/notes/<slug>`**, built by the Worker
(`cloudflare/pages.js`) with its own title, description, canonical link and share card
(Open Graph and X), so links shared on X, LinkedIn or WhatsApp show a proper preview.
The page also carries share links, the subscribe box, comments and the disclaimers. The
Worker also serves **`/notes/feed.xml`** (RSS) and **`/sitemap.xml`**, both rebuilt from
the post list, so new posts are listed with no redeploy. Letters link to the post's page.

Comments use Giscus (GitHub Discussions), one thread per post (keyed by its slug),
configured in `data/portfolios.json` → `config.comments`.

---

## Compliance

This is a personal track record, not a solicitation or an offer to invest; the
footer and `/terms` carry the disclosures, including the CFD risk warning with
Darwinex's current figure. Performance is shown in EUR, before Darwinex's fees.
Keep the Darwinex links live so every figure can be checked independently.
