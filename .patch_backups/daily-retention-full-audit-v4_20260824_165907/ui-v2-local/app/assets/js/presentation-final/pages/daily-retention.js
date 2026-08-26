import {
  fetchDailyOverview,
  fetchDailyCohorts,
  fetchDailyChannels,
  fetchDailyAnomalies,
  fetchDailySummaries,
  clearDailyRetentionClientCache,
} from "../services/daily-retention-api.js?v=3301";

const STYLE_ID = "cqr-daily-retention-v3303-style";
const STYLE_HREF = "./assets/css/daily-retention.css?v=3303";
const GAMES = [
  { value: "ALL", label: "ทุกเกม (4 เกม)" },
  { value: "CBM_TH", label: "CBM TH" },
  { value: "CBM_SEA", label: "CBM SEA" },
  { value: "CBPC_TH", label: "CBPC TH" },
  { value: "CBPC_SEA", label: "CBPC SEA" },
];
const WINDOWS = [14, 28, 60];
const DEFAULT_TREND_WINDOW = 28;
const HISTORY_WINDOW = 60;
const TABS = ["overview", "cohorts", "channels", "anomalies"];
const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const MILESTONE_DAYS = { D1: 1, D3: 3, D7: 7, D14: 14 };
const CQR_DAILY_RETENTION_UX_PATCH_V2_SAFE_20260822 = true;
const CQR_DAILY_RETENTION_APPROVED_UI_PATCH_V3_20260823 = true;

const view = {
  game: "ALL",
  window: DEFAULT_TREND_WINDOW,
  reportDate: "",
  tab: "overview",
  anomalyStatus: "open",
  anomalySeverity: "",
  loading: false,
  error: "",
  overviewEnvelope: null,
  trendEnvelope: null,
  cohortsEnvelope: null,
  channelsEnvelope: null,
  anomaliesEnvelope: null,
  summaryEnvelope: null,
  loadedKeys: new Set(),
};

function ensureStyle() {
  document.querySelectorAll('[id^="cqr-daily-retention-v"][id$="-style"]').forEach((node) => {
    if (node.id !== STYLE_ID) node.remove();
  });
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = STYLE_HREF;
  document.head.appendChild(link);
}

function icon(name, cls = "dr-ico") {
  const paths = {
    chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 14 3-3 3 2 4-6"/>',
    alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="m10.3 3.9-7.4 12.8A2 2 0 0 0 4.6 20h14.8a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4-.1Z"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
    retention: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v6h-6"/>',
    channel: '<path d="M5 12h14"/><path d="M12 5v14"/><path d="m5 5 14 14"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
    trophy: '<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5a2 2 0 0 0 2 4h1"/><path d="M16 6h3a2 2 0 0 1-2 4h-1"/><path d="M12 12v4"/><path d="M8 20h8"/><path d="M10 16h4v4h-4z"/>',
    spark: '<path d="M12 3l1.7 4.2L18 9l-4.3 1.8L12 15l-1.7-4.2L6 9l4.3-1.8L12 3Z"/><path d="m19 16 .8 1.9 2.2.8-2.2.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8L19 16Z"/>',
    arrowdown: '<path d="M12 4v15"/><path d="m6 13 6 6 6-6"/>',
    arrowup: '<path d="M12 20V5"/><path d="m6 11 6-6 6 6"/>',
    day1: '<path d="M7 7h10a4 4 0 0 1 4 4v1a4 4 0 0 1-4 4H8"/><path d="m8 12-4 4 4 4"/>',
    week: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M7 2v4M17 2v4M3 9h18"/><path d="M9 13h6M9 17h4"/>',
    longterm: '<path d="M5 21V5"/><path d="M5 6h10l-2 4 2 4H5"/><path d="M18 19a3 3 0 1 0 0-6"/><path d="M18 13v-2"/>',
    change: '<path d="M4 17 9 12l4 3 7-8"/><path d="M15 7h5v5"/>',
  };
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.chart}</svg>`;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function n(value) {
  if (value === null || value === undefined || value === "") return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
}
function int(value) {
  const out = n(value);
  return out === null ? "—" : Math.round(out).toLocaleString("en-US");
}
function pct(value) {
  const out = n(value);
  return out === null ? "—" : `${(out * 100).toFixed(1)}%`;
}
function pp(value) {
  const out = n(value);
  if (out === null) return "—";
  return `${out > 0 ? "+" : ""}${out.toFixed(1)} จุด`;
}
function formatDateTh(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value || "—";
  return `${Number(match[3])} ${MONTHS_TH[Number(match[2]) - 1]} ${match[1]}`;
}
function toDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function isoDate(date) {
  return new Date(date.getTime()).toISOString().slice(0, 10);
}
function shiftDate(value, days) {
  const date = toDate(value);
  if (!date) return value || "";
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}
function metricCode(metric) {
  return String(metric || "").replace("_rate", "").toUpperCase();
}
function metricKey(code) {
  return String(code || "").toLowerCase();
}
function metricThai(code) {
  return {
    D1: "ผู้สมัครที่ใช้วัด D1",
    D3: "ผู้สมัครที่ใช้วัด D3",
    D7: "ผู้สมัครที่ใช้วัด D7",
    D14: "ผู้สมัครที่ใช้วัด D14",
  }[code] || code;
}

function alertLabel(state) {
  const labels = {
    none: "",
    watch: "ควรจับตา",
    warning: "ควรตรวจสอบ",
    critical: "ผิดปกติชัดเจน",
  };
  const key = String(state || "none").toLowerCase();
  return Object.prototype.hasOwnProperty.call(labels, key) ? labels[key] : "";
}
function alertIcon(state) {
  const value = String(state || "none").toLowerCase();
  if (value === "none") return "check";
  if (value === "watch") return "clock";
  return "alert";
}
function pill(state) {
  const value = String(state || "none").toLowerCase();
  const label = alertLabel(value);
  if (!label) return "";
  return `<span class="dr-pill ${value}">${icon(alertIcon(value), "dr-ico dr-ico-sm")}${esc(label)}</span>`;
}
function baselineText() { return "ช่วงปกติของเกม"; }
function pointDifference(value) {
  const out = n(value);
  if (out === null) return "—";
  if (out < 0) return `ลดลง ${Math.abs(out).toFixed(1)} จุด`;
  if (out > 0) return `เพิ่มขึ้น ${out.toFixed(1)} จุด`;
  return "ใกล้เคียงช่วงปกติ";
}
function historicalComparison(current, baseline, diff) {
  return normalComparisonText(current, baseline);
}

function channelComparison(current, gameRate, diff) {
  const currentNum = n(current);
  const gameNum = n(gameRate);
  if (currentNum === null || gameNum === null) return "ยังไม่มีภาพรวมเกมให้เทียบ";
  return `Channel นี้ ${pct(currentNum)} · ทั้งเกม ${pct(gameNum)} · ${pointDifference(diff)}`;
}
function diffText(value) {
  return pointDifference(value);
}
function options(items, value) {
  return items.map((item) => `<option value="${esc(item.value)}"${item.value === value ? " selected" : ""}>${esc(item.label)}</option>`).join("");
}
function latestMilestone(game, code) {
  return (game.milestones || []).find((item) => metricCode(item.metric) === code) || null;
}
function envelopeCompleteThrough(envelope) {
  const direct = envelope?.data?.data_complete_through || "";
  if (direct) return direct;
  const gameDates = (envelope?.data?.games || [])
    .map((game) => String(game?.data_complete_through || game?.snapshot?.report_date || ""))
    .filter(Boolean)
    .sort();
  return gameDates.at(-1) || "";
}
function dataCompleteThrough() {
  const candidates = [
    view.overviewEnvelope,
    view.trendEnvelope,
    view.cohortsEnvelope,
    view.channelsEnvelope,
    view.anomaliesEnvelope,
  ].map(envelopeCompleteThrough).filter(Boolean).sort();
  return candidates.at(-1) || view.reportDate || "";
}
function selectedReportDate() {
  return view.reportDate || dataCompleteThrough();
}
function syncReportDateFromEnvelope(envelope) {
  const completeThrough = envelopeCompleteThrough(envelope);
  if (!completeThrough) return;
  if (!view.reportDate) {
    view.reportDate = completeThrough;
    return;
  }
  if (view.reportDate > completeThrough) view.reportDate = completeThrough;
}
function calendarBounds() {
  const max = dataCompleteThrough();
  if (!max) return { min: "", max: "", ready: true };
  return {
    min: shiftDate(max, -(HISTORY_WINDOW - 1)),
    max,
    ready: true,
  };
}
function visibleDateRange() {
  const end = selectedReportDate();
  const start = shiftDate(end, -(view.window - 1));
  return { start, end };
}

function trendRows(gameCode) {
  return (view.trendEnvelope?.data?.rows || [])
    .filter((row) => row.game_code === gameCode)
    .slice()
    .sort((a, b) => String(a.cohort_date).localeCompare(String(b.cohort_date)));
}
function rowsVisibleByReport(rows, dateKey) {
  const { start, end } = visibleDateRange();
  return (rows || []).filter((row) => {
    const value = String(row?.[dateKey] || "");
    return value && value >= start && value <= end;
  });
}
function trendFor(gameCode, code) {
  return rowsVisibleByReport(trendRows(gameCode), "cohort_date")
    .map((row) => ({ date: row.cohort_date, rate: n(row.milestones?.[metricKey(code)]?.rate) }))
    .filter((point) => point.rate !== null);
}
function sparkline(points) {
  if (!points || points.length < 2) return "";
  const values = points.map((point) => point.rate);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.0001);
  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 28 - ((value - min) / span) * 22;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = coords.split(" ").at(-1).split(",");
  return `<svg class="dr-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-label="Trend"><polyline points="${coords}"/><circle cx="${last[0]}" cy="${last[1]}" r="2.1"/></svg>`;
}

function deriveMilestoneFromRows(rows, code) {
  const targetDate = shiftDate(selectedReportDate(), -MILESTONE_DAYS[code]);
  const row = rows.find((item) => item.cohort_date === targetDate);
  const source = row?.milestones?.[metricKey(code)] || null;
  if (!source || n(source.rate) === null) return null;
  return {
    metric: `${metricKey(code)}_rate`,
    cohort_date: targetDate,
    value: n(source.rate),
    retained: source.retained,
    eligible: source.eligible,
    baseline: source.baseline,
    diff_pp: source.diff_pp,
    maturity_status: source.maturity_status,
    alert_state: source.alert_state,
  };
}
function deriveOverviewGames(baseGames = []) {
  const sourceCodes = (baseGames.length ? baseGames : GAMES.filter((item) => item.value !== "ALL").map((item) => ({ game_code: item.value })))
    .map((item) => item.game_code)
    .filter((code) => view.game === "ALL" || code === view.game);
  return sourceCodes.map((gameCode) => {
    const rows = trendRows(gameCode);
    const milestones = ["D1", "D3", "D7", "D14"]
      .map((code) => deriveMilestoneFromRows(rows, code))
      .filter(Boolean);
    return { game_code: gameCode, milestones };
  }).filter((game) => game.milestones.length);
}
function overviewData() {
  const base = view.overviewEnvelope?.data;
  if (!base) return null;

  const selected = selectedReportDate();
  const latest = (base.games || [])
    .map((game) => String(game?.data_complete_through || game?.snapshot?.report_date || ""))
    .filter(Boolean)
    .sort()
    .at(-1) || "";

  const scopedLatestGames = (base.games || [])
    .filter((game) => view.game === "ALL" || game.game_code === view.game);

  return {
    ...base,
    games: selected && latest && selected === latest
      ? scopedLatestGames
      : deriveOverviewGames(base.games || []),
    data_complete_through: selected || latest,
  };
}

function allMilestonePoints(games) {
  return games.flatMap((game) => (game.milestones || []).map((item) => ({
    game: game.game_code,
    code: metricCode(item.metric),
    value: n(item.value),
    baseline: n(item.baseline),
    diff: n(item.diff_pp),
    retained: item.retained,
    eligible: item.eligible,
    cohortDate: item.cohort_date,
    state: String(item.alert_state || "none").toLowerCase(),
  }))).filter((item) => item.value !== null);
}
function maxBy(items, selector) {
  return items.reduce((best, item) => (!best || selector(item) > selector(best) ? item : best), null);
}
function minBy(items, selector) {
  return items.reduce((best, item) => (!best || selector(item) < selector(best) ? item : best), null);
}



function metricRanking(games, code) {
  return games.map((game) => {
    const metric = latestMilestone(game, code);
    return metric && n(metric.value) !== null
      ? { game: game.game_code, code, value: n(metric.value), metric }
      : null;
  }).filter(Boolean).sort((a, b) => b.value - a.value);
}

function rankLabel(games, gameCode, code) {
  if (games.length <= 1) return "";
  const ranked = metricRanking(games, code);
  const index = ranked.findIndex((item) => item.game === gameCode);
  if (index < 0) return "";
  if (index === 0) return "สูงสุดใน 4 เกม";
  if (index === ranked.length - 1) return "ต่ำสุดใน 4 เกม";
  return `อันดับ ${index + 1} จาก ${ranked.length}`;
}

function weakestGameSummary(games) {
  if (games.length <= 1) return null;
  const losses = new Map();
  ["D1", "D3", "D7", "D14"].forEach((code) => {
    const ranked = metricRanking(games, code);
    if (!ranked.length) return;
    const lowest = ranked.at(-1);
    const current = losses.get(lowest.game) || { count: 0, metrics: [] };
    current.count += 1;
    current.metrics.push(lowest);
    losses.set(lowest.game, current);
  });
  const rankedLosses = [...losses.entries()]
    .map(([game, detail]) => ({ game, ...detail }))
    .sort((a, b) => b.count - a.count);
  return rankedLosses[0] || null;
}

function weakestMetric(games) {
  const points = allMilestonePoints(games);
  if (!points.length) return null;
  return minBy(points, (item) => item.value);
}

function dailyLeader(games) {
  const codes = ["D1", "D3", "D7", "D14"];
  const wins = new Map();
  codes.forEach((code) => {
    const candidates = games.map((game) => {
      const metric = latestMilestone(game, code);
      return metric && n(metric.value) !== null
        ? { game: game.game_code, code, value: n(metric.value), metric }
        : null;
    }).filter(Boolean);
    const winner = maxBy(candidates, (item) => item.value);
    if (!winner) return;
    const current = wins.get(winner.game) || { count: 0, wins: [] };
    current.count += 1;
    current.wins.push(winner);
    wins.set(winner.game, current);
  });
  const ranked = [...wins.entries()]
    .map(([game, detail]) => ({ game, ...detail }))
    .sort((a, b) => b.count - a.count);
  if (!ranked.length) return null;
  return {
    ...ranked[0],
    tied: ranked.length > 1 && ranked[1].count === ranked[0].count,
  };
}

function statePriority(state) {
  return { critical: 4, warning: 3, watch: 2, none: 1 }[String(state || "none").toLowerCase()] || 0;
}

function performanceStateText(item) {
  const state = String(item?.state || "none").toLowerCase();
  if (state === "critical") return "ผิดปกติชัดเจนเมื่อเทียบกับค่าปกติย้อนหลัง";
  if (state === "warning") return "ควรตรวจสอบการเปลี่ยนแปลงจากค่าปกติย้อนหลัง";
  if (state === "watch") return "ควรจับตาการเปลี่ยนแปลงจากค่าปกติย้อนหลัง";
  return "Backend ยังไม่จัดเป็น Anomaly เมื่อเทียบกับค่าปกติย้อนหลัง";
}

function movementText(item) {
  if (!item || item.diff === null) return "ยังไม่มีข้อมูลเทียบค่าปกติย้อนหลัง";
  return `${item.game} · ${item.code}: ${historicalComparison(item.value, item.baseline, item.diff)}`;
}

function leaderDetailText(games, leader) {
  if (!leader) return "ยังไม่มีข้อมูลพอสำหรับสรุปเกมเด่น";
  if (view.game !== "ALL") {
    const points = allMilestonePoints(games).filter((item) => item.diff !== null);
    const strongest = maxBy(points, (item) => item.diff);
    if (!strongest) return "ยังไม่มีข้อมูลพอสำหรับสรุปจุดเด่น";
    return `${strongest.code} อยู่ที่ ${pct(strongest.value)} และ${diffText(strongest.diff)}เมื่อเทียบกับค่าปกติย้อนหลัง`;
  }
  if (leader.tied) {
    return `วันนี้มีมากกว่า 1 เกมที่ทำค่า Retention สูงสุดในจำนวนช่วงเท่ากัน`;
  }
  const values = ["D1", "D3", "D7", "D14"]
    .map((code) => {
      const metric = latestMilestone(games.find((game) => game.game_code === leader.game), code);
      return metric && n(metric.value) !== null ? `${code} ${pct(metric.value)}` : null;
    })
    .filter(Boolean)
    .join(" · ");
  return `${leader.game} นำ ${leader.count} จาก 4 ช่วง${values ? ` — ${values}` : ""}`;
}


function currentAiSummary() {
  const data = view.summaryEnvelope?.data;
  if (!data) return null;

  if (view.game === "ALL") {
    if (data.overall && typeof data.overall === "object") return data.overall;
    return (data.rows || []).find((row) => String(row.scope_type || "") === "overall") || null;
  }

  if (data.games && data.games[view.game]) return data.games[view.game];
  return (data.rows || []).find((row) =>
    String(row.scope_type || "") === "game" &&
    String(row.game_code || "").toUpperCase() === view.game
  ) || null;
}

function aiSummaryForGame(gameCode) {
  const data = view.summaryEnvelope?.data;
  if (!data) return null;
  if (data.games && data.games[gameCode]) return data.games[gameCode];
  return (data.rows || []).find((row) =>
    String(row.scope_type || "") === "game" &&
    String(row.game_code || "").toUpperCase() === String(gameCode || "").toUpperCase()
  ) || null;
}


function aiRowsForScope(scopeType) {
  const rows = view.summaryEnvelope?.data?.rows || [];
  return rows.filter((row) => String(row.scope_type || "").toLowerCase() === scopeType);
}

function aiSummaryForScope(scopeType, gameCode = view.game) {
  const target = String(gameCode || "ALL").toUpperCase();
  return aiRowsForScope(scopeType).find((row) =>
    String(row.game_code || "").toUpperCase() === target
  ) || null;
}

function plainAiSummaryBlock(scopeType, title, emptyText = "") {
  const rows = aiRowsForScope(scopeType);
  if (!rows.length) return emptyText ? `<div class="dr-ai-inline-empty">${esc(emptyText)}</div>` : "";

  const selected = view.game === "ALL"
    ? rows.filter((row) => String(row.game_code || "").toUpperCase() !== "ALL")
    : rows.filter((row) => String(row.game_code || "").toUpperCase() === view.game);

  if (!selected.length) return "";

  if (view.game !== "ALL") {
    const item = selected[0];
    const summary = String(item.summary_text || "").trim();
    const next = String(item.recommended_check || "").trim();
    if (!summary && !next) return "";
    return `<section class="dr-ai-inline">
      <div class="dr-ai-inline-kicker">${icon("spark", "dr-ico dr-ico-sm")} AI Summary</div>
      <div class="dr-ai-inline-title">${esc(title)}</div>
      ${summary ? `<div class="dr-ai-inline-main">${esc(summary)}</div>` : ""}
      ${next ? `<div class="dr-ai-inline-next"><strong>ควรดูต่อ:</strong> ${esc(next)}</div>` : ""}
    </section>`;
  }

  return `<section class="dr-ai-inline">
    <div class="dr-ai-inline-kicker">${icon("spark", "dr-ico dr-ico-sm")} AI Summary</div>
    <div class="dr-ai-inline-title">${esc(title)}</div>
    <div class="dr-ai-inline-list">
      ${selected.map((item) => `<div class="dr-ai-inline-row">
        <div class="dr-ai-inline-game">${esc(item.game_code)}</div>
        <div class="dr-ai-inline-row-text">${esc(String(item.summary_text || "ข้อมูลยังไม่พอสำหรับสรุป"))}</div>
      </div>`).join("")}
    </div>
  </section>`;
}

function deltaPresentation(diff) {
  const value = n(diff);
  if (value === null) return { cls: "flat", icon: "•", text: "ยังไม่มีข้อมูลเทียบกับช่วงปกติ" };
  if (value < 0) return { cls: "down", icon: "↓", text: `ลดลง ${Math.abs(value).toFixed(1)} จุด` };
  if (value > 0) return { cls: "up", icon: "↑", text: `เพิ่มขึ้น ${value.toFixed(1)} จุด` };
  return { cls: "flat", icon: "•", text: "ใกล้เคียงช่วงปกติ" };
}

function relativeChangePresentation(current, baseline) {
  const currentNum = n(current);
  const baselineNum = n(baseline);
  if (currentNum === null || baselineNum === null || Math.abs(baselineNum) < 1e-12) {
    return { cls: "flat", icon: "→", text: "ยังไม่มีข้อมูลเทียบย้อนหลัง", percent: null };
  }
  const relative = ((currentNum - baselineNum) / Math.abs(baselineNum)) * 100;
  const rounded = Math.round(Math.abs(relative));
  if (relative < 0) return { cls: "down", icon: "↓", text: `วันนี้ลดลง ${rounded}%`, percent: -rounded };
  if (relative > 0) return { cls: "up", icon: "↑", text: `วันนี้เพิ่มขึ้น ${rounded}%`, percent: rounded };
  return { cls: "flat", icon: "→", text: "วันนี้ใกล้เคียงเดิม", percent: 0 };
}

function normalComparisonText(current, baseline) {
  const baselineNum = n(baseline);
  if (baselineNum === null) return "ยังไม่มีข้อมูลย้อนหลังให้เทียบ";
  const movement = relativeChangePresentation(current, baseline);
  return `ปกติอยู่ราว ${pct(baselineNum)} · ${movement.icon} ${movement.text}`;
}

function aiSummaryParagraphs(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const chunks = text
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return chunks.map((part) => `<p>${esc(part)}</p>`).join("");
}

function deterministicDailyFallback(games) {
  const leader = dailyLeader(games);
  const weakest = weakestGameSummary(games);
  if (view.game === "ALL") {
    const lead = leader && !leader.tied
      ? `${leader.game} ทำ Retention เด่นที่สุดใน ${leader.count} จาก 4 ช่วง`
      : "ผลงานของหลายเกมค่อนข้างสูสีกัน";
    const low = weakest
      ? `${weakest.game} มี Retention ต่ำสุดใน ${weakest.count} จาก 4 ช่วง`
      : "";
    return [lead, low].filter(Boolean).join(" ขณะที่ ");
  }

  const game = games[0];
  if (!game) return "ยังไม่มีข้อมูลพอสำหรับสรุปวันที่เลือก";
  const values = ["D1", "D3", "D7", "D14"].map((code) => {
    const metric = latestMilestone(game, code);
    return metric && n(metric.value) !== null ? `${code} ${pct(metric.value)}` : null;
  }).filter(Boolean);
  return `${game.game_code} มี Retention ${values.join(" · ")}`;
}

function overallSummary(data) {
  const games = data.games || [];
  const ai = currentAiSummary();
  const aiParagraphs = [
    String(ai?.key_finding || "").trim(),
    String(ai?.attention_point || "").trim(),
    String(ai?.recommended_check || "").trim(),
  ].filter(Boolean);
  const summaryText = aiParagraphs.length
    ? aiParagraphs.join("\n\n")
    : (String(ai?.summary_text || "").trim() || deterministicDailyFallback(games));

  return `
    <section class="dr-overall dr-ai-summary dr-ai-summary-free">
      <div class="dr-ai-summary-head">
        <div>
          <div class="dr-overall-kicker">${icon("spark", "dr-ico dr-ico-sm")} สรุปประจำวัน · ข้อมูล ณ ${esc(formatDateTh(selectedReportDate()))}</div>
          <div class="dr-ai-summary-title">ภาพรวม Retention เป็นอย่างไร?</div>
        </div>
        ${ai ? `<span class="dr-ai-ready">${icon("spark", "dr-ico dr-ico-sm")} AI Summary</span>` : ""}
      </div>
      <div class="dr-ai-summary-prose">${aiSummaryParagraphs(summaryText)}</div>
    </section>`;
}


function metricBadge(code) {
  return `<div class="dr-metric-badge">${esc(code)}</div>`;
}

function cautionBadge() {
  return `<div class="dr-caution-badge">${icon("alert", "dr-ico dr-ico-lg")}</div>`;
}

function highlights(data) {
  const games = data.games || [];
  const points = allMilestonePoints(games);
  const d1 = maxBy(points.filter((item) => item.code === "D1"), (item) => item.value);
  const d7 = maxBy(points.filter((item) => item.code === "D7"), (item) => item.value);
  const d14 = maxBy(points.filter((item) => item.code === "D14"), (item) => item.value);
  const flagged = points
    .filter((item) => ["watch", "warning", "critical"].includes(item.state))
    .sort((a, b) => {
      const severity = statePriority(b.state) - statePriority(a.state);
      if (severity) return severity;
      return (a.diff ?? 0) - (b.diff ?? 0);
    });
  const singleGame = view.game !== "ALL";

  const retentionCard = (code, item, caption) => {
    if (!item) return "";
    return `<div class="dr-highlight dr-highlight-metric">
      ${metricBadge(code)}
      <div class="dr-highlight-body">
        <div class="dr-highlight-label">${singleGame ? `${code} Retention` : `${code} สูงสุดใน ${games.length} เกม`}</div>
        <div class="dr-highlight-value">${singleGame ? pct(item.value) : `${item.game} · ${pct(item.value)}`}</div>
        <div class="dr-highlight-meta">${int(item.retained)} จาก ${int(item.eligible)} คนกลับมาเล่น · ผู้สมัครวันที่ ${formatDateTh(item.cohortDate)}</div>
        <div class="dr-highlight-text">${esc(caption)}</div>
      </div>
    </div>`;
  };

  let attentionValue = "ยังไม่มีจุดเร่งด่วน";
  let attentionText = "ยังไม่พบ Retention ที่ต้องรีบตรวจจากข้อมูลของวันที่เลือก";
  if (flagged.length) {
    const item = flagged[0];
    attentionValue = `${item.game} · ${item.code} ${pct(item.value)}`;
    const movement = relativeChangePresentation(item.value, item.baseline);
    attentionText = n(item.baseline) !== null
      ? `ปกติอยู่ราว ${pct(item.baseline)} · ${movement.icon} ${movement.text} · ควรตรวจสอบ`
      : "จุดนี้มีการเปลี่ยนแปลงมากพอที่จะควรเปิดดูรายละเอียด";
  }

  return `<section class="dr-highlights">
    ${retentionCard("D1", d1, singleGame ? "ผู้เล่นใหม่ที่กลับมาเล่นในวันถัดไป" : "ค่า D1 สูงที่สุดในเกมที่กำลังเปรียบเทียบ")}
    ${retentionCard("D7", d7, singleGame ? "ผู้เล่นใหม่ที่กลับมาเล่นภายใน 7 วัน" : "ค่า D7 สูงที่สุดในเกมที่กำลังเปรียบเทียบ")}
    ${retentionCard("D14", d14, singleGame ? "ผู้เล่นใหม่ที่กลับมาเล่นภายใน 14 วัน" : "ค่า D14 สูงที่สุดในเกมที่กำลังเปรียบเทียบ")}
    <div class="dr-highlight dr-highlight-attention">
      ${cautionBadge()}
      <div class="dr-highlight-body">
        <div class="dr-highlight-label">ต้องตรวจสอบก่อน</div>
        <div class="dr-highlight-value">${esc(attentionValue)}</div>
        <div class="dr-highlight-text">${esc(attentionText)}</div>
      </div>
    </div>
  </section>`;
}

function comparison(data) {
  const games = data.games || [];

  const cell = (game, code) => {
    const metric = latestMilestone(game, code);
    if (!metric || n(metric.value) === null) return `<div class="dr-comp-empty">—</div>`;

    const state = String(metric.alert_state || "none").toLowerCase();
    const rank = rankLabel(games, game.game_code, code);
    const showRank = rank.startsWith("สูงสุด") || rank.startsWith("ต่ำสุด");
    const alert = alertLabel(state);
    const movement = relativeChangePresentation(metric.value, metric.baseline);

    return `<div class="dr-comp-cell">
      <div class="dr-comp-top">
        <div class="dr-comp-rate">${pct(metric.value)}</div>
        ${showRank ? `<div class="dr-comp-rank ${rank.startsWith("ต่ำสุด") ? "low" : "high"}">${esc(rank)}</div>` : ""}
      </div>
      <div class="dr-comp-sample">${int(metric.retained)} จาก ${int(metric.eligible)} คนกลับมาเล่น</div>
      ${n(metric.baseline) !== null ? `<div class="dr-comp-history">ปกติอยู่ราว ${pct(metric.baseline)} <span class="dr-comp-delta ${movement.cls}">${movement.icon} ${esc(movement.text)}</span></div>` : ""}
      ${alert ? `<div class="dr-comp-alert ${state}">${esc(alert)}</div>` : ""}
    </div>`;
  };

  return `<section class="dr-section dr-section-tight">
    <div class="dr-section-head"><div>
      <h3 class="dr-section-title">เปรียบเทียบ Retention ระหว่างเกม</h3>
      <div class="dr-section-sub">ดูว่าแต่ละเกมรักษาผู้เล่นได้กี่เปอร์เซ็นต์ มีคนกลับมาเล่นจริงกี่คน และต่างจากช่วงปกติของเกมแค่ไหน</div>
    </div></div>
    <div class="dr-comparison"><table><thead><tr><th>เกม</th><th>D1 Retention</th><th>D3 Retention</th><th>D7 Retention</th><th>D14 Retention</th></tr></thead>
    <tbody>${games.map((game) => `<tr><td><strong>${esc(game.game_code)}</strong></td><td>${cell(game, "D1")}</td><td>${cell(game, "D3")}</td><td>${cell(game, "D7")}</td><td>${cell(game, "D14")}</td></tr>`).join("")}</tbody></table></div>
  </section>`;
}

function retentionCard(game, item) {
  const code = metricCode(item?.metric);
  const trend = trendFor(game.game_code, code);
  const state = String(item?.alert_state || "none").toLowerCase();
  const retained = int(item?.retained);
  const eligible = int(item?.eligible);
  const movement = relativeChangePresentation(item?.value, item?.baseline);

  return `<div class="dr-ret ${state}">
    <div class="dr-ret-head">
      <div>
        <div class="dr-ret-title">${esc(code)} Retention</div>
        <div class="dr-ret-desc">${esc(metricThai(code))}</div>
      </div>
      <div class="dr-ret-code">${esc(code)}</div>
    </div>

    <div class="dr-ret-rate">${pct(item?.value)}</div>
    <div class="dr-ret-people">${retained} จาก ${eligible} คนกลับมาเล่น</div>

    ${n(item?.baseline) !== null ? `<div class="dr-ret-normal">ปกติอยู่ราว <strong>${pct(item?.baseline)}</strong></div>` : ""}
    <div class="dr-ret-delta ${movement.cls}">
      <span>${movement.icon}</span>
      <strong>${esc(movement.text)}</strong>
    </div>

    <div class="dr-ret-date">กลุ่มผู้สมัครวันที่ ${formatDateTh(item?.cohort_date)}</div>
    ${trend.length >= 2 ? `<div class="dr-ret-trend-label">แนวโน้มย้อนหลัง ${view.window} วัน</div>${sparkline(trend)}` : ""}
    ${state !== "none" ? `<div class="dr-ret-pill">${pill(state)}</div>` : ""}
  </div>`;
}

function gameInsight(game) {
  const ai = aiSummaryForGame(game.game_code);
  if (ai?.summary_text) return String(ai.summary_text);

  const values = ["D1", "D3", "D7", "D14"].map((code) => {
    const metric = latestMilestone(game, code);
    return metric && n(metric.value) !== null ? `${code} ${pct(metric.value)}` : null;
  }).filter(Boolean);

  const biggestMove = maxBy(
    (game.milestones || []).filter((item) => n(item.diff_pp) !== null),
    (item) => Math.abs(n(item.diff_pp)),
  );

  if (!biggestMove) return `${values.join(" · ")}`;
  const code = metricCode(biggestMove.metric);
  const movement = relativeChangePresentation(biggestMove.value, biggestMove.baseline);
  return `${values.join(" · ")} · จุดที่เปลี่ยนจากช่วงย้อนหลังมากที่สุดคือ ${code} ${movement.icon} ${movement.text}`;
}

function gameCard(game) {
  const ai = aiSummaryForGame(game.game_code);
  return `<article class="dr-game-card">
    <div class="dr-game-head">
      <div class="dr-game-head-copy">
        <div class="dr-game-name">${esc(game.game_code)}</div>
        <div class="dr-game-insight">${esc(gameInsight(game))}</div>
        ${ai?.recommended_check ? `<div class="dr-game-ai-action">${icon("spark", "dr-ico dr-ico-sm")} <strong>ควรดูต่อ:</strong> ${esc(ai.recommended_check)}</div>` : ""}
      </div>
      <button class="dr-anomaly-link" data-open-anomalies="${esc(game.game_code)}" type="button">ดูจุดผิดปกติ →</button>
    </div>
    <div class="dr-ret-grid">${(game.milestones || []).map((item) => retentionCard(game, item)).join("")}</div>
  </article>`;
}

function renderOverview() {
  const data = overviewData();
  if (!data) return loadingOrError();
  const games = data.games || [];
  return `<section class="dr-context-card">
      <div><strong>ข้อมูล ณ วันที่ ${formatDateTh(selectedReportDate())}</strong></div>
      <div>D1–D14 อาจอ้างอิง Cohort คนละวัน กรุณาดูวันที่ Cohort และ Sample Size ประกอบก่อนสรุปผล</div>
      <div class="dr-context-muted">ข้อมูลครบถึง ${formatDateTh(dataCompleteThrough())}</div>
    </section>${overallSummary({ ...data, games })}${highlights({ ...data, games })}${comparison({ ...data, games })}
    <section class="dr-section dr-section-spacious"><div class="dr-section-head"><div><h3 class="dr-section-title">รายละเอียดรายเกม</h3><div class="dr-section-sub">ดูเปอร์เซ็นต์จริง จำนวนคนที่กลับมา เทียบค่าปกติย้อนหลัง และคำแนะนำสั้น ๆ ของแต่ละเกม</div></div></div>
    <div class="dr-games">${games.map(gameCard).join("")}</div></section>`;
}

function milestoneCell(item) {
  if (!item || String(item.maturity_status) === "collecting" || n(item.rate) === null) return `<div class="dr-cell-main">ยังวัดไม่ได้</div><div class="dr-cell-sub">ยังไม่ถึงช่วงวันที่ใช้วัด Retention นี้</div>`;
  return `<div class="dr-cell-main">${pct(item.rate)}</div><div class="dr-cell-sub">${int(item.retained)} จาก ${int(item.eligible)} คนกลับมาเล่น · ${historicalComparison(item.rate, item.baseline, item.diff_pp)}</div>`;
}
function selectedRangeText() {
  const { start, end } = visibleDateRange();
  return `${formatDateTh(start)} – ${formatDateTh(end)}`;
}
function emptyRows(message, colspan) {
  return `<tr><td colspan="${colspan}"><div class="dr-table-empty">
    ${icon("calendar", "dr-ico dr-ico-lg")}
    <div class="dr-table-empty-title">${esc(message)}</div>
    <div class="dr-table-empty-text">ลองเลือก Date ย้อนหลัง หรือเพิ่ม Trend Window เพื่อดูช่วงข้อมูลที่กว้างขึ้น</div>
  </div></td></tr>`;
}

function renderCohorts() {
  const data = view.cohortsEnvelope?.data;
  if (!data) return loadingOrError();
  const rows = rowsVisibleByReport(data.rows || [], "cohort_date");
  const ai = plainAiSummaryBlock(
    "cohort",
    view.game === "ALL" ? "กลุ่มผู้เล่นใหม่ของแต่ละเกมเป็นอย่างไร?" : `กลุ่มผู้เล่นใหม่ของ ${view.game} เป็นอย่างไร?`
  );
  return `${ai}
  <div class="dr-intro-note"><strong>กลุ่มผู้สมัคร:</strong> แต่ละแถวคือผู้เล่นที่สมัครในวันเดียวกัน เพื่อดูว่ากลุ่มไหนกลับมาเล่นต่อได้ดีหรืออ่อนกว่ากลุ่มอื่น</div>
  <div class="dr-panel"><div class="dr-panel-head"><div><div class="dr-panel-title">Retention ตามกลุ่มผู้สมัคร</div><div class="dr-panel-sub">ใช้ดูว่าผู้เล่นที่สมัครวันไหนกลับมาเล่นต่อมากหรือน้อยเป็นพิเศษ</div></div></div>
  <div class="dr-table-wrap"><table class="dr-table"><thead><tr><th>วันที่สมัคร</th><th>เกม</th><th>D1</th><th>D3</th><th>D7</th><th>D14</th></tr></thead><tbody>
  ${rows.length ? rows.map((row) => `<tr><td>${formatDateTh(row.cohort_date)}</td><td><strong>${esc(row.game_code)}</strong></td><td>${milestoneCell(row.milestones?.d1)}</td><td>${milestoneCell(row.milestones?.d3)}</td><td>${milestoneCell(row.milestones?.d7)}</td><td>${milestoneCell(row.milestones?.d14)}</td></tr>`).join("") : emptyRows(`ยังไม่มีข้อมูล Retention ของกลุ่มผู้สมัครในช่วง ${selectedRangeText()}`, 6)}
  </tbody></table></div></div>`;
}
function channelCell(item) {
  if (!item || String(item.maturity_status) === "collecting" || n(item.rate) === null) {
    return `<div class="dr-cell-main">ยังวัดไม่ได้</div><div class="dr-cell-sub">ยังไม่ถึงวันที่สามารถวัด Retention ช่วงนี้ได้</div>`;
  }
  return `<div class="dr-cell-main">${pct(item.rate)}</div>
    <div class="dr-cell-sub">${int(item.retained)} จาก ${int(item.eligible)} คนกลับมาเล่น</div>
    <div class="dr-cell-sub">${channelComparison(item.rate, item.game_rate, item.diff_vs_game_pp)}</div>`;
}
function renderChannels() {
  if (view.game === "ALL") return `<div class="dr-intro-note"><strong>เลือกเกมจากตัวกรองด้านบนก่อน</strong><br>จากนั้นดู Rate พร้อมจำนวนคนของ Facebook Ads, Google Ads หรือ Organic / Unknown เพื่อไม่ให้ Percentage จาก Sample เล็กทำให้เข้าใจผิด</div>`;
  const data = view.channelsEnvelope?.data;
  if (!data) return loadingOrError();
  const rows = rowsVisibleByReport(data.rows || [], "cohort_date");
  const ai = plainAiSummaryBlock(
    "channel",
    `ผู้เล่นจากแต่ละ Channel ของ ${view.game} เป็นอย่างไร?`
  );
  return `${ai}
  <div class="dr-intro-note"><strong>Retention ตามช่องทาง:</strong> ดูว่าผู้เล่นจากแต่ละช่องทางกลับมาเล่นต่อมากน้อยต่างกันแค่ไหน</div>
  <div class="dr-panel"><div class="dr-panel-head"><div><div class="dr-panel-title">Retention ตามช่องทาง · ${esc(view.game)}</div><div class="dr-panel-sub">ช่วยดูว่าช่องทางไหนพาผู้เล่นที่กลับมาเล่นต่อได้มากกว่า โดยควรดูจำนวนผู้เล่นประกอบด้วย</div></div></div>
  <div class="dr-table-wrap"><table class="dr-table"><thead><tr><th>วันที่สมัคร</th><th>ช่องทาง</th><th>D1</th><th>D3</th><th>D7</th><th>D14</th></tr></thead><tbody>
  ${rows.length ? rows.map((row) => `<tr><td>${formatDateTh(row.cohort_date)}</td><td><strong>${esc(row.db_channel)}</strong></td><td>${channelCell(row.milestones?.d1)}</td><td>${channelCell(row.milestones?.d3)}</td><td>${channelCell(row.milestones?.d7)}</td><td>${channelCell(row.milestones?.d14)}</td></tr>`).join("") : emptyRows(`ยังไม่มี Channel Retention ในช่วง ${selectedRangeText()}`, 6)}
  </tbody></table></div></div>`;
}
function anomalyValue(row, key) {
  const value = n(row[key]);
  if (value === null) return "—";
  return row.metric_family === "retention" ? pct(value) : int(value);
}
function renderAnomalies() {
  const data = view.anomaliesEnvelope?.data;
  if (!data) return loadingOrError();
  const rows = rowsVisibleByReport(data.rows || [], "metric_date");
  const ai = plainAiSummaryBlock(
    "anomaly",
    view.game === "ALL" ? "มีจุดไหนที่ควรตรวจสอบเป็นพิเศษ?" : `${view.game} มีจุดไหนที่ควรตรวจสอบเป็นพิเศษ?`
  );
  return `${ai}
  <div class="dr-intro-note"><strong>จุดผิดปกติ:</strong> รวมจุดที่ Retention เปลี่ยนจากรูปแบบเดิมมากพอที่จะควรเปิดดูรายละเอียดต่อ</div>
  <div class="dr-panel"><div class="dr-panel-head"><div><div class="dr-panel-title">จุดผิดปกติของ Retention</div><div class="dr-panel-sub">ใช้ดูว่า Game / Metric / วันที่ไหนควรถูกตรวจสอบก่อน</div></div>
  <div class="dr-controls"><label class="dr-control"><span class="dr-control-label">สถานะ</span><select id="dr-anomaly-status"><option value="open"${view.anomalyStatus === "open" ? " selected" : ""}>เปิดอยู่</option><option value="resolved"${view.anomalyStatus === "resolved" ? " selected" : ""}>แก้ไขแล้ว</option><option value="all"${view.anomalyStatus === "all" ? " selected" : ""}>ทั้งหมด</option></select></label>
  <label class="dr-control"><span class="dr-control-label">ระดับ</span><select id="dr-anomaly-severity"><option value="">ทั้งหมด</option><option value="critical"${view.anomalySeverity === "critical" ? " selected" : ""}>ผิดปกติชัดเจน</option><option value="warning"${view.anomalySeverity === "warning" ? " selected" : ""}>ควรตรวจสอบ</option><option value="watch"${view.anomalySeverity === "watch" ? " selected" : ""}>ควรจับตา</option></select></label></div></div>
  <div class="dr-table-wrap"><table class="dr-table"><thead><tr><th>วันที่</th><th>เกม</th><th>Metric</th><th>ระดับ</th><th>สถานะ</th><th class="dr-num">ค่าปัจจุบัน</th><th class="dr-num">ค่าปกติ</th><th class="dr-num">ผลต่าง</th><th class="dr-num">Eligible users</th></tr></thead><tbody>
  ${rows.length ? rows.map((row) => `<tr><td>${formatDateTh(row.metric_date)}</td><td><strong>${esc(row.game_code)}</strong></td><td>${row.metric_family === "retention" ? esc(metricCode(row.metric_name)) : esc(row.metric_name)}</td><td>${pill(row.severity)}</td><td>${esc(row.status || "—")}</td><td class="dr-num">${anomalyValue(row, "actual_value")}</td><td class="dr-num">${anomalyValue(row, "baseline_value")}</td><td class="dr-num">${row.metric_family === "retention" ? deltaPresentation(row.diff_pp).text : "—"}</td><td class="dr-num">${int(row.eligible_sample)}</td></tr>`).join("") : `<tr><td colspan="9"><div class="dr-empty">ยังไม่พบจุดที่ต้องตรวจสอบในช่วง ${esc(selectedRangeText())}</div></td></tr>`}
  </tbody></table></div></div>`;
}
function loadingOrError() {
  if (view.error) return `<div class="dr-error"><strong>โหลด Daily Retention ไม่สำเร็จ</strong><br>${esc(view.error)}</div>`;
  return `<div class="dr-loading">กำลังโหลดข้อมูล Retention…</div>`;
}
function content() {
  if (view.tab === "overview") return renderOverview();
  if (view.tab === "cohorts") return renderCohorts();
  if (view.tab === "channels") return renderChannels();
  return renderAnomalies();
}
function asOf() {
  const selected = selectedReportDate();
  return `<div class="dr-asof">ข้อมูล ณ <strong>${formatDateTh(selected)}</strong></div>`;
}
function tab(id, label, iconName) {
  return `<button class="dr-tab${view.tab === id ? " active" : ""}" data-tab="${id}" type="button">${icon(iconName, "dr-ico dr-ico-sm")}${esc(label)}</button>`;
}
function headerToolsMarkup() {
  const bounds = calendarBounds();
  const value = selectedReportDate();
  return `
    <div class="dr-header-tools-inner">
      <label class="dr-control dr-header-game">
        <span class="dr-control-label">เกม</span>
        <select id="dr-game">${options(GAMES, view.game)}</select>
      </label>
      <label class="dr-control dr-date-control">
        ${icon("calendar", "dr-ico dr-ico-sm")}
        <span class="dr-control-label">ข้อมูล ณ วันที่</span>
        <input id="dr-report-date" type="date"
          value="${esc(value)}"
          ${bounds.min ? `min="${esc(bounds.min)}"` : ""}
          ${bounds.max ? `max="${esc(bounds.max)}"` : ""}
          ${bounds.ready ? "" : "disabled"}>
      </label>
      <div class="dr-window dr-header-trend" aria-label="Trend history range">
        <span class="dr-window-label">แนวโน้ม</span>
        ${WINDOWS.map((value) => `<button class="dr-window-btn dr-trend-btn${view.window === value ? " active" : ""}" data-window="${value}" type="button">${value} วัน</button>`).join("")}
      </div>
      <button class="dr-btn" id="dr-refresh" type="button">${icon("refresh", "dr-ico dr-ico-sm")}อัปเดตข้อมูล</button>
    </div>`;
}
function renderHeaderTools() {
  const mount = document.getElementById("daily-retention-header-tools");
  if (!mount) return;
  mount.innerHTML = headerToolsMarkup();
  bindHeaderTools();
}
function bindHeaderTools() {
  document.getElementById("dr-game")?.addEventListener("change", async (event) => {
    view.game = event.target.value;
    view.loadedKeys.clear();
    view.overviewEnvelope = view.trendEnvelope = view.cohortsEnvelope = view.channelsEnvelope = view.anomaliesEnvelope = view.summaryEnvelope = null;
    await loadCurrent();
  });
  document.querySelectorAll("[data-window]").forEach((button) => button.addEventListener("click", async () => {
    view.window = Number(button.dataset.window);
    document.querySelectorAll("[data-window]").forEach((item) => item.classList.toggle("active", item === button));
    update();
  }));
  document.getElementById("dr-report-date")?.addEventListener("change", async (event) => {
    const next = event.target.value;
    const bounds = calendarBounds();
    if (!next || (bounds.min && next < bounds.min) || (bounds.max && next > bounds.max)) return;
    view.reportDate = next;
    view.summaryEnvelope = null;
    update();
    await loadSummary();
  });
  document.getElementById("dr-refresh")?.addEventListener("click", async () => {
    clearDailyRetentionClientCache();
    view.loadedKeys.clear();
    view.overviewEnvelope = view.trendEnvelope = view.cohortsEnvelope = view.channelsEnvelope = view.anomaliesEnvelope = view.summaryEnvelope = null;
    await loadCurrent({ refresh: true });
  });
}
function renderShell() {
  ensureStyle();
  return `<section class="dr-page" id="dr-page" data-ui-version="2.11.0" aria-label="Daily Retention">
    <div class="dr-tabs">${tab("overview", "ภาพรวม", "chart")}${tab("cohorts", "กลุ่มผู้สมัคร", "calendar")}${tab("channels", "ช่องทางผู้เล่น", "channel")}${tab("anomalies", "จุดผิดปกติ", "alert")}</div>
    <div id="dr-content" class="dr-content-stack">${content()}</div>
  </section>`;
}
function update() {
  const node = document.getElementById("dr-content");
  if (node) node.innerHTML = content();
  renderHeaderTools();
  bindDynamic();
}

function key() {
  if (view.tab === "overview") return `overview|${view.game}|${view.window}|${selectedReportDate()}`;
  if (view.tab === "cohorts") return `cohorts|${view.game}|${view.window}|${selectedReportDate()}`;
  if (view.tab === "channels") return `channels|${view.game}|${view.window}|${selectedReportDate()}`;
  return `anomalies|${view.game}|${view.window}|${selectedReportDate()}|${view.anomalyStatus}|${view.anomalySeverity}`;
}

function summaryKey() {
  return `summary|${view.game}|${selectedReportDate()}`;
}

async function loadSummary({ refresh = false } = {}) {
  const reportDate = selectedReportDate();
  if (!reportDate) return;
  try {
    view.summaryEnvelope = await fetchDailySummaries(
      { game: view.game, reportDate },
      { refresh },
    );
  } catch (error) {
    // AI Summary is an enhancement. It must never block deterministic Retention data.
    view.summaryEnvelope = null;
  }
  update();
}

async function loadCurrent({ refresh = false } = {}) {
  if (view.tab === "channels" && view.game === "ALL") {
    view.error = "";
    update();
    return;
  }
  const currentKey = key();
  if (!refresh && view.loadedKeys.has(currentKey)) {
    update();
    if (!view.summaryEnvelope) await loadSummary();
    return;
  }
  view.loading = true;
  view.error = "";
  update();
  try {
    if (view.tab === "overview") {
      const [overview, trend] = await Promise.all([
        fetchDailyOverview({ refresh }),
        fetchDailyCohorts({ game: view.game, window: HISTORY_WINDOW }, { refresh }),
      ]);
      view.overviewEnvelope = overview;
      view.trendEnvelope = trend;
      syncReportDateFromEnvelope(overview);
      syncReportDateFromEnvelope(trend);
      await loadSummary({ refresh });
    } else if (view.tab === "cohorts") {
      view.cohortsEnvelope = await fetchDailyCohorts({ game: view.game, window: HISTORY_WINDOW }, { refresh });
      syncReportDateFromEnvelope(view.cohortsEnvelope);
      await loadSummary({ refresh });
    } else if (view.tab === "channels") {
      view.channelsEnvelope = await fetchDailyChannels({ game: view.game, window: HISTORY_WINDOW }, { refresh });
      syncReportDateFromEnvelope(view.channelsEnvelope);
      await loadSummary({ refresh });
    } else {
      view.anomaliesEnvelope = await fetchDailyAnomalies({
        game: view.game,
        window: HISTORY_WINDOW,
        status: view.anomalyStatus,
        severity: view.anomalySeverity,
      }, { refresh });
      syncReportDateFromEnvelope(view.anomaliesEnvelope);
      await loadSummary({ refresh });
    }
    view.loadedKeys.add(currentKey);
  } catch (error) {
    view.error = error?.message || String(error);
  } finally {
    view.loading = false;
    update();
  }
}

function bindDynamic() {
  document.querySelectorAll("[data-open-anomalies]").forEach((button) => button.addEventListener("click", async () => {
    view.game = button.dataset.openAnomalies || "ALL";
    view.tab = "anomalies";
    view.anomaliesEnvelope = null;
    if (document.getElementById("dr-game")) document.getElementById("dr-game").value = view.game;
    document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item.dataset.tab === "anomalies"));
    update();
    await loadCurrent();
  }));
  document.getElementById("dr-anomaly-status")?.addEventListener("change", async (event) => {
    view.anomalyStatus = event.target.value; view.anomaliesEnvelope = null; await loadCurrent();
  });
  document.getElementById("dr-anomaly-severity")?.addEventListener("change", async (event) => {
    view.anomalySeverity = event.target.value; view.anomaliesEnvelope = null; await loadCurrent();
  });
}
export function renderDailyRetentionPage() { return renderShell(); }
export function bindDailyRetentionPage() {
  renderHeaderTools();
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", async () => {
    if (!TABS.includes(button.dataset.tab) || button.dataset.tab === view.tab) return;
    view.tab = button.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item.dataset.tab === view.tab));
    update();
    await loadCurrent();
  }));
  bindDynamic();
  loadCurrent();
}
