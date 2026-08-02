# CQR UI V2 R3 — Filter / Action Matrix

| Page | Header controls | In-page controls | Reason |
|---|---|---|---|
| Dashboard | Game, Month, Channel, Monthly/Weekly, Week, Export | Dashboard content only | Global analytical context |
| AI Insight | None | Game + Period (ALL supported), Apply Context, Export Chat, Clear | Avoid duplicate filters; AI context is local to AI page |
| User Access | None | User form, permissions, refresh users | User management does not depend on report scope |
| Data Health Overview | Game + Month (ALL supported) | Run Health Check, handoff actions | Health can be checked broadly or by scope |
| Check Raw | One Game + one Month only | Run Raw Check, copy request ID, history | Manual Raw Check forbids ALL; background process handles broad checks |
| Pipeline Check | Game + Month (ALL supported) | Run Pipeline Check | Health API supports broad or specific scope |
| Data Control History | Game + Month (ALL supported) | Action, Status, Run ID search | History is searchable and filterable |
| Data Control Preview | One Game + one Month only | Run ID/Hash, select Run, Preview | Destructive workflow must start with a specific scope |
| Data Control Clear | None | Confirmation phrase + checkbox | Scope is locked from Preview to prevent accidental changes |
| Data Control Build | None | Build + verify | Scope is locked from Preview/Clear |
| Profile / Preferences | None | Personal settings only | No report data scope needed |

## Production reminder

- Local Google Login bypass must be removed before Production.
- Re-test approved account, unapproved account, session expiry and sign out.
- Check Raw must never send `ALL / ALL` from the manual page.
