import { APP_CONFIG } from "../config.js";
import { getState, setFilters, setRawCheck } from "../state.js";
import { callAuthorized, assertSuccessfulPayload, normalizePayload } from "../api.js";
import { icon, statusPill, escapeHtml, showToast, optionMarkup } from "../ui.js";

const ACTIVE_KEY = "cqr_raw_check_active_request_id";
const HISTORY_KEY = "cqr_raw_check_browser_history";
let pollTimer = null;
let polling = false;
const specificGames = APP_CONFIG.games.filter((item) => item.value !== "ALL");

function readHistory() { try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function writeHistory(row) { const rows = [row, ...readHistory().filter((item) => item.requestId !== row.requestId)].slice(0, 10); localStorage.setItem(HISTORY_KEY, JSON.stringify(rows)); }
function tone(status) { return ["completed", "raw_ready"].includes(status) ? "ready" : ["failed", "raw_missing"].includes(status) ? "danger" : ["running", "queued"].includes(status) ? status : "warning"; }
function progress(raw) { if (["completed", "failed"].includes(raw.status)) return 100; if (raw.totalJobs) return Math.min(99, Math.round(((raw.completedJobs + raw.failedJobs + raw.runningJobs * 0.5) / raw.totalJobs) * 100)); return raw.status === "running" ? 50 : raw.status === "queued" ? 15 : 0; }
function clearPollTimer() { if (pollTimer) clearTimeout(pollTimer); pollTimer = null; }

function readActive() {
  const raw = localStorage.getItem(ACTIVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.requestId) return parsed;
  } catch {}
  return { requestId: raw, game: "", month: "" };
}
function writeActive(value) { localStorage.setItem(ACTIVE_KEY, JSON.stringify(value)); }

function renderJobs(raw) {
  const jobs = raw.jobs || [];
  return jobs.length ? `<div class="table-wrap"><table><thead><tr><th>Game</th><th>Period</th><th>Status</th><th>Result</th><th>Tabs</th><th>Raw Hash</th></tr></thead><tbody>${jobs.map((job) => `<tr><td>${escapeHtml(job.game_code)}</td><td>${escapeHtml(job.period_key)}</td><td>${statusPill(tone(job.status), escapeHtml(job.status))}</td><td>${escapeHtml(job.result_status || "-")}</td><td>${escapeHtml(job.tab_count_found ?? "-")} / ${escapeHtml(job.tab_count_expected ?? 5)}</td><td class="code-chip">${escapeHtml(job.raw_data_hash || "-")}</td></tr>`).join("")}</tbody></table></div>` : "";
}

export function renderCheckRawPage() {
  const state = getState();
  const raw = state.rawCheck;
  const history = readHistory();
  return `<div class="page-grid"><section class="grid-wide-aside"><article class="surface-card warm-card"><div class="card-header"><div><h2 class="card-title">Check Raw</h2><p class="card-description">ส่ง Request เข้า Queue แล้วติดตามสถานะตาม poll_after_ms ของ Backend</p></div>${statusPill(tone(raw.status), raw.status === "idle" ? "Ready" : raw.status)}</div><div class="card-body"><div class="form-grid two"><label class="form-field"><span class="form-label">Game</span><select class="form-control" id="raw-game">${optionMarkup(specificGames, state.filters.game === "ALL" ? specificGames[0].value : state.filters.game)}</select></label><label class="form-field"><span class="form-label">Month</span><select class="form-control" id="raw-month">${optionMarkup(APP_CONFIG.months, state.filters.month === "ALL" ? APP_CONFIG.months[0].value : state.filters.month)}</select></label></div><div class="toolbar" style="margin-top:14px"><button class="button primary" id="raw-submit" type="button" ${["queued", "running"].includes(raw.status) ? "disabled" : ""}>${icon("play", "nav-icon")} ${["queued", "running"].includes(raw.status) ? "Request active" : "Run Raw Check"}</button>${raw.requestId ? `<button class="button" id="raw-refresh" type="button">${icon("refresh", "nav-icon")} Refresh Status</button><button class="button" id="raw-copy" type="button">${icon("copy", "nav-icon")} Copy Request ID</button>` : ""}</div><div class="notice warning" style="margin-top:14px">Manual Raw Check ต้องเลือก Game และ Month อย่างละ 1 ค่า ระบบไม่อนุญาต ALL</div></div></article><aside class="surface-card"><div class="card-header"><div><h2 class="card-title">Active Request</h2><p class="card-description">Reload หน้าแล้วระบบจะกลับมาติดตาม Request เดิม</p></div></div><div class="card-body"><div class="metric-grid"><div class="metric-box"><div class="metric-label">Request ID</div><div class="metric-value code-chip">${escapeHtml(raw.requestId || "-")}</div></div><div class="metric-box"><div class="metric-label">Scope</div><div class="metric-value">${escapeHtml(raw.game || "-")} / ${escapeHtml(raw.month || "-")}</div></div><div class="metric-box"><div class="metric-label">Progress</div><div class="metric-value">${progress(raw)}%</div></div><div class="metric-box"><div class="metric-label">Current Job</div><div class="metric-value">${escapeHtml(raw.currentGame || "-")} ${escapeHtml(raw.currentMonth || "")}</div></div></div></div></aside></section><article class="surface-card"><div class="card-header"><div><h2 class="card-title">Queue Status</h2><p class="card-description">Controller → Queue → Worker → Completed / Failed</p></div></div><div class="card-body"><div class="progress-track"><div class="progress-fill" style="width:${progress(raw)}%"></div></div><div class="metric-grid four" style="margin-top:14px"><div class="metric-box"><div class="metric-label">Queued</div><div class="metric-value">${raw.queuedJobs}</div></div><div class="metric-box"><div class="metric-label">Running</div><div class="metric-value">${raw.runningJobs}</div></div><div class="metric-box"><div class="metric-label">Completed</div><div class="metric-value">${raw.completedJobs}</div></div><div class="metric-box"><div class="metric-label">Failed</div><div class="metric-value">${raw.failedJobs}</div></div></div>${raw.errorMessage ? `<div class="notice danger" style="margin-top:12px">${escapeHtml(raw.errorMessage)}</div>` : ""}${raw.status === "completed" ? `<div class="metric-grid four" style="margin-top:14px"><div class="metric-box"><div class="metric-label">Result</div><div class="metric-value">${escapeHtml(raw.resultStatus || "-")}</div></div><div class="metric-box"><div class="metric-label">Tabs</div><div class="metric-value">${escapeHtml(raw.tabsFound)} / ${escapeHtml(raw.tabsExpected)}</div></div><div class="metric-box"><div class="metric-label">Missing Tabs</div><div class="metric-value">${escapeHtml(raw.missingTabs || "-")}</div></div><div class="metric-box"><div class="metric-label">Raw Hash</div><div class="metric-value code-chip">${escapeHtml(raw.rawHash || "-")}</div></div></div>` : ""}${renderJobs(raw)}</div></article><article class="surface-card"><div class="card-header"><div><h2 class="card-title">Recent Requests</h2><p class="card-description">ประวัติใน Browser นี้เท่านั้น ข้อมูลกลางอยู่ที่ RawCheckRequests / RawCheckJobs</p></div></div><div class="card-body">${history.length ? `<div class="table-wrap"><table><thead><tr><th>Request ID</th><th>Scope</th><th>Status</th><th>Finished</th></tr></thead><tbody>${history.map((item) => `<tr><td class="code-chip">${escapeHtml(item.requestId)}</td><td>${escapeHtml(item.game)} / ${escapeHtml(item.month)}</td><td>${statusPill(tone(item.status), escapeHtml(item.status))}</td><td>${escapeHtml(item.finishedAt || "-")}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state">ยังไม่มีประวัติใน Browser นี้</div>'}</div></article></div>`;
}

function applyStatus(result) {
  const payload = normalizePayload(result);
  const status = String(payload.status || "queued");
  const terminal = ["completed", "failed"].includes(status);
  const job = (payload.jobs || [])[0] || {};
  const current = getState().rawCheck;
  const requestId = payload.request_id || current.requestId;
  const game = payload.target_games_csv || payload.current_game_code || current.game;
  const month = payload.target_months_csv || payload.current_period_key || current.month;
  setRawCheck({
    requestId, game, month, status,
    resultStatus: job.result_status || payload.result_status || "",
    totalJobs: Number(payload.total_jobs || 0), queuedJobs: Number(payload.queued_jobs || 0),
    runningJobs: Number(payload.running_jobs || 0), completedJobs: Number(payload.completed_jobs || 0), failedJobs: Number(payload.failed_jobs || 0),
    currentGame: payload.current_game_code || "", currentMonth: payload.current_period_key || "",
    tabsFound: job.tab_count_found ?? "-", tabsExpected: job.tab_count_expected ?? 5,
    missingTabs: job.missing_tabs || "", rawHash: job.raw_data_hash || "",
    finishedAt: payload.finished_at || job.finished_at || "", errorMessage: payload.error_message || job.error_message || "", jobs: payload.jobs || [],
  });
  if (terminal) {
    clearPollTimer();
    localStorage.removeItem(ACTIVE_KEY);
    writeHistory({ requestId, game, month, status, finishedAt: payload.finished_at || new Date().toISOString() });
  } else {
    writeActive({ requestId, game, month });
  }
  return payload;
}

async function poll(requestId, { immediate = false } = {}) {
  if (!requestId || polling) return;
  if (immediate) clearPollTimer();
  polling = true;
  try {
    const result = await callAuthorized("admin.n8n.raw.status", { request_id: requestId });
    const payload = assertSuccessfulPayload(result, "Raw Check status");
    let finalResult = payload;
    if (["completed", "failed"].includes(String(payload.status))) {
      try {
        const details = await callAuthorized("admin.n8n.raw.status", { request_id: requestId, include_jobs: "true" });
        finalResult = assertSuccessfulPayload(details, "Raw Check job details");
      } catch (detailError) {
        finalResult = { ...payload, error_message: payload.error_message || `Job details unavailable: ${detailError.message || detailError}` };
      }
    }
    const applied = applyStatus(finalResult);
    if (!["completed", "failed"].includes(String(applied.status))) {
      pollTimer = setTimeout(() => poll(requestId), Math.max(1000, Number(applied.poll_after_ms || 5000)));
    }
  } catch (error) {
    setRawCheck({ errorMessage: error.message || String(error) });
    if (/Session/i.test(error.message || "")) return;
    pollTimer = setTimeout(() => poll(requestId), 5000);
  } finally {
    polling = false;
  }
}

async function submit() {
  const game = document.getElementById("raw-game")?.value;
  const month = document.getElementById("raw-month")?.value;
  if (!game || game === "ALL" || !month || month === "ALL") { showToast("เลือก Game และ Month อย่างละ 1 ค่า"); return; }
  clearPollTimer();
  setFilters({ game, month });
  setRawCheck({
    requestId: "", game, month, status: "queued", resultStatus: "", totalJobs: 1, queuedJobs: 1,
    runningJobs: 0, completedJobs: 0, failedJobs: 0, currentGame: "", currentMonth: "",
    tabsFound: "-", tabsExpected: 5, missingTabs: "", rawHash: "", finishedAt: "", errorMessage: "", jobs: [],
  });
  localStorage.removeItem(ACTIVE_KEY);
  try {
    const result = await callAuthorized("admin.n8n.raw.check", { game, month, target_game_code: game, target_month: month, target_games_csv: game, target_months_csv: month, check_mode: "manual", expected_tabs_csv: "Registered,DAU,Returners,Late_Starters,Login" }, 60000);
    const payload = assertSuccessfulPayload(result, "Raw Check request");
    const requestId = payload.request_id || result.request_id;
    if (!requestId) throw new Error("Backend ไม่ได้ส่ง request_id กลับมา");
    writeActive({ requestId, game, month });
    setRawCheck({ requestId, status: payload.status === "accepted" ? "queued" : (payload.status || "queued"), totalJobs: Number(payload.total_jobs || 1), queuedJobs: Number(payload.queued_jobs ?? 1) });
    poll(requestId, { immediate: true });
  } catch (error) {
    localStorage.removeItem(ACTIVE_KEY);
    setRawCheck({ status: "failed", failedJobs: 1, queuedJobs: 0, errorMessage: error.message || String(error) });
  }
}

export function bindCheckRawPage() {
  document.getElementById("raw-submit")?.addEventListener("click", submit);
  document.getElementById("raw-refresh")?.addEventListener("click", () => poll(getState().rawCheck.requestId, { immediate: true }));
  document.getElementById("raw-copy")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(getState().rawCheck.requestId); showToast("Copied Request ID"); }
    catch { showToast("Copy ไม่สำเร็จ กรุณาเลือก Request ID แล้วคัดลอกเอง"); }
  });
  const active = readActive();
  if (active?.requestId && !getState().rawCheck.requestId) {
    setRawCheck({ requestId: active.requestId, game: active.game || "", month: active.month || "", status: "queued" });
    poll(active.requestId, { immediate: true });
  } else if (active?.requestId && !["completed", "failed"].includes(getState().rawCheck.status)) {
    poll(active.requestId);
  }
}
