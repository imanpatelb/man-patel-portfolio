# Man Patel — Systematic Trader

Editorial, production-grade portfolio site. Static front-end + one Vercel
serverless function for the contact form. No build step, no framework — loads
fast and scores top marks on Lighthouse.

```
.
├── index.html              # markup
├── assets/
│   ├── css/styles.css      # all styling
│   ├── js/main.js          # chart, interactions, contact form
│   └── img/og.svg          # social share image
├── data/portfolios.json    # ← YOUR DATA lives here
├── api/contact.js          # serverless email endpoint (Resend)
├── vercel.json             # headers, caching, clean URLs
├── robots.txt / sitemap.xml
└── .env.example            # env vars to set
```

---

## 1. Run it locally

Any static server works for the front-end:

```bash
npx serve .
# open http://localhost:3000
```

To also run the contact API locally, use the Vercel CLI:

```bash
npm i -g vercel
cp .env.example .env.local      # then add your RESEND_API_KEY
vercel dev                       # serves the site + /api/contact
```

> Opening `index.html` directly with `file://` works too, but the browser
> blocks loading `data/portfolios.json` over `file://`, so it falls back to
> built-in sample data. Use a local server to see your real JSON.

---

## 2. Add your real Darwinex numbers

> **Why manual?** Darwinex Zero has **no public API** — strategy data
> (KBAD/WMSN/ASGU) is only available inside your own logged-in session.
> Scraping it risks breaking Darwinex's Terms of Service. So the site shows
> the numbers **you** enter, and links each strategy to its official Darwinex
> page as third-party proof. Honest and rule-compliant.

Edit **`data/portfolios.json`**. For each portfolio, paste your equity curve
into `series` as `{ "d": "YYYY-MM-DD", "v": equityInUSD }`:

```json
{
  "key": "KBAD",
  "strat": "Index breakout",
  "darwinexUrl": "https://www.darwinexzero.com/darwin/KBAD/strategy-analysis",
  "series": [
    { "d": "2026-01-05", "v": 7000 },
    { "d": "2026-02-27", "v": 7240 },
    { "d": "2026-03-31", "v": 7510 }
  ]
}
```

- As soon as a portfolio has **2+ real points**, the site switches that book to
  real data, recomputes every stat (return, drawdown, Sharpe, Sortino, etc.),
  and drops the "illustrative data" badge automatically.
- While `series` is empty (`[]`), a clearly-labelled sample curve is shown.
- Daily points give the smoothest chart, but month-end points are fine.
- Update the `notes` array for your journal entries; edit `config` for your
  email, social links, and site URL.

No redeploy code needed — just commit the JSON change (Vercel redeploys on push),
or re-run `vercel --prod`.

---

## 3. Make the contact form send email

The form posts to `/api/contact`, which emails you via
[Resend](https://resend.com) (free tier is plenty).

1. Sign up at **resend.com** using **mptraderx.capital@gmail.com** (so test
   sends are allowed to your own inbox before you own a domain).
2. Create an **API key** → copy it (`re_...`).
3. In Vercel: **Project → Settings → Environment Variables**, add:
   - `RESEND_API_KEY` = your key  *(required)*
   - `CONTACT_TO` = `mptraderx.capital@gmail.com`  *(optional, this is the default)*
4. Redeploy.

**Deliverability note:** until you verify a custom domain in Resend, emails are
sent from `onboarding@resend.dev` and can only be delivered to your Resend
account's own email — which is exactly your inbox, so it works. When you get a
domain later, verify it in Resend and set `CONTACT_FROM` to an address on it for
unrestricted, well-deliverable sending.

If the API key is missing or the call fails, the form **gracefully falls back**
to opening the visitor's email app pre-filled — so you never lose an enquiry.

Spam protection built in: a hidden honeypot field, input validation on both
client and server, and per-instance rate limiting.

---

## 4. Deploy to Vercel

**Easiest (dashboard):**
1. Push this folder to a GitHub repo.
2. vercel.com → **Add New → Project** → import the repo.
3. Framework preset: **Other**. No build command. Output dir: root.
4. Add the env vars from step 3 above → **Deploy**.

**Or via CLI:**
```bash
vercel            # preview deploy
vercel --prod     # production
```

You'll get a `*.vercel.app` URL instantly. When you buy a domain later, add it
in **Settings → Domains** and update the `siteUrl` in `data/portfolios.json`,
the `<link rel="canonical">` / OG URLs in `index.html`, `robots.txt`, and
`sitemap.xml`.

---

## 5. Blog posts (admin) + comments

**Posts** are written from a password-protected page at **`/admin`** and stored in
a free database (Upstash Redis via Vercel). They render in the **Notes** section;
clicking one opens the full post with a comment thread.

**One-time setup:**
1. **Database:** Vercel dashboard → your project → **Storage → Create Database →
   Upstash (Redis/KV) → Connect**. This auto-adds `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` to the project.
2. **Admin password:** already set as the `ADMIN_PASSWORD` env var (change it in
   **Settings → Environment Variables** anytime).
3. **Redeploy.** Then go to `/admin`, log in, and publish. Posts appear instantly
   in Notes. Until the database is connected, the site shows the static sample notes.

**Comments (Giscus / GitHub):** readers comment by signing in with GitHub.
1. Push this repo to GitHub and make it **public**.
2. Repo **Settings → General → Features → enable Discussions**.
3. Install the **giscus** app: <https://github.com/apps/giscus> (grant it this repo).
4. Go to <https://giscus.app>, enter your repo, choose a Discussion category
   (e.g. *Announcements*), and copy the four values it generates.
5. Paste them into `data/portfolios.json` → `config.comments`
   (`repo`, `repoId`, `category`, `categoryId`) and redeploy.
Until configured, posts show a tasteful "comments open soon" note.

> **After editing `assets/css/styles.css` or `assets/js/main.js`, bump the `?v=N`
> number on their tags in `index.html`** (and the `styles.css?v=` in `admin.html`)
> so browsers fetch the new file instead of a cached copy.

## Compliance & disclaimers

This site presents a personal track record. It is not a solicitation or an offer
to invest, and the footer carries the appropriate disclosures. Performance is
shown gross of fees in USD. Keep the data accurate and the Darwinex proof links
live so every figure is independently verifiable.

