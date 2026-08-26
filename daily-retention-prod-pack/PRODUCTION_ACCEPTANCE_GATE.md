# CQR Daily Retention V1 — Production Acceptance Gate

The workstream is considered LIVE only when every required item below passes.

## Source gate
- [ ] All 4 CABAL games have final successful source runs.
- [ ] Common `data_complete_through` exists.
- [ ] Required current-month tabs exist: DAU, Registered, Login.
- [ ] No source error is treated as a business decline.

## Mart gate
- [ ] Initial Production backfill completed from 2026-06-01 through the current common complete-through date.
- [ ] No duplicate composite keys.
- [ ] Missing/null values are not converted to 0.
- [ ] `Collecting` is used for immature milestones.
- [ ] `retained_dN <= eligible_dN` for every eligible row.
- [ ] Same-cohort retention invariant passes.
- [ ] D1/D3/D7/D14 use +1/+3/+7/+14 maturity independently.
- [ ] CBPC_TH 2026-08-06 DAU remains missing and is recorded as a Data Incident.

## Reconciliation gate
- [ ] Daily registration totals reconcile with source Registered tabs.
- [ ] Daily DAU values reconcile with source DAU tabs.
- [ ] Matured historical retention reconciles with the approved Weekly/Monthly definition.
- [ ] Differences outside tolerance are explained before serving.

## API gate
- [ ] Script Property `CQR_DAILY_RETENTION_DB_ID` points to Production sheet ID.
- [ ] `retention.daily.overview` works.
- [ ] `retention.daily.cohorts` works.
- [ ] `retention.daily.channels` works.
- [ ] `retention.daily.anomalies` works.
- [ ] API cache namespace is separate from `dashboard.data`.
- [ ] 6-hour TTL remains a fallback only; successful mart publication invalidates Daily Retention cache.
- [ ] No username/PII is returned by the API.

## Frontend gate
- [ ] Daily Retention route lazy-loads the new API.
- [ ] Existing `dashboard.data` request/payload is unchanged.
- [ ] Missing, Collecting, Partial, Blocked states render distinctly.
- [ ] Frontend does not recalculate retention or anomaly rules.

## Discord gate
- [ ] DQ runs before performance alerts.
- [ ] Alert dedupe key exists.
- [ ] Data Incident has precedence over business alert.
- [ ] `discord_send_enabled=true` only after a real Production webhook is wired.

## Go-live switch
When all required gates above pass:
1. Set `RuntimeConfig.serve_enabled = TRUE`.
2. Refresh/invalidate the Daily Retention cache only.
3. Enable the Daily Retention dashboard route.
4. Keep Discord independent; enabling dashboard serving does not automatically enable Discord.
