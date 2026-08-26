# CQR Frontend Refactor Plan — No Logic Change First

## Phase 1 — Current structure audit
Run this package only. It does not modify source files.

## Phase 2 — Ownership labels
Target ownership:

- Dashboard: dashboard page + dashboard-final-r11.js/css
- AI: pages/ai-insight.js + AI-only presentation styles
- Admin/Data: check-raw.js, data-health.js, data-control.js
- User Access: user-access.js
- Auth: session.js + permissions.js
- Shared Core: config.js, api.js, router.js, app.js, ui.js, topbar.js
- Shared State: state.js (do not split yet)
- Shared Shell: shared-sidebar.js/css

## Phase 3 — Safe separation
First safe change should be API facades, not moving state:
- services/dashboard-api.js
- services/ai-api.js
- services/admin-api.js
- services/user-api.js

Each facade may call existing callAuthorized() from api.js.
This reduces cross-feature edits while preserving one transport/client implementation.

## Phase 4 — State split
Only after import/export audit is clean:
- state/core-state.js
- state/ai-state.js
- state/admin-state.js
- state/dashboard-state.js

Do not perform this phase until current consumers are verified.

## Phase 5 — Smoke tests
- Login/session
- Dashboard render/filter
- AI ask
- Data Health
- Raw Check
- Data Control
- User Access
- Shared sidebar/routes
