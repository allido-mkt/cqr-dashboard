# CQR Dashboard

Production repo for **Cabal Retention & Channel Quality — Unified Performance Dashboard**.

## Production URL

https://allido-mkt.github.io/cqr-dashboard/

## Current Files

- `index.html` - production dashboard for GitHub Pages
- `cqr_data_v7.js` - embedded dashboard dataset
- `index_single_backup.html` - self-contained backup version

## Current Status

- Dashboard UI is production-polished.
- Monthly / Weekly view is available.
- June login data is mapped for all 4 games.
- GitHub Pages repo is ready for static deploy.

## Pending Before Real Login

To connect Google OAuth login, add:

- Google OAuth Client ID
- Apps Script Web App URL
- Allowed email list source, if not hardcoded in Apps Script

Expected allowed emails from handoff:

- `bwm.workco@gmail.com`
- `eveningbs@gmail.com`
- `ksbing34@gmail.com`
- `mkt.performance.center@gmail.com`
- `tipchareon.t@gmail.com`

## Data Notes

- `Total User Retention` uses same-cohort cumulative retention.
- `D30` remains pending until login buffer +30 days is available.
- Weekly view uses period keys like `2026-06-W2`.
- Weekly Late Starters needs a reliable activity date field such as `late_start_login_date`.
