/**
 * CQR Daily Retention API V1 — Production module.
 *
 * Additive backend module only.
 * - Does NOT modify dashboard.data.
 * - Reads only the compact Daily Retention Production DB.
 * - Separate cache namespace, default 6h.
 * - Refuses to serve stale prototype rows while RuntimeConfig.serve_enabled=false.
 * - Returns no PII.
 *
 * Required Script Property:
 *   CQR_DAILY_RETENTION_DB_ID=1LKYwNQAVuMk3ptLEsA1bm2BjEk8G1Hys-mcpMf89DJs
 */

var CQR_DAILY_RETENTION_CONTRACT_V1_ = 'daily_retention_v1';
var CQR_DAILY_RETENTION_DEFAULT_CACHE_SECONDS_V1_ = 21600;
var CQR_DAILY_RETENTION_ALLOWED_GAMES_V1_ = {
  CBM_TH: true,
  CBM_SEA: true,
  CBPC_TH: true,
  CBPC_SEA: true
};

function cqrDailyRetentionDbIdV1_() {
  var id = String(PropertiesService.getScriptProperties().getProperty('CQR_DAILY_RETENTION_DB_ID') || '').trim();
  if (!id) throw new Error('Missing Script Property: CQR_DAILY_RETENTION_DB_ID');
  return id;
}

function cqrDailyRetentionSheetV1_() {
  return SpreadsheetApp.openById(cqrDailyRetentionDbIdV1_());
}

function cqrDailyRetentionRowsV1_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing Daily Retention sheet: ' + sheetName);
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  var headers = values[0].map(function (v) { return String(v || '').trim(); });
  return values.slice(1).filter(function (row) {
    return row.some(function (v) { return v !== '' && v !== null; });
  }).map(function (row) {
    var out = {};
    headers.forEach(function (header, index) {
      if (header) out[header] = row[index] === '' ? null : row[index];
    });
    return out;
  });
}

function cqrDailyRetentionConfigV1_(ss) {
  var rows = cqrDailyRetentionRowsV1_(ss, 'RuntimeConfig');
  var out = {};
  rows.forEach(function (row) {
    var key = String(row.key || '').trim();
    if (key) out[key] = row.value;
  });
  return out;
}

function cqrDailyRetentionBoolV1_(value) {
  if (value === true) return true;
  return /^(1|true|yes)$/i.test(String(value || '').trim());
}

function cqrDailyRetentionCacheSecondsV1_(config) {
  var n = Number(config.api_cache_seconds || CQR_DAILY_RETENTION_DEFAULT_CACHE_SECONDS_V1_);
  if (!isFinite(n) || n < 60 || n > 21600) return CQR_DAILY_RETENTION_DEFAULT_CACHE_SECONDS_V1_;
  return Math.floor(n);
}

function cqrDailyRetentionGameV1_(value) {
  var game = String(value || '').trim().toUpperCase();
  return CQR_DAILY_RETENTION_ALLOWED_GAMES_V1_[game] ? game : '';
}

function cqrDailyRetentionDateTextV1_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  return String(value).slice(0, 10);
}

function cqrDailyRetentionSerializeV1_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return value;
}

function cqrDailyRetentionCleanObjectV1_(row) {
  var out = {};
  Object.keys(row || {}).forEach(function (key) {
    // Defensive PII block even though compact mart should not contain these fields.
    if (/^(username|email|user_id|player_id)$/i.test(key)) return;
    out[key] = cqrDailyRetentionSerializeV1_(row[key]);
  });
  return out;
}

function cqrDailyRetentionServeGuardV1_(config) {
  var environment = String(config.environment || '').toUpperCase();
  var productionEnabled = cqrDailyRetentionBoolV1_(config.production_enabled);
  var serveEnabled = cqrDailyRetentionBoolV1_(config.serve_enabled);
  if (environment !== 'PROD' || !productionEnabled) {
    return { ok: false, status: 'blocked', reason: 'production_not_enabled' };
  }
  if (!serveEnabled) {
    return { ok: false, status: 'warming', reason: 'initial_production_backfill_required' };
  }
  return { ok: true };
}

function cqrDailyRetentionBaseResponseV1_(config) {
  return {
    contract_version: CQR_DAILY_RETENTION_CONTRACT_V1_,
    environment: String(config.environment || ''),
    data_complete_through: cqrDailyRetentionDateTextV1_(config.data_complete_through),
    generated_at: Utilities.formatDate(new Date(), 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    ads_page_joined: false
  };
}

function cqrDailyRetentionCacheGetV1_(key) {
  var raw = CacheService.getScriptCache().get('cqr-retention-daily-v1:' + key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (error) { return null; }
}

function cqrDailyRetentionCachePutV1_(key, value, seconds) {
  CacheService.getScriptCache().put(
    'cqr-retention-daily-v1:' + key,
    JSON.stringify(value),
    seconds
  );
}

function cqrDailyRetentionOverviewV1_(params) {
  var ss = cqrDailyRetentionSheetV1_();
  var config = cqrDailyRetentionConfigV1_(ss);
  var base = cqrDailyRetentionBaseResponseV1_(config);
  var guard = cqrDailyRetentionServeGuardV1_(config);
  if (!guard.ok) {
    base.status = guard.status;
    base.reason = guard.reason;
    base.games = [];
    return base;
  }

  var requestedGame = cqrDailyRetentionGameV1_(params && (params.game || params.game_code));
  var cacheKey = 'overview:' + (requestedGame || 'ALL') + ':' + base.data_complete_through;
  var cached = cqrDailyRetentionCacheGetV1_(cacheKey);
  if (cached) return cached;

  var rows = cqrDailyRetentionRowsV1_(ss, 'DailyOverview')
    .filter(function (row) { return !requestedGame || String(row.game_code || '') === requestedGame; })
    .map(cqrDailyRetentionCleanObjectV1_);

  base.status = 'ready';
  base.coverage = { requested_games: requestedGame ? 1 : 4, returned_games: rows.length };
  base.games = rows;
  cqrDailyRetentionCachePutV1_(cacheKey, base, cqrDailyRetentionCacheSecondsV1_(config));
  return base;
}

function cqrDailyRetentionCohortsV1_(params) {
  var ss = cqrDailyRetentionSheetV1_();
  var config = cqrDailyRetentionConfigV1_(ss);
  var base = cqrDailyRetentionBaseResponseV1_(config);
  var guard = cqrDailyRetentionServeGuardV1_(config);
  if (!guard.ok) {
    base.status = guard.status;
    base.reason = guard.reason;
    base.rows = [];
    return base;
  }

  var game = cqrDailyRetentionGameV1_(params && (params.game || params.game_code));
  var limit = Math.max(1, Math.min(240, Number(params && params.limit || 120)));
  var rows = cqrDailyRetentionRowsV1_(ss, 'DailyCohortRetention')
    .filter(function (row) { return !game || String(row.game_code || '') === game; })
    .sort(function (a, b) { return String(b.cohort_date || '').localeCompare(String(a.cohort_date || '')); })
    .slice(0, limit)
    .map(cqrDailyRetentionCleanObjectV1_);

  base.status = 'ready';
  base.rows = rows;
  return base;
}

function cqrDailyRetentionChannelsV1_(params) {
  var ss = cqrDailyRetentionSheetV1_();
  var config = cqrDailyRetentionConfigV1_(ss);
  var base = cqrDailyRetentionBaseResponseV1_(config);
  var guard = cqrDailyRetentionServeGuardV1_(config);
  if (!guard.ok) {
    base.status = guard.status;
    base.reason = guard.reason;
    base.rows = [];
    return base;
  }

  var game = cqrDailyRetentionGameV1_(params && (params.game || params.game_code));
  var limit = Math.max(1, Math.min(500, Number(params && params.limit || 200)));
  var rows = cqrDailyRetentionRowsV1_(ss, 'DailyChannelRetention')
    .filter(function (row) { return !game || String(row.game_code || '') === game; })
    .sort(function (a, b) { return String(b.cohort_date || '').localeCompare(String(a.cohort_date || '')); })
    .slice(0, limit)
    .map(cqrDailyRetentionCleanObjectV1_);

  base.status = 'ready';
  base.attribution_scope = 'db_side_not_ads_platform';
  base.rows = rows;
  return base;
}

function cqrDailyRetentionAnomaliesV1_(params) {
  var ss = cqrDailyRetentionSheetV1_();
  var config = cqrDailyRetentionConfigV1_(ss);
  var base = cqrDailyRetentionBaseResponseV1_(config);
  var guard = cqrDailyRetentionServeGuardV1_(config);
  if (!guard.ok) {
    base.status = guard.status;
    base.reason = guard.reason;
    base.rows = [];
    return base;
  }

  var game = cqrDailyRetentionGameV1_(params && (params.game || params.game_code));
  var rows = cqrDailyRetentionRowsV1_(ss, 'DailyRetentionAnomaly')
    .filter(function (row) { return !game || String(row.game_code || '') === game; })
    .sort(function (a, b) { return String(b.metric_date || '').localeCompare(String(a.metric_date || '')); })
    .slice(0, 200)
    .map(cqrDailyRetentionCleanObjectV1_);

  base.status = 'ready';
  base.rows = rows;
  return base;
}

function cqrDailyRetentionHealthV1_() {
  var ss = cqrDailyRetentionSheetV1_();
  var config = cqrDailyRetentionConfigV1_(ss);
  var base = cqrDailyRetentionBaseResponseV1_(config);
  base.status = cqrDailyRetentionServeGuardV1_(config).ok ? 'ready' : 'warming';
  base.sync_state = cqrDailyRetentionRowsV1_(ss, 'DailyRetentionSyncState').map(cqrDailyRetentionCleanObjectV1_);
  base.data_quality = cqrDailyRetentionRowsV1_(ss, 'DataQuality').map(cqrDailyRetentionCleanObjectV1_);
  return base;
}

/**
 * Call this from the existing authenticated Apps Script router.
 * Do not expose it as an unauthenticated standalone doGet without the project's normal auth/session checks.
 */
function handleDailyRetentionActionV1_(action, params) {
  var a = String(action || '').trim();
  if (a === 'retention.daily.overview') return cqrDailyRetentionOverviewV1_(params || {});
  if (a === 'retention.daily.cohorts') return cqrDailyRetentionCohortsV1_(params || {});
  if (a === 'retention.daily.channels') return cqrDailyRetentionChannelsV1_(params || {});
  if (a === 'retention.daily.anomalies') return cqrDailyRetentionAnomaliesV1_(params || {});
  if (a === 'retention.daily.health') return cqrDailyRetentionHealthV1_();
  throw new Error('Unsupported Daily Retention action: ' + a);
}
