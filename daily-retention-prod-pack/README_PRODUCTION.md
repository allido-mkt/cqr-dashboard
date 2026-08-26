# CQR Daily Retention V1 — Production Migration Pack

Date: 2026-08-19
Scope: DB-only Daily Retention for CBM_TH, CBM_SEA, CBPC_TH, CBPC_SEA.

## Production decisions
- No separate TEST/Staging rollout for this workstream.
- Keep current `dashboard.data` and its page-speed optimizations unchanged.
- Daily Retention uses a separate operational read model, cache namespace, and API actions.
- No Meta Ads, Google Ads, or Facebook Page data in V1.
- Data Quality (DQ) must run before business anomaly evaluation.
- Missing values are null/blank, never coerced to zero.
- `Collecting` is used for milestones that have not matured.

## Production data store
Spreadsheet ID: `1LKYwNQAVuMk3ptLEsA1bm2BjEk8G1Hys-mcpMf89DJs`
Title: `CQR_Daily_Retention_PROD_DB_V1_2026-08-19`
Timezone: `Asia/Bangkok`
Contract: `daily_retention_v1`

## Verified raw sources
- CBM_TH: `1UsDCekjtHS5U51cMs_tPL4YRIIXrJAXwyslIKYm1aSo`
- CBM_SEA: `1vyS4-KYpo0OG_WdVADOJVUZ12bKx9gy92ypc1vZJxFA`
- CBPC_TH: `1Iu4kSlR2PdtOCiqlVkxWoRUipBKxaGcgcf3_Mi3S8l8`
- CBPC_SEA: `1p8fL06Vi_03Na2k2d5QH2NpH4-ZRQnJ766gbYpeKvZM`

Latest verified common raw `data_complete_through`: `2026-08-18`.

Known DQ incident:
- CBPC_TH `DAU_2026-08` has no row for `2026-08-06`.
- Keep it missing; suppress the DAU anomaly for that affected date.

## Retention maturity contract
- D1: `cohort_date + 1 <= data_complete_through`
- D3: `cohort_date + 3 <= data_complete_through`
- D7: `cohort_date + 7 <= data_complete_through`
- D14: `cohort_date + 14 <= data_complete_through`

Raw milestone source: `Registered_YYYY-MM + Login_YYYY-MM`.

## Serving gate
The Production spreadsheet is configured, but `serve_enabled=false` until the initial Production backfill replaces the copied prototype snapshot. This is a production bootstrap guard, not a separate TEST environment.

## Remaining deployment work
1. Run the initial Production mart backfill into the Production spreadsheet.
2. Reconcile the generated daily aggregates with the current Weekly/Monthly contract.
3. Wire `APPS_SCRIPT_DAILY_RETENTION_API_V1_PROD.gs` into the existing Production Apps Script router and set `CQR_DAILY_RETENTION_DB_ID` to the Production sheet ID.
4. Set `serve_enabled=true` only after the backfill + reconciliation pass.
5. Add the Daily Retention frontend route using the separate actions; do not modify `dashboard.data`.
6. Keep Discord send disabled until the Production webhook is wired and the alert log/dedup path exists.

## Important
This pack does not pretend that an n8n workflow has been deployed. No authenticated n8n workspace is available in the current session, and no standalone Daily Retention n8n workflow artifact was found in the project library. Use `N8N_PRODUCTION_IMPLEMENTATION_SPEC.md` as the exact build contract for that deployment.
