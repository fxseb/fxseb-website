# FXSEB website

Static site in `public/`, deployed by Netlify.

- `netlify/functions/myfxbook-sync.mjs` – runs daily, pulls verified stats from the Myfxbook API
- `netlify/functions/performance.mjs` – serves the latest snapshot at `/api/performance`
- `public/perf.js` – updates the performance section in the browser (falls back to the static numbers)

Required Netlify environment variables (set in the Netlify UI, never in this repo):
`MYFXBOOK_EMAIL`, `MYFXBOOK_PASSWORD`, optional `MYFXBOOK_ACCOUNT_ID` (default 12096727).
