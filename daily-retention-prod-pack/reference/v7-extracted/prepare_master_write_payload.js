const unit = $('Prepare Tab Plan').first().json;
const now = new Date().toISOString();
const nowDate = new Date(now.slice(0, 10) + 'T00:00:00Z');
const runId = unit.run_id || `RUN-${unit.game_code}-${unit.target_month}-${now.replace(/[-:.]/g, '').slice(0, 15)}Z`;
const batchId = unit.batch_id || `BATCH-${now.replace(/[-:.]/g, '').slice(0, 15)}Z`;
const month = String(unit.target_month || '').trim();
const gameCode = String(unit.game_code || '').trim().toUpperCase();
const masterFileId = String(unit.master_file_id || '').trim();
const centralDbId = String(unit.central_db_id || $('Set Runtime Config').first().json.central_db_id || '').trim();
const rawCheckId = String(unit.raw_check_id || '').trim();
const rawCheckStatus = String(unit.raw_check_status || 'not_checked').trim();
const MIN_SAMPLE = 30;
const RETENTION_WINDOW_DAYS = 14;
const MILESTONES = [1, 3, 7, 14];
const PAID_CHANNELS = new Set(['Google Ads', 'Facebook Ads', 'Other Campaign']);

function rowsFrom(name) {
  try { return $(name).all().map(item => item.json).filter(row => !row.error); }
  catch (error) { return []; }
}
function errorsFrom(name) {
  try { return $(name).all().map(item => item.json).filter(row => row.error).map(row => String(row.error?.message || row.error)); }
  catch (error) { return [String(error.message || error)]; }
}
function text(value) { return String(value ?? '').trim(); }
function numberValue(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function boolFlag(value) {
  const normalized = text(value).toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return 1;
  if (['0', 'false', 'no', 'n', ''].includes(normalized)) return 0;
  return Number(value) ? 1 : 0;
}
function parseDate(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(Date.UTC(1899, 11, 30));
    d.setUTCDate(d.getUTCDate() + Math.floor(value));
    return d;
  }
  const s = text(value);
  let match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  match = s.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})/);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function dateKey(value) {
  const d = parseDate(value);
  return d ? d.toISOString().slice(0, 10) : '';
}
function addDays(value, days) {
  const d = parseDate(value);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
function monthEnd(period) {
  const [year, monthNumber] = String(period).split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0));
}
function weekBucket(value) {
  const d = parseDate(value);
  if (!d) return { key: '', start: '', end: '' };
  const number = Math.min(5, Math.floor((d.getUTCDate() - 1) / 7) + 1);
  const startDay = 1 + (number - 1) * 7;
  const endOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const endDay = Math.min(startDay + 6, endOfMonth);
  const prefix = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return {
    key: `${prefix}-W${number}`,
    start: `${prefix}-${String(startDay).padStart(2, '0')}`,
    end: `${prefix}-${String(endDay).padStart(2, '0')}`
  };
}
function normalizeUsername(value) { return text(value).toLowerCase(); }
function usernameKey(row) { return normalizeUsername(row?.username); }
function completenessScore(row) { return Object.values(row || {}).filter(value => value !== '' && value !== null && value !== undefined).length; }
function dedupeRows(rows) {
  const selected = new Map();
  let duplicateCount = 0;
  for (const row of rows) {
    const key = usernameKey(row);
    if (!key) continue;
    const existing = selected.get(key);
    if (existing) {
      duplicateCount += 1;
      if (completenessScore(row) > completenessScore(existing)) selected.set(key, row);
    } else selected.set(key, row);
  }
  return { rows: [...selected.values()], duplicateCount };
}
function normalizeChannel(value) {
  const raw = text(value);
  const low = raw.toLowerCase();
  if (!low) return 'Organic / Unknown';
  if (low.includes('inapp') || low.includes('in_app') || low.includes('in-app')) return 'In-App Register';
  if (low.includes('google') || low.includes('adwords') || low.includes('-gg') || low.includes('_gg') || low.endsWith('gg')) return 'Google Ads';
  if (low.includes('facebook') || low.includes('-fb') || low.includes('_fb') || low.endsWith('fb')) return 'Facebook Ads';
  if (low.includes('organic') || low.includes('unknown')) return 'Organic / Unknown';
  return 'Other Campaign';
}
function channelOf(row) { return normalizeChannel(row?.ads_ref || row?.channel || ''); }
function rate(numerator, denominator) { return denominator > 0 ? +(numerator / denominator).toFixed(6) : ''; }
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
}
function fnv1a64Update(hash, value) {
  const input = String(value);
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash;
}
function fallbackHash(parts) {
  let hash = 14695981039346656037n;
  for (const part of parts) {
    hash = fnv1a64Update(hash, stableStringify(part));
    hash = fnv1a64Update(hash, '\n');
  }
  return hash.toString(16).padStart(16, '0').slice(0, 12);
}
function summarizeTab(nodeName, sheetType, tabName) {
  const rows = rowsFrom(nodeName);
  const errors = errorsFrom(nodeName);
  return { rows, errors, status: errors.length ? 'raw_partial' : (rows.length ? 'raw_ready' : 'raw_missing'), sheetType, tabName };
}
function hasColumn(rows, column) { return rows.some(row => Object.prototype.hasOwnProperty.call(row, column)); }
function getRegisterDate(row) { return row?.register_at || row?.register_date || ''; }
function getLoginDate(row) { return row?.login_day || row?.login_date || row?.date || ''; }
function getLoginDays(row) { return numberValue(row?.distinct_login_days ?? row?.login_days_in_month); }
function cumulativeFlags(source) {
  const rawRetained = {};
  const rawEligible = {};
  for (const day of MILESTONES) {
    rawRetained[day] = boolFlag(source?.[`retained_d${day}`]);
    rawEligible[day] = boolFlag(source?.[`eligible_d${day}`]);
  }
  const retained = {
    14: rawRetained[14] ? 1 : 0,
    7: rawRetained[7] || rawRetained[14] ? 1 : 0,
    3: rawRetained[3] || rawRetained[7] || rawRetained[14] ? 1 : 0,
    1: rawRetained[1] || rawRetained[3] || rawRetained[7] || rawRetained[14] ? 1 : 0
  };
  const eligible = {
    14: rawEligible[14] || retained[14] ? 1 : 0,
    7: rawEligible[7] || rawEligible[14] || retained[7] ? 1 : 0,
    3: rawEligible[3] || rawEligible[7] || rawEligible[14] || retained[3] ? 1 : 0,
    1: rawEligible[1] || rawEligible[3] || rawEligible[7] || rawEligible[14] || retained[1] ? 1 : 0
  };
  for (const day of MILESTONES) retained[day] = retained[day] && eligible[day] ? 1 : 0;
  const corrected = MILESTONES.some(day => retained[day] !== rawRetained[day] || eligible[day] !== rawEligible[day]);
  return { retained, eligible, corrected };
}
function qualityTier(registerUsers, eligibleD14, d1Rate, d14Rate, averageD14) {
  if (registerUsers < MIN_SAMPLE || eligibleD14 < MIN_SAMPLE) return {
    tier: 'insufficient_sample',
    verdict: `ขนาดกลุ่มตัวอย่างยังไม่เพียงพอ (Register ${registerUsers}, Eligible D14 ${eligibleD14})`
  };
  if (d1Rate !== '' && Number(d1Rate) < 0.10) return { tier: 'bad', verdict: `D1 ต่ำผิดปกติ (${(Number(d1Rate) * 100).toFixed(1)}%) ควรตรวจสอบคุณภาพ Traffic และเส้นทาง First Login` };
  if (d14Rate === '' || averageD14 === '') return { tier: 'needs_review', verdict: 'ข้อมูลยังไม่ครบพอสำหรับจัดระดับคุณภาพ' };
  if (Number(d14Rate) >= Number(averageD14) * 1.20) return { tier: 'good', verdict: `D14 สูงกว่าค่าเฉลี่ย (${(Number(d14Rate) * 100).toFixed(1)}% เทียบ ${(Number(averageD14) * 100).toFixed(1)}%)` };
  if (Number(d14Rate) <= Number(averageD14) * 0.60) return { tier: 'bad', verdict: `D14 ต่ำกว่าค่าเฉลี่ย (${(Number(d14Rate) * 100).toFixed(1)}% เทียบ ${(Number(averageD14) * 100).toFixed(1)}%)` };
  return { tier: 'watch', verdict: `D14 ใกล้เคียงค่าเฉลี่ย (${(Number(d14Rate) * 100).toFixed(1)}% เทียบ ${(Number(averageD14) * 100).toFixed(1)}%)` };
}
function signal(metricName, metricValue, threshold, tier, ruleMessage, channel = 'ALL') {
  return {
    signal_id: `QS-${gameCode}-${month}-${metricName}-${qualitySignalRows.length + 1}`,
    period_key: month,
    game_code: gameCode,
    channel,
    metric_name: metricName,
    metric_value: metricValue,
    threshold,
    tier,
    rule_message: ruleMessage,
    requires_ai_summary: ['high', 'critical'].includes(tier),
    created_at: now
  };
}

const tabs = {
  Registered: summarizeTab('Read Raw - Registered', 'registered', `Registered_${month}`),
  DAU: summarizeTab('Read Raw - DAU', 'dau', `DAU_${month}`),
  Returners: summarizeTab('Read Raw - Returners', 'returners', `Returners_${month}`),
  Late_Starters: summarizeTab('Read Raw - Late Starters', 'late_starters', `Late_Starters_${month}`),
  Login: summarizeTab('Read Raw - Login', 'login', `Login_${month}`)
};
const missingTabs = Object.values(tabs).filter(tab => tab.status === 'raw_missing').map(tab => tab.tabName);
const schemaIssues = [];
if (!tabs.Registered.rows.length || !hasColumn(tabs.Registered.rows, 'username')) schemaIssues.push({ severity: 'error', message: 'Registered tab must contain username and at least one data row.' });
if (tabs.Registered.rows.length && !hasColumn(tabs.Registered.rows, 'register_at') && !hasColumn(tabs.Registered.rows, 'register_date')) schemaIssues.push({ severity: 'error', message: 'Registered tab must contain register_at or register_date.' });
if (!tabs.DAU.rows.length || (!hasColumn(tabs.DAU.rows, 'login_day') && !hasColumn(tabs.DAU.rows, 'login_date') && !hasColumn(tabs.DAU.rows, 'date'))) schemaIssues.push({ severity: 'error', message: 'DAU tab must contain login_day/login_date/date.' });
if (!tabs.Login.rows.length || !hasColumn(tabs.Login.rows, 'username')) schemaIssues.push({ severity: 'warning', message: 'Login tab has no usable username rows; joined activity defaults to zero.' });

const registeredDeduped = dedupeRows(tabs.Registered.rows);
const loginDeduped = dedupeRows(tabs.Login.rows);
const returnerDeduped = dedupeRows(tabs.Returners.rows);
const lateDeduped = dedupeRows(tabs.Late_Starters.rows);
const duplicateRowsRemoved = registeredDeduped.duplicateCount + loginDeduped.duplicateCount + returnerDeduped.duplicateCount + lateDeduped.duplicateCount;
const loginMap = new Map(loginDeduped.rows.map(row => [usernameKey(row), row]));
const observedDates = [];
for (const row of loginDeduped.rows) {
  const d = parseDate(row.last_login_date || row.login_date);
  if (d) observedDates.push(d);
}
for (const row of tabs.DAU.rows) {
  const d = parseDate(getLoginDate(row));
  if (d) observedDates.push(d);
}
const dataCompleteDate = observedDates.length ? new Date(Math.max(...observedDates.map(d => d.getTime()))) : null;
const rawHash = text(unit.raw_data_hash);
const dataHash = rawHash || fallbackHash(Object.entries(tabs).map(([name, tab]) => [name, tab.rows.length, tab.rows]));
const previousDataHash = text(unit.last_data_hash);
const sameHash = Boolean(previousDataHash && previousDataHash === dataHash);
const differentHashSamePeriod = Boolean(previousDataHash && previousDataHash !== dataHash);
const cleanupConfirmed = /^(1|true|yes)$/i.test(text(unit.cleanup_confirmed));
const shouldSkipWrite = unit.run_mode !== 'force' && sameHash;
const requiresCleanup = differentHashSamePeriod && !(unit.run_mode === 'force' && cleanupConfirmed);
const rawCheckBlocked = Boolean(unit.raw_check_blocked);

let correctedCount = 0;
let missingLoginJoin = 0;
const userCohortRows = [];
for (const raw of registeredDeduped.rows) {
  const username = text(raw.username);
  const login = loginMap.get(normalizeUsername(username)) || {};
  const registerDate = parseDate(getRegisterDate(raw));
  // Merge Registered and Login flags, then apply actual observation-window eligibility.
  const retentionSource = {};
  for (const day of MILESTONES) {
    retentionSource[`retained_d${day}`] = Math.max(
      boolFlag(raw[`retained_d${day}`]),
      boolFlag(login[`login_d${day}`] ?? login[`retained_d${day}`])
    );
    retentionSource[`eligible_d${day}`] = registerDate && dataCompleteDate && dataCompleteDate >= addDays(registerDate, day) ? 1 : 0;
  }
  retentionSource.retained_d14 = Math.max(retentionSource.retained_d14, boolFlag(login.login_d30));
  const normalized = cumulativeFlags(retentionSource);
  if (normalized.corrected) correctedCount += 1;
  if (!Object.keys(login).length) missingLoginJoin += 1;
  const firstLogin = dateKey(raw.first_login_date || login.first_login_date);
  const lastLogin = dateKey(raw.last_login_date || login.last_login_date);
  userCohortRows.push({
    cohort_id: `UC-${gameCode}-${month}-${username}`,
    run_id: runId,
    game_code: gameCode,
    period_key: month,
    username,
    channel: normalizeChannel(raw.ads_ref || login.ads_ref),
    register_date: dateKey(registerDate),
    first_login_date: firstLogin,
    last_login_date: lastLogin,
    distinct_login_days: getLoginDays(raw) || getLoginDays(login),
    retained_d1: normalized.retained[1], retained_d3: normalized.retained[3], retained_d7: normalized.retained[7], retained_d14: normalized.retained[14],
    eligible_d1: normalized.eligible[1], eligible_d3: normalized.eligible[3], eligible_d7: normalized.eligible[7], eligible_d14: normalized.eligible[14],
    player_type: firstLogin ? 'New Register Active' : 'New Register Inactive',
    source_file_id: unit.source_file_id,
    data_hash: dataHash,
    is_provisional: true
  });
}
userCohortRows.sort((a, b) => normalizeUsername(a.username).localeCompare(normalizeUsername(b.username)));

function aggregateCohort(rows, groupFn) {
  const groups = new Map();
  for (const row of rows) {
    const group = groupFn(row);
    if (!group?.key) continue;
    if (!groups.has(group.key)) groups.set(group.key, {
      ...group,
      register_users: 0,
      first_login_users: 0,
      retained_d1: 0, eligible_d1: 0,
      retained_d3: 0, eligible_d3: 0,
      retained_d7: 0, eligible_d7: 0,
      retained_d14: 0, eligible_d14: 0
    });
    const target = groups.get(group.key);
    target.register_users += 1;
    target.first_login_users += row.first_login_date ? 1 : 0;
    for (const day of MILESTONES) target[`eligible_d${day}`] += numberValue(row[`eligible_d${day}`]);
    if (numberValue(row.eligible_d14) > 0) {
      target.cohort_base_d14 = numberValue(target.cohort_base_d14) + 1;
      for (const day of MILESTONES) target[`retained_d${day}`] += numberValue(row[`retained_d${day}`]);
    }
  }
  return [...groups.values()].map(target => {
    const cumulativeDenominator = numberValue(target.cohort_base_d14);
    for (const day of MILESTONES) target[`d${day}_rate`] = rate(target[`retained_d${day}`], cumulativeDenominator);
    delete target.key;
    return target;
  });
}

const channelDailyRows = aggregateCohort(userCohortRows.filter(row => row.register_date), row => ({
  key: `${row.register_date}|${row.channel}`,
  date: row.register_date,
  channel: row.channel
})).map(row => ({
  daily_id: `CD-${gameCode}-${row.date}-${row.channel}`, run_id: runId, game_code: gameCode, period_key: month, ...row, data_hash: dataHash
})).sort((a, b) => `${a.date}|${a.channel}`.localeCompare(`${b.date}|${b.channel}`));

const channelWeeklyRows = aggregateCohort(userCohortRows.filter(row => row.register_date), row => {
  const week = weekBucket(row.register_date);
  return { key: `${week.key}|${row.channel}`, week_key: week.key, week_start_date: week.start, week_end_date: week.end, channel: row.channel };
}).map(row => ({
  weekly_id: `CW-${gameCode}-${row.week_key}-${row.channel}`, run_id: runId, game_code: gameCode, period_key: month, ...row, data_hash: dataHash
})).sort((a, b) => `${a.week_key}|${a.channel}`.localeCompare(`${b.week_key}|${b.channel}`));

let channelMonthlyRows = aggregateCohort(userCohortRows, row => ({ key: row.channel, channel: row.channel }));
const totalD14Num = channelMonthlyRows.reduce((sum, row) => sum + row.retained_d14, 0);
const totalD14Den = channelMonthlyRows.reduce((sum, row) => sum + row.eligible_d1, 0);
const averageD14 = rate(totalD14Num, totalD14Den);
const paidRegisterTotal = channelMonthlyRows.filter(row => PAID_CHANNELS.has(row.channel)).reduce((sum, row) => sum + row.register_users, 0);
channelMonthlyRows = channelMonthlyRows.map(row => {
  const quality = qualityTier(row.register_users, row.eligible_d14, row.d1_rate, row.d14_rate, averageD14);
  return {
    monthly_id: `CM-${gameCode}-${month}-${row.channel}`,
    run_id: runId,
    game_code: gameCode,
    period_key: month,
    month,
    ...row,
    paid_register_share: PAID_CHANNELS.has(row.channel) ? rate(row.register_users, paidRegisterTotal) : 0,
    quality_tier: quality.tier,
    verdict_text: quality.verdict,
    data_hash: dataHash
  };
}).sort((a, b) => b.register_users - a.register_users || a.channel.localeCompare(b.channel));

const dauDailyRows = tabs.DAU.rows.map(row => {
  const date = dateKey(getLoginDate(row));
  return {
    dau_id: `DAU-${gameCode}-${date}`, run_id: runId, game_code: gameCode, period_key: month,
    date, dau: numberValue(row.dau), source_file_id: unit.source_file_id, source_tab_name: tabs.DAU.tabName,
    data_hash: dataHash, updated_at: now
  };
}).filter(row => row.date).sort((a, b) => a.date.localeCompare(b.date));

const returnerRows = returnerDeduped.rows.map(row => ({
  returner_id: `RET-${gameCode}-${month}-${text(row.username)}`, run_id: runId, game_code: gameCode, period_key: month,
  username: text(row.username), channel: normalizeChannel(row.ads_ref), register_date: dateKey(getRegisterDate(row)),
  last_login_date: dateKey(row.last_login_date), data_hash: dataHash
})).sort((a, b) => normalizeUsername(a.username).localeCompare(normalizeUsername(b.username)));

const lateFirstLoginRows = lateDeduped.rows.map(row => {
  const username = text(row.username);
  const login = loginMap.get(normalizeUsername(username)) || {};
  const registeredAt = parseDate(getRegisterDate(row));
  const firstLoginAt = parseDate(row.first_login_date || login.first_login_date);
  const daysToFirstLogin = registeredAt && firstLoginAt ? Math.round((firstLoginAt - registeredAt) / 86400000) : '';
  return {
    late_id: `LATE-${gameCode}-${month}-${username}`, run_id: runId, game_code: gameCode, period_key: month,
    username, channel: normalizeChannel(row.ads_ref || login.ads_ref), register_date: dateKey(registeredAt),
    first_login_date: dateKey(firstLoginAt), days_to_first_login: daysToFirstLogin, data_hash: dataHash
  };
}).sort((a, b) => normalizeUsername(a.username).localeCompare(normalizeUsername(b.username)));

const registeredKeys = new Set(userCohortRows.map(row => normalizeUsername(row.username)).filter(Boolean));
const loginKeys = new Set([...loginMap.keys()]);
const activeNewKeys = new Set([...registeredKeys].filter(key => loginKeys.has(key)));
const lateKeys = new Set(lateFirstLoginRows.map(row => normalizeUsername(row.username)).filter(key => key && !registeredKeys.has(key)));
const returnerKeys = new Set(returnerRows.map(row => normalizeUsername(row.username)).filter(key => key && !registeredKeys.has(key) && !lateKeys.has(key)));
const otherActiveKeys = new Set([...loginKeys].filter(key => !registeredKeys.has(key) && !lateKeys.has(key) && !returnerKeys.has(key)));
const unionActive = new Set([...activeNewKeys, ...returnerKeys, ...lateKeys, ...otherActiveKeys]);
const playerTypeMonthlyRows = [{
  player_type_id: `PT-${gameCode}-${month}`, run_id: runId, game_code: gameCode, period_key: month,
  new_register_total: registeredKeys.size, new_register_active: activeNewKeys.size,
  new_register_inactive: registeredKeys.size - activeNewKeys.size, returners: returnerKeys.size,
  late_starters: lateKeys.size, other_active: otherActiveKeys.size, total_active: unionActive.size,
  login_rows_unique: loginKeys.size, category_sum: activeNewKeys.size + returnerKeys.size + lateKeys.size + otherActiveKeys.size,
  invariant_failures: (activeNewKeys.size + returnerKeys.size + lateKeys.size + otherActiveKeys.size) === loginKeys.size ? 0 : 1,
  data_hash: dataHash
}];

const baseMilestone = 14;
const baseRows = userCohortRows.filter(row => numberValue(row.eligible_d14) > 0);
const totalRetentionMonthlyRows = [{
  retention_id: `TR-${gameCode}-${month}`, run_id: runId, game_code: gameCode, period_key: month,
  mode: 'same_cohort_cumulative', base_milestone: `d${baseMilestone}`, cohort_size: baseRows.length,
  retained_d1: baseRows.reduce((sum, row) => sum + row.retained_d1, 0),
  retained_d3: baseRows.reduce((sum, row) => sum + row.retained_d3, 0),
  retained_d7: baseRows.reduce((sum, row) => sum + row.retained_d7, 0),
  retained_d14: baseRows.reduce((sum, row) => sum + row.retained_d14, 0),
  d1_rate: rate(baseRows.reduce((sum, row) => sum + row.retained_d1, 0), baseRows.length),
  d3_rate: rate(baseRows.reduce((sum, row) => sum + row.retained_d3, 0), baseRows.length),
  d7_rate: rate(baseRows.reduce((sum, row) => sum + row.retained_d7, 0), baseRows.length),
  d14_rate: rate(baseRows.reduce((sum, row) => sum + row.retained_d14, 0), baseRows.length),
  data_hash: dataHash
}];

const periodEndDate = monthEnd(month);
const expectedMatureAt = addDays(periodEndDate, RETENTION_WINDOW_DAYS);
const allD14Eligible = userCohortRows.length > 0 && userCohortRows.every(row => row.eligible_d14 === 1);
const maturityStatus = nowDate >= expectedMatureAt && dataCompleteDate && dataCompleteDate >= expectedMatureAt && allD14Eligible ? 'matured' : 'collecting';
const isProvisional = maturityStatus !== 'matured';
for (const row of userCohortRows) row.is_provisional = isProvisional;
const cohortMaturityRows = [{
  game_code: gameCode, period_key: month, retention_window_days: RETENTION_WINDOW_DAYS,
  period_end: dateKey(periodEndDate), expected_mature_at: dateKey(expectedMatureAt),
  data_complete_through: dateKey(dataCompleteDate), maturity_status: maturityStatus,
  is_provisional: isProvisional, matured_at: maturityStatus === 'matured' ? dateKey(expectedMatureAt) : '', data_hash: dataHash
}];

const invariantFailures = userCohortRows.filter(row =>
  !(row.retained_d1 >= row.retained_d3 && row.retained_d3 >= row.retained_d7 && row.retained_d7 >= row.retained_d14) ||
  !(row.eligible_d1 >= row.eligible_d3 && row.eligible_d3 >= row.eligible_d7 && row.eligible_d7 >= row.eligible_d14) ||
  MILESTONES.some(day => row[`retained_d${day}`] > row[`eligible_d${day}`])
).length;
const missingLoginRate = userCohortRows.length ? +(missingLoginJoin / userCohortRows.length).toFixed(6) : 0;
const rawStatus = missingTabs.length ? 'raw_partial' : 'raw_ready';
const transformStatus = invariantFailures || schemaIssues.some(issue => issue.severity === 'error') ? 'needs_review' : 'ready';
const summarizeCohort = (scopeKey, scopeType, rows) => {
  const base = rows.filter(row => numberValue(row.eligible_d14) > 0);
  const sum = key => base.reduce((total, row) => total + numberValue(row[key]), 0);
  return {
    summary_id: `CS-${gameCode}-${scopeKey}`, run_id: runId, game_code: gameCode, period_key: month,
    scope_type: scopeType, scope_key: scopeKey, register_users: rows.length,
    first_login_users: rows.filter(row => row.first_login_date).length,
    active_ge1: rows.filter(row => numberValue(row.distinct_login_days) >= 1).length,
    active_ge2: rows.filter(row => numberValue(row.distinct_login_days) >= 2).length,
    active_gt3: rows.filter(row => numberValue(row.distinct_login_days) > 3).length,
    avg_login_days: rows.length ? +(rows.reduce((total, row) => total + numberValue(row.distinct_login_days), 0) / rows.length).toFixed(2) : 0,
    cohort_base_d14: base.length, retained_d1: sum('retained_d1'), retained_d3: sum('retained_d3'),
    retained_d7: sum('retained_d7'), retained_d14: sum('retained_d14'),
    d1_rate: rate(sum('retained_d1'), base.length), d3_rate: rate(sum('retained_d3'), base.length),
    d7_rate: rate(sum('retained_d7'), base.length), d14_rate: rate(sum('retained_d14'), base.length),
    maturity_status: maturityStatus, data_hash: dataHash
  };
};
const cohortSummaryRows = [summarizeCohort(month, 'monthly', userCohortRows)];
const weeklyCohorts = new Map();
for (const row of userCohortRows.filter(row => row.register_date)) {
  const key = weekBucket(row.register_date).key;
  if (!weeklyCohorts.has(key)) weeklyCohorts.set(key, []);
  weeklyCohorts.get(key).push(row);
}
for (const [key, rows] of [...weeklyCohorts.entries()].sort()) cohortSummaryRows.push(summarizeCohort(key, 'weekly', rows));

const dataQualitySummaryRows = [{
  game_code: gameCode, period_key: month, data_hash: dataHash,
  registered_rows_raw: tabs.Registered.rows.length, registered_rows_unique: userCohortRows.length,
  login_rows_raw: tabs.Login.rows.length, login_rows_unique: loginDeduped.rows.length,
  returners_rows_raw: tabs.Returners.rows.length, returners_rows_unique: returnerRows.length,
  late_rows_raw: tabs.Late_Starters.rows.length, late_rows_unique: lateFirstLoginRows.length,
  dau_rows: dauDailyRows.length, cumulative_rows_corrected: correctedCount,
  duplicate_rows_removed: duplicateRowsRemoved, missing_login_join: missingLoginJoin,
  missing_login_rate: missingLoginRate, invariant_failures: invariantFailures,
  raw_status: rawStatus, transform_status: transformStatus, maturity_status: maturityStatus, generated_at: now
}];

const qualitySignalRows = [];
if (missingTabs.length) qualitySignalRows.push(signal('missing_required_tabs', missingTabs.length, '0 expected', 'critical', `Missing tabs: ${missingTabs.join(', ')}`));
if (correctedCount) qualitySignalRows.push(signal('cumulative_rows_corrected', correctedCount, '0 expected', 'medium', `ปรับ Retention ให้เป็น Cumulative ${correctedCount} แถว เพื่อบังคับ D1 ≥ D3 ≥ D7 ≥ D14`));
if (duplicateRowsRemoved) qualitySignalRows.push(signal('duplicate_rows_deduplicated', duplicateRowsRemoved, '0 expected', 'medium', `Deduplicate ${duplicateRowsRemoved} แถวด้วย Game + Period + Username`));
if (missingLoginRate > 0.10) qualitySignalRows.push(signal('missing_login_join', missingLoginJoin, '<=10% of registered', 'high', `${missingLoginJoin} จาก ${userCohortRows.length} Registered ไม่มี Login join (${(missingLoginRate * 100).toFixed(1)}%)`));
if (maturityStatus !== 'matured') qualitySignalRows.push(signal('cohort_collecting', month, `Mature at ${dateKey(expectedMatureAt)}`, 'info', 'Cohort ยังอยู่ในช่วงเก็บ Observation Window; Dashboard ใช้ได้แบบ Provisional แต่ AI/Weekly Alert ต้องรอ Matured'));
if (invariantFailures) qualitySignalRows.push(signal('cumulative_invariant_failure', invariantFailures, '0 expected', 'critical', 'พบแถวที่ไม่ผ่าน Cumulative invariant หลัง Transform'));
for (const row of channelMonthlyRows.filter(row => row.quality_tier === 'insufficient_sample')) qualitySignalRows.push(signal('insufficient_sample', row.register_users, `Register and Eligible D14 >= ${MIN_SAMPLE}`, 'info', row.verdict_text, row.channel));
for (const issue of schemaIssues) qualitySignalRows.push(signal('schema_validation', issue.message, 'required schema', issue.severity === 'error' ? 'critical' : 'medium', issue.message));
if (requiresCleanup) qualitySignalRows.push(signal('scope_replace_guard', previousDataHash, 'cleanup before replacement', 'high', `พบ Hash ใหม่ ${dataHash} แทน Hash เดิม ${previousDataHash}; ต้อง Cleanup scope เดิมและส่ง cleanup_confirmed=true ก่อน force build`));

const rawImportRows = Object.values(tabs).map(tab => ({
  import_id: `IMP-${gameCode}-${month}-${dataHash}-${tab.sheetType}`, run_id: runId,
  source_file_id: unit.source_file_id, source_file_name: unit.source_file_name, source_tab_name: tab.tabName,
  game_code: gameCode, period_key: month, sheet_type: tab.sheetType, row_count: tab.rows.length,
  import_status: tab.status, imported_at: now, data_hash: dataHash, notes: tab.errors.join(' | ')
}));

const indexSheetRows = [
  ['UserCohort', userCohortRows.length, 'V'], ['DAUDaily', dauDailyRows.length, 'J'],
  ['ChannelDaily', channelDailyRows.length, 'U'], ['ChannelWeekly', channelWeeklyRows.length, 'W'],
  ['ChannelMonthly', channelMonthlyRows.length, 'X'], ['PlayerTypeMonthly', 1, 'M'],
  ['TotalRetentionMonthly', 1, 'P'], ['CohortSummary', cohortSummaryRows.length, 'W'], ['CohortMaturity', 1, 'J'], ['DataQualitySummary', 1, 'U']
];
const dataIndexRows = indexSheetRows.map(([targetSheet, recordCount, lastColumn]) => ({
  index_id: `IDX-${gameCode}-${month}-${targetSheet}`, game_code: gameCode, period_key: month, month,
  week_start_date: '', week_end_date: '', channel: 'ALL', master_file_id: masterFileId,
  target_sheet: targetSheet, range_ref: `${targetSheet}!A2:${lastColumn}${Math.max(2, Number(recordCount) + 1)}`,
  data_hash: dataHash, record_count: recordCount, last_updated_at: now, central_db_id: centralDbId,
  maturity_status: maturityStatus, is_provisional: isProvisional
}));

const processedRows = Object.values(tabs).reduce((sum, tab) => sum + tab.rows.length, 0);
const hasCriticalSchemaError = schemaIssues.some(issue => issue.severity === 'error');
const shouldBlockWrite = rawCheckBlocked || shouldSkipWrite || requiresCleanup || hasCriticalSchemaError || invariantFailures > 0;
const flowStatus = rawCheckBlocked ? 'raw_not_ready'
  : shouldSkipWrite ? 'skipped'
  : requiresCleanup ? 'needs_review'
  : hasCriticalSchemaError || invariantFailures ? 'needs_review'
  : 'ready';
const statusMessage = rawCheckBlocked ? `Raw check is not ready: ${unit.raw_check_message || rawCheckStatus}`
  : shouldSkipWrite ? `Skipped write: unchanged data_hash ${dataHash}`
  : requiresCleanup ? `Blocked replacement: previous=${previousDataHash}, current=${dataHash}; cleanup_confirmed is required after scoped cleanup.`
  : hasCriticalSchemaError ? `Schema validation failed: ${schemaIssues.filter(issue => issue.severity === 'error').map(issue => issue.message).join(' | ')}`
  : invariantFailures ? `Cumulative invariant failed for ${invariantFailures} rows.`
  : `Prepared canonical cumulative payload: users=${userCohortRows.length}, corrected=${correctedCount}, duplicates_removed=${duplicateRowsRemoved}, maturity=${maturityStatus}`;

const preparedRowCounts = {
  RawImports: rawImportRows.length, UserCohort: userCohortRows.length,
  ChannelDaily: channelDailyRows.length, ChannelWeekly: channelWeeklyRows.length,
  ChannelMonthly: channelMonthlyRows.length, DAUDaily: dauDailyRows.length,
  Returners: returnerRows.length, LateFirstLogin: lateFirstLoginRows.length,
  PlayerTypeMonthly: playerTypeMonthlyRows.length, TotalRetentionMonthly: totalRetentionMonthlyRows.length,
  QualitySignals: qualitySignalRows.length, CohortMaturity: cohortMaturityRows.length,
  DataQualitySummary: dataQualitySummaryRows.length, TransformLog: 1,
  DataIndex: dataIndexRows.length, PipelineLogs: 1
};
const rowsWritten = shouldBlockWrite ? 0 : Object.entries(preparedRowCounts)
  .filter(([key]) => !['QualitySignals', 'PipelineLogs'].includes(key))
  .reduce((sum, [, count]) => sum + count, 0);
const transformLogRows = [{
  run_id: runId, batch_id: batchId, workflow_name: 'CQR_N8N_Master_Data_Update_V7_Direct_Master_Cumulative',
  game_code: gameCode, period_key: month, source_file_id: unit.source_file_id, master_file_id: masterFileId,
  run_started_at: unit.run_started_at || now, run_finished_at: now, rows_read: processedRows, rows_written: rowsWritten,
  processed_rows: processedRows, status: flowStatus, message: statusMessage, data_hash: dataHash,
  raw_check_id: rawCheckId, raw_check_status: rawCheckStatus, maturity_status: maturityStatus
}];
const pipelineLogRows = [{
  run_id: runId, workflow_name: 'CQR_N8N_Master_Data_Update_V7_Direct_Master_Cumulative',
  run_started_at: unit.run_started_at || now, run_finished_at: now, game_code: gameCode,
  source_file_id: unit.source_file_id, master_file_id: masterFileId, status: flowStatus,
  rows_read: processedRows, rows_written: rowsWritten, data_hash_before: previousDataHash, data_hash_after: dataHash,
  error_message: hasCriticalSchemaError || invariantFailures ? statusMessage : '', triggered_by: unit.triggered_by || 'n8n',
  central_db_id: centralDbId, period_key: month, started_at: unit.run_started_at || now, finished_at: now,
  processed_rows: processedRows, message: statusMessage, data_hash: dataHash, batch_id: batchId,
  raw_check_id: rawCheckId, raw_check_status: rawCheckStatus, maturity_status: maturityStatus
}];

const fullPayloads = {
  RawImports: rawImportRows, UserCohort: userCohortRows, ChannelDaily: channelDailyRows,
  ChannelWeekly: channelWeeklyRows, ChannelMonthly: channelMonthlyRows, DAUDaily: dauDailyRows,
  Returners: returnerRows, LateFirstLogin: lateFirstLoginRows, PlayerTypeMonthly: playerTypeMonthlyRows,
  TotalRetentionMonthly: totalRetentionMonthlyRows, CohortSummary: cohortSummaryRows, QualitySignals: qualitySignalRows,
  CohortMaturity: cohortMaturityRows, DataQualitySummary: dataQualitySummaryRows,
  CentralCohortMaturity: cohortMaturityRows.map(row => ({ ...row, central_db_id: centralDbId })),
  CentralDataQualitySummary: dataQualitySummaryRows.map(row => ({ ...row, central_db_id: centralDbId })),
  TransformLog: transformLogRows, DataIndex: dataIndexRows, PipelineLogs: pipelineLogRows
};
const writePayloads = shouldBlockWrite
  ? Object.fromEntries(Object.entries(fullPayloads).map(([key]) => [key, ['QualitySignals', 'TransformLog', 'PipelineLogs'].includes(key) ? fullPayloads[key] : []]))
  : fullPayloads;

return [{ json: {
  ...unit,
  central_db_id: centralDbId,
  batch_id: batchId,
  raw_check_id: rawCheckId,
  raw_check_status: rawCheckStatus,
  master_file_id: masterFileId,
  master_data_hash: dataHash,
  previous_data_hash: previousDataHash,
  cleanup_required: requiresCleanup,
  cleanup_confirmed: cleanupConfirmed,
  skipped_duplicate_hash: shouldSkipWrite,
  schema_issues: schemaIssues,
  raw_counts: Object.fromEntries(Object.entries(tabs).map(([key, value]) => [key, value.rows.length])),
  prepared_row_counts: preparedRowCounts,
  write_payloads: writePayloads,
  pipeline_status: flowStatus,
  maturity_status: maturityStatus,
  is_provisional: isProvisional,
  data_complete_through: dateKey(dataCompleteDate),
  next_step: shouldBlockWrite ? statusMessage : 'Append canonical scope rows; then warm AI only when maturity_status=matured.'
}}];
