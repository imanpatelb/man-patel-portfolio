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
    { "d": "2025-04-28", "v": 7000 },
    { "d": "2025-05-30", "v": 7240 },
    { "d": "2025-06-30", "v": 7510 }
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

## Compliance & disclaimers

This site presents a personal track record. It is not a solicitation or an offer
to invest, and the footer carries the appropriate disclosures. Performance is
shown gross of fees in USD. Keep the data accurate and the Darwinex proof links
live so every figure is independently verifiable.
