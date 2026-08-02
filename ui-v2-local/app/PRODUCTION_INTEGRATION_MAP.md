# Production Integration Map

The UI preview should be connected to the existing backend without changing the tested workflow contracts.

| UI feature | Apps Script / data source |
|---|---|
| Login and session | `login`, existing `session_token` flow |
| AI Insight | `ai.ask` |
| User list | `admin.users.list` |
| User save | `admin.users.upsert` |
| User delete | `admin.users.delete` |
| Data Health / Pipeline Check | `admin.pipeline.health` |
| Run lookup | `admin.pipeline.run.lookup` |
| Raw Check request | `admin.n8n.raw.check` |
| Raw Check polling | `admin.n8n.raw.status` every ~5 seconds |
| Preview | `admin.n8n.cleanup.preview` |
| Clear | `admin.n8n.cleanup.run` |
| Build | `admin.n8n.master.run` |
| Raw request history | Central DB `RawCheckRequests` / `RawCheckJobs` |
| Admin work history | Central DB `PipelineLogs` or `AdminActionLogs` |

## Raw Check state contract

```text
idle → queued → running → completed / failed
```

Store the active request ID in:

```text
cqr_raw_check_active_request_id
```

Normal polling calls `admin.n8n.raw.status` without jobs. On terminal state, request `include_jobs=true` for tabs, hash, missing tabs, and final job details.

## Safety rules retained

- Manual Raw Check must use exactly one Game and one Month while the current backend guard is active.
- Data Control must Preview before Clear.
- Clear must target a selected Run, not ALL.
- Build should run only after Raw / Preview / Clear prerequisites pass.
- Admin routes must be blocked by backend permission checks even when the menu is hidden in the UI.
