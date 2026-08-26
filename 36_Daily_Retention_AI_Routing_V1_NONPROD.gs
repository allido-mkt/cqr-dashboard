/**
 * CQR Daily Retention AI Routing V1 — NON-PROD
 *
 * Purpose:
 * - Deterministically detect Daily Retention questions before the legacy/monthly AI path.
 * - Reuse existing Daily Retention serving/API helpers; never recalculate retention.
 * - Build grounded Daily Retention evidence before the single existing AI webhook call.
 * - Preserve legacy/monthly routing by returning null for monthly questions.
 *
 * NON-PROD ONLY: do not deploy until acceptance tests are approved.
 */

const CQR_DAILY_RETENTION_AI_V1_GAMES_ = ['CBM_TH', 'CBM_SEA', 'CBPC_TH', 'CBPC_SEA'];
const CQR_DAILY_RETENTION_AI_V1_TIMEZONE_ = 'Asia/Bangkok';
const CQR_DAILY_RETENTION_AI_V1_SAMPLE_MIN_ = 30;
const CQR_DAILY_RETENTION_AI_V1_PROMPT_VERSION_ = 'daily_retention_ai_routing_v1_nonprod';

function cqrDailyRetentionAiParseJsonV1_(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

function cqrDailyRetentionAiPreviousScopeV1_(value) {
  const parsed = cqrDailyRetentionAiParseJsonV1_(value);
  if (!parsed) return null;
  if (parsed.resolved_scope && typeof parsed.resolved_scope === 'object') {
    return Object.assign({}, parsed.resolved_scope, {
      intent: parsed.resolved_scope.intent || parsed.intent || ''
    });
  }
  return parsed;
}

function cqrDailyRetentionAiIsMonthlyQuestionV1_(question) {
  const text = String(question || '').trim();
  if (!text) return false;

  const monthNames = /(?:\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)/i;
  if (/เดือน(?:นี้|ก่อน|ที่แล้ว|ที่ผ่านมา)?/i.test(text)) return true;
  if (monthNames.test(text)) return true;
  if (/\b20\d{2}[-\/]\d{1,2}\b/.test(text)) return true;
  return false;
}

function cqrDailyRetentionAiExplicitGamesV1_(question) {
  const text = String(question || '').toUpperCase();
  const games = [];
  const patterns = [
    ['CBM_TH', /\bCBM[\s_-]*TH\b/i],
    ['CBM_SEA', /\bCBM[\s_-]*SEA\b/i],
    ['CBPC_TH', /\bCBPC[\s_-]*TH\b/i],
    ['CBPC_SEA', /\bCBPC[\s_-]*SEA\b/i]
  ];
  patterns.forEach(function (pair) {
    if (pair[1].test(text)) games.push(pair[0]);
  });
  return games;
}

function cqrDailyRetentionAiPreviousGamesV1_(previousScope) {
  if (!previousScope || typeof previousScope !== 'object') return [];
  if (Array.isArray(previousScope.games)) {
    return previousScope.games.map(function (game) { return String(game || '').toUpperCase(); })
      .filter(function (game) { return CQR_DAILY_RETENTION_AI_V1_GAMES_.indexOf(game) !== -1; });
  }
  const game = String(previousScope.game || '').toUpperCase();
  return CQR_DAILY_RETENTION_AI_V1_GAMES_.indexOf(game) !== -1 ? [game] : [];
}

function cqrDailyRetentionAiHasDailySignalV1_(question, previousScope) {
  const text = String(question || '').trim();
  if (!text || cqrDailyRetentionAiIsMonthlyQuestionV1_(text)) return false;

  const explicitDaily = /(?:daily\s*retention|รายวัน|วันนี้|เมื่อวาน|ล่าสุด|7\s*วันที่ผ่านมา|ช่วง\s*7\s*วัน|7\s*วัน|สัปดาห์นี้|channel\s*quality|ช่องทางไหนคุณภาพ|คุณภาพ.*ช่องทาง|เกมไหนควรจับตา|ควรจับตา|ทำไม.*0\s*%|0\s*%|ข้อมูลผิดปกติ|ผิดปกติ|คนสมัครวันที่|กลับมาเล่น(?:ใน)?วันถัดไป|กลับมาเล่นหลัง\s*3\s*วัน|กลับมาเล่นหลัง\s*7\s*วัน|กลับมาเล่นหลัง\s*14\s*วัน)/i;
  if (explicitDaily.test(text)) return true;

  const previousIntent = String(previousScope && previousScope.intent || '').toLowerCase();
  if (previousIntent === 'daily_retention') {
    if (cqrDailyRetentionAiExplicitGamesV1_(text).length) return true;
    if (/^(?:แล้ว|แล้วถ้า|แล้วของ|ส่วน|ของ)\b|ล่ะ|ละ$/i.test(text)) return true;
  }
  return false;
}

function cqrDailyRetentionAiAnalysisV1_(question, previousScope) {
  const text = String(question || '');
  if (/(?:channel\s*quality|ช่องทางไหนคุณภาพ|คุณภาพ.*ช่องทาง|ช่องทาง.*ดีกว่า|ช่องทาง.*แย่กว่า)/i.test(text)) {
    return 'channel_quality';
  }
  if (/(?:ทำไม.*0\s*%|0\s*%|ข้อมูลผิดปกติ|data\s*quality|ข้อมูลตกหล่น|ข้อมูลหาย)/i.test(text)) {
    return 'data_quality';
  }
  if (/(?:7\s*วันที่ผ่านมา|ช่วง\s*7\s*วัน|7\s*วัน|สัปดาห์นี้)/i.test(text)) {
    return 'seven_day_context';
  }
  const inherited = String(previousScope && previousScope.analysis || '');
  if (String(previousScope && previousScope.intent || '').toLowerCase() === 'daily_retention' && inherited) {
    return inherited;
  }
  return 'overview';
}

function cqrDailyRetentionAiWindowV1_(question, previousScope) {
  const text = String(question || '');
  if (/สัปดาห์นี้/i.test(text)) return 'week_to_date';
  if (/(?:7\s*วันที่ผ่านมา|ช่วง\s*7\s*วัน|7\s*วัน)/i.test(text)) return '7d';
  const inherited = String(previousScope && previousScope.window || '');
  if (String(previousScope && previousScope.intent || '').toLowerCase() === 'daily_retention' && inherited) {
    return inherited;
  }
  return '1d';
}

function cqrDailyRetentionAiBangkokDateV1_(date) {
  return Utilities.formatDate(date instanceof Date ? date : new Date(date), CQR_DAILY_RETENTION_AI_V1_TIMEZONE_, 'yyyy-MM-dd');
}

function cqrDailyRetentionAiAddDaysV1_(dateText, days) {
  const parts = String(dateText || '').split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function cqrDailyRetentionAiParseQuestionV1_(question, previousScopeValue, now) {
  const previousScope = cqrDailyRetentionAiPreviousScopeV1_(previousScopeValue);
  if (!cqrDailyRetentionAiHasDailySignalV1_(question, previousScope)) return null;

  const text = String(question || '').trim();
  let games = cqrDailyRetentionAiExplicitGamesV1_(text);
  if (/(?:ทุกเกม|cabal\s*ทุกเกม|ของ\s*cabal)/i.test(text)) {
    games = CQR_DAILY_RETENTION_AI_V1_GAMES_.slice();
  }
  if (!games.length) games = cqrDailyRetentionAiPreviousGamesV1_(previousScope);
  if (!games.length) games = CQR_DAILY_RETENTION_AI_V1_GAMES_.slice();

  const current = now instanceof Date ? now : new Date();
  const today = cqrDailyRetentionAiBangkokDateV1_(current);
  let reportDateMode = 'latest';
  let reportDate = '';
  if (/เมื่อวาน/i.test(text)) {
    reportDateMode = 'explicit';
    reportDate = cqrDailyRetentionAiAddDaysV1_(today, -1);
  } else if (/วันนี้/i.test(text)) {
    reportDateMode = 'explicit';
    reportDate = today;
  } else if (/ล่าสุด/i.test(text)) {
    reportDateMode = 'latest';
  } else if (previousScope && String(previousScope.intent || '').toLowerCase() === 'daily_retention') {
    if (previousScope.report_date) {
      reportDateMode = 'explicit';
      reportDate = String(previousScope.report_date);
    } else if (previousScope.report_date_mode) {
      reportDateMode = String(previousScope.report_date_mode);
    }
  }

  const analysis = cqrDailyRetentionAiAnalysisV1_(text, previousScope);
  const window = cqrDailyRetentionAiWindowV1_(text, previousScope);

  return {
    intent: 'daily_retention',
    analysis: analysis,
    window: window,
    games: games,
    game: games.length === 1 ? games[0] : 'ALL',
    report_date_mode: reportDateMode,
    report_date: reportDate,
    zero_percent_question: /0\s*%/.test(text),
    previous_scope: previousScope,
    parser: 'deterministic_js_v1'
  };
}

function cqrDailyRetentionAiRouteV1_(e, session, question) {
  const params = e && e.parameter ? e.parameter : {};
  return cqrDailyRetentionAiParseQuestionV1_(question, params.previous_scope || null, new Date());
}

function cqrDailyRetentionAiWeekStartV1_(dateText) {
  const parts = String(dateText).split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const mondayOffset = -((date.getUTCDay() + 6) % 7);
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}

function cqrDailyRetentionAiResolveDatesV1_(route, ctx) {
  const latest = cqrDailyRetentionDate_(ctx.runtime.data_complete_through);
  if (!latest) throw new Error('Daily Retention data_complete_through is missing.');

  const requested = route.report_date_mode === 'explicit' && route.report_date
    ? cqrDailyRetentionDate_(route.report_date)
    : latest;
  if (!requested) throw new Error('Daily Retention requested date is invalid.');

  const resolvedEnd = requested > latest ? latest : requested;
  let start = resolvedEnd;
  if (route.window === '7d') start = cqrDailyRetentionAddDays_(resolvedEnd, -6);
  if (route.window === 'week_to_date') start = cqrDailyRetentionAiWeekStartV1_(resolvedEnd);

  return {
    requested_report_date: requested,
    report_date: resolvedEnd,
    start_date: start,
    end_date: resolvedEnd,
    data_complete_through: latest,
    requested_date_clamped_to_available_data: requested !== resolvedEnd
  };
}

function cqrDailyRetentionAiFilterRowsV1_(table, games, maxRows) {
  const wanted = {};
  (games || []).forEach(function (game) { wanted[String(game).toUpperCase()] = true; });
  const rows = (table && Array.isArray(table.rows) ? table.rows : []).filter(function (row) {
    const game = String(row.game_code || row.game || '').trim().toUpperCase();
    return !game || Boolean(wanted[game]);
  });
  return rows.slice(Math.max(0, rows.length - Number(maxRows || 120)));
}

function cqrDailyRetentionAiReadServingRowsV1_(dbId, sheetName, games, maxRows) {
  const table = cqrDailyRetentionReadTable_(dbId, sheetName);
  return {
    source: sheetName,
    row_count: table.rows.length,
    rows: cqrDailyRetentionAiFilterRowsV1_(table, games, maxRows)
  };
}

function cqrDailyRetentionAiApplyChannelGuardV1_(data) {
  const source = data && Array.isArray(data.rows) ? data.rows : [];
  const rows = source.map(function (row) {
    const samples = [];
    const registerUsers = cqrDailyRetentionNullableNumber_(row.register_users);
    if (registerUsers !== null) samples.push(registerUsers);
    const milestones = row.milestones || {};
    ['d1', 'd3', 'd7', 'd14'].forEach(function (key) {
      const milestone = milestones[key] || {};
      const eligible = cqrDailyRetentionNullableNumber_(milestone.eligible);
      const rate = cqrDailyRetentionNullableNumber_(milestone.rate);
      if (rate !== null && eligible !== null) samples.push(eligible);
    });
    const minSample = samples.length ? Math.min.apply(null, samples) : 0;
    const conclusionAllowed = minSample >= CQR_DAILY_RETENTION_AI_V1_SAMPLE_MIN_;
    return Object.assign({}, row, {
      sample_guard: {
        threshold: CQR_DAILY_RETENTION_AI_V1_SAMPLE_MIN_,
        minimum_observed_sample: minSample,
        conclusion_allowed: conclusionAllowed,
        instruction: conclusionAllowed
          ? 'Sample threshold passed; comparison still must be grounded in returned evidence.'
          : 'Sample below 30; do not conclude that this channel is better or worse.'
      }
    });
  });
  return Object.assign({}, data, {
    rows: rows,
    sample_rule: 'sample < 30 => no better/worse conclusion'
  });
}

function cqrDailyRetentionAiHasPartialMissingStatusV1_(rows) {
  return (rows || []).some(function (row) {
    return Object.keys(row || {}).some(function (key) {
      if (!/(?:status|state|quality|health|sync)/i.test(key)) return false;
      return /(?:partial|missing)/i.test(String(row[key] == null ? '' : row[key]));
    });
  });
}

function cqrDailyRetentionAiDataQualityGuardV1_(sources, zeroPercentQuestion) {
  const allRows = [];
  (sources || []).forEach(function (source) {
    if (source && Array.isArray(source.rows)) Array.prototype.push.apply(allRows, source.rows);
  });
  const partialOrMissing = cqrDailyRetentionAiHasPartialMissingStatusV1_(allRows);
  return {
    partial_or_missing_detected: partialOrMissing,
    zero_percent_question: Boolean(zeroPercentQuestion),
    zero_percent_conclusion_allowed: !(zeroPercentQuestion && partialOrMissing),
    instruction: zeroPercentQuestion && partialOrMissing
      ? 'ตัวเลข 0% ยังใช้สรุปไม่ได้ ต้องตรวจข้อมูลการเข้าเล่นก่อนว่าเป็นข้อมูลจริงหรือข้อมูลตกหล่น'
      : 'Do not infer player behavior unless the serving evidence supports it.'
  };
}

function cqrDailyRetentionAiBuildEvidenceV1_(session, route) {
  const ctx = cqrDailyRetentionApiContext_();
  if (!ctx.gate.pass) {
    return {
      status: 'blocked',
      blockers: ctx.gate.blockers,
      route: route,
      coverage: { requested_games: route.games, returned_games: [], complete_scope: false }
    };
  }

  const scope = cqrDailyRetentionResolveScope_(session, { games_csv: route.games.join(',') }, ctx.available_games);
  const dates = cqrDailyRetentionAiResolveDatesV1_(route, ctx);
  const params = {
    start_date: dates.start_date,
    end_date: dates.end_date,
    report_date: dates.report_date,
    status: 'all'
  };
  let evidence;
  let sources;

  if (route.analysis === 'channel_quality') {
    const channels = cqrDailyRetentionAiApplyChannelGuardV1_(cqrDailyRetentionChannels_(ctx, scope, params));
    evidence = { channels: channels };
    sources = ['DailyChannelRetention'];
  } else if (route.analysis === 'data_quality') {
    const health = cqrDailyRetentionAiReadServingRowsV1_(ctx.db_id, 'DailyGameHealth', scope.games, 120);
    const dataQuality = cqrDailyRetentionAiReadServingRowsV1_(ctx.db_id, 'DataQuality', scope.games, 120);
    const syncState = cqrDailyRetentionAiReadServingRowsV1_(ctx.db_id, 'DailyRetentionSyncState', scope.games, 120);
    const anomalies = cqrDailyRetentionAnomalies_(ctx, scope, params);
    const guardSources = [health, dataQuality, syncState, { source: 'DailyRetentionAnomaly', rows: anomalies.rows || [] }];
    evidence = {
      game_health: health,
      data_quality: dataQuality,
      anomalies: anomalies,
      sync_state: syncState,
      zero_percent_guard: cqrDailyRetentionAiDataQualityGuardV1_(guardSources, route.zero_percent_question)
    };
    sources = ['DailyGameHealth', 'DataQuality', 'DailyRetentionAnomaly', 'DailyRetentionSyncState'];
  } else if (route.analysis === 'seven_day_context') {
    evidence = {
      cohorts: cqrDailyRetentionCohorts_(ctx, scope, params),
      anomalies: cqrDailyRetentionAnomalies_(ctx, scope, params),
      baseline_source: 'DailyRetentionBaseline (reused by Daily Cohort helper; no recalculation)'
    };
    sources = ['DailyCohortRetention', 'DailyRetentionAnomaly', 'DailyRetentionBaseline'];
  } else {
    evidence = {
      overview: cqrDailyRetentionOverview_(ctx, scope),
      summaries: cqrDailyRetentionSummaries_(ctx, scope, params),
      anomalies: cqrDailyRetentionAnomalies_(ctx, scope, params)
    };
    sources = ['DailyOverview', 'DailyRetentionAISummary', 'DailyRetentionAnomaly'];
  }

  const coverage = {
    requested_games: route.games,
    available_games: scope.games.slice(),
    returned_games: scope.games,
    missing_games: route.games.filter(function (game) { return scope.games.indexOf(game) === -1; }),
    complete_scope: route.games.every(function (game) { return scope.games.indexOf(game) !== -1; }),
    contexts_used: 0,
    data_freshness: dates.data_complete_through
  };

  return {
    status: 'ready',
    intent: 'daily_retention',
    analysis: route.analysis,
    window: route.window,
    games: scope.games,
    dates: dates,
    sources: sources,
    evidence: evidence,
    coverage: coverage,
    calculation_policy: 'reuse_serving_marts_only_no_daily_retention_recalculation'
  };
}

function cqrDailyRetentionAiResolvedScopeV1_(route, evidence) {
  const dates = evidence.dates || {};
  return {
    intent: 'daily_retention',
    games: evidence.games || route.games,
    game: (evidence.games || route.games).length === 1 ? (evidence.games || route.games)[0] : 'ALL',
    periods: dates.start_date === dates.end_date ? [dates.end_date] : [dates.start_date, dates.end_date],
    report_date: dates.report_date || route.report_date || '',
    report_date_mode: route.report_date_mode,
    window: route.window,
    analysis: route.analysis
  };
}

function cqrDailyRetentionAiPresentationV1_() {
  return {
    metric_wording: {
      d1_rate: 'กลับมาเล่นในวันถัดไป',
      d3_rate: 'กลับมาเล่นหลัง 3 วัน',
      d7_rate: 'ยังกลับมาเล่นหลัง 7 วัน',
      d14_rate: 'ยังกลับมาเล่นหลัง 14 วัน'
    },
    forbidden_terms: ['ย่อตัว', 'อ่อนตัว', 'อ่อนลง', 'กลุ่มก่อนหน้า'],
    comparison_must_include_date_and_value: true
  };
}

function cqrDailyRetentionAiNumberOrNullV1_(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function cqrDailyRetentionAiPutNumberMetricV1_(metrics, name, value) {
  const n = cqrDailyRetentionAiNumberOrNullV1_(value);
  if (n !== null) metrics[name] = n;
}

function cqrDailyRetentionAiMilestoneMetricsV1_(milestones, valueField) {
  const metrics = {};
  const metricDates = {};
  ['d1', 'd3', 'd7', 'd14'].forEach(function (key) {
    const milestone = milestones && milestones[key] ? milestones[key] : null;
    if (!milestone) return;
    const metricName = milestone.metric || (key + '_rate');
    const metricValue = cqrDailyRetentionAiNumberOrNullV1_(milestone[valueField || 'rate']);
    if (metricValue !== null) metrics[metricName] = metricValue;
    if (milestone.cohort_date) metricDates[metricName] = milestone.cohort_date;
  });
  return { metrics: metrics, metric_dates: metricDates };
}

function cqrDailyRetentionAiBaseContextV1_(game, periodKey, route, evidence) {
  return {
    game_code: game,
    period_key: periodKey || '',
    metrics: {},
    evidence_type: 'daily_retention_serving_marts',
    analysis: route.analysis,
    window: route.window,
    sources: evidence.sources || [],
    presentation: cqrDailyRetentionAiPresentationV1_()
  };
}

function cqrDailyRetentionAiCompactOverviewV1_(route, evidence) {
  const overview = evidence.evidence && evidence.evidence.overview ? evidence.evidence.overview : {};
  return (overview.games || []).map(function (gameRow) {
    const game = String(gameRow.game_code || '').trim().toUpperCase();
    if (!game) return null;
    const context = cqrDailyRetentionAiBaseContextV1_(game, gameRow.snapshot && gameRow.snapshot.report_date, route, evidence);
    cqrDailyRetentionAiPutNumberMetricV1_(context.metrics, 'registrations', gameRow.snapshot && gameRow.snapshot.registrations && gameRow.snapshot.registrations.value);
    cqrDailyRetentionAiPutNumberMetricV1_(context.metrics, 'dau', gameRow.snapshot && gameRow.snapshot.dau && gameRow.snapshot.dau.value);
    const metricDates = {};
    (gameRow.milestones || []).forEach(function (milestone) {
      const metricName = String(milestone.metric || '');
      if (!metricName) return;
      cqrDailyRetentionAiPutNumberMetricV1_(context.metrics, metricName, milestone.value);
      if (milestone.cohort_date) metricDates[metricName] = milestone.cohort_date;
    });
    context.evidence = {
      overview_row: gameRow,
      metric_dates: metricDates,
      summaries: evidence.evidence.summaries ? {
        overall: evidence.evidence.summaries.overall || null,
        game: evidence.evidence.summaries.games ? evidence.evidence.summaries.games[game] || null : null
      } : null,
      anomalies: evidence.evidence.anomalies && Array.isArray(evidence.evidence.anomalies.rows)
        ? evidence.evidence.anomalies.rows.filter(function (row) {
            return String(row.game_code || '').trim().toUpperCase() === game;
          })
        : []
    };
    return context;
  }).filter(Boolean);
}

function cqrDailyRetentionAiCompactCohortsV1_(route, evidence) {
  const cohorts = evidence.evidence && evidence.evidence.cohorts ? evidence.evidence.cohorts : {};
  const anomalies = evidence.evidence && evidence.evidence.anomalies ? evidence.evidence.anomalies : null;
  return (cohorts.rows || []).map(function (row) {
    const game = String(row.game_code || '').trim().toUpperCase();
    if (!game) return null;
    const context = cqrDailyRetentionAiBaseContextV1_(game, row.cohort_date, route, evidence);
    cqrDailyRetentionAiPutNumberMetricV1_(context.metrics, 'register_users', row.register_users);
    cqrDailyRetentionAiPutNumberMetricV1_(context.metrics, 'first_login_users', row.first_login_users);
    const milestone = cqrDailyRetentionAiMilestoneMetricsV1_(row.milestones, 'rate');
    Object.keys(milestone.metrics).forEach(function (name) { context.metrics[name] = milestone.metrics[name]; });
    context.evidence = {
      cohort_row: row,
      baseline_source: evidence.evidence.baseline_source || '',
      anomalies: anomalies && Array.isArray(anomalies.rows)
        ? anomalies.rows.filter(function (anomaly) {
            return String(anomaly.game_code || '').trim().toUpperCase() === game &&
              String(anomaly.metric_date || '') === String(row.cohort_date || '');
          })
        : [],
      metric_dates: milestone.metric_dates
    };
    return context;
  }).filter(Boolean);
}

function cqrDailyRetentionAiCompactChannelsV1_(route, evidence) {
  const channels = evidence.evidence && evidence.evidence.channels ? evidence.evidence.channels : {};
  const grouped = {};
  (channels.rows || []).forEach(function (row) {
    const game = String(row.game_code || '').trim().toUpperCase();
    const cohortDate = String(row.cohort_date || '');
    if (!game || !cohortDate) return;
    const key = game + '|' + cohortDate;
    if (!grouped[key]) {
      grouped[key] = cqrDailyRetentionAiBaseContextV1_(game, cohortDate, route, evidence);
      grouped[key].channels = [];
      grouped[key].evidence = {
        channel_rows: [],
        baseline_scope: channels.baseline_scope || '',
        limitations: channels.limitations || [],
        metric_dates: {}
      };
    }

    const channelMetrics = {};
    cqrDailyRetentionAiPutNumberMetricV1_(channelMetrics, 'register_users', row.register_users);
    cqrDailyRetentionAiPutNumberMetricV1_(channelMetrics, 'first_login_users', row.first_login_users);
    ['d1', 'd3', 'd7', 'd14'].forEach(function (milestoneKey) {
      const milestone = row.milestones && row.milestones[milestoneKey] ? row.milestones[milestoneKey] : null;
      if (!milestone) return;
      const metricName = milestoneKey + '_rate';
      cqrDailyRetentionAiPutNumberMetricV1_(channelMetrics, metricName, milestone.rate);
      cqrDailyRetentionAiPutNumberMetricV1_(grouped[key].metrics, metricName, milestone.game_rate);
      grouped[key].evidence.metric_dates[metricName] = cohortDate;
    });

    grouped[key].channels.push({
      channel: String(row.db_channel || ''),
      quality_tier: row.sample_guard && row.sample_guard.conclusion_allowed === false ? 'insufficient_sample' : 'sufficient_sample',
      metrics: channelMetrics,
      sample_guard: row.sample_guard || null
    });
    grouped[key].evidence.channel_rows.push(row);
  });
  return Object.keys(grouped).sort().map(function (key) { return grouped[key]; });
}

function cqrDailyRetentionAiRowsByGameV1_(source) {
  const out = {};
  ((source && source.rows) || []).forEach(function (row) {
    const game = String(row.game_code || row.game || '').trim().toUpperCase();
    if (!game) return;
    if (!out[game]) out[game] = [];
    out[game].push(row);
  });
  return out;
}

function cqrDailyRetentionAiCopyNumericHealthMetricsV1_(metrics, rows) {
  (rows || []).forEach(function (row) {
    Object.keys(row || {}).forEach(function (key) {
      if (/^(?:game_code|game|date|report_date|metric_date|updated_at|created_at|contract_version)$/i.test(key)) return;
      if (/(?:status|state|quality|health|message|note|reason|source|detail|evidence|impact|remediation|id)$/i.test(key)) return;
      cqrDailyRetentionAiPutNumberMetricV1_(metrics, key, row[key]);
    });
  });
}

function cqrDailyRetentionAiCompactDataQualityV1_(route, evidence) {
  const inner = evidence.evidence || {};
  const healthByGame = cqrDailyRetentionAiRowsByGameV1_(inner.game_health);
  const dataQualityByGame = cqrDailyRetentionAiRowsByGameV1_(inner.data_quality);
  const syncByGame = cqrDailyRetentionAiRowsByGameV1_(inner.sync_state);
  const anomalyByGame = cqrDailyRetentionAiRowsByGameV1_(inner.anomalies);
  const games = cqrDailyRetentionUnique_((evidence.games || route.games || []).concat(Object.keys(healthByGame), Object.keys(dataQualityByGame), Object.keys(syncByGame), Object.keys(anomalyByGame)));

  return games.map(function (game) {
    const reportDate = evidence.dates && evidence.dates.report_date ? String(evidence.dates.report_date) : '';
    const context = cqrDailyRetentionAiBaseContextV1_(game, reportDate, route, evidence);
    const matchingHealthRows = (healthByGame[game] || []).filter(function (row) {
      const rowDate = cqrDailyRetentionDate_(row.report_date || row.metric_date || row.cohort_date);
      return Boolean(rowDate && reportDate && rowDate === reportDate);
    });
    cqrDailyRetentionAiCopyNumericHealthMetricsV1_(context.metrics, matchingHealthRows);
    const metricDates = {};
    (anomalyByGame[game] || []).forEach(function (row) {
      const metricName = String(row.metric_name || '').trim();
      const actual = cqrDailyRetentionAiNumberOrNullV1_(row.actual_value);
      if (metricName && actual !== null && context.metrics[metricName] === undefined) {
        context.metrics[metricName] = actual;
        if (row.metric_date) metricDates[metricName] = row.metric_date;
      }
    });
    context.evidence = {
      game_health_rows: matchingHealthRows,
      data_quality_rows: dataQualityByGame[game] || [],
      anomaly_rows: anomalyByGame[game] || [],
      sync_state_rows: syncByGame[game] || [],
      zero_percent_guard: inner.zero_percent_guard || null,
      metric_dates: metricDates
    };
    context.data_quality_guard = inner.zero_percent_guard || null;
    return context;
  });
}

function cqrDailyRetentionAiCompactContextV1_(route, evidence) {
  if (route.analysis === 'channel_quality') return cqrDailyRetentionAiCompactChannelsV1_(route, evidence);
  if (route.analysis === 'seven_day_context') return cqrDailyRetentionAiCompactCohortsV1_(route, evidence);
  if (route.analysis === 'data_quality') return cqrDailyRetentionAiCompactDataQualityV1_(route, evidence);
  return cqrDailyRetentionAiCompactOverviewV1_(route, evidence);
}

function cqrDailyRetentionAiCompactGamesV1_(compactContext) {
  const games = {};
  (compactContext || []).forEach(function (context) {
    const game = String(context && context.game_code || '').trim().toUpperCase();
    if (game && game !== 'ALL') games[game] = true;
  });
  return Object.keys(games);
}

function cqrDailyRetentionAiCompactMetricsV1_(compactContext) {
  const metrics = {};
  (compactContext || []).forEach(function (context) {
    Object.keys((context && context.metrics) || {}).forEach(function (name) { metrics[name] = true; });
    (context.channels || []).forEach(function (channel) {
      Object.keys((channel && channel.metrics) || {}).forEach(function (name) { metrics[name] = true; });
    });
  });
  return Object.keys(metrics);
}

function cqrDailyRetentionAiComparisonV1_(route, compactContext) {
  if (route.analysis === 'channel_quality') return 'channel_over_channel';
  if (route.analysis === 'seven_day_context') return 'period_over_period';
  if (route.analysis === 'overview' && cqrDailyRetentionAiCompactGamesV1_(compactContext).length > 1) return 'game_over_game';
  return 'none';
}

function cqrDailyRetentionAiFinalCoverageV1_(route, built, compactContext) {
  const availableGames = cqrDailyRetentionAiCompactGamesV1_(compactContext);
  const coverage = Object.assign({}, built.coverage || {});
  coverage.requested_games = route.games || coverage.requested_games || [];
  coverage.available_games = availableGames;
  coverage.returned_games = availableGames;
  coverage.missing_games = (route.games || []).filter(function (game) { return availableGames.indexOf(game) === -1; });
  coverage.contexts_used = (compactContext || []).length;
  coverage.complete_scope = (route.games || []).every(function (game) { return availableGames.indexOf(game) !== -1; });
  return coverage;
}

function handleDailyRetentionAiAskV1_(e, callback, session, question, route) {
  const props = PropertiesService.getScriptProperties();
  const webhookUrl = props.getProperty('CQR_AI_ASK_WEBHOOK_URL');
  const sharedSecret = props.getProperty('CQR_AI_ASK_SHARED_SECRET');
  if (!webhookUrl) throw new Error('Missing Script Property: CQR_AI_ASK_WEBHOOK_URL');
  if (!sharedSecret) throw new Error('Missing Script Property: CQR_AI_ASK_SHARED_SECRET');

  const built = cqrDailyRetentionAiBuildEvidenceV1_(session, route);
  if (built.status !== 'ready') {
    return json_({
      ok: false,
      status: built.status,
      intent: 'daily_retention',
      message: 'Daily Retention evidence is not ready.',
      blockers: built.blockers || [],
      resolved_scope: null,
      coverage: built.coverage || {}
    }, callback);
  }

  const resolvedScope = cqrDailyRetentionAiResolvedScopeV1_(route, built);
  const compactContext = cqrDailyRetentionAiCompactContextV1_(route, built);
  const finalCoverage = cqrDailyRetentionAiFinalCoverageV1_(route, built, compactContext);
  built.coverage = finalCoverage;
  if (!compactContext.length || finalCoverage.complete_scope !== true) {
    return json_({
      ok: false,
      status: 'not_ready',
      intent: 'daily_retention',
      message: 'Daily Retention evidence is incomplete for the requested scope.',
      resolved_scope: resolvedScope,
      coverage: finalCoverage,
      retryable: false,
      gemini_calls: 0
    }, callback);
  }
  resolvedScope.metrics = cqrDailyRetentionAiCompactMetricsV1_(compactContext);
  const requestId = 'AIASK-DAILY-' + new Date().toISOString();
  const payload = {
    request_id: requestId,
    question: question,
    conversation_id: String(e.parameter.conversation_id || ''),
    ai_mode: String(e.parameter.ai_mode || 'gemini'),
    data_source: 'daily_retention_serving_marts',
    prompt_version: CQR_DAILY_RETENTION_AI_V1_PROMPT_VERSION_,
    previous_scope: route.previous_scope,
    parser_status: 'parsed',
    data_mode: 'daily_retention',
    intent: 'daily_retention',
    game: resolvedScope.game,
    period: resolvedScope.report_date,
    view: 'daily',
    parsed_query_plan: {
      intent: 'daily_retention',
      analysis: route.analysis,
      window: route.window,
      comparison: cqrDailyRetentionAiComparisonV1_(route, compactContext),
      evidence_sources: built.sources,
      parser: 'deterministic_js_v1'
    },
    resolved_scope: resolvedScope,
    coverage: finalCoverage,
    compact_context: compactContext,
    daily_retention_evidence: built,
    user_email: session.email,
    answer_style_instructions: [
      'ตอบภาษาไทยแบบคนทั่วไปอ่านเข้าใจ และใช้เฉพาะ Daily Retention evidence ที่ส่งมา',
      'ห้ามสร้างตัวเลข สาเหตุ หรือ Player Behavior ที่ evidence ไม่รองรับ',
      'D1 ให้เขียนว่า “กลับมาเล่นในวันถัดไป”',
      'D3 ให้เขียนว่า “กลับมาเล่นหลัง 3 วัน”',
      'D7 ให้เขียนว่า “ยังกลับมาเล่นหลัง 7 วัน”',
      'D14 ให้เขียนว่า “ยังกลับมาเล่นหลัง 14 วัน”',
      'หลีกเลี่ยงคำว่า ย่อตัว, อ่อนตัว, อ่อนลง, กลุ่มก่อนหน้า',
      'ถ้าเปรียบเทียบให้ระบุวันที่/ช่วงเวลาและตัวเลขจริง',
      'Channel Quality: หาก sample_guard.conclusion_allowed=false ห้ามสรุปเด็ดขาดว่าช่องทางนั้นดีกว่าหรือแย่กว่า',
      'Data Quality/0%: หาก zero_percent_guard.zero_percent_conclusion_allowed=false ให้บอกว่า “ตัวเลข 0% ยังใช้สรุปไม่ได้” และต้องตรวจข้อมูลการเข้าเล่นก่อน',
      'ห้ามกล่าวถึง workflow, webhook, n8n, payload, prompt หรือโครงสร้างระบบภายใน'
    ].join('\n'),
    max_answer_chars: 1800
  };

  // Exactly one outbound AI request. No retry and no loop.
  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-CQR-AI-Secret': sharedSecret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const data = normalizeAiWebhookResponse_(response.getContentText() || '{}');
  if (status < 200 || status >= 300) {
    return json_({
      ok: false,
      status: status,
      intent: 'daily_retention',
      message: 'AI backend request failed.',
      detail: data,
      resolved_scope: resolvedScope,
      coverage: finalCoverage,
      retryable: false
    }, callback);
  }

  if (data.ok === false) {
    return json_({
      ok: false,
      status: status,
      intent: 'daily_retention',
      message: data.message || data.error || 'AI backend returned a failed response.',
      detail: data,
      resolved_scope: resolvedScope,
      coverage: finalCoverage,
      retryable: false
    }, callback);
  }

  const answer = sanitizeAiAnswerForUsers_(data.answer || '');
  if (!answer) {
    return json_({
      ok: false,
      status: status,
      intent: 'daily_retention',
      message: 'AI backend returned an empty answer.',
      resolved_scope: resolvedScope,
      coverage: finalCoverage,
      retryable: false
    }, callback);
  }

  return json_({
    ok: true,
    answer: answer,
    source: data.source || 'n8n',
    used_ai_model: data.used_ai_model || '',
    grounded: true,
    intent: 'daily_retention',
    request_id: data.request_id || requestId,
    resolved_scope: resolvedScope,
    coverage: finalCoverage,
    parser_status: 'parsed',
    data_mode: 'daily_retention',
    prompt_version: CQR_DAILY_RETENTION_AI_V1_PROMPT_VERSION_,
    retryable: false,
    warnings: Array.isArray(data.warnings) ? data.warnings : []
  }, callback);
}

function cqrDailyRetentionAiAssertV1_(condition, message) {
  if (!condition) throw new Error('Daily Retention AI Routing V1 test failed: ' + message);
}

/**
 * Pure parser/regression test. Does not read Sheets and does not call Gemini/n8n.
 */
function testCqrDailyRetentionAiRoutingV1_() {
  const now = new Date('2026-08-26T07:53:00.000Z'); // 14:53 Asia/Bangkok
  const results = [];

  const t1 = cqrDailyRetentionAiParseQuestionV1_('สรุป Daily Retention เมื่อวานของ CABAL ทุกเกม', null, now);
  cqrDailyRetentionAiAssertV1_(t1 && t1.intent === 'daily_retention', 'Test 1 intent');
  cqrDailyRetentionAiAssertV1_(t1.games.length === 4, 'Test 1 games');
  cqrDailyRetentionAiAssertV1_(t1.report_date === '2026-08-25', 'Test 1 Bangkok previous day');
  results.push({ test: 1, status: 'PASS' });

  const t2 = cqrDailyRetentionAiParseQuestionV1_('CBM TH ช่วง 7 วันที่ผ่านมาเป็นยังไง', null, now);
  cqrDailyRetentionAiAssertV1_(t2 && t2.game === 'CBM_TH', 'Test 2 game');
  cqrDailyRetentionAiAssertV1_(t2.window === '7d', 'Test 2 window');
  cqrDailyRetentionAiAssertV1_(t2.analysis === 'seven_day_context', 'Test 2 analysis');
  results.push({ test: 2, status: 'PASS' });

  const t3 = cqrDailyRetentionAiParseQuestionV1_('Channel Quality ของ CBM SEA เป็นยังไง', null, now);
  cqrDailyRetentionAiAssertV1_(t3 && t3.game === 'CBM_SEA', 'Test 3 game');
  cqrDailyRetentionAiAssertV1_(t3.analysis === 'channel_quality', 'Test 3 analysis');
  results.push({ test: 3, status: 'PASS' });

  const t4 = cqrDailyRetentionAiParseQuestionV1_('เกมไหนควรจับตาวันนี้', null, now);
  cqrDailyRetentionAiAssertV1_(t4 && t4.games.length === 4, 'Test 4 all games');
  cqrDailyRetentionAiAssertV1_(t4.analysis === 'overview', 'Test 4 analysis');
  results.push({ test: 4, status: 'PASS' });

  const t5 = cqrDailyRetentionAiParseQuestionV1_('ทำไม CBPC TH ถึงเป็น 0%', null, now);
  cqrDailyRetentionAiAssertV1_(t5 && t5.game === 'CBPC_TH', 'Test 5 game');
  cqrDailyRetentionAiAssertV1_(t5.analysis === 'data_quality', 'Test 5 analysis');
  cqrDailyRetentionAiAssertV1_(t5.zero_percent_question === true, 'Test 5 zero percent guard');
  results.push({ test: 5, status: 'PASS' });

  const t6a = cqrDailyRetentionAiParseQuestionV1_('Channel Quality ของ CBM SEA ช่วง 7 วันที่ผ่านมาเป็นยังไง', null, now);
  const previous = {
    intent: t6a.intent,
    games: t6a.games,
    game: t6a.game,
    window: t6a.window,
    analysis: t6a.analysis,
    report_date_mode: t6a.report_date_mode,
    report_date: t6a.report_date
  };
  const t6b = cqrDailyRetentionAiParseQuestionV1_('แล้ว CBM TH ล่ะ', previous, now);
  cqrDailyRetentionAiAssertV1_(t6b && t6b.game === 'CBM_TH', 'Test 6 follow-up game');
  cqrDailyRetentionAiAssertV1_(t6b.window === '7d', 'Test 6 inherited window');
  cqrDailyRetentionAiAssertV1_(t6b.analysis === 'channel_quality', 'Test 6 inherited analysis');
  cqrDailyRetentionAiAssertV1_(t6b.intent === 'daily_retention', 'Test 6 inherited intent');
  results.push({ test: 6, status: 'PASS' });

  const r7 = cqrDailyRetentionAiParseQuestionV1_('Retention เดือน August ของ CBM TH', null, now);
  cqrDailyRetentionAiAssertV1_(r7 === null, 'Regression 7 must bypass Daily Router');
  results.push({ test: 7, type: 'monthly_regression', status: 'PASS' });

  const r8 = cqrDailyRetentionAiParseQuestionV1_('เปรียบเทียบ Retention May กับ June ของ CABAL ทุกเกม', null, now);
  cqrDailyRetentionAiAssertV1_(r8 === null, 'Regression 8 must bypass Daily Router');
  results.push({ test: 8, type: 'monthly_regression', status: 'PASS' });

  return {
    status: 'PASS',
    daily_tests: '6/6 PASS',
    monthly_routing_regression: '2/2 PASS',
    gemini_calls: 0,
    results: results
  };
}
