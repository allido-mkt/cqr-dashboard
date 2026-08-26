/**
 * CQR Daily Retention API V1 — PRODUCTION
 *
 * Dedicated read API for the Daily Retention serving marts.
 * - Does NOT call the legacy dashboard data endpoint.
 * - Does NOT read raw user-level sheets.
 * - Uses the existing session_token / validateSession_ security path.
 * - Uses a separate cache namespace and publication fingerprint.
 * - Frontend receives backend-provided maturity, baseline and anomaly state.
 * - DB-only V1: no Meta Ads, Google Ads or Facebook Page joins.
 */

const CQR_DAILY_RETENTION_API_V1_CONTRACT_ = 'daily_retention_v1';
const CQR_DAILY_RETENTION_API_V1_ACTIONS_ = [
  'retention.daily.overview',
  'retention.daily.cohorts',
  'retention.daily.channels',
  'retention.daily.anomalies',
  'retention.daily.summaries'
];
const CQR_DAILY_RETENTION_API_V1_CACHE_PREFIX_ = 'cqr-daily-retention-v1:';
const CQR_DAILY_RETENTION_API_V1_DEFAULT_WINDOW_ = 28;
const CQR_DAILY_RETENTION_API_V1_ALLOWED_WINDOWS_ = [14, 28, 60];
const CQR_DAILY_RETENTION_API_V1_MAX_RANGE_DAYS_ = 120;
const CQR_DAILY_RETENTION_API_V1_MAX_CACHE_BYTES_ = 90000;

function handleDailyRetentionApiV1_(e, callback) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || '').trim().toLowerCase();

  if (CQR_DAILY_RETENTION_API_V1_ACTIONS_.indexOf(action) === -1) {
    return json_({
      ok: false,
      status: 'error',
      error_code: 'DAILY_RETENTION_UNKNOWN_ACTION',
      message: 'Unsupported Daily Retention action: ' + action
    }, callback);
  }

  const session = validateSession_(params.session_token);
  const ctx = cqrDailyRetentionApiContext_();
  const scope = cqrDailyRetentionResolveScope_(session, params, ctx.available_games);

  if (!ctx.gate.pass) {
    return json_({
      ok: true,
      email: session.email,
      cache_hit: false,
      data: {
        status: 'blocked',
        contract_version: CQR_DAILY_RETENTION_API_V1_CONTRACT_,
        data_complete_through: ctx.runtime.data_complete_through || '',
        release_state: ctx.build.release_state || '',
        blockers: ctx.gate.blockers,
        coverage: {
          requested_games: scope.games,
          returned_games: [],
          ready_games: 0,
          partial_games: 0
        },
        limitations: ['Daily Retention serving is disabled until the Production release gate passes.']
      }
    }, callback);
  }

  const fingerprint = cqrDailyRetentionFingerprint_(ctx);
  const cacheKey = cqrDailyRetentionCacheKey_(action, fingerprint, scope, params);
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);

  if (cached) {
    try {
      return json_({
        ok: true,
        email: session.email,
        cache_hit: true,
        data: JSON.parse(cached)
      }, callback);
    } catch (cacheError) {
      cache.remove(cacheKey);
    }
  }

  let data;
  if (action === 'retention.daily.overview') {
    data = cqrDailyRetentionOverview_(ctx, scope);
  } else if (action === 'retention.daily.cohorts') {
    data = cqrDailyRetentionCohorts_(ctx, scope, params);
  } else if (action === 'retention.daily.channels') {
    data = cqrDailyRetentionChannels_(ctx, scope, params);
  } else if (action === 'retention.daily.anomalies') {
    data = cqrDailyRetentionAnomalies_(ctx, scope, params);
  } else {
    data = cqrDailyRetentionSummaries_(ctx, scope, params);
  }

  data.contract_version = CQR_DAILY_RETENTION_API_V1_CONTRACT_;
  data.data_complete_through = ctx.runtime.data_complete_through || '';
  data.release_state = ctx.build.release_state || '';
  data.fingerprint = fingerprint;
  data.generated_at = new Date().toISOString();

  const serialized = JSON.stringify(data);
  if (serialized.length <= CQR_DAILY_RETENTION_API_V1_MAX_CACHE_BYTES_) {
    cache.put(cacheKey, serialized, cqrDailyRetentionCacheTtl_(ctx.runtime));
  }

  return json_({
    ok: true,
    email: session.email,
    cache_hit: false,
    data: data
  }, callback);
}

function cqrDailyRetentionApiContext_() {
  const dbId = cqrDailyRetentionDbId_();
  const runtime = cqrDailyRetentionReadKeyValueSheet_(dbId, 'RuntimeConfig');
  const build = cqrDailyRetentionReadKeyValueSheet_(dbId, 'BuildManifest');
  const overviewTable = cqrDailyRetentionReadTable_(dbId, 'DailyOverview');

  cqrDailyRetentionRequireColumns_('DailyOverview', overviewTable.headers, [
    'game_code', 'data_status', 'report_date', 'registrations', 'dau',
    'd1_cohort_date', 'd1_rate', 'd1_retained', 'd1_eligible', 'd1_alert_state',
    'd3_cohort_date', 'd3_rate', 'd3_retained', 'd3_eligible', 'd3_alert_state',
    'd7_cohort_date', 'd7_rate', 'd7_retained', 'd7_eligible', 'd7_alert_state',
    'd14_cohort_date', 'd14_rate', 'd14_retained', 'd14_eligible', 'd14_alert_state',
    'open_alert_count', 'data_complete_through', 'contract_version', 'limitations'
  ]);

  const availableGames = cqrDailyRetentionUnique_(overviewTable.rows.map(function (row) {
    return String(row.game_code || '').trim().toUpperCase();
  }).filter(Boolean));

  return {
    db_id: dbId,
    runtime: runtime,
    build: build,
    overview_table: overviewTable,
    available_games: availableGames,
    gate: cqrDailyRetentionReleaseGate_(runtime, build)
  };
}

function cqrDailyRetentionDbId_() {
  const id = String(PropertiesService.getScriptProperties().getProperty('CQR_DAILY_RETENTION_DB_ID') || '').trim();
  if (!id) throw new Error('Missing Script Property: CQR_DAILY_RETENTION_DB_ID');
  return id;
}

function cqrDailyRetentionReleaseGate_(runtime, build) {
  const blockers = [];
  if (String(runtime.environment || '').toUpperCase() !== 'PROD') blockers.push('environment_not_prod');
  if (String(runtime.contract_version || '') !== CQR_DAILY_RETENTION_API_V1_CONTRACT_) blockers.push('contract_version_mismatch');
  if (String(runtime.initial_backfill_state || '').toUpperCase() !== 'COMPLETE') blockers.push('historical_backfill_not_complete');
  if (!cqrDailyRetentionBool_(runtime.serve_enabled)) blockers.push('serve_enabled_false');
  if (String(build.serving_mart_verification || '').toUpperCase() !== 'PASS') blockers.push('serving_mart_verification_not_pass');
  if (String(build.release_state || '').indexOf('PROD_SERVING_MARTS_COMPLETE') !== 0) blockers.push('release_state_not_ready');
  return { pass: blockers.length === 0, blockers: blockers };
}

function cqrDailyRetentionResolveScope_(session, params, availableGames) {
  let allowed = availableGames.slice();
  const sessionGames = String(session.allowed_games || 'ALL').trim().toUpperCase();
  const sessionRegions = String(session.allowed_regions || 'ALL').trim().toUpperCase();

  if (sessionGames && sessionGames !== 'ALL') {
    const allowedSet = {};
    sessionGames.split(',').map(function (v) { return v.trim(); }).filter(Boolean).forEach(function (v) { allowedSet[v] = true; });
    allowed = allowed.filter(function (game) { return Boolean(allowedSet[game]); });
  }

  if (sessionRegions && sessionRegions !== 'ALL') {
    const regionSet = {};
    sessionRegions.split(',').map(function (v) { return v.trim(); }).filter(Boolean).forEach(function (v) { regionSet[v] = true; });
    allowed = allowed.filter(function (game) {
      const region = /_TH$/.test(game) ? 'TH' : /_SEA$/.test(game) ? 'SEA' : '';
      return !region || Boolean(regionSet[region]);
    });
  }

  const requestedRaw = String(params.games_csv || params.game || '').trim().toUpperCase();
  let requested = requestedRaw ? requestedRaw.split(',').map(function (v) { return v.trim(); }).filter(Boolean) : allowed.slice();
  requested = cqrDailyRetentionUnique_(requested);

  const forbidden = requested.filter(function (game) { return allowed.indexOf(game) === -1; });
  if (forbidden.length) throw new Error('Daily Retention scope is not allowed: ' + forbidden.join(', '));
  if (!requested.length) throw new Error('No Daily Retention games are available for this session.');

  return {
    games: requested,
    session_allowed_games: allowed,
    session_email: String(session.email || '')
  };
}

function cqrDailyRetentionOverview_(ctx, scope) {
  const rows = ctx.overview_table.rows.filter(function (row) {
    return scope.games.indexOf(String(row.game_code || '').trim().toUpperCase()) !== -1;
  });

  const baselineTable = cqrDailyRetentionReadTable_(ctx.db_id, 'DailyRetentionBaseline');
  cqrDailyRetentionRequireColumns_('DailyRetentionBaseline', baselineTable.headers, [
    'metric_date', 'game_code', 'metric_name', 'metric_value', 'baseline_value',
    'baseline_observations', 'mad', 'robust_z', 'diff_abs', 'diff_relative',
    'eligible_sample', 'alert_state', 'contract_version'
  ]);
  const baselineIndex = cqrDailyRetentionBaselineIndex_(baselineTable.rows, scope.games);
  const dqIssues = cqrDailyRetentionDataQualityIssues_(ctx.db_id, scope.games);

  const games = rows.map(function (row) {
    const game = String(row.game_code || '').trim().toUpperCase();
    const reportDate = cqrDailyRetentionDate_(row.report_date);
    const regBase = baselineIndex[cqrDailyRetentionBaselineKey_(game, 'registrations', reportDate)] || null;
    const dauBase = baselineIndex[cqrDailyRetentionBaselineKey_(game, 'dau', reportDate)] || null;

    return {
      game_code: game,
      data_status: String(row.data_status || ''),
      snapshot: {
        report_date: reportDate,
        registrations: cqrDailyRetentionMetricValue_(row.registrations, regBase),
        dau: cqrDailyRetentionMetricValue_(row.dau, dauBase)
      },
      milestones: [1, 3, 7, 14].map(function (day) {
        const metric = 'd' + day + '_rate';
        const cohortDate = cqrDailyRetentionDate_(row['d' + day + '_cohort_date']);
        const base = baselineIndex[cqrDailyRetentionBaselineKey_(game, metric, cohortDate)] || null;
        const value = cqrDailyRetentionNullableNumber_(row[metric]);
        return {
          metric: metric,
          cohort_date: cohortDate,
          value: value,
          retained: cqrDailyRetentionNullableNumber_(row['d' + day + '_retained']),
          eligible: cqrDailyRetentionNullableNumber_(row['d' + day + '_eligible']),
          baseline: base ? cqrDailyRetentionNullableNumber_(base.baseline_value) : null,
          baseline_observations: base ? cqrDailyRetentionNullableNumber_(base.baseline_observations) : null,
          diff_abs: base ? cqrDailyRetentionNullableNumber_(base.diff_abs) : null,
          diff_pp: base && cqrDailyRetentionNullableNumber_(base.diff_abs) !== null ? +(cqrDailyRetentionNullableNumber_(base.diff_abs) * 100).toFixed(4) : null,
          diff_relative: base ? cqrDailyRetentionNullableNumber_(base.diff_relative) : null,
          robust_z: base ? cqrDailyRetentionNullableNumber_(base.robust_z) : null,
          maturity_status: value === null ? 'collecting' : 'eligible',
          alert_state: String(row['d' + day + '_alert_state'] || (base && base.alert_state) || 'none')
        };
      }),
      open_alert_count: cqrDailyRetentionNullableNumber_(row.open_alert_count) || 0,
      data_complete_through: cqrDailyRetentionDate_(row.data_complete_through),
      limitations: String(row.limitations || '')
    };
  });

  const readyCount = games.filter(function (g) { return g.data_status === 'ready'; }).length;
  const partialCount = games.filter(function (g) { return g.data_status === 'partial'; }).length;
  const status = games.some(function (g) { return g.data_status === 'blocked'; }) ? 'blocked' : (partialCount ? 'partial' : 'ready');

  return {
    status: status,
    coverage: {
      requested_games: scope.games,
      returned_games: games.map(function (g) { return g.game_code; }),
      ready_games: readyCount,
      partial_games: partialCount
    },
    baseline: {
      type: 'previous_4_matching_weekdays',
      min_observations: 3
    },
    games: games,
    data_quality_issues: dqIssues,
    limitations: cqrDailyRetentionUnique_(games.map(function (g) { return g.limitations; }).filter(Boolean))
  };
}

function cqrDailyRetentionCohorts_(ctx, scope, params) {
  const range = cqrDailyRetentionDateRange_(params, ctx.runtime.data_complete_through);
  const table = cqrDailyRetentionReadTable_(ctx.db_id, 'DailyCohortRetention');
  cqrDailyRetentionRequireColumns_('DailyCohortRetention', table.headers, [
    'cohort_date', 'game_code', 'register_users', 'first_login_users',
    'retained_d1', 'eligible_d1', 'd1_rate', 'd1_status',
    'retained_d3', 'eligible_d3', 'd3_rate', 'd3_status',
    'retained_d7', 'eligible_d7', 'd7_rate', 'd7_status',
    'retained_d14', 'eligible_d14', 'd14_rate', 'd14_status',
    'data_complete_through', 'contract_version'
  ]);
  const baselineTable = cqrDailyRetentionReadTable_(ctx.db_id, 'DailyRetentionBaseline');
  const baselineIndex = cqrDailyRetentionBaselineIndex_(baselineTable.rows, scope.games);

  const rows = table.rows.filter(function (row) {
    const game = String(row.game_code || '').trim().toUpperCase();
    const date = cqrDailyRetentionDate_(row.cohort_date);
    return scope.games.indexOf(game) !== -1 && cqrDailyRetentionDateInRange_(date, range.start_date, range.end_date);
  }).map(function (row) {
    const game = String(row.game_code || '').trim().toUpperCase();
    const date = cqrDailyRetentionDate_(row.cohort_date);
    const milestones = {};
    [1, 3, 7, 14].forEach(function (day) {
      const metric = 'd' + day + '_rate';
      const base = baselineIndex[cqrDailyRetentionBaselineKey_(game, metric, date)] || null;
      milestones['d' + day] = {
        metric: metric,
        rate: cqrDailyRetentionNullableNumber_(row[metric]),
        retained: cqrDailyRetentionNullableNumber_(row['retained_d' + day]),
        eligible: cqrDailyRetentionNullableNumber_(row['eligible_d' + day]),
        maturity_status: String(row['d' + day + '_status'] || ''),
        baseline: base ? cqrDailyRetentionNullableNumber_(base.baseline_value) : null,
        baseline_observations: base ? cqrDailyRetentionNullableNumber_(base.baseline_observations) : null,
        diff_abs: base ? cqrDailyRetentionNullableNumber_(base.diff_abs) : null,
        diff_pp: base && cqrDailyRetentionNullableNumber_(base.diff_abs) !== null ? +(cqrDailyRetentionNullableNumber_(base.diff_abs) * 100).toFixed(4) : null,
        diff_relative: base ? cqrDailyRetentionNullableNumber_(base.diff_relative) : null,
        robust_z: base ? cqrDailyRetentionNullableNumber_(base.robust_z) : null,
        alert_state: base ? String(base.alert_state || 'none') : 'none'
      };
    });
    return {
      cohort_date: date,
      game_code: game,
      register_users: cqrDailyRetentionNullableNumber_(row.register_users),
      first_login_users: cqrDailyRetentionNullableNumber_(row.first_login_users),
      milestones: milestones,
      data_complete_through: cqrDailyRetentionDate_(row.data_complete_through)
    };
  });

  rows.sort(function (a, b) {
    return a.cohort_date === b.cohort_date ? a.game_code.localeCompare(b.game_code) : a.cohort_date.localeCompare(b.cohort_date);
  });

  return {
    status: 'ready',
    filters: { games: scope.games, start_date: range.start_date, end_date: range.end_date, window_days: range.window_days },
    row_count: rows.length,
    rows: rows,
    limitations: ['DB-only cohort mart; frontend must not recalculate retention, maturity or anomaly rules.']
  };
}

function cqrDailyRetentionChannels_(ctx, scope, params) {
  const range = cqrDailyRetentionDateRange_(params, ctx.runtime.data_complete_through);
  const channelFilter = String(params.channel || '').trim().toLowerCase();
  const table = cqrDailyRetentionReadTable_(ctx.db_id, 'DailyChannelRetention');
  const cohortTable = cqrDailyRetentionReadTable_(ctx.db_id, 'DailyCohortRetention');

  cqrDailyRetentionRequireColumns_('DailyChannelRetention', table.headers, [
    'cohort_date', 'game_code', 'db_channel', 'register_users', 'first_login_users',
    'retained_d1', 'eligible_d1', 'd1_rate', 'd1_status',
    'retained_d3', 'eligible_d3', 'd3_rate', 'd3_status',
    'retained_d7', 'eligible_d7', 'd7_rate', 'd7_status',
    'retained_d14', 'eligible_d14', 'd14_rate', 'd14_status',
    'data_complete_through', 'contract_version'
  ]);

  const gameIndex = {};
  cohortTable.rows.forEach(function (row) {
    const game = String(row.game_code || '').trim().toUpperCase();
    const date = cqrDailyRetentionDate_(row.cohort_date);
    gameIndex[game + '|' + date] = row;
  });

  const rows = table.rows.filter(function (row) {
    const game = String(row.game_code || '').trim().toUpperCase();
    const date = cqrDailyRetentionDate_(row.cohort_date);
    const channel = String(row.db_channel || '').trim();
    return scope.games.indexOf(game) !== -1 && cqrDailyRetentionDateInRange_(date, range.start_date, range.end_date) && (!channelFilter || channel.toLowerCase() === channelFilter);
  }).map(function (row) {
    const game = String(row.game_code || '').trim().toUpperCase();
    const date = cqrDailyRetentionDate_(row.cohort_date);
    const gameRow = gameIndex[game + '|' + date] || {};
    const milestones = {};
    [1, 3, 7, 14].forEach(function (day) {
      const rate = cqrDailyRetentionNullableNumber_(row['d' + day + '_rate']);
      const gameRate = cqrDailyRetentionNullableNumber_(gameRow['d' + day + '_rate']);
      milestones['d' + day] = {
        rate: rate,
        retained: cqrDailyRetentionNullableNumber_(row['retained_d' + day]),
        eligible: cqrDailyRetentionNullableNumber_(row['eligible_d' + day]),
        maturity_status: String(row['d' + day + '_status'] || ''),
        game_rate: gameRate,
        diff_vs_game_pp: rate !== null && gameRate !== null ? +((rate - gameRate) * 100).toFixed(4) : null,
        diff_vs_game_relative: rate !== null && gameRate !== null && Math.abs(gameRate) > 1e-12 ? +((rate - gameRate) / Math.abs(gameRate)).toFixed(6) : null
      };
    });
    return {
      cohort_date: date,
      game_code: game,
      db_channel: String(row.db_channel || ''),
      register_users: cqrDailyRetentionNullableNumber_(row.register_users),
      first_login_users: cqrDailyRetentionNullableNumber_(row.first_login_users),
      milestones: milestones,
      data_complete_through: cqrDailyRetentionDate_(row.data_complete_through)
    };
  });

  rows.sort(function (a, b) {
    if (a.cohort_date !== b.cohort_date) return a.cohort_date.localeCompare(b.cohort_date);
    if (a.game_code !== b.game_code) return a.game_code.localeCompare(b.game_code);
    return a.db_channel.localeCompare(b.db_channel);
  });

  return {
    status: 'ready',
    filters: { games: scope.games, channel: String(params.channel || ''), start_date: range.start_date, end_date: range.end_date, window_days: range.window_days },
    row_count: rows.length,
    rows: rows,
    baseline_scope: 'game_total_only',
    limitations: [
      'DB-side Attribution only — not Ads Platform API.',
      'Current Production baseline mart has game-level baseline only; no channel-specific baseline is fabricated.'
    ]
  };
}


function cqrDailyRetentionSummaries_(ctx, scope, params) {
  const reportDate = cqrDailyRetentionDate_(params.report_date || ctx.runtime.data_complete_through);
  if (!reportDate) throw new Error('Daily Retention summary report_date is invalid.');

  const ss = SpreadsheetApp.openById(ctx.db_id);
  const sheet = ss.getSheetByName('DailyRetentionAISummary');
  if (!sheet || sheet.getLastRow() < 2) {
    return {
      status: 'not_ready',
      report_date: reportDate,
      overall: null,
      games: {},
      rows: [],
      limitations: ['AI Summary has not been generated for this Daily Retention database yet.']
    };
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(function (value) { return String(value || '').trim(); });
  cqrDailyRetentionRequireColumns_('DailyRetentionAISummary', headers, [
    'report_date', 'scope_type', 'game_code', 'scope_key',
    'summary_text', 'key_finding', 'attention_point', 'recommended_check',
    'prompt_version', 'model', 'generated_at', 'source_hash', 'status'
  ]);

  const rows = values.slice(1).filter(function (row) {
    return row.some(function (value) { return value !== '' && value !== null; });
  }).map(function (row) {
    const out = {};
    headers.forEach(function (header, index) {
      if (header) out[header] = row[index];
    });
    return out;
  }).filter(function (row) {
    const rowDate = cqrDailyRetentionDate_(row.report_date);
    const scopeType = String(row.scope_type || '').trim().toLowerCase();
    const game = String(row.game_code || '').trim().toUpperCase();
    const status = String(row.status || '').trim().toLowerCase();
    if (rowDate !== reportDate || status !== 'ready') return false;
    if (scopeType === 'overall') return true;
    return scope.games.indexOf(game) !== -1;
  }).map(function (row) {
    return {
      report_date: cqrDailyRetentionDate_(row.report_date),
      scope_type: String(row.scope_type || '').trim().toLowerCase(),
      game_code: String(row.game_code || '').trim().toUpperCase(),
      scope_key: String(row.scope_key || ''),
      summary_text: String(row.summary_text || ''),
      key_finding: String(row.key_finding || ''),
      attention_point: String(row.attention_point || ''),
      recommended_check: String(row.recommended_check || ''),
      prompt_version: String(row.prompt_version || ''),
      model: String(row.model || ''),
      generated_at: row.generated_at instanceof Date ? row.generated_at.toISOString() : String(row.generated_at || ''),
      source_hash: String(row.source_hash || '')
    };
  });

  const overall = rows.find(function (row) {
    return row.scope_type === 'overall';
  }) || null;

  const games = {};
  rows.filter(function (row) {
    return row.scope_type === 'game' && row.game_code;
  }).forEach(function (row) {
    games[row.game_code] = row;
  });

  return {
    status: rows.length ? 'ready' : 'not_ready',
    report_date: reportDate,
    overall: overall,
    games: games,
    rows: rows,
    limitations: rows.length ? [] : ['AI Summary has not been generated for the requested date yet.']
  };
}

function cqrDailyRetentionAnomalies_(ctx, scope, params) {
  const range = cqrDailyRetentionDateRange_(params, ctx.runtime.data_complete_through);
  const statusFilter = String(params.status || 'open').trim().toLowerCase();
  const severityFilter = String(params.severity || '').trim().toLowerCase();
  const table = cqrDailyRetentionReadTable_(ctx.db_id, 'DailyRetentionAnomaly');
  cqrDailyRetentionRequireColumns_('DailyRetentionAnomaly', table.headers, [
    'anomaly_id', 'game_code', 'metric_name', 'metric_family', 'metric_date',
    'severity', 'actual_value', 'baseline_value', 'diff_abs', 'diff_relative',
    'robust_z', 'eligible_sample', 'status', 'contract_version', 'alert_key'
  ]);

  const severityRank = { critical: 0, warning: 1, watch: 2, none: 3 };
  const rows = table.rows.filter(function (row) {
    const game = String(row.game_code || '').trim().toUpperCase();
    const date = cqrDailyRetentionDate_(row.metric_date);
    const rowStatus = String(row.status || '').trim().toLowerCase();
    const severity = String(row.severity || '').trim().toLowerCase();
    const statusPass = statusFilter === 'all' ? true : statusFilter === 'open' ? rowStatus !== 'resolved' : rowStatus === statusFilter;
    return scope.games.indexOf(game) !== -1 && cqrDailyRetentionDateInRange_(date, range.start_date, range.end_date) && statusPass && (!severityFilter || severity === severityFilter);
  }).map(function (row) {
    return {
      anomaly_id: String(row.anomaly_id || ''),
      game_code: String(row.game_code || '').trim().toUpperCase(),
      metric_name: String(row.metric_name || ''),
      metric_family: String(row.metric_family || ''),
      metric_date: cqrDailyRetentionDate_(row.metric_date),
      severity: String(row.severity || ''),
      actual_value: cqrDailyRetentionNullableNumber_(row.actual_value),
      baseline_value: cqrDailyRetentionNullableNumber_(row.baseline_value),
      diff_abs: cqrDailyRetentionNullableNumber_(row.diff_abs),
      diff_pp: String(row.metric_family || '') === 'retention' && cqrDailyRetentionNullableNumber_(row.diff_abs) !== null ? +(cqrDailyRetentionNullableNumber_(row.diff_abs) * 100).toFixed(4) : null,
      diff_relative: cqrDailyRetentionNullableNumber_(row.diff_relative),
      robust_z: cqrDailyRetentionNullableNumber_(row.robust_z),
      eligible_sample: cqrDailyRetentionNullableNumber_(row.eligible_sample),
      status: String(row.status || ''),
      alert_key: String(row.alert_key || '')
    };
  });

  rows.sort(function (a, b) {
    const sr = (severityRank[a.severity] == null ? 9 : severityRank[a.severity]) - (severityRank[b.severity] == null ? 9 : severityRank[b.severity]);
    return sr || b.metric_date.localeCompare(a.metric_date) || a.game_code.localeCompare(b.game_code);
  });

  return {
    status: 'ready',
    filters: { games: scope.games, status: statusFilter, severity: severityFilter, start_date: range.start_date, end_date: range.end_date, window_days: range.window_days },
    row_count: rows.length,
    rows: rows,
    data_quality_issues: cqrDailyRetentionDataQualityIssues_(ctx.db_id, scope.games),
    limitations: ['Business anomalies are deterministic serving-mart outputs; affected missing-source dates remain suppressed by Data Quality rules.']
  };
}

function cqrDailyRetentionMetricValue_(value, baselineRow) {
  const actual = cqrDailyRetentionNullableNumber_(value);
  return {
    value: actual,
    baseline: baselineRow ? cqrDailyRetentionNullableNumber_(baselineRow.baseline_value) : null,
    baseline_observations: baselineRow ? cqrDailyRetentionNullableNumber_(baselineRow.baseline_observations) : null,
    diff_abs: baselineRow ? cqrDailyRetentionNullableNumber_(baselineRow.diff_abs) : null,
    diff_relative: baselineRow ? cqrDailyRetentionNullableNumber_(baselineRow.diff_relative) : null,
    robust_z: baselineRow ? cqrDailyRetentionNullableNumber_(baselineRow.robust_z) : null,
    alert_state: baselineRow ? String(baselineRow.alert_state || 'none') : 'none'
  };
}

function cqrDailyRetentionDataQualityIssues_(dbId, games) {
  const table = cqrDailyRetentionReadTable_(dbId, 'DataQuality');
  cqrDailyRetentionRequireColumns_('DataQuality', table.headers, ['check_id', 'game_code', 'severity', 'status', 'evidence', 'impact', 'remediation']);
  return table.rows.filter(function (row) {
    const game = String(row.game_code || '').trim().toUpperCase();
    return games.indexOf(game) !== -1 && String(row.status || '').trim().toLowerCase() !== 'pass';
  }).map(function (row) {
    return {
      check_id: String(row.check_id || ''),
      game_code: String(row.game_code || '').trim().toUpperCase(),
      severity: String(row.severity || ''),
      status: String(row.status || ''),
      evidence: String(row.evidence || ''),
      impact: String(row.impact || ''),
      remediation: String(row.remediation || '')
    };
  });
}

function cqrDailyRetentionBaselineIndex_(rows, games) {
  const index = {};
  rows.forEach(function (row) {
    const game = String(row.game_code || '').trim().toUpperCase();
    if (games.indexOf(game) === -1) return;
    const date = cqrDailyRetentionDate_(row.metric_date);
    const metric = String(row.metric_name || '').trim();
    if (!date || !metric) return;
    index[cqrDailyRetentionBaselineKey_(game, metric, date)] = row;
  });
  return index;
}

function cqrDailyRetentionBaselineKey_(game, metric, date) {
  return String(game || '').toUpperCase() + '|' + String(metric || '') + '|' + String(date || '');
}

function cqrDailyRetentionReadKeyValueSheet_(dbId, sheetName) {
  const table = cqrDailyRetentionReadTable_(dbId, sheetName);
  cqrDailyRetentionRequireColumns_(sheetName, table.headers, ['key', 'value']);
  const out = {};
  table.rows.forEach(function (row) {
    const key = String(row.key || '').trim();
    if (key) out[key] = row.value;
  });
  return out;
}

function cqrDailyRetentionReadTable_(dbId, sheetName) {
  const ss = SpreadsheetApp.openById(dbId);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing Daily Retention sheet: ' + sheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { headers: [], rows: [] };
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(function (v) { return String(v || '').trim(); });
  const rows = values.slice(1).filter(function (row) {
    return row.some(function (v) { return v !== '' && v !== null; });
  }).map(function (row) {
    const obj = {};
    headers.forEach(function (header, index) { if (header) obj[header] = row[index]; });
    return obj;
  });
  return { headers: headers, rows: rows };
}

function cqrDailyRetentionRequireColumns_(sheetName, headers, required) {
  const missing = required.filter(function (name) { return headers.indexOf(name) === -1; });
  if (missing.length) throw new Error(sheetName + ' schema missing: ' + missing.join(', '));
}

function cqrDailyRetentionFingerprint_(ctx) {
  const explicit = String(ctx.build.serving_mart_hash || '').trim();
  if (explicit) return explicit;
  let lastUpdated = '';
  try {
    lastUpdated = DriveApp.getFileById(ctx.db_id).getLastUpdated().toISOString();
  } catch (error) {
    lastUpdated = '';
  }
  const payload = [
    ctx.runtime.data_complete_through || '',
    ctx.runtime.initial_backfill_state || '',
    ctx.runtime.serve_enabled || '',
    ctx.build.release_state || '',
    ctx.build.serving_mart_cutoff || '',
    ctx.build.serving_mart_rows || '',
    ctx.build.serving_mart_verification || '',
    lastUpdated
  ].join('|');
  return cqrDailyRetentionSha256_(payload).slice(0, 24);
}

function cqrDailyRetentionCacheKey_(action, fingerprint, scope, params) {
  const raw = [
    action,
    fingerprint,
    scope.games.slice().sort().join(','),
    String(params.start_date || ''),
    String(params.end_date || ''),
    String(params.report_date || ''),
    String(params.window || ''),
    String(params.channel || ''),
    String(params.status || ''),
    String(params.severity || '')
  ].join('|');
  return CQR_DAILY_RETENTION_API_V1_CACHE_PREFIX_ + cqrDailyRetentionSha256_(raw).slice(0, 40);
}

function cqrDailyRetentionCacheTtl_(runtime) {
  const configured = Number(runtime.api_cache_seconds || 21600);
  if (!Number.isFinite(configured) || configured < 60) return 21600;
  return Math.min(21600, Math.floor(configured));
}

function cqrDailyRetentionDateRange_(params, defaultEnd) {
  const endDate = cqrDailyRetentionDate_(params.end_date || defaultEnd);
  if (!endDate) throw new Error('Daily Retention end_date is invalid.');
  let windowDays = Number(params.window || CQR_DAILY_RETENTION_API_V1_DEFAULT_WINDOW_);
  if (CQR_DAILY_RETENTION_API_V1_ALLOWED_WINDOWS_.indexOf(windowDays) === -1) windowDays = CQR_DAILY_RETENTION_API_V1_DEFAULT_WINDOW_;
  let startDate = cqrDailyRetentionDate_(params.start_date || '');
  if (!startDate) startDate = cqrDailyRetentionAddDays_(endDate, -(windowDays - 1));
  const span = cqrDailyRetentionDaysBetween_(startDate, endDate) + 1;
  if (span < 1 || span > CQR_DAILY_RETENTION_API_V1_MAX_RANGE_DAYS_) throw new Error('Daily Retention date range must be between 1 and ' + CQR_DAILY_RETENTION_API_V1_MAX_RANGE_DAYS_ + ' days.');
  return { start_date: startDate, end_date: endDate, window_days: span };
}

function cqrDailyRetentionDateInRange_(date, startDate, endDate) {
  return Boolean(date && date >= startDate && date <= endDate);
}

function cqrDailyRetentionDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, 'Asia/Bangkok', 'yyyy-MM-dd');
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return dmy[3] + '-' + ('0' + dmy[2]).slice(-2) + '-' + ('0' + dmy[1]).slice(-2);
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? '' : Utilities.formatDate(parsed, 'Asia/Bangkok', 'yyyy-MM-dd');
}

function cqrDailyRetentionAddDays_(dateText, days) {
  const parts = String(dateText).split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function cqrDailyRetentionDaysBetween_(a, b) {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const da = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.floor((db - da) / 86400000);
}

function cqrDailyRetentionNullableNumber_(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function cqrDailyRetentionBool_(value) {
  return ['1', 'true', 'yes', 'y'].indexOf(String(value == null ? '' : value).trim().toLowerCase()) !== -1;
}

function cqrDailyRetentionUnique_(values) {
  const seen = {};
  return (Array.isArray(values) ? values : []).filter(function (value) {
    const key = String(value || '');
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function cqrDailyRetentionSha256_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    const v = (b + 256) % 256;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function authorizeDailyRetentionApiV1_() {
  const dbId = cqrDailyRetentionDbId_();
  const ss = SpreadsheetApp.openById(dbId);
  const result = {
    ok: true,
    database: ss.getName(),
    contract_version: CQR_DAILY_RETENTION_API_V1_CONTRACT_,
    sheets: ['DailyOverview', 'DailyCohortRetention', 'DailyChannelRetention', 'DailyRetentionBaseline', 'DailyRetentionAnomaly', 'DataQuality'].map(function (name) {
      const sheet = ss.getSheetByName(name);
      if (!sheet) throw new Error('Missing Daily Retention sheet: ' + name);
      return { name: name, rows: sheet.getLastRow() };
    }),
    checked_at: new Date().toISOString()
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
