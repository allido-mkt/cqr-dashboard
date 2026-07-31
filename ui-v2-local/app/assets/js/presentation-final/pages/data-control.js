import { APP_CONFIG } from "../config.js";
import { getState, setControl, setFilters, setRoute } from "../state.js";
import { callAuthorized, normalizePayload, assertSuccessfulPayload } from "../api.js";
import { escapeHtml, icon, optionMarkup, statusPill, showToast, openConfirmModal } from "../ui.js";

const LOG_KEY = "cqr_admin_action_logs";
const HANDOFF_KEY = "cqr_data_control_handoff";
let actionBusy = false;

function logs() { try { const value = JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function addLog(action, result, scope) {
  const payload = normalizePayload(result);
  const status = String(payload?.status || (payload?.ok === false ? "failed" : "completed"));
  const row = { at: new Date().toISOString(), action, game: scope.game, month: scope.month, runId: scope.runId || "", status, requestId: result?.request_id || payload?.request_id || "", message: payload?.message || result?.message || "" };
  localStorage.setItem(LOG_KEY, JSON.stringify([row, ...logs()].slice(0, 100)));
}
function exactScope() {
  const state = getState();
  return {
    game: state.filters.game === "ALL" ? APP_CONFIG.games.find((item) => item.value !== "ALL").value : state.filters.game,
    month: state.filters.month === "ALL" ? APP_CONFIG.months[0].value : state.filters.month,
  };
}
function controlFilters() {
  const scope = exactScope();
  return `<div class="form-grid two"><label class="form-field"><span class="form-label">Game</span><select id="control-game" class="form-control">${optionMarkup(APP_CONFIG.games.filter((item) => item.value !== "ALL"), scope.game)}</select></label><label class="form-field"><span class="form-label">Month</span><select id="control-month" class="form-control">${optionMarkup(APP_CONFIG.months, scope.month)}</select></label></div>`;
}
function guide(active) {
  return `<div class="workflow-steps">${[["history", "1", "History"], ["preview", "2", "Preview"], ["clear", "3", "Clear"], ["build", "4", "Build"]].map(([id, number, label]) => `<div class="workflow-step${id === active ? " active" : ""}"><span>${number}</span><b>${label}</b></div>`).join("")}</div>`;
}
function selectedRun() { const control = getState().control; return control.lookupRuns.find((run) => run.run_id === control.selectedRuns[0]) || null; }
function extractRuns(result) {
  const payload = normalizePayload(result);
  if (Array.isArray(result?.matches)) return result.matches;
  if (Array.isArray(result?.runs)) return result.runs;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.runs)) return payload.runs;
  if (Array.isArray(payload)) return payload;
  return [];
}
function lockedScopeForRun(run) {
  const selected = exactScope();
  const runGame = run.game_code || run.game || selected.game;
  const runMonth = run.period_key || run.month || selected.month;
  if (runGame !== selected.game || runMonth !== selected.month) {
    throw new Error(`Run scope mismatch: selected ${selected.game}/${selected.month}, run is ${runGame}/${runMonth}`);
  }
  return { game: runGame, month: runMonth, runId: run.run_id, hash: run.data_hash_after || run.data_hash_before || "" };
}

export function renderDataControlHistoryPage() {
  const rows = logs();
  return `<div class="page-grid">${guide("history")}<article class="surface-card"><div class="card-header"><div><h2 class="card-title">Work History</h2><p class="card-description">ประวัติการกดเครื่องมือใน Browser นี้เท่านั้น; หลักฐานกลางต้องตรวจ PipelineLogs / AdminActionLogs / n8n executions</p></div><button id="history-clear-local" class="button ghost" type="button">Clear local history</button></div><div class="card-body">${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Scope</th><th>Run ID</th><th>Status</th><th>Request ID</th><th>Message</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.at)}</td><td>${escapeHtml(row.action)}</td><td>${escapeHtml(row.game)} / ${escapeHtml(row.month)}</td><td class="code-chip">${escapeHtml(row.runId || "-")}</td><td>${statusPill(row.status, escapeHtml(row.status))}</td><td class="code-chip">${escapeHtml(row.requestId || "-")}</td><td>${escapeHtml(row.message || "-")}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state">ยังไม่มีประวัติใน Browser นี้</div>'}</div></article></div>`;
}

export function bindDataControlHistoryPage() {
  document.getElementById("history-clear-local")?.addEventListener("click", () => openConfirmModal({ title: "Clear local history", message: "ลบประวัติ Data Control ที่เก็บใน Browser นี้?", confirmLabel: "Clear", danger: true, onConfirm: () => { localStorage.removeItem(LOG_KEY); window.dispatchEvent(new Event("cqr-page-refresh")); } }));
}

export function renderDataControlPreviewPage() {
  const control = getState().control;
  const noMatches = control.lookupPerformed && !control.lookupRuns.length && !actionBusy;
  return `<div class="page-grid">${guide("preview")}<section class="grid-wide-aside"><article class="surface-card warm-card"><div class="card-header"><div><h2 class="card-title">Find & Preview Run</h2><p class="card-description">ค้นหา Run ID / Hash แล้ว Preview ก่อน Clear ทุกครั้ง</p></div>${statusPill(actionBusy ? "running" : control.previewToken ? "ready" : "warm", actionBusy ? "Working" : control.previewToken ? "Preview ready" : "Ready")}</div><div class="card-body">${controlFilters()}<label class="form-field" style="margin-top:12px"><span class="form-label">Run ID / Hash</span><input id="control-query" class="form-control" value="${escapeHtml(control.lookupQuery || "")}" placeholder="RUN-... หรือ hash"></label><div class="toolbar" style="margin-top:14px"><button id="lookup-run" class="button primary" type="button" ${actionBusy ? "disabled" : ""}>${icon("search", "nav-icon")} Find Runs</button><button id="preview-run" class="button warm" type="button" ${actionBusy || !control.selectedRuns.length ? "disabled" : ""}>Preview Selected Run</button></div>${control.error ? `<div class="notice danger">${escapeHtml(control.error)}</div>` : ""}${noMatches ? '<div class="notice warning">ไม่พบ Run ที่ตรงกับ Scope และคำค้นหา</div>' : ""}</div></article><aside class="surface-card"><div class="card-header"><div><h2 class="card-title">Locked Scope</h2><p class="card-description">Clear และ Build จะใช้ Scope นี้เท่านั้น</p></div></div><div class="card-body"><div class="metric-grid"><div class="metric-box"><div class="metric-label">Game / Month</div><div class="metric-value">${escapeHtml(control.previewScope?.game || "-")} / ${escapeHtml(control.previewScope?.month || "-")}</div></div><div class="metric-box"><div class="metric-label">Run ID</div><div class="metric-value code-chip">${escapeHtml(control.previewScope?.runId || "-")}</div></div><div class="metric-box"><div class="metric-label">Preview Receipt</div><div class="metric-value code-chip">${escapeHtml(control.previewToken || "-")}</div></div></div></div></aside></section>${control.lookupRuns.length ? `<article class="surface-card"><div class="card-header"><div><h2 class="card-title">Matching Runs</h2><p class="card-description">เลือกหนึ่ง Run เท่านั้น</p></div></div><div class="card-body"><div class="table-wrap"><table><thead><tr><th></th><th>Run ID</th><th>Game</th><th>Month</th><th>Status</th><th>Hash Before</th><th>Hash After</th><th>Rows</th></tr></thead><tbody>${control.lookupRuns.map((run) => `<tr><td><input type="radio" name="run-select" value="${escapeHtml(run.run_id)}" ${control.selectedRuns[0] === run.run_id ? "checked" : ""}></td><td class="code-chip">${escapeHtml(run.run_id)}</td><td>${escapeHtml(run.game_code)}</td><td>${escapeHtml(run.period_key)}</td><td>${statusPill(run.status, escapeHtml(run.status))}</td><td class="code-chip">${escapeHtml(run.data_hash_before || "-")}</td><td class="code-chip">${escapeHtml(run.data_hash_after || "-")}</td><td>${escapeHtml(run.rows_written || run.rows_read || "-")}</td></tr>`).join("")}</tbody></table></div></div></article>` : ""}${control.previewResult ? `<article class="surface-card"><div class="card-header"><div><h2 class="card-title">Preview Result</h2></div><button class="button primary" data-route="data-control-clear" type="button">Continue to Clear</button></div><div class="card-body"><pre class="json-preview">${escapeHtml(JSON.stringify(control.previewResult, null, 2))}</pre></div></article>` : ""}</div>`;
}

async function lookup() {
  const game = document.getElementById("control-game")?.value;
  const month = document.getElementById("control-month")?.value;
  const query = document.getElementById("control-query")?.value.trim() || "";
  setFilters({ game, month });
  setControl({ lookupQuery: query, lookupPerformed: false, error: "", lookupRuns: [], selectedRuns: [], lookupResult: null, previewToken: "", previewScope: null, previewResult: null, lastClearAt: "", clearResult: null, lastBuildAt: "", buildResult: null, buildProgress: 0 });
  actionBusy = true;
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const result = await callAuthorized("admin.pipeline.run.lookup", { game, month, query }, 60000);
    assertSuccessfulPayload(result, "Run lookup");
    const runs = extractRuns(result).filter((run) => (!run.game_code || run.game_code === game) && (!run.period_key || run.period_key === month));
    setControl({ lookupResult: result, lookupRuns: runs, lookupPerformed: true, selectedRuns: runs[0]?.run_id ? [runs[0].run_id] : [] });
  } catch (error) {
    setControl({ lookupPerformed: true, error: error.message || String(error) });
  } finally {
    actionBusy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

async function preview() {
  const run = selectedRun();
  if (!run) { showToast("เลือก Run ก่อน"); return; }
  actionBusy = true;
  setControl({ error: "" });
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const scope = lockedScopeForRun(run);
    const params = { game: scope.game, month: scope.month, run_id: scope.runId, run_ids: JSON.stringify([scope.runId]), run_items: JSON.stringify([{ run_id: scope.runId, game_code: scope.game, period_key: scope.month }]), cleanup_hash: scope.hash, hash: scope.hash };
    const result = await callAuthorized("admin.n8n.cleanup.preview", params, 60000);
    const payload = assertSuccessfulPayload(result, "Cleanup preview");
    const receipt = String(payload.preview_token || payload.receipt || result.request_id || payload.request_id || `PREVIEW-${Date.now()}-${scope.runId}`);
    setControl({ previewToken: receipt, previewAt: new Date().toISOString(), previewResult: payload, previewScope: scope, clearResult: null, lastClearAt: "", buildResult: null, lastBuildAt: "", buildProgress: 0, error: "" });
    addLog("Preview", result, scope);
    showToast("Preview completed");
  } catch (error) {
    setControl({ previewToken: "", previewScope: null, previewResult: null, error: error.message || String(error) });
  } finally {
    actionBusy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

function consumeHandoff() {
  const raw = sessionStorage.getItem(HANDOFF_KEY);
  if (!raw || getState().control.lookupQuery) return false;
  sessionStorage.removeItem(HANDOFF_KEY);
  try {
    const handoff = JSON.parse(raw);
    const game = handoff.target_game_code || getState().filters.game;
    const month = handoff.target_month || getState().filters.month;
    const query = handoff.run_id || handoff.search_hash || "";
    setFilters({ game, month });
    setControl({ lookupQuery: query });
    return true;
  } catch {
    return false;
  }
}

export function bindDataControlPreviewPage() {
  if (consumeHandoff()) return;
  document.getElementById("lookup-run")?.addEventListener("click", lookup);
  document.getElementById("preview-run")?.addEventListener("click", preview);
  document.querySelectorAll('input[name="run-select"]').forEach((radio) => radio.addEventListener("change", () => setControl({ selectedRuns: [radio.value], previewToken: "", previewScope: null, previewResult: null, lastClearAt: "", clearResult: null, lastBuildAt: "", buildResult: null })));
  document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.route)));
}

export function renderDataControlClearPage() {
  const control = getState().control;
  const scope = control.previewScope;
  const phrase = scope ? `CLEAR ${scope.game} ${scope.month}` : "";
  return `<div class="page-grid">${guide("clear")}<article class="surface-card danger-card"><div class="card-header"><div><h2 class="card-title">Clear Selected Run</h2><p class="card-description">การลบจริงต้องมี Preview Receipt และ Scope ที่ล็อกไว้</p></div>${statusPill(control.lastClearAt ? "ready" : scope ? "warning" : "danger", control.lastClearAt ? "Completed" : scope ? "Confirmation required" : "Preview required")}</div><div class="card-body">${scope ? `<div class="metric-grid"><div class="metric-box"><div class="metric-label">Scope</div><div class="metric-value">${escapeHtml(scope.game)} / ${escapeHtml(scope.month)}</div></div><div class="metric-box"><div class="metric-label">Run ID</div><div class="metric-value code-chip">${escapeHtml(scope.runId)}</div></div><div class="metric-box"><div class="metric-label">Preview Receipt</div><div class="metric-value code-chip">${escapeHtml(control.previewToken)}</div></div></div><div class="notice danger" style="margin-top:14px">พิมพ์ <b>${escapeHtml(phrase)}</b> และยืนยัน Checkbox ก่อนดำเนินการ</div><label class="form-field" style="margin-top:12px"><span class="form-label">Confirmation phrase</span><input id="clear-phrase" class="form-control" autocomplete="off"></label><label class="checkbox-row"><input id="clear-ack" type="checkbox"><span>ฉันตรวจ Scope และ Preview Result แล้ว</span></label><button id="clear-run" class="button danger" type="button" ${actionBusy || control.lastClearAt ? "disabled" : ""}>${icon("trash", "nav-icon")} Clear Run</button>` : '<div class="empty-state">กลับไป Preview และเลือก Run ก่อน</div>'}${control.error ? `<div class="notice danger">${escapeHtml(control.error)}</div>` : ""}${control.clearResult ? `<pre class="json-preview">${escapeHtml(JSON.stringify(control.clearResult, null, 2))}</pre>` : ""}</div></article></div>`;
}

async function clearNow() {
  const control = getState().control;
  const scope = control.previewScope;
  if (!scope || !control.previewToken) return;
  actionBusy = true;
  setControl({ error: "" });
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const result = await callAuthorized("admin.n8n.cleanup.run", { game: scope.game, month: scope.month, run_id: scope.runId, run_ids: JSON.stringify([scope.runId]), run_items: JSON.stringify([{ run_id: scope.runId, game_code: scope.game, period_key: scope.month }]), cleanup_hash: scope.hash || "", hash: scope.hash || "", preview_receipt: control.previewToken }, 60000);
    const payload = assertSuccessfulPayload(result, "Cleanup run");
    setControl({ lastClearAt: new Date().toISOString(), clearResult: payload, error: "" });
    addLog("Clear", result, scope);
    showToast("Clear completed");
  } catch (error) {
    setControl({ lastClearAt: "", clearResult: null, error: error.message || String(error) });
  } finally {
    actionBusy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

export function bindDataControlClearPage() {
  const control = getState().control;
  const scope = control.previewScope;
  if (!scope) return;
  const phrase = `CLEAR ${scope.game} ${scope.month}`;
  document.getElementById("clear-run")?.addEventListener("click", () => {
    if (document.getElementById("clear-phrase")?.value.trim() !== phrase || !document.getElementById("clear-ack")?.checked) { showToast("Confirmation ยังไม่ครบ"); return; }
    openConfirmModal({ title: "Final Clear Confirmation", message: `ล้างข้อมูล Run ${scope.runId} ของ ${scope.game} / ${scope.month}?`, confirmLabel: "Clear Run", danger: true, onConfirm: clearNow });
  });
}

export function renderDataControlBuildPage() {
  const control = getState().control;
  const scope = control.previewScope;
  const ready = Boolean(scope && control.previewToken && control.lastClearAt);
  return `<div class="page-grid">${guide("build")}<article class="surface-card warm-card"><div class="card-header"><div><h2 class="card-title">Build Master Data</h2><p class="card-description">Build ใช้ Scope เดียวกับ Preview/Clear และต้องผ่าน Prerequisite</p></div>${statusPill(control.lastBuildAt ? "ready" : ready ? "warning" : "danger", control.lastBuildAt ? "Completed" : ready ? "Ready" : "Blocked")}</div><div class="card-body"><div class="prerequisite-list"><div class="prerequisite"><span>Preview receipt exists</span>${statusPill(control.previewToken ? "ready" : "danger", control.previewToken ? "Pass" : "Missing")}</div><div class="prerequisite"><span>Clear completed for locked scope</span>${statusPill(control.lastClearAt ? "ready" : "danger", control.lastClearAt ? "Pass" : "Missing")}</div><div class="prerequisite"><span>Specific Game and Month</span>${statusPill(scope && scope.game !== "ALL" && scope.month !== "ALL" ? "ready" : "danger", scope ? `${scope.game} / ${scope.month}` : "Missing")}</div></div><div class="toolbar" style="margin-top:16px"><button id="build-run" class="button primary" type="button" ${!ready || actionBusy || control.lastBuildAt ? "disabled" : ""}>${icon("build", "nav-icon")} Build Master</button><button class="button" data-route="pipeline-check" type="button">Verify with Pipeline Check</button></div>${control.error ? `<div class="notice danger">${escapeHtml(control.error)}</div>` : ""}${control.buildResult ? `<pre class="json-preview">${escapeHtml(JSON.stringify(control.buildResult, null, 2))}</pre>` : ""}</div></article></div>`;
}

async function build() {
  const control = getState().control;
  const scope = control.previewScope;
  if (!scope || !control.lastClearAt) return;
  actionBusy = true;
  setControl({ error: "" });
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const result = await callAuthorized("admin.n8n.master.run", { game: scope.game, month: scope.month, run_id: scope.runId, preview_receipt: control.previewToken }, 60000);
    const payload = assertSuccessfulPayload(result, "Master build");
    setControl({ lastBuildAt: new Date().toISOString(), buildResult: payload, buildProgress: 100, error: "" });
    addLog("Build", result, scope);
    showToast("Build completed");
  } catch (error) {
    setControl({ lastBuildAt: "", buildResult: null, buildProgress: 0, error: error.message || String(error) });
  } finally {
    actionBusy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

export function bindDataControlBuildPage() {
  document.getElementById("build-run")?.addEventListener("click", build);
  document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.route)));
}
