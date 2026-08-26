# CQR Frontend Current Structure Audit

- Repo: `/Users/wmbew/Desktop/cqr-dashboard`
- Branch: `main`
- HEAD: `dbaab9fb7e1c9b121ac5066623a41610c7c69bd8`
- Files scanned: **70**
- Working tree changes: **1**

## Current ownership map

### Dashboard
- `ui-v2-local/app/assets/js/dashboard-final-r11.js`
- `ui-v2-local/app/assets/js/pages/dashboard.js`
- `ui-v2-local/app/assets/js/presentation-final/pages/dashboard.js`

### AI
- `ui-v2-local/app/assets/js/pages/ai-insight.js`
- `ui-v2-local/app/assets/js/presentation-final/pages/ai-insight.js`

### Admin/Data Control
- `ui-v2-local/app/assets/js/pages/check-raw.js`
- `ui-v2-local/app/assets/js/pages/data-control.js`
- `ui-v2-local/app/assets/js/pages/data-health.js`
- `ui-v2-local/app/assets/js/presentation-final/pages/check-raw.js`
- `ui-v2-local/app/assets/js/presentation-final/pages/data-control.js`
- `ui-v2-local/app/assets/js/presentation-final/pages/data-health.js`

### User Access
- `ui-v2-local/app/assets/js/pages/user-access.js`
- `ui-v2-local/app/assets/js/presentation-final/pages/user-access.js`

### Auth/Permission
- `ui-v2-local/app/assets/js/permissions.js`
- `ui-v2-local/app/assets/js/presentation-final/permissions.js`
- `ui-v2-local/app/assets/js/presentation-final/session.js`
- `ui-v2-local/app/assets/js/session.js`

### Core/Shared
- `ui-v2-local/app/assets/js/api.js`
- `ui-v2-local/app/assets/js/app.js`
- `ui-v2-local/app/assets/js/config.js`
- `ui-v2-local/app/assets/js/presentation-final/api.js`
- `ui-v2-local/app/assets/js/presentation-final/app.js`
- `ui-v2-local/app/assets/js/presentation-final/config.js`
- `ui-v2-local/app/assets/js/presentation-final/router.js`
- `ui-v2-local/app/assets/js/presentation-final/state.js`
- `ui-v2-local/app/assets/js/presentation-final/topbar.js`
- `ui-v2-local/app/assets/js/presentation-final/ui.js`
- `ui-v2-local/app/assets/js/router.js`
- `ui-v2-local/app/assets/js/state.js`
- `ui-v2-local/app/assets/js/topbar.js`
- `ui-v2-local/app/assets/js/ui.js`

### Shared Shell
- `ui-v2-local/app/assets/css/shared-shell/shared-sidebar-host.css`
- `ui-v2-local/app/assets/js/dashboard-shared-shell-r4.js`
- `ui-v2-local/app/assets/js/shared-shell/shared-sidebar.js`

### Entry/HTML
- `copilot.html`
- `index.html`
- `ui-v2-local/app/copilot-v2.html`
- `ui-v2-local/app/dashboard-v2.html`

### CSS
- `ui-v2-local/app/assets/css/base.css`
- `ui-v2-local/app/assets/css/components.css`
- `ui-v2-local/app/assets/css/dashboard-final-r11.css`
- `ui-v2-local/app/assets/css/dashboard-final.css`
- `ui-v2-local/app/assets/css/layout.css`
- `ui-v2-local/app/assets/css/pages.css`
- `ui-v2-local/app/assets/css/presentation-final/base.css`
- `ui-v2-local/app/assets/css/presentation-final/components.css`
- `ui-v2-local/app/assets/css/presentation-final/copilot-final.css`
- `ui-v2-local/app/assets/css/presentation-final/functional-fixes.css`
- `ui-v2-local/app/assets/css/presentation-final/layout.css`
- `ui-v2-local/app/assets/css/presentation-final/pages.css`
- `ui-v2-local/app/assets/css/presentation-final/presentation-final.css`
- `ui-v2-local/app/assets/css/presentation-final/responsive.css`
- `ui-v2-local/app/assets/css/presentation-final/shell-r3.css`
- `ui-v2-local/app/assets/css/presentation-final/shell-r4.css`
- `ui-v2-local/app/assets/css/presentation-final/tokens.css`
- `ui-v2-local/app/assets/css/responsive.css`
- `ui-v2-local/app/assets/css/shell-r3.css`
- `ui-v2-local/app/assets/css/shell-r4.css`
- `ui-v2-local/app/assets/css/tokens.css`

## Highest shared/coupled modules

- `ui-v2-local/app/assets/js/presentation-final/ui.js` — imported by **11** files
- `ui-v2-local/app/assets/js/state.js` — imported by **11** files
- `ui-v2-local/app/assets/js/presentation-final/state.js` — imported by **10** files
- `ui-v2-local/app/assets/js/ui.js` — imported by **10** files
- `ui-v2-local/app/assets/js/presentation-final/config.js` — imported by **9** files
- `ui-v2-local/app/assets/js/config.js` — imported by **8** files
- `ui-v2-local/app/assets/js/presentation-final/api.js` — imported by **6** files
- `ui-v2-local/app/assets/js/api.js` — imported by **5** files
- `ui-v2-local/app/assets/js/presentation-final/session.js` — imported by **5** files
- `ui-v2-local/app/assets/js/permissions.js` — imported by **4** files
- `ui-v2-local/app/assets/js/presentation-final/permissions.js` — imported by **4** files
- `ui-v2-local/app/assets/js/session.js` — imported by **4** files
- `ui-v2-local/app/assets/js/sidebar.js` — imported by **2** files
- `ui-v2-local/app/assets/js/navigation.js` — imported by **1** files
- `ui-v2-local/app/assets/js/pages/ai-insight.js` — imported by **1** files

## API actions used by frontend

- `admin.n8n.cleanup.preview`
  - `ui-v2-local/app/assets/js/api.js`
  - `ui-v2-local/app/assets/js/pages/data-control.js`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/functional-self-test.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/data-control.js`
- `admin.n8n.cleanup.run`
  - `ui-v2-local/app/assets/js/api.js`
  - `ui-v2-local/app/assets/js/pages/data-control.js`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/functional-self-test.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/data-control.js`
- `admin.n8n.master.run`
  - `ui-v2-local/app/assets/js/api.js`
  - `ui-v2-local/app/assets/js/pages/data-control.js`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/functional-self-test.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/data-control.js`
- `admin.n8n.raw.check`
  - `ui-v2-local/app/assets/js/api.js`
  - `ui-v2-local/app/assets/js/pages/check-raw.js`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/functional-self-test.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/check-raw.js`
- `admin.n8n.raw.status`
  - `ui-v2-local/app/assets/js/api.js`
  - `ui-v2-local/app/assets/js/pages/check-raw.js`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/functional-self-test.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/check-raw.js`
- `admin.pipeline.health`
  - `ui-v2-local/app/assets/js/api.js`
  - `ui-v2-local/app/assets/js/pages/data-health.js`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/functional-self-test.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/data-control.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/data-health.js`
- `admin.pipeline.run.lookup`
  - `ui-v2-local/app/assets/js/api.js`
  - `ui-v2-local/app/assets/js/pages/data-control.js`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/functional-self-test.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/data-control.js`
- `admin.users.audit`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/functional-self-test.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/user-access.js`
- `admin.users.delete`
  - `ui-v2-local/app/assets/js/api.js`
  - `ui-v2-local/app/assets/js/pages/user-access.js`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/functional-self-test.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/user-access.js`
- `admin.users.list`
  - `ui-v2-local/app/assets/js/api.js`
  - `ui-v2-local/app/assets/js/pages/user-access.js`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/functional-self-test.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/user-access.js`
- `admin.users.login_history`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/functional-self-test.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/user-access.js`
- `admin.users.upsert`
  - `ui-v2-local/app/assets/js/api.js`
  - `ui-v2-local/app/assets/js/pages/user-access.js`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/functional-self-test.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/user-access.js`
- `ai.ask`
  - `index.html`
  - `ui-v2-local/app/dashboard-v2.html`
  - `ui-v2-local/app/assets/js/api.js`
  - `ui-v2-local/app/assets/js/pages/ai-insight.js`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/functional-self-test.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/ai-insight.js`
- `dashboard.data`
  - `index.html`
  - `ui-v2-local/app/dashboard-v2.html`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/ai-insight.js`
- `session.me`
  - `index.html`
  - `ui-v2-local/app/dashboard-v2.html`
  - `ui-v2-local/app/assets/js/presentation-final/api.js`
  - `ui-v2-local/app/assets/js/presentation-final/pages/user-access.js`

## Refactor rule for next phase

1. Do not change runtime logic in the first refactor pass.
2. Keep `config.js`, `api.js`, `session.js`, `permissions.js`, `router.js` as shared core until all import contracts are mapped.
3. Keep page-specific code inside `pages/`.
4. Split `state.js` only after verifying every imported/exported state symbol.
5. Dashboard R11 should remain isolated from Copilot/Admin unless a shared module is explicitly required.
6. After every move, run Node syntax checks + import audit + local smoke test before commit.
