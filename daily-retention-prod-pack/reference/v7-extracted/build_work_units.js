const config = $('Set Runtime Config').first().json;
const REPORT_START_MONTH = '2026-02';
function currentMonthKey() {
  const now = new Date();
  return now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0');
}
function monthRange(start, end) {
  const out = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(y + '-' + String(m).padStart(2, '0'));
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
function normalizeMonths(value, rows = []) {
  const text = String(value || '').trim();
  if (text && text.toUpperCase() !== 'ALL' && text.toUpperCase() !== 'AUTO') {
    return [...new Set(text.split(',').map(v => v.trim()).filter(Boolean))];
  }
  const known = [...new Set(rows.map(period).filter(Boolean))].sort();
  const latest = known.length ? known[known.length - 1] : currentMonthKey();
  return monthRange(REPORT_START_MONTH, latest);
}
const targetGamesCsv = config.target_games_csv || 'ALL';
const targetGames = targetGamesCsv === 'ALL' ? null : targetGamesCsv.split(',').map(v => v.trim()).filter(Boolean);
const batchId = config.batch_id || 'BATCH-' + new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
const requireRawCheck = String(config.require_raw_check || 'true').toLowerCase() !== 'false';

const masterFileByGame = {
  CBM_TH: '1ofe69uOTknTY2RcoLjAkPXUQ0sUQjZPgJ-oIRCD5hKM',
  CBM_SEA: '1B_eXcoxJyKnV_wH4zyPHqDg2lmS_gfGJ-9cxaF5h5bY',
  CBPC_TH: '18uiKPUsWeByiT2jOv_aaCdq_xlpcMkw1B6glN8NRyF4',
  CBPC_SEA: '1p5qN81Vg5rN08XldlQDV_fQTuqRaS1xpBk-aWuQb-9I'
};
function requiredTabsFor(month) {
  return [
    { sheet_type: 'registered', tab_name: `Registered_${month}` },
    { sheet_type: 'dau', tab_name: `DAU_${month}` },
    { sheet_type: 'returners', tab_name: `Returners_${month}` },
    { sheet_type: 'late_starters', tab_name: `Late_Starters_${month}` },
    { sheet_type: 'login', tab_name: `Login_${month}` }
  ];
}
function rowsFrom(nodeName) {
  try { return $(nodeName).all().map(item => item.json).filter(row => !row.error); }
  catch (error) { return []; }
}
function latestBy(rows, field) {
  return [...rows].sort((a, b) => String(b[field] || b.checked_at || b.run_finished_at || '').localeCompare(String(a[field] || a.checked_at || a.run_finished_at || '')))[0] || null;
}
function period(row) { return String(row.period_key || row.month || row.target_month || '').trim(); }

const sourceRows = rowsFrom('Read Central DB - SourceFiles');
const dataIndexRows = rowsFrom('Read Central DB - DataIndex');
const rawCheckRows = rowsFrom('Read Central DB - RawIngestionLogs');
const activeRows = sourceRows.filter(row => String(row.status || '').toLowerCase() === 'active');
const targetMonths = normalizeMonths(config.target_months_csv || config.target_month, [...rawCheckRows, ...dataIndexRows]);
const filteredRows = targetGames ? activeRows.filter(row => targetGames.includes(row.game_code)) : activeRows;
function latestHashFor(gameCode, month) {
  const rows = dataIndexRows.filter(row => row.game_code === gameCode && period(row) === month && String(row.data_hash || '').trim());
  rows.sort((a, b) => String(b.last_updated_at || b.updated_at || '').localeCompare(String(a.last_updated_at || a.updated_at || '')));
  return rows[0]?.data_hash || '';
}
function latestRawCheckFor(gameCode, month) {
  return latestBy(rawCheckRows.filter(row => row.game_code === gameCode && period(row) === month), 'checked_at');
}
const nowKey = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
const units = [];
for (const row of filteredRows) {
  for (const targetMonth of targetMonths) {
    const rawCheck = latestRawCheckFor(row.game_code, targetMonth);
    const rawStatus = String(rawCheck?.status || '').toLowerCase();
    const base = {
      run_id: 'RUN-' + row.game_code + '-' + targetMonth + '-' + nowKey,
      batch_id: batchId,
      run_mode: config.run_mode,
      target_month: targetMonth,
      game_code: row.game_code,
      source_file_id: row.source_file_id,
      source_file_name: row.source_file_name,
      source_folder_id: row.source_folder_id,
      master_file_id: masterFileByGame[row.game_code] || row.master_file_id || '',
      schema_version: row.schema_version,
      last_modified_at: row.last_modified_at,
      last_data_hash: latestHashFor(row.game_code, targetMonth),
      raw_check_id: rawCheck?.raw_check_id || '',
      raw_check_status: rawCheck?.status || (requireRawCheck ? 'missing_raw_check' : 'not_checked'),
      raw_data_hash: rawCheck?.raw_data_hash || '',
      raw_check_message: rawCheck?.message || '',
      dedupe_source: 'Central DB DataIndex + RawIngestionLogs',
      required_tabs: requiredTabsFor(targetMonth),
      missing_tab_policy: config.missing_tab_policy,
      prompt_version: config.prompt_version,
      cleanup_confirmed: config.cleanup_confirmed,
      central_db_id: config.central_db_id
    };
    if (requireRawCheck && rawStatus !== 'raw_ready') {
      units.push({ json: { ...base, raw_check_blocked: true, raw_check_message: rawCheck?.message || 'Raw check is required before build.' }});
    } else {
      units.push({ json: { ...base, raw_check_blocked: false }});
    }
  }
}
return units;