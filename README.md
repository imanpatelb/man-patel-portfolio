# Man Patel — Discretionary Trader

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

## 2. Live Darwinex data

KBAD's track record updates **automatically**. `/api/darwin?ticker=KBAD` reads
the DARWIN's public page on darwinex.com (`/invest/KBAD`), which embeds the full
daily quote series — no login or credentials involved — and computes the stats
with Darwinex's own formulas:

| Stat | Formula |
|---|---|
| Annualised | (1 + return)^(365 / calendar days) − 1 |
| Volatility | sample stdev of daily returns × √252 |
| Sharpe | annualised ÷ volatility |
| Sortino | annualised ÷ (stdev of negative days × √252) |
| Win rate | winning days ÷ days with a non-zero move |

These match Darwinex Zero's figures (checked against the 12 Jun 2026 numbers).
The CDN caches the result for an hour, and the last good result is kept in KV,
so the site keeps working if darwinex.com is slow, down, or changes its page.
If both fail, the stored snapshot in `data/portfolios.json` is shown, labelled
"as of" its date.

**AUM** is live too: Darwinex's invested capital (EUR) plus investors' AuM
(USD on the page, converted at the ECB euro reference rate).

**One number is still manual** in `data/portfolios.json`:
- `maxDrawdownFloor` — Darwinex measures drawdown intraday; the public data is
  daily closes, which reads shallower. The site shows the deeper of the two, so
  raise this if Darwinex ever reports a deeper drawdown.

**Factsheet.** `/factsheet` builds a one-page A4 factsheet from the same live data;
visitors use *Save as PDF*. If live data is unavailable it shows a message instead
of a factsheet, since people keep and forward these. The FAQ's fees are also read
live from Darwinex.

**Daily data check.** A Vercel Cron Job calls `/api/health` every day at 07:00 UTC.
It re-fetches every source (Darwinex page, CFD figure, ECB rate, the site's own
`/api/darwin`) and emails `CONTACT_TO` only if something that affects what visitors
see has broken. It needs the `CRON_SECRET` env var (already set on Vercel), which
Vercel sends with each scheduled run; other requests are refused.

To add another DARWIN: add it to `portfolios` with `"live": true`, and add its
ticker to the `DARWIN_TICKERS` env var on Vercel (comma-separated; default
`KBAD`).

Edit `config` for your email, social links and site URL. Commit and push — Vercel
redeploys automatically.

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

