import { callAuthorized } from "../api.js";
import { getSavedSession, isPreviewSession } from "../session.js";

const ACTIONS = Object.freeze({
  overview: "retention.daily.overview",
  cohorts: "retention.daily.cohorts",
  channels: "retention.daily.channels",
  anomalies: "retention.daily.anomalies",
  summaries: "retention.daily.summaries",
});

const CLIENT_CACHE_TTL_MS = 60_000;
const responseCache = new Map();
const inFlight = new Map();

function stableKey(action, params = {}) {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return `${action}|${JSON.stringify(entries)}`;
}

function cachedValue(key) {
  const item = responseCache.get(key);
  if (!item) return null;
  if (Date.now() - item.savedAt > CLIENT_CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return item.value;
}

function remember(key, value) {
  responseCache.set(key, { savedAt: Date.now(), value });
  return value;
}

function previewEnvelope(data, cacheHit = false) {
  return { ok: true, email: "local.preview@cqr.local", cache_hit: cacheHit, data };
}

const PREVIEW_OVERVIEW = {
  status: "partial",
  coverage: {
    requested_games: ["CBM_TH", "CBM_SEA", "CBPC_TH", "CBPC_SEA"],
    returned_games: ["CBM_TH", "CBM_SEA", "CBPC_TH", "CBPC_SEA"],
    ready_games: 3,
    partial_games: 1,
  },
  baseline: { type: "previous_4_matching_weekdays", min_observations: 3 },
  games: [
    {
      game_code: "CBM_TH",
      data_status: "ready",
      snapshot: {
        report_date: "2026-08-18",
        registrations: { value: 51, baseline: 69, diff_abs: -18, diff_relative: -0.2609, robust_z: -2.4, alert_state: "warning" },
        dau: { value: 6288, baseline: 6470, diff_abs: -182, diff_relative: -0.0281, robust_z: -0.7, alert_state: "none" },
      },
      milestones: [
        { metric: "d1_rate", cohort_date: "2026-08-17", value: 0.394, retained: 28, eligible: 71, baseline: 0.52, diff_abs: -0.126, diff_pp: -12.6, diff_relative: -0.2423, robust_z: -3.2, maturity_status: "eligible", alert_state: "critical" },
        { metric: "d3_rate", cohort_date: "2026-08-15", value: 0.328, retained: 21, eligible: 64, baseline: 0.37, diff_abs: -0.042, diff_pp: -4.2, diff_relative: -0.1135, robust_z: -2.2, maturity_status: "eligible", alert_state: "watch" },
        { metric: "d7_rate", cohort_date: "2026-08-11", value: 0.270, retained: 17, eligible: 63, baseline: 0.28, diff_abs: -0.01, diff_pp: -1.0, diff_relative: -0.0357, robust_z: -0.5, maturity_status: "eligible", alert_state: "none" },
        { metric: "d14_rate", cohort_date: "2026-08-04", value: 0.160, retained: 8, eligible: 50, baseline: 0.17, diff_abs: -0.01, diff_pp: -1.0, diff_relative: -0.0588, robust_z: -0.6, maturity_status: "eligible", alert_state: "none" },
      ],
      open_alert_count: 8,
      data_complete_through: "2026-08-18",
      limitations: "DB-only V1; no Ads/Page join.",
    },
    {
      game_code: "CBM_SEA",
      data_status: "ready",
      snapshot: {
        report_date: "2026-08-18",
        registrations: { value: 257, baseline: 265, diff_abs: -8, diff_relative: -0.0302, robust_z: -0.5, alert_state: "none" },
        dau: { value: 15213, baseline: 15420, diff_abs: -207, diff_relative: -0.0134, robust_z: -0.4, alert_state: "none" },
      },
      milestones: [
        { metric: "d1_rate", cohort_date: "2026-08-17", value: 0.489, retained: 113, eligible: 231, baseline: 0.54, diff_abs: -0.051, diff_pp: -5.1, diff_relative: -0.0944, robust_z: -2.4, maturity_status: "eligible", alert_state: "watch" },
        { metric: "d3_rate", cohort_date: "2026-08-15", value: 0.373, retained: 63, eligible: 169, baseline: 0.41, diff_abs: -0.037, diff_pp: -3.7, diff_relative: -0.0902, robust_z: -2.1, maturity_status: "eligible", alert_state: "watch" },
        { metric: "d7_rate", cohort_date: "2026-08-11", value: 0.246, retained: 45, eligible: 183, baseline: 0.25, diff_abs: -0.004, diff_pp: -0.4, diff_relative: -0.016, robust_z: -0.2, maturity_status: "eligible", alert_state: "none" },
        { metric: "d14_rate", cohort_date: "2026-08-04", value: 0.147, retained: 26, eligible: 177, baseline: 0.15, diff_abs: -0.003, diff_pp: -0.3, diff_relative: -0.02, robust_z: -0.2, maturity_status: "eligible", alert_state: "none" },
      ],
      open_alert_count: 3,
      data_complete_through: "2026-08-18",
      limitations: "DB-only V1; historical DAU source gap 2026-02-15..18 disclosed separately.",
    },
    {
      game_code: "CBPC_TH",
      data_status: "partial",
      snapshot: {
        report_date: "2026-08-18",
        registrations: { value: 47, baseline: 49, diff_abs: -2, diff_relative: -0.0408, robust_z: -0.3, alert_state: "none" },
        dau: { value: 4151, baseline: 4200, diff_abs: -49, diff_relative: -0.0117, robust_z: -0.2, alert_state: "none" },
      },
      milestones: [
        { metric: "d1_rate", cohort_date: "2026-08-17", value: 0.182, retained: 8, eligible: 44, baseline: 0.19, diff_abs: -0.008, diff_pp: -0.8, diff_relative: -0.0421, robust_z: -0.2, maturity_status: "eligible", alert_state: "none" },
        { metric: "d3_rate", cohort_date: "2026-08-15", value: 0.178, retained: 8, eligible: 45, baseline: 0.18, diff_abs: -0.002, diff_pp: -0.2, diff_relative: -0.0111, robust_z: -0.1, maturity_status: "eligible", alert_state: "none" },
        { metric: "d7_rate", cohort_date: "2026-08-11", value: 0.125, retained: 5, eligible: 40, baseline: 0.13, diff_abs: -0.005, diff_pp: -0.5, diff_relative: -0.0385, robust_z: -0.2, maturity_status: "eligible", alert_state: "none" },
        { metric: "d14_rate", cohort_date: "2026-08-04", value: 0.054, retained: 2, eligible: 37, baseline: 0.06, diff_abs: -0.006, diff_pp: -0.6, diff_relative: -0.1, robust_z: -0.4, maturity_status: "eligible", alert_state: "none" },
      ],
      open_alert_count: 0,
      data_complete_through: "2026-08-18",
      limitations: "DAU 2026-08-06 missing in source; affected DAU business anomaly suppressed.",
    },
    {
      game_code: "CBPC_SEA",
      data_status: "ready",
      snapshot: {
        report_date: "2026-08-18",
        registrations: { value: 96, baseline: 102, diff_abs: -6, diff_relative: -0.0588, robust_z: -0.7, alert_state: "none" },
        dau: { value: 3829, baseline: 3900, diff_abs: -71, diff_relative: -0.0182, robust_z: -0.4, alert_state: "none" },
      },
      milestones: [
        { metric: "d1_rate", cohort_date: "2026-08-17", value: 0.111, retained: 10, eligible: 90, baseline: 0.12, diff_abs: -0.009, diff_pp: -0.9, diff_relative: -0.075, robust_z: -0.5, maturity_status: "eligible", alert_state: "none" },
        { metric: "d3_rate", cohort_date: "2026-08-15", value: 0.060, retained: 5, eligible: 84, baseline: 0.09, diff_abs: -0.03, diff_pp: -3.0, diff_relative: -0.3333, robust_z: -2.4, maturity_status: "eligible", alert_state: "watch" },
        { metric: "d7_rate", cohort_date: "2026-08-11", value: 0.053, retained: 5, eligible: 95, baseline: 0.055, diff_abs: -0.002, diff_pp: -0.2, diff_relative: -0.0364, robust_z: -0.2, maturity_status: "eligible", alert_state: "none" },
        { metric: "d14_rate", cohort_date: "2026-08-04", value: 0.017, retained: 2, eligible: 119, baseline: 0.04, diff_abs: -0.023, diff_pp: -2.3, diff_relative: -0.575, robust_z: -2.2, maturity_status: "eligible", alert_state: "watch" },
      ],
      open_alert_count: 5,
      data_complete_through: "2026-08-18",
      limitations: "DB-only V1; no Ads/Page join.",
    },
  ],
  data_quality_issues: [
    {
      check_id: "dau_date_continuity",
      game_code: "CBPC_TH",
      severity: "high",
      status: "fail",
      evidence: "DAU_2026-08 is missing 2026-08-06.",
      impact: "DAU trend/anomaly evaluation incomplete for affected date.",
      remediation: "Keep blank and suppress affected business anomaly.",
    },
  ],
  limitations: ["DB-only V1; no Ads/Page joins."],
  contract_version: "daily_retention_v1",
  data_complete_through: "2026-08-18",
  release_state: "PROD_SERVING_MARTS_COMPLETE_API_DEPLOYMENT_REQUIRED",
  fingerprint: "preview-serving-v1",
  generated_at: new Date().toISOString(),
};

function previewCohorts(params = {}) {
  const games = params.game ? [params.game] : ["CBM_TH", "CBM_SEA", "CBPC_TH", "CBPC_SEA"];
  const rows = [];
  games.forEach((game, gameIndex) => {
    for (let i = 0; i < 60; i += 1) {
      const cohort = new Date(Date.UTC(2026, 7, 18));
      cohort.setUTCDate(cohort.getUTCDate() - i);
      const date = cohort.toISOString().slice(0, 10);
      const base = game === "CBM_TH" ? 0.44 : game === "CBM_SEA" ? 0.52 : game === "CBPC_TH" ? 0.19 : 0.12;
      rows.push({
        cohort_date: date,
        game_code: game,
        register_users: 40 + gameIndex * 35 + i * 3,
        first_login_users: 38 + gameIndex * 32 + i * 3,
        milestones: {
          d1: { metric: "d1_rate", rate: i === 0 ? null : Math.max(0, base - i * 0.008), retained: i === 0 ? null : 18 + gameIndex * 5, eligible: i === 0 ? null : 45 + gameIndex * 20, maturity_status: i === 0 ? "collecting" : "eligible", baseline: base + 0.03, diff_pp: i === 0 ? null : -3.1, robust_z: i === 0 ? null : -1.2, alert_state: i === 2 && game === "CBM_TH" ? "watch" : "none" },
          d3: { metric: "d3_rate", rate: i < 3 ? null : Math.max(0, base - 0.09 - i * 0.006), retained: i < 3 ? null : 15 + gameIndex * 4, eligible: i < 3 ? null : 44 + gameIndex * 20, maturity_status: i < 3 ? "collecting" : "eligible", baseline: base - 0.04, diff_pp: i < 3 ? null : -2.2, robust_z: i < 3 ? null : -0.9, alert_state: "none" },
          d7: { metric: "d7_rate", rate: i < 7 ? null : Math.max(0, base - 0.17), retained: i < 7 ? null : 11 + gameIndex * 3, eligible: i < 7 ? null : 43 + gameIndex * 20, maturity_status: i < 7 ? "collecting" : "eligible", baseline: base - 0.15, diff_pp: i < 7 ? null : -2.0, robust_z: i < 7 ? null : -0.8, alert_state: "none" },
          d14: { metric: "d14_rate", rate: i < 14 ? null : Math.max(0, base - 0.24 - i * 0.002), retained: i < 14 ? null : 7 + gameIndex * 2, eligible: i < 14 ? null : 42 + gameIndex * 20, maturity_status: i < 14 ? "collecting" : "eligible", baseline: i < 14 ? null : Math.max(0, base - 0.20), diff_pp: i < 14 ? null : -4.0, robust_z: i < 14 ? null : -1.0, alert_state: i === 16 && game === "CBPC_SEA" ? "watch" : "none" },
        },
        data_complete_through: "2026-08-18",
      });
    }
  });
  return {
    status: "ready",
    filters: { games, start_date: "2026-06-20", end_date: "2026-08-18", window_days: Number(params.window || 28) },
    row_count: rows.length,
    rows,
    limitations: ["Preview data"],
    contract_version: "daily_retention_v1",
    data_complete_through: "2026-08-18",
    release_state: "PREVIEW",
    fingerprint: "preview-cohorts-v1",
    generated_at: new Date().toISOString(),
  };
}

function previewChannels(params = {}) {
  const game = params.game || "CBM_TH";
  const channels = ["Facebook Ads", "Google Ads", "Organic / Unknown", "In-App Register"];
  const rows = channels.flatMap((channel, index) => [17, 16, 15].map((day) => ({
    cohort_date: `2026-08-${day}`,
    game_code: game,
    db_channel: channel,
    register_users: 18 + index * 9 + day % 3,
    first_login_users: 17 + index * 8,
    milestones: {
      d1: { rate: 0.22 + index * 0.05, retained: 7 + index, eligible: 30 + index * 5, maturity_status: "eligible", game_rate: 0.39, diff_vs_game_pp: -17 + index * 5 },
      d3: { rate: 0.16 + index * 0.04, retained: 5 + index, eligible: 29 + index * 5, maturity_status: "eligible", game_rate: 0.33, diff_vs_game_pp: -17 + index * 4 },
      d7: { rate: day >= 17 ? null : 0.11 + index * 0.03, retained: day >= 17 ? null : 4 + index, eligible: day >= 17 ? null : 28 + index * 5, maturity_status: day >= 17 ? "collecting" : "eligible", game_rate: day >= 17 ? null : 0.27, diff_vs_game_pp: day >= 17 ? null : -16 + index * 3 },
      d14: { rate: null, retained: null, eligible: null, maturity_status: "collecting", game_rate: null, diff_vs_game_pp: null },
    },
    data_complete_through: "2026-08-18",
  })));
  return {
    status: "ready",
    filters: { games: [game], channel: "", start_date: "2026-06-20", end_date: "2026-08-18", window_days: Number(params.window || 28) },
    row_count: rows.length,
    rows,
    baseline_scope: "game_total_only",
    limitations: ["DB-side Attribution only — not Ads Platform API."],
    contract_version: "daily_retention_v1",
    data_complete_through: "2026-08-18",
    release_state: "PREVIEW",
    fingerprint: "preview-channels-v1",
    generated_at: new Date().toISOString(),
  };
}

function previewAnomalies(params = {}) {
  const rows = [
    { anomaly_id: "PREVIEW-1", game_code: "CBM_TH", metric_name: "d1_rate", metric_family: "retention", metric_date: "2026-08-17", severity: "critical", actual_value: 0.394, baseline_value: 0.52, diff_abs: -0.126, diff_pp: -12.6, diff_relative: -0.2423, robust_z: -3.2, eligible_sample: 71, status: "open", alert_key: "preview-1" },
    { anomaly_id: "PREVIEW-2", game_code: "CBM_SEA", metric_name: "d1_rate", metric_family: "retention", metric_date: "2026-08-17", severity: "watch", actual_value: 0.489, baseline_value: 0.54, diff_abs: -0.051, diff_pp: -5.1, diff_relative: -0.0944, robust_z: -2.4, eligible_sample: 231, status: "open", alert_key: "preview-2" },
    { anomaly_id: "PREVIEW-3", game_code: "CBPC_SEA", metric_name: "d3_rate", metric_family: "retention", metric_date: "2026-08-15", severity: "watch", actual_value: 0.06, baseline_value: 0.09, diff_abs: -0.03, diff_pp: -3.0, diff_relative: -0.333, robust_z: -2.4, eligible_sample: 84, status: "open", alert_key: "preview-3" },
  ].filter((row) => !params.game || row.game_code === params.game);
  return {
    status: "ready",
    filters: { games: params.game ? [params.game] : ["CBM_TH", "CBM_SEA", "CBPC_TH", "CBPC_SEA"], status: params.status || "open", severity: params.severity || "", start_date: "2026-06-20", end_date: "2026-08-18", window_days: Number(params.window || 28) },
    row_count: rows.length,
    rows,
    data_quality_issues: PREVIEW_OVERVIEW.data_quality_issues,
    limitations: ["Preview data"],
    contract_version: "daily_retention_v1",
    data_complete_through: "2026-08-18",
    release_state: "PREVIEW",
    fingerprint: "preview-anomalies-v1",
    generated_at: new Date().toISOString(),
  };
}


function previewSummaries(params = {}) {
  const reportDate = params.report_date || "2026-08-18";
  const game = params.game || "ALL";
  const generatedAt = new Date().toISOString();
  const promptVersion = "daily_retention_ai_summary_v2_plain_language";

  const overall = {
    report_date: reportDate,
    scope_type: "overall",
    game_code: "ALL",
    summary_text: "ภาพรวมแบ่งเป็น 2 กลุ่มค่อนข้างชัด โดย CBM_TH และ CBM_SEA ยังรักษาผู้เล่นได้ดีกว่า CBPC_TH และ CBPC_SEA ขณะที่ CBPC_SEA อ่อนที่สุดในหลายช่วง โดยเฉพาะ D14 ที่เหลือเพียง 1.7%",
    key_finding: "CBM_SEA เด่นที่สุดในช่วงต้น ส่วน CBM_TH ทำ D7 และ D14 ได้สูงที่สุด",
    attention_point: "CBPC_SEA ควรจับตาการกลับมาเล่นหลังวันแรก เพราะ D3, D7 และ D14 อยู่ในระดับต่ำเมื่อเทียบกับเกมอื่น",
    recommended_check: "เริ่มดู CBPC_SEA ใน Game Detail แล้วต่อด้วย Cohorts และ Channels เพื่อดูว่าจุดอ่อนเกิดกับกลุ่มผู้เล่นหรือช่องทางไหน",
    prompt_version: promptVersion,
    model: "preview",
    generated_at: generatedAt,
  };

  const gameRows = {
    CBM_TH: {
      report_date: reportDate,
      scope_type: "game",
      game_code: "CBM_TH",
      summary_text: "CBM_TH ยังทำ D7 และ D14 ได้ดีเมื่อเทียบกับเกมอื่น แต่ D1 ลดลงจากระดับที่เกมเคยทำได้ จึงควรดูการกลับมาเล่นในวันแรกเป็นหลัก",
      key_finding: "D7 และ D14 ยังเป็นจุดแข็งของเกม",
      attention_point: "D1 อ่อนลงกว่าช่วงปกติของเกม",
      recommended_check: "ดูจำนวนผู้เล่นที่กลับมาใน D1 และเทียบกับกลุ่มผู้สมัครวันก่อนหน้า",
    },
    CBM_SEA: {
      report_date: reportDate,
      scope_type: "game",
      game_code: "CBM_SEA",
      summary_text: "CBM_SEA ทำ Retention เด่นที่สุดในภาพรวม โดย D1 อยู่ที่ 48.9% และ D3 37.3% ขณะที่ D7 และ D14 ก็ยังสูงกว่าเกมกลุ่ม CBPC",
      key_finding: "Retention แข็งแรงต่อเนื่องตั้งแต่ D1 ถึง D14",
      attention_point: "D1 และ D3 อ่อนลงจากระดับเดิมเล็กน้อย จึงควรติดตามต่อ",
      recommended_check: "ดู D1 และ D3 ของกลุ่มผู้สมัครล่าสุดว่าการลดลงเกิดต่อเนื่องหลายวันหรือไม่",
    },
    CBPC_TH: {
      report_date: reportDate,
      scope_type: "game",
      game_code: "CBPC_TH",
      summary_text: "CBPC_TH มี Retention ต่ำกว่าเกมกลุ่ม CBM ชัดเจน โดย D1 อยู่ที่ 18.2% และ D14 เหลือ 5.4% จึงควรให้ความสำคัญกับการรักษาผู้เล่นระยะยาว",
      key_finding: "D14 เป็นช่วงที่อ่อนที่สุดของเกม",
      attention_point: "ผู้เล่นที่กลับมาใน D14 มีเพียง 2 จาก 37 คน",
      recommended_check: "ดู D14 ของกลุ่มผู้สมัครก่อนหน้าเพื่อเช็กว่าระดับต่ำแบบนี้เกิดซ้ำหรือไม่",
    },
    CBPC_SEA: {
      report_date: reportDate,
      scope_type: "game",
      game_code: "CBPC_SEA",
      summary_text: "CBPC_SEA ต่ำที่สุดในหลายช่วงเมื่อเทียบกับ 4 เกม โดย D1 อยู่ที่ 11.1%, D3 6.0%, D7 5.3% และ D14 1.7% จุดที่ควรโฟกัสคือการกลับมาเล่นหลังวันแรก",
      key_finding: "D3 ถึง D14 ต่ำกว่าเกมอื่นชัดเจน",
      attention_point: "D14 มีผู้เล่นกลับมาเพียง 2 จาก 119 คน",
      recommended_check: "ดู Cohorts และ Channels เพื่อดูว่าการลดลงเกิดกับผู้เล่นหลายกลุ่มหรือกระจุกอยู่บางช่องทาง",
    },
  };

  const scopeRows = [
    {
      report_date: reportDate,
      scope_type: "cohort",
      game_code: "CBM_TH",
      summary_text: "กลุ่มผู้เล่นใหม่ของ CBM_TH ยังรักษา D7 ได้ค่อนข้างดี แต่กลุ่มล่าสุดใน D1 อ่อนกว่าระดับที่เกมเคยทำได้",
      recommended_check: "ดูว่ากลุ่มผู้สมัคร 2–3 วันล่าสุดมี D1 ลดลงต่อเนื่องหรือเป็นเพียงวันเดียว",
    },
    {
      report_date: reportDate,
      scope_type: "cohort",
      game_code: "CBM_SEA",
      summary_text: "กลุ่มผู้เล่นใหม่ของ CBM_SEA ยังทำ Retention ได้แข็งแรงกว่ากลุ่มเกมอื่น โดยเฉพาะ D1 และ D3",
      recommended_check: "ดูแนวโน้มของกลุ่มผู้สมัครล่าสุดเพื่อเช็กว่าค่า D1/D3 ที่เริ่มอ่อนลงเกิดซ้ำหรือไม่",
    },
    {
      report_date: reportDate,
      scope_type: "cohort",
      game_code: "CBPC_TH",
      summary_text: "กลุ่มผู้เล่นใหม่ของ CBPC_TH กลับมาเล่นต่อค่อนข้างน้อยในช่วง D14 เมื่อเทียบกับ D1–D7",
      recommended_check: "เปิดกลุ่มผู้สมัครย้อนหลังเพื่อดูว่า D14 ต่ำต่อเนื่องหลายกลุ่มหรือไม่",
    },
    {
      report_date: reportDate,
      scope_type: "cohort",
      game_code: "CBPC_SEA",
      summary_text: "หลายกลุ่มผู้เล่นใหม่ของ CBPC_SEA มี Retention ระยะกลางถึงยาวต่ำ จุดอ่อนชัดที่สุดอยู่หลังวันแรก",
      recommended_check: "เริ่มดู D3 และ D7 ของกลุ่มผู้สมัครล่าสุดว่ามีวันไหนต่ำผิดจากวันรอบข้างมากเป็นพิเศษ",
    },
    {
      report_date: reportDate,
      scope_type: "channel",
      game_code: "CBM_TH",
      summary_text: "ผู้เล่นจากแต่ละ Channel ของ CBM_TH มีผลต่างกัน แต่ควรดูจำนวนผู้เล่นของแต่ละช่องทางประกอบก่อนสรุปว่าช่องทางไหนดีกว่า",
      recommended_check: "เทียบ D1 และ D7 ของ Facebook Ads, Google Ads และ Organic พร้อมจำนวนผู้เล่นจริง",
    },
    {
      report_date: reportDate,
      scope_type: "channel",
      game_code: "CBM_SEA",
      summary_text: "CBM_SEA มี Retention ค่อนข้างแข็งแรงในหลาย Channel แต่ช่องทางที่มีผู้เล่นน้อยไม่ควรถูกตัดสินจากเปอร์เซ็นต์อย่างเดียว",
      recommended_check: "ให้ความสำคัญกับ Channel ที่มีจำนวนผู้เล่นมากพอก่อน แล้วค่อยเปรียบเทียบ D1–D14",
    },
    {
      report_date: reportDate,
      scope_type: "channel",
      game_code: "CBPC_TH",
      summary_text: "Channel ของ CBPC_TH ควรถูกดูควบคู่กับจำนวนผู้เล่น เพราะ Retention โดยรวมของเกมค่อนข้างต่ำอยู่แล้ว",
      recommended_check: "หาช่องทางที่ D7/D14 ดีกว่าภาพรวมเกมและมีจำนวนผู้เล่นมากพอ",
    },
    {
      report_date: reportDate,
      scope_type: "channel",
      game_code: "CBPC_SEA",
      summary_text: "CBPC_SEA ควรดูว่า D3–D14 ที่ต่ำเกิดกับทุก Channel หรือมีบางช่องทางที่อ่อนกว่าช่องทางอื่นชัดเจน",
      recommended_check: "เทียบ Channel ที่มีจำนวนผู้เล่นมากที่สุดก่อน เพื่อไม่ให้เปอร์เซ็นต์จากกลุ่มเล็กทำให้เข้าใจผิด",
    },
    {
      report_date: reportDate,
      scope_type: "anomaly",
      game_code: "CBM_TH",
      summary_text: "จุดที่ควรตรวจสอบของ CBM_TH อยู่ที่ D1 ซึ่งลดลงจากระดับที่เกมเคยทำได้มากกว่าช่วงอื่น",
      recommended_check: "ดู D1 ของวันก่อนหน้าและจำนวนผู้เล่นที่กลับมาจริงเพื่อเช็กว่าการลดลงต่อเนื่องหรือไม่",
    },
    {
      report_date: reportDate,
      scope_type: "anomaly",
      game_code: "CBM_SEA",
      summary_text: "CBM_SEA มีจุดที่ควรจับตาใน D1 และ D3 แม้ภาพรวมยังทำได้ดีกว่าเกมอื่น",
      recommended_check: "ติดตาม D1/D3 ในวันถัดไปว่าค่ายังลดลงจากระดับเดิมต่อหรือไม่",
    },
    {
      report_date: reportDate,
      scope_type: "anomaly",
      game_code: "CBPC_TH",
      summary_text: "ยังไม่มีจุดที่ระบบเปิดเตือนสำหรับ CBPC_TH แต่ระดับ Retention โดยรวมยังต่ำเมื่อเทียบกับเกมกลุ่ม CBM",
      recommended_check: "ใช้ Game Detail และ Cohorts ดูระดับ Retention จริงต่อ แม้ไม่มีรายการเตือน",
    },
    {
      report_date: reportDate,
      scope_type: "anomaly",
      game_code: "CBPC_SEA",
      summary_text: "CBPC_SEA มีจุดที่ควรจับตาใน D3 และ D14 ซึ่งสอดคล้องกับภาพรวมที่ Retention หลังวันแรกค่อนข้างต่ำ",
      recommended_check: "เริ่มตรวจ D3 และ D14 ก่อน แล้วดู Cohorts/Channels เพื่อหาว่าจุดอ่อนกระจุกอยู่ตรงไหน",
    },
  ].map((row) => ({
    ...row,
    key_finding: row.key_finding || "",
    attention_point: row.attention_point || "",
    prompt_version: promptVersion,
    model: "preview",
    generated_at: generatedAt,
  }));

  const allRows = [overall, ...Object.values(gameRows), ...scopeRows];
  const rows = game === "ALL"
    ? allRows
    : allRows.filter((row) =>
        row.scope_type !== "overall" &&
        String(row.game_code || "").toUpperCase() === String(game).toUpperCase()
      );

  return {
    status: "ready",
    report_date: reportDate,
    overall: game === "ALL" ? overall : null,
    games: gameRows,
    rows,
    prompt_version: promptVersion,
    generated_at: generatedAt,
    contract_version: "daily_retention_v1",
    data_complete_through: "2026-08-18",
    release_state: "PREVIEW",
  };
}
function previewRequest(action, params = {}) {
  if (action === ACTIONS.overview) return previewEnvelope(structuredClone(PREVIEW_OVERVIEW));
  if (action === ACTIONS.cohorts) return previewEnvelope(previewCohorts(params));
  if (action === ACTIONS.channels) return previewEnvelope(previewChannels(params));
  if (action === ACTIONS.anomalies) return previewEnvelope(previewAnomalies(params));
  if (action === ACTIONS.summaries) return previewEnvelope(previewSummaries(params));
  throw new Error(`Unsupported Daily Retention preview action: ${action}`);
}

async function request(action, params = {}, { refresh = false } = {}) {
  const key = stableKey(action, params);
  if (!refresh) {
    const cached = cachedValue(key);
    if (cached) return cached;
  }
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    const session = getSavedSession();
    const result = isPreviewSession(session)
      ? previewRequest(action, params)
      : await callAuthorized(action, params, 45_000);

    if (!result?.ok) throw new Error(result?.message || result?.error || "Daily Retention API failed");
    if (!result?.data || typeof result.data !== "object") throw new Error("Daily Retention API response has no data payload");
    return remember(key, result);
  })();

  inFlight.set(key, task);
  task.finally(() => {
    if (inFlight.get(key) === task) inFlight.delete(key);
  });
  return task;
}

export function clearDailyRetentionClientCache() {
  responseCache.clear();
}

export function fetchDailyOverview(options = {}) {
  return request(ACTIONS.overview, {}, options);
}

export function fetchDailyCohorts({ game = "", window = 28 } = {}, options = {}) {
  return request(ACTIONS.cohorts, { ...(game && game !== "ALL" ? { game } : {}), window: String(window) }, options);
}

export function fetchDailyChannels({ game = "", window = 28 } = {}, options = {}) {
  if (!game || game === "ALL") throw new Error("เลือก Game ก่อนเปิด Channel Retention");
  return request(ACTIONS.channels, { game, window: String(window) }, options);
}

export function fetchDailyAnomalies({ game = "", window = 28, status = "open", severity = "" } = {}, options = {}) {
  return request(
    ACTIONS.anomalies,
    {
      ...(game && game !== "ALL" ? { game } : {}),
      window: String(window),
      status,
      ...(severity ? { severity } : {}),
    },
    options,
  );
}


export function fetchDailySummaries({ game = "", reportDate = "" } = {}, options = {}) {
  return request(
    ACTIONS.summaries,
    {
      ...(game && game !== "ALL" ? { game } : {}),
      ...(reportDate ? { report_date: reportDate } : {}),
    },
    options,
  );
}
