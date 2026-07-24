# CQR Dashboard

Production repo for **Cabal Retention & Channel Quality — Unified Performance Dashboard**.

## Production URL

https://allido-mkt.github.io/cqr-dashboard/

## Current Files

- `index.html` - production dashboard for GitHub Pages
- `cqr_data_v7.js` - embedded dashboard dataset
- `index_single_backup.html` - self-contained backup version
- `PRODUCTION_RUNBOOK.md` - operating guide for login, data update, deploy, and QA

## Current Status

- Dashboard UI is production-polished.
- Monthly / Weekly view is available.
- June login data is mapped for all 4 games.
- GitHub Pages repo is ready for static deploy.
- Google OAuth login gate is connected on `index.html`.

## Login Config

- Production URL: https://allido-mkt.github.io/cqr-dashboard/
- Google OAuth JavaScript origin: `https://allido-mkt.github.io`
- Apps Script Web App URL: `https://script.google.com/macros/s/AKfycbzkTPioC-JPSdZI5df1WDPIsRwlHOxepSOPNZzafX_OMSLsO8Ec0864PP5d6lEKgGdYMQ/exec`
- Frontend file uses Google OAuth `client_id` only. Do not upload or expose `client_secret`.

Allowed emails:

- `bwm.workco@gmail.com`
- `eveningbs@gmail.com`
- `ksbing34@gmail.com`
- `mkt.performance.center@gmail.com`
- `tipchareon.t@gmail.com`

Recommended backend behavior:

- `GET ?action=verify&id_token=...`
- Verify the Google ID token server-side.
- Return JSON such as `{ "ok": true, "allowed": true, "email": "user@example.com" }`.

## Data Notes

- `Total User Retention` uses same-cohort cumulative retention.
- `D30` remains pending until login buffer +30 days is available.
- Weekly view uses period keys like `2026-06-W2`.
- Weekly Late Starters needs a reliable activity date field such as `late_start_login_date`.
