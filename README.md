# CQR Dashboard

Production repo for **Cabal Retention & Channel Quality — Unified Performance Dashboard**.

## Production URL

https://allido-mkt.github.io/cqr-dashboard/

## Current Files

- `index.html` - production dashboard for GitHub Pages
- `APPS_SCRIPT_SECURE_API.gs` - Apps Script backend example for token verification and secure data response
- `PRODUCTION_RUNBOOK.md` - operating guide for login, data update, deploy, and QA

## Current Status

- Dashboard UI is production-polished.
- Monthly / Weekly view is available.
- June login data is mapped for all 4 games.
- GitHub Pages repo is ready for static deploy.
- Google OAuth login gate is connected on `index.html`.
- Dashboard data must be loaded from Apps Script after Google token verification.
- Public data files were removed from the deploy surface.

## Login Config

- Production URL: https://allido-mkt.github.io/cqr-dashboard/
- Google OAuth JavaScript origin: `https://allido-mkt.github.io`
- Apps Script Web App URL: `https://script.google.com/macros/s/AKfycbzkTPioC-JPSdZI5df1WDPIsRwlHOxepSOPNZzafX_OMSLsO8Ec0864PP5d6lEKgGdYMQ/exec`
- Frontend file uses Google OAuth `client_id` only. Do not upload or expose `client_secret`.
- Allowed email checks should live in Apps Script, not in public frontend code.

Expected allowed emails:

- `bwm.workco@gmail.com`
- `eveningbs@gmail.com`
- `ksbing34@gmail.com`
- `mkt.performance.center@gmail.com`
- `tipchareon.t@gmail.com`

Recommended backend behavior:

- `GET ?action=verify&id_token=...`
- Verify the Google ID token server-side.
- Return JSON such as `{ "ok": true, "allowed": true, "email": "user@example.com" }`.
- `GET ?action=data&id_token=...`
- Return JSON such as `{ "ok": true, "data": { ...CQR_DATA... } }`.

## Security Notes

- GitHub Pages is public by design. Do not publish sensitive dashboard data as static files.
- Do not keep files like `cqr_data_v7.js` or self-contained dashboard backups in a public repo.
- If sensitive data was previously committed to a public repo, delete it from the latest deploy and consider making the repo private or rotating to a fresh repo to remove public history exposure.

## Data Notes

- `Total User Retention` uses same-cohort cumulative retention.
- `D30` remains pending until login buffer +30 days is available.
- Weekly view uses period keys like `2026-06-W2`.
- Weekly Late Starters needs a reliable activity date field such as `late_start_login_date`.
