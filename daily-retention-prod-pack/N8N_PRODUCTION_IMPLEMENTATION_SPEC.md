# CQR Daily Retention Mart V1 — n8n Production Implementation Spec

This is the exact Production workflow contract. It intentionally avoids inventing a credential ID or a fake deployed workflow.

## Workflow name
`CQR Daily Retention Mart V1 PROD`

## Trigger
Preferred: run after the existing four-game raw extraction has completed successfully.
Fallback schedule: after the normal sequential raw jobs, with a freshness check before processing.

## Required input sources
Read these 4 raw spreadsheets from `CQR_DAILY_RETENTION_PROD_CONFIG.json`.

For the current report month read:
- `_meta`
- `Registered_YYYY-MM`
- `Login_YYYY-MM`
- `DAU_YYYY-MM`

For cohorts crossing a month boundary, read the previous `Login_YYYY-MM` while its milestones can still mature.

## Processing order
1. Read latest successful `_meta` per game.
2. Determine common `data_complete_through`.
3. Stop business evaluation if a source is not final-success or required tabs are missing.
4. Build `DailyGameHealth` from Registered + DAU.
5. Build `DailyCohortRetention` using registration cohorts and raw milestone flags.
6. Build `DailyChannelRetention` only through the existing approved DB-side `ads_ref` mapping; do not invent an Ads Platform mapping.
7. Run DQ gates.
8. Build/update weekday-aware baseline rows.
9. Evaluate deterministic anomalies only for rows that pass DQ and minimum sample.
10. Upsert compact mart rows into Production spreadsheet.
11. Update `DailyRetentionSyncState` and `DataQuality`.
12. Invalidate Daily Retention cache namespace.
13. Do not call Gemini.
14. Discord path remains disabled unless `discord_send_enabled=true`.

## Milestone rules
- D1 eligible when cohort date + 1 <= common complete-through.
- D3 eligible when +3.
- D7 eligible when +7.
- D14 eligible when +14.
- Before maturity: status = `collecting`; retained/eligible/rate must not be presented as a confirmed zero.

## Write behavior
Use idempotent upsert keys:
- DailyGameHealth: `report_date|game_code`
- DailyCohortRetention: `cohort_date|game_code`
- DailyChannelRetention: `cohort_date|game_code|db_channel`
- DailyRetentionBaseline: `metric_date|game_code|metric_name|db_channel?`
- DailyRetentionAnomaly: deterministic `anomaly_id`
- DailyRetentionSyncState: `game_code|report_month|query_finished_at` or latest-state replacement contract

Never append duplicate logical rows on rerun.

## Hard exclusions
- No `dashboard.data` writes or payload changes.
- No Meta/Google/Page joins.
- No PII/usernames in Production mart.
- No AI call in ETL.
- No conversion of missing values to zero.

## Production bootstrap
The first run must rebuild from 2026-06-01 through the current common complete-through date and replace prototype-derived rows. Only after reconciliation passes should `serve_enabled` be changed to true.
