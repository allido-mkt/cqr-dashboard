import { APP_CONFIG } from "../config.js";
import { getState, setControl, setFilters, setRoute } from "../state.js?v=3515";
import { callAuthorized, normalizePayload, assertSuccessfulPayload } from "../services/admin-api.js";
import { escapeHtml, icon, optionMarkup, statusPill, showToast, openConfirmModal } from "../ui.js";

const LOG_KEY = "cqr_admin_action_logs";
const HANDOFF_KEY = "cqr_data_control_handoff";
const FIRST_BUILD_KEY = "cqr_first_build_scope";
const CLEANUP_PREVIEW_TIMEOUT_MS = 180000;
const CLEANUP_RUN_TIMEOUT_MS = 300000;
let actionBusy = false;
let repairRecoveryBusy = false;
let repairRecoveryAttemptedKey = "";

function isUsableRawStatus(status) {
  return ["raw_ready", "raw_updated"].includes(String(status || "").toLowerCase());
}

function logs() {
  try {
    const value = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function addLog(action, result, scope) {
  const payload = normalizePayload(result);
  const status = String(payload?.status || (payload?.ok === false ? "failed" : "completed"));
  const row = {
    at: new Date().toISOString(),
    action,
    game: scope.game,
    month: scope.month,
    runId: scope.runId || "",
    rawHash: scope.rawHash || scope.hash || "",
    status,
    requestId: result?.request_id || payload?.request_id || "",
    message: payload?.message || result?.message || "",
  };
  localStorage.setItem(LOG_KEY, JSON.stringify([row, ...logs()].slice(0, 100)));
}


let centralHistory = {
  status: "idle",
  rows: [],
  error: "",
};

function centralHistoryRows(result) {
  const payload = normalizePayload(result);
  const rows = Array.isArray(result?.activities)
    ? result.activities
    : Array.isArray(payload?.activities)
      ? payload.activities
      : [];

  return rows.map((row) => ({
    at: row.created_at || row.at || "",
    requestedBy: row.requested_by || "",
    action: row.action || "",
    game: row.game || "",
    month: row.month || "",
    runId: row.run_id || row.runId || "",
    rawHash: row.hash || row.raw_hash || row.rawHash || "",
    status: row.status || "",
    requestId: row.request_id || row.requestId || "",
    message: row.message || "",
  }));
}

async function loadCentralHistory(force = false) {
  if (!force && ["loading", "ready"].includes(centralHistory.status)) return;

  centralHistory = {
    ...centralHistory,
    status: "loading",
    error: "",
  };
  window.dispatchEvent(new Event("cqr-page-refresh"));

  try {
    const result = await callAuthorized("admin.activity.list", { limit: 100 }, 60000);
    assertSuccessfulPayload(result, "Activity log");

    centralHistory = {
      status: "ready",
      rows: centralHistoryRows(result),
      error: "",
    };
  } catch (error) {
    centralHistory = {
      status: "error",
      rows: [],
      error: error.message || String(error),
    };
  }

  window.dispatchEvent(new Event("cqr-page-refresh"));
}

function historyTable(rows, central = false) {
  if (!rows.length) {
    return central
      ? '<div class="empty-state">ยังไม่มี Central Activity Log</div>'
      : '<div class="empty-state">ไม่มี Local Debug History ใน Browser นี้</div>';
  }

  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Time</th>
      ${central ? "<th>Requested by</th>" : ""}
      <th>Action</th>
      <th>Scope</th>
      <th>Run ID</th>
      <th>Hash</th>
      <th>Status</th>
      <th>Request ID</th>
      <th>Message</th>
    </tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td>${escapeHtml(row.at || "-")}</td>
      ${central ? `<td>${escapeHtml(row.requestedBy || "-")}</td>` : ""}
      <td>${escapeHtml(row.action || "-")}</td>
      <td>${escapeHtml(row.game || "-")} / ${escapeHtml(row.month || "-")}</td>
      <td class="code-chip">${escapeHtml(row.runId || "-")}</td>
      <td class="code-chip">${escapeHtml(row.rawHash || "-")}</td>
      <td>${statusPill(row.status || "unknown", escapeHtml(row.status || "unknown"))}</td>
      <td class="code-chip">${escapeHtml(row.requestId || "-")}</td>
      <td>${escapeHtml(row.message || "-")}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function exactScope() {
  const state = getState();
  return {
    game: state.filters.game === "ALL"
      ? APP_CONFIG.games.find((item) => item.value !== "ALL").value
      : state.filters.game,
    month: state.filters.month === "ALL" ? APP_CONFIG.months[0].value : state.filters.month,
  };
}

function controlFilters() {
  const scope = exactScope();
  return `<div class="form-grid two">
    <label class="form-field"><span class="form-label">Game</span><select id="control-game" class="form-control">${optionMarkup(APP_CONFIG.games.filter((item) => item.value !== "ALL"), scope.game)}</select></label>
    <label class="form-field"><span class="form-label">Month</span><select id="control-month" class="form-control">${optionMarkup(APP_CONFIG.months, scope.month)}</select></label>
  </div>`;
}

function guide(active, mode = "") {
  const control = getState().control || {};
  const firstBuild = mode === "first_build" || control.buildMode === "first_build";
  const errorStep = control.error ? active : "";
  const repairSteps = [
    { id: "history", number: "1", label: "History", state: logs().length ? "complete" : "available" },
    { id: "preview", number: "2", label: "Preview", state: control.previewToken ? "complete" : "available" },
    { id: "clear", number: "3", label: "Clear", state: control.lastClearAt ? "complete" : control.previewToken ? "available" : "locked" },
    { id: "build", number: "4", label: "Build", state: control.lastBuildAt ? "complete" : control.lastClearAt ? "available" : "locked" },
    { id: "verify", number: "5", label: "Verify", state: control.lastBuildAt ? "ready" : "locked" },
  ];
  const scope = control.buildScope || readFirstBuild();
  const rawReady = Boolean(isUsableRawStatus(scope?.rawStatus) && scope?.actionStatus === "build_required" && scope?.rawHash);
  const firstSteps = [
    { id: "health", number: "1", label: "Raw Ready", state: rawReady ? "complete" : "locked" },
    { id: "build", number: "2", label: "First Build", state: control.lastBuildAt ? "complete" : rawReady ? "available" : "locked" },
    { id: "verify", number: "3", label: "Verify", state: control.lastBuildAt ? "ready" : "locked" },
  ];
  const steps = firstBuild ? firstSteps : repairSteps;
  return `<nav class="workflow-steps dc-workflow" style="--dc-step-count:${steps.length}" aria-label="${firstBuild ? "First Build workflow" : "Repair workflow"}">
    ${steps.map((step) => {
      let state = step.state;
      if (step.id === active && state !== "complete") state = errorStep === step.id ? "failed" : "current";
      const current = state === "current" || state === "failed" ? ' aria-current="step"' : "";
      const stateLabel = state === "complete" ? "Completed" : state === "current" ? "Current" : state === "ready" ? "Ready" : state === "failed" ? "Failed" : state === "locked" ? "Locked" : "Available";
      return `<div class="workflow-step is-${state}"${current}><span>${step.number}</span><b>${step.label}</b><small>${stateLabel}</small></div>`;
    }).join("")}
  </nav>`;
}

function selectedRun() {
  const control = getState().control;
  return control.lookupRuns.find((run) => run.run_id === control.selectedRuns[0]) || null;
}

function repairScopeFromSeed() {
  const control = getState().control;
  const seed = control.repairSeedScope;
  const runId = String(seed?.runId || "").trim();
  const hash = String(seed?.hash || "").trim();
  if (!seed?.game || !seed?.month || (!runId && !hash)) return null;
  return {
    game: seed.game,
    month: seed.month,
    runId,
    hash,
    source: hash ? "scope_hash" : "scope_run",
  };
}

function repairTargetValue(scope) {
  return String(scope?.hash || scope?.runId || "").trim();
}

function repairTargetLabel(scope) {
  if (scope?.hash) return "Master Hash";
  if (scope?.runId) return "Run ID";
  return "Repair Target";
}

function shortHash(value) {
  const text = String(value || "");
  if (text.length <= 18) return text || "-";
  return `${text.slice(0, 10)}...${text.slice(-6)}`;
}

function repairHashFromHealthRow(row) {
  return String(
    row?.master_hash
    || row?.direct_master_hash
    || row?.snapshot_hash
    || row?.previous_hash
    || row?.cleanup_hash
    || row?.data_hash_before
    || row?.master_data_hash
    || ""
  ).trim();
}

function repairRunIdFromHealthRow(row) {
  return String(
    row?.review_run_id
    || row?.ready_run_id
    || row?.latest_run_id
    || row?.run_id
    || ""
  ).trim();
}

function repairSeedNeedsRecovery() {
  const seed = getState().control.repairSeedScope;
  return Boolean(
    seed?.game
    && seed?.month
    && String(seed.actionStatus || "").toLowerCase() === "repair"
    && !String(seed.runId || "").trim()
    && !String(seed.hash || "").trim()
  );
}

function repairHashFromRun(run) {
  const status = String(run?.status || "").toLowerCase();
  if (status === "needs_review") {
    return String(run?.data_hash_before || run?.data_hash_after || "").trim();
  }
  return String(run?.data_hash_after || run?.data_hash_before || "").trim();
}

function selectRepairLookupRun(runs, preferredRunId = "", preferredHash = "") {
  const list = Array.isArray(runs) ? runs : [];
  const runId = String(preferredRunId || "").trim();
  const hash = String(preferredHash || "").trim();
  if (runId) {
    const exact = list.find((run) => String(run?.run_id || "").trim() === runId);
    if (exact) return exact;
  }
  if (hash) {
    const exact = list.find((run) => [run?.data_hash_before, run?.data_hash_after].some((value) => String(value || "").trim() === hash));
    if (exact) return exact;
  }
  return list.find((run) => String(run?.status || "").toLowerCase() === "ready")
    || list.find((run) => String(run?.status || "").toLowerCase() === "needs_review")
    || list[0]
    || null;
}

function extractRuns(result) {
  const payload = normalizePayload(result);
  if (Array.isArray(result?.matches)) return result.matches;
  if (Array.isArray(result?.runs)) return result.runs;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.runs)) return payload.runs;
  if (Array.isArray(payload)) return payload;
  return [];
}

function runStatus(run) {
  return String(run?.status || "").trim().toLowerCase();
}

function runMessage(run) {
  return String(run?.message || run?.error_message || run?.error || "").trim();
}

function parsePipelineTime(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) return parsed;
  const match = text.match(/(20\d{6}T\d{6})Z?/);
  if (!match) return 0;
  const compact = match[1];
  const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}Z`;
  const compactParsed = Date.parse(iso);
  return Number.isFinite(compactParsed) ? compactParsed : 0;
}

function runEvidenceTime(run) {
  return Math.max(parsePipelineTime(run?.run_finished_at), parsePipelineTime(run?.run_started_at));
}

function isFreshRun(run, scope, dispatchAt) {
  if (!run) return false;
  if ((run.game_code || run.game) !== scope.game || (run.period_key || run.month) !== scope.month) return false;
  const dispatchTime = parsePipelineTime(dispatchAt);
  if (!dispatchTime) return false;
  const evidenceTime = runEvidenceTime(run);
  return evidenceTime && evidenceTime >= dispatchTime - 30000;
}

function newestFreshRun(runs, scope, dispatchAt) {
  return (Array.isArray(runs) ? runs : [])
    .filter((run) => isFreshRun(run, scope, dispatchAt))
    .sort((a, b) => runEvidenceTime(b) - runEvidenceTime(a))[0] || null;
}

function isTerminalFailureStatus(status) {
  const value = String(status || "").toLowerCase();
  return value === "write_failed" || value === "failed" || value === "error" || value.endsWith("_failed") || value.includes("error");
}

function isReadyRunStatus(status) {
  return String(status || "").toLowerCase() === "ready";
}

function lockedScopeForRun(run) {
  const selected = exactScope();
  const runGame = run.game_code || run.game || selected.game;
  const runMonth = run.period_key || run.month || selected.month;
  if (runGame !== selected.game || runMonth !== selected.month) {
    throw new Error(`Run scope mismatch: selected ${selected.game}/${selected.month}, run is ${runGame}/${runMonth}`);
  }
  return {
    game: runGame,
    month: runMonth,
    runId: run.run_id,
    hash: run.data_hash_after || run.data_hash_before || "",
    source: "run_history",
  };
}

function normalizeHealth(result) {
  const payload = normalizePayload(result);
  const rows = Array.isArray(payload?.scope_rows)
    ? payload.scope_rows
    : Array.isArray(payload?.rows)
      ? payload.rows
      : [];
  return { payload, rows };
}

function firstBuildScopeFromRow(row) {
  return {
    game: row.game_code || row.game || "",
    month: row.period_key || row.month || "",
    rawHash: row.raw_hash || "",
    rawCheckId: row.raw_check_id || "",
    rawStatus: row.raw_status || "",
    actionStatus: row.action_status || "",
  };
}

function firstBuildIsReady(scope) {
  return Boolean(
    scope
    && scope.game
    && scope.game !== "ALL"
    && scope.month
    && scope.month !== "ALL"
    && isUsableRawStatus(scope.rawStatus)
    && scope.actionStatus === "build_required"
    && scope.rawHash
  );
}

function persistFirstBuild(scope) {
  if (!scope) {
    sessionStorage.removeItem(FIRST_BUILD_KEY);
    return;
  }
  sessionStorage.setItem(FIRST_BUILD_KEY, JSON.stringify(scope));
}

function readFirstBuild() {
  try {
    const value = JSON.parse(sessionStorage.getItem(FIRST_BUILD_KEY) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function applyFirstBuildScope(scope) {
  if (!scope?.game || !scope?.month) throw new Error("First Build scope ไม่ครบ");
  setFilters({ game: scope.game, month: scope.month });
  setControl({
    buildMode: "first_build",
    buildScope: scope,
    buildRawHash: scope.rawHash || "",
    buildRawCheckId: scope.rawCheckId || "",
    buildActionStatus: scope.actionStatus || "",
    buildHealthStatus: scope.rawStatus || "",
    previewToken: "",
    previewScope: null,
    previewResult: null,
    selectedRuns: [],
    repairSeedScope: null,
    lastClearAt: "",
    clearResult: null,
    lastBuildAt: "",
    buildResult: null,
    buildProgress: 0,
    buildVerifyStatus: "",
    buildDispatchAt: "",
    buildRequestId: "",
    buildRunStatus: "",
    buildRunId: "",
    buildRunMessage: "",
    error: "",
  });
  persistFirstBuild(scope);
}

function consumeHandoff() {
  const raw = sessionStorage.getItem(HANDOFF_KEY);
  if (!raw) return false;
  sessionStorage.removeItem(HANDOFF_KEY);
  try {
    const handoff = JSON.parse(raw);
    const mode = handoff.mode || (handoff.action_status === "build_required" ? "first_build" : "repair");
    const game = handoff.target_game_code || handoff.game || getState().filters.game;
    const month = handoff.target_month || handoff.month || getState().filters.month;
    setFilters({ game, month });
    if (mode === "first_build") {
      applyFirstBuildScope({
        game,
        month,
        rawHash: handoff.raw_hash || handoff.rawHash || "",
        rawCheckId: handoff.raw_check_id || handoff.rawCheckId || "",
        rawStatus: handoff.raw_status || handoff.rawStatus || "raw_ready",
        actionStatus: handoff.action_status || handoff.actionStatus || "build_required",
      });
      if (getState().route !== "data-control-build") setRoute("data-control-build");
      return true;
    }
    const repairHash = String(
      handoff.cleanup_hash
      || handoff.search_hash
      || handoff.master_hash
      || handoff.direct_master_hash
      || handoff.snapshot_hash
      || handoff.previous_hash
      || handoff.data_hash_before
      || handoff.master_data_hash
      || handoff.hash
      || ""
    ).trim();
    const repairRunId = String(
      handoff.run_id
      || handoff.review_run_id
      || handoff.ready_run_id
      || handoff.latest_run_id
      || ""
    ).trim();
    setControl({
      buildMode: "repair",
      buildScope: null,
      lookupQuery: repairRunId || repairHash || "",
      repairSeedScope: {
        game,
        month,
        runId: repairRunId,
        hash: repairHash,
        actionStatus: handoff.action_status || handoff.actionStatus || "repair",
      },
      previewToken: "",
      previewScope: null,
      previewResult: null,
      lastClearAt: "",
      clearResult: null,
      lastBuildAt: "",
      buildResult: null,
      buildProgress: 0,
      buildVerifyStatus: "",
      buildDispatchAt: "",
      buildRequestId: "",
      buildRunStatus: "",
      buildRunId: "",
      buildRunMessage: "",
      error: "",
    });
    if (getState().route !== "data-control-preview") setRoute("data-control-preview");
    return true;
  } catch {
    return false;
  }
}

export function renderDataControlHistoryPage() {
  const localRows = logs();

  let centralBody = "";

  if (centralHistory.status === "loading") {
    centralBody = '<div class="empty-state">กำลังโหลด Central Activity Log...</div>';
  } else if (centralHistory.status === "error") {
    centralBody = `<div class="notice danger">${escapeHtml(centralHistory.error || "โหลด Central Activity Log ไม่สำเร็จ")}</div>`;
  } else if (centralHistory.status === "ready") {
    centralBody = historyTable(centralHistory.rows, true);
  } else {
    centralBody = '<div class="empty-state">กำลังเตรียม Central Activity Log...</div>';
  }

  return `<div class="page-grid">${guide("history")}
    <article class="surface-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Activity Log</h2>
          <p class="card-description">Central Audit Log จาก AdminActionLogs · แสดงรายการ Preview / Clear / Build ล่าสุดสูงสุด 100 รายการ</p>
        </div>
        <button id="history-refresh" class="button ghost" type="button" ${centralHistory.status === "loading" ? "disabled" : ""}>
          ${centralHistory.status === "loading" ? "Loading..." : "Refresh"}
        </button>
      </div>
      <div class="card-body">${centralBody}</div>
    </article>

    <article class="surface-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Local Debug History</h2>
          <p class="card-description">ข้อมูลใน Browser นี้เท่านั้น ใช้สำหรับ Debug และไม่ใช่หลักฐานกลาง</p>
        </div>
        <button id="history-clear-local" class="button ghost" type="button" ${localRows.length ? "" : "disabled"}>Clear local</button>
      </div>
      <div class="card-body">${historyTable(localRows, false)}</div>
    </article>
  </div>`;
}

export function bindDataControlHistoryPage() {
  document.getElementById("history-refresh")?.addEventListener("click", () => {
    loadCentralHistory(true);
  });

  document.getElementById("history-clear-local")?.addEventListener("click", () => openConfirmModal({
    title: "Clear local debug history",
    message: "ลบเฉพาะ Local Debug History ใน Browser นี้? Central Activity Log จะไม่ถูกลบ",
    confirmLabel: "Clear",
    danger: true,
    onConfirm: () => {
      localStorage.removeItem(LOG_KEY);
      window.dispatchEvent(new Event("cqr-page-refresh"));
    },
  }));

  if (centralHistory.status === "idle") {
    loadCentralHistory();
  }
}

export function renderDataControlPreviewPage() {
  const control = getState().control;
  const repairScope = repairScopeFromSeed();
  const repairSeed = control.repairSeedScope;
  const repairExpected = Boolean(
    repairSeed?.game
    && repairSeed?.month
    && String(repairSeed.actionStatus || "").toLowerCase() === "repair"
  );
  const noMatches = control.lookupPerformed && !control.lookupRuns.length && !actionBusy;
  const firstBuildNotice = noMatches && !repairScope && !repairExpected ? `<div class="notice warning">
    <b>ไม่พบข้อมูล Master เดิมในขอบเขตนี้</b><br>
    ตรวจสอบก่อนว่าเป็นการสร้างครั้งแรกจริงหรือไม่
    <div class="dc-button-row"><button id="continue-first-build" class="button warm" type="button">Check First Build Eligibility</button></div>
  </div>` : "";
  const manualSearch = `<div class="dc-manual-panel">
    <div class="dc-section-title">
      <h3>${repairScope || repairExpected ? "Advanced / หา Run แบบ Manual" : "หา Run แบบ Manual"}</h3>
      <p>${repairScope || repairExpected ? "ใช้เมื่อจำเป็นต้องเลือก Run เฉพาะแทน Repair Scope ที่ระบบส่งมา" : "เลือก Game/Month แล้วค้นหา Run เดิมเพื่อ Preview ก่อน Clear"}</p>
    </div>
    ${controlFilters()}
    <label class="form-field"><span class="form-label">Run ID / Hash</span><input id="control-query" class="form-control" value="${escapeHtml(control.lookupQuery || "")}" placeholder="RUN-... หรือ hash"></label>
    <div class="dc-button-row">
      <button id="lookup-run" class="button" type="button" ${actionBusy ? "disabled" : ""}>${icon("search", "nav-icon")} Find Runs</button>
      <button id="preview-run" class="button warm" type="button" ${actionBusy || !control.selectedRuns.length ? "disabled" : ""}>Preview Selected Run</button>
    </div>
  </div>`;
  return `<div class="page-grid data-control-preview-page">${guide("preview")}
    <section class="dc-preview-layout">
      <div class="dc-preview-main">
        ${repairScope ? `<article class="surface-card warm-card dc-repair-card">
          <div class="card-header"><div><h2 class="card-title">ตรวจขอบเขตซ่อมข้อมูลก่อนเริ่ม</h2><p class="card-description">ระบบพบ Repair Target จาก Data Health แล้ว สามารถ Preview Repair ได้ทันที</p></div>${statusPill(actionBusy ? "running" : control.previewToken ? "ready" : "warm", actionBusy ? "Working" : control.previewToken ? "Preview ready" : "Ready")}</div>
          <div class="card-body">
            <div class="notice warning"><b>พบ Repair Target เดิม</b><br>กด Preview Repair เพื่อตรวจรายการที่จะซ่อมก่อน ขั้นตอนนี้ยังไม่ลบและยังไม่ Build</div>
            <div class="dc-scope-summary">
              <div class="metric-box"><div class="metric-label">Game</div><div class="metric-value">${escapeHtml(repairScope.game)}</div></div>
              <div class="metric-box"><div class="metric-label">Month</div><div class="metric-value">${escapeHtml(repairScope.month)}</div></div>
              <div class="metric-box"><div class="metric-label">${escapeHtml(repairTargetLabel(repairScope))}</div><div class="metric-value code-chip" title="${escapeHtml(repairTargetValue(repairScope))}">${escapeHtml(shortHash(repairTargetValue(repairScope)))}</div></div>
            </div>
            <div class="dc-button-row"><button id="preview-repair-scope" class="button primary" type="button" ${actionBusy ? "disabled" : ""}>Preview Repair</button></div>
            ${control.error ? `<div class="notice danger">${escapeHtml(control.error)}</div>` : ""}
            ${noMatches ? `<div class="notice warning"><b>ไม่พบ Run History</b><br>ยัง Preview Repair ด้วย Repair Target ที่ตรวจพบได้ ไม่ต้องใช้ First Build</div>` : ""}
            <details class="dc-advanced"><summary>Advanced / หา Run แบบ Manual</summary>${manualSearch}</details>
          </div>
        </article>` : repairExpected ? `<article class="surface-card warm-card dc-repair-card">
          <div class="card-header"><div><h2 class="card-title">ตรวจขอบเขตซ่อมข้อมูลก่อนเริ่ม</h2><p class="card-description">Data Health ระบุว่า Scope นี้ต้อง Repair แต่ยังไม่ได้ Run ID หรือ Master Hash สำหรับล็อกขอบเขต</p></div>${statusPill(actionBusy || repairRecoveryBusy ? "running" : "warning", actionBusy || repairRecoveryBusy ? "Checking" : "Needs scope")}</div>
          <div class="card-body">
            <div class="notice warning"><b>กำลังยืนยัน Repair Scope</b><br>ระบบจะอ่าน Data Health ของ ${escapeHtml(repairSeed?.game || "-")} / ${escapeHtml(repairSeed?.month || "-")} ใหม่และค้นหา Run History อัตโนมัติเพื่อหา Repair Target ที่ใช้ Preview/Clear อย่างปลอดภัย</div>
            <div class="dc-scope-summary">
              <div class="metric-box"><div class="metric-label">Game</div><div class="metric-value">${escapeHtml(repairSeed?.game || "-")}</div></div>
              <div class="metric-box"><div class="metric-label">Month</div><div class="metric-value">${escapeHtml(repairSeed?.month || "-")}</div></div>
              <div class="metric-box"><div class="metric-label">Repair Status</div><div>${statusPill("warning", "รอ Repair Target")}</div></div>
            </div>
            <div class="dc-button-row"><button id="reload-repair-scope" class="button primary" type="button" ${actionBusy || repairRecoveryBusy ? "disabled" : ""}>Reload Repair Scope</button></div>
            ${control.error ? `<div class="notice danger">${escapeHtml(control.error)}</div>` : ""}
            <details class="dc-advanced"><summary>Advanced / หา Run แบบ Manual</summary>${manualSearch}</details>
          </div>
        </article>` : `<article class="surface-card warm-card dc-repair-card">
          <div class="card-header"><div><h2 class="card-title">ตรวจขอบเขตซ่อมข้อมูลก่อนเริ่ม</h2><p class="card-description">ยังไม่มี Repair Target จาก Data Health ให้ค้นหา Run เดิมแบบ Manual</p></div>${statusPill(actionBusy ? "running" : control.previewToken ? "ready" : "warm", actionBusy ? "Working" : control.previewToken ? "Preview ready" : "Ready")}</div>
          <div class="card-body">
            ${manualSearch}
            ${control.error ? `<div class="notice danger">${escapeHtml(control.error)}</div>` : ""}
            ${firstBuildNotice}
          </div>
        </article>`}
      </div>
      <aside class="surface-card dc-status-panel">
        <div class="card-header"><div><h2 class="card-title">สถานะขอบเขต</h2><p class="card-description">ล็อกหลัง Preview เท่านั้น</p></div></div>
        <div class="card-body">
          <div class="dc-status-list">
            <div><span>Game / Month</span><b>${escapeHtml(control.previewScope?.game || repairScope?.game || repairSeed?.game || "-")} / ${escapeHtml(control.previewScope?.month || repairScope?.month || repairSeed?.month || "-")}</b></div>
            <div><span>Repair Target</span><b class="code-chip" title="${escapeHtml(repairTargetValue(control.previewScope || repairScope || repairSeed))}">${escapeHtml(shortHash(repairTargetValue(control.previewScope || repairScope || repairSeed)))}</b></div>
            <div><span>Preview Receipt</span><b class="code-chip">${escapeHtml(control.previewToken || "-")}</b></div>
          </div>
        </div>
      </aside>
    </section>
    ${control.lookupRuns.length ? `<article class="surface-card">
      <div class="card-header"><div><h2 class="card-title">Matching Runs</h2><p class="card-description">เลือกหนึ่ง Run เท่านั้น</p></div></div>
      <div class="card-body"><div class="table-wrap"><table>
        <thead><tr><th></th><th>Run ID</th><th>Game</th><th>Month</th><th>Status</th><th>Hash Before</th><th>Hash After</th><th>Rows</th></tr></thead>
        <tbody>${control.lookupRuns.map((run) => `<tr><td><input type="radio" name="run-select" value="${escapeHtml(run.run_id)}" ${control.selectedRuns[0] === run.run_id ? "checked" : ""}></td><td class="code-chip">${escapeHtml(run.run_id)}</td><td>${escapeHtml(run.game_code)}</td><td>${escapeHtml(run.period_key)}</td><td>${statusPill(run.status, escapeHtml(run.status))}</td><td class="code-chip">${escapeHtml(run.data_hash_before || "-")}</td><td class="code-chip">${escapeHtml(run.data_hash_after || "-")}</td><td>${escapeHtml(run.rows_written || run.rows_read || "-")}</td></tr>`).join("")}</tbody>
      </table></div></div>
    </article>` : ""}
    ${control.previewResult ? `<article class="surface-card"><div class="card-header"><div><h2 class="card-title">Preview Result</h2></div><button class="button primary" data-route="data-control-clear" type="button">Continue to Clear</button></div><div class="card-body"><pre class="json-preview">${escapeHtml(JSON.stringify(control.previewResult, null, 2))}</pre></div></article>` : ""}
  </div>`;
}

function cleanupParams(scope) {
  const runIds = scope.runId ? [scope.runId] : [];
  const runItems = scope.runId ? [{ run_id: scope.runId, game_code: scope.game, period_key: scope.month }] : [];
  return {
    game: scope.game,
    month: scope.month,
    run_id: scope.runId || "",
    run_ids: JSON.stringify(runIds),
    run_items: JSON.stringify(runItems),
    cleanup_hash: scope.hash || "",
    hash: scope.hash || "",
  };
}

async function lookup() {
  const currentSeed = getState().control.repairSeedScope;
  const game = document.getElementById("control-game")?.value;
  const month = document.getElementById("control-month")?.value;
  const query = document.getElementById("control-query")?.value.trim() || "";
  const repairSeedScope = currentSeed?.game === game && currentSeed?.month === month ? currentSeed : null;
  setFilters({ game, month });
  setControl({
    buildMode: "repair",
    buildScope: null,
    buildRawHash: "",
    buildRawCheckId: "",
    buildActionStatus: "",
    buildHealthStatus: "",
    lookupQuery: query,
    lookupPerformed: false,
    error: "",
    lookupRuns: [],
    selectedRuns: [],
    repairSeedScope,
    lookupResult: null,
    previewToken: "",
    previewScope: null,
    previewResult: null,
    lastClearAt: "",
    clearResult: null,
    lastBuildAt: "",
    buildResult: null,
    buildProgress: 0,
    buildVerifyStatus: "",
    buildDispatchAt: "",
    buildRequestId: "",
    buildRunStatus: "",
    buildRunId: "",
    buildRunMessage: "",
  });
  persistFirstBuild(null);
  actionBusy = true;
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const result = await callAuthorized("admin.pipeline.run.lookup", { game, month, query }, 60000);
    assertSuccessfulPayload(result, "Run lookup");
    const runs = extractRuns(result).filter((run) => (!run.game_code || run.game_code === game) && (!run.period_key || run.period_key === month));
    setControl({
      lookupResult: result,
      lookupRuns: runs,
      lookupPerformed: true,
      selectedRuns: runs[0]?.run_id ? [runs[0].run_id] : [],
    });
  } catch (error) {
    setControl({ lookupPerformed: true, error: error.message || String(error) });
  } finally {
    actionBusy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

async function preview() {
  const run = selectedRun();
  if (!run) {
    showToast("เลือก Run ก่อน");
    return;
  }
  actionBusy = true;
  setControl({ error: "" });
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const scope = lockedScopeForRun(run);
    const result = await callAuthorized("admin.n8n.cleanup.preview", cleanupParams(scope), CLEANUP_PREVIEW_TIMEOUT_MS);
    const payload = assertSuccessfulPayload(result, "Cleanup preview");
    const receipt = String(payload.preview_receipt || payload.preview_token || payload.receipt || result.preview_receipt || result.request_id || payload.request_id || `PREVIEW-${Date.now()}-${scope.runId}`);
    setControl({
      buildMode: "repair",
      buildScope: null,
      previewToken: receipt,
      previewAt: new Date().toISOString(),
      previewResult: payload,
      previewScope: scope,
      clearResult: null,
      lastClearAt: "",
      buildResult: null,
      lastBuildAt: "",
      buildProgress: 0,
      buildVerifyStatus: "",
      buildDispatchAt: "",
      buildRequestId: "",
      buildRunStatus: "",
      buildRunId: "",
      buildRunMessage: "",
      error: "",
    });
    addLog("Preview", result, scope);
    showToast("Preview completed");
  } catch (error) {
    setControl({ previewToken: "", previewScope: null, previewResult: null, error: error.message || String(error) });
  } finally {
    actionBusy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

async function recoverRepairScope(force = false) {
  const seed = getState().control.repairSeedScope;
  if (!seed?.game || !seed?.month) return;
  const key = `${seed.game}|${seed.month}`;
  if (repairRecoveryBusy) return;
  if (!force && repairRecoveryAttemptedKey === key) return;

  repairRecoveryAttemptedKey = key;
  repairRecoveryBusy = true;
  setControl({ error: "" });
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const result = await callAuthorized("admin.pipeline.health", { game: seed.game, month: seed.month }, 60000);
    assertSuccessfulPayload(result, "Repair scope check");
    const { rows } = normalizeHealth(result);
    const row = rows.find((item) =>
      (item.game_code || item.game) === seed.game
      && (item.period_key || item.month) === seed.month
    );
    if (!row) throw new Error("ไม่พบ Data Health ของ Repair Scope นี้");

    const actionStatus = String(row.action_status || "").toLowerCase();
    if (actionStatus !== "repair") {
      if (actionStatus === "ready") throw new Error("Scope นี้พร้อมใช้งานแล้ว ไม่ต้อง Repair");
      if (actionStatus === "build_required") throw new Error("Scope นี้ไม่มี Master เดิม ต้องใช้ First Build");
      throw new Error(`สถานะล่าสุดไม่อนุญาต Repair (${row.action_status || "unknown"})`);
    }

    let repairHash = repairHashFromHealthRow(row);
    let repairRunId = repairRunIdFromHealthRow(row);

    if (!repairHash && !repairRunId) {
      const lookupResult = await callAuthorized("admin.pipeline.run.lookup", {
        game: seed.game,
        month: seed.month,
        query: "",
      }, 60000);
      assertSuccessfulPayload(lookupResult, "Repair run lookup");
      const candidate = selectRepairLookupRun(extractRuns(lookupResult));
      if (candidate) {
        repairRunId = String(candidate.run_id || "").trim();
        repairHash = repairHashFromRun(candidate);
      }
    }

    if (!repairHash && !repairRunId) {
      throw new Error("Data Health ยืนยันว่าเป็น Repair แต่ไม่พบ Run ID หรือ Master Hash จาก Health/Run History จึงยังล็อกขอบเขตอย่างปลอดภัยไม่ได้");
    }

    setFilters({ game: seed.game, month: seed.month });
    setControl({
      buildMode: "repair",
      buildScope: null,
      lookupQuery: repairRunId || repairHash,
      repairSeedScope: {
        game: seed.game,
        month: seed.month,
        runId: repairRunId,
        hash: repairHash,
        actionStatus: "repair",
      },
      previewToken: "",
      previewScope: null,
      previewResult: null,
      lastClearAt: "",
      clearResult: null,
      lastBuildAt: "",
      buildResult: null,
      buildProgress: 0,
      buildVerifyStatus: "",
      buildDispatchAt: "",
      buildRequestId: "",
      buildRunStatus: "",
      buildRunId: "",
      buildRunMessage: "",
      error: "",
    });
  } catch (error) {
    setControl({ error: error.message || String(error) });
  } finally {
    repairRecoveryBusy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

async function previewRepairScope() {
  const scope = repairScopeFromSeed();
  if (!scope) {
    showToast("ไม่มี Run ID หรือ Master Hash สำหรับ Repair");
    return;
  }
  actionBusy = true;
  setControl({ error: "" });
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const result = await callAuthorized("admin.n8n.cleanup.preview", cleanupParams(scope), CLEANUP_PREVIEW_TIMEOUT_MS);
    const payload = assertSuccessfulPayload(result, "Cleanup preview");
    const receipt = String(payload.preview_receipt || payload.preview_token || payload.receipt || result.preview_receipt || result.request_id || payload.request_id || `PREVIEW-${Date.now()}-${scope.hash}`);
    setControl({
      buildMode: "repair",
      buildScope: null,
      previewToken: receipt,
      previewAt: new Date().toISOString(),
      previewResult: payload,
      previewScope: scope,
      clearResult: null,
      lastClearAt: "",
      buildResult: null,
      lastBuildAt: "",
      buildProgress: 0,
      buildVerifyStatus: "",
      buildDispatchAt: "",
      buildRequestId: "",
      buildRunStatus: "",
      buildRunId: "",
      buildRunMessage: "",
      error: "",
    });
    addLog("Preview", result, scope);
    showToast("Preview completed");
  } catch (error) {
    setControl({ previewToken: "", previewScope: null, previewResult: null, error: error.message || String(error) });
  } finally {
    actionBusy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

async function prepareFirstBuild() {
  const scope = exactScope();
  if (!scope.game || scope.game === "ALL" || !scope.month || scope.month === "ALL") {
    showToast("เลือก Game และ Month แบบเจาะจง");
    return;
  }
  actionBusy = true;
  setControl({ error: "" });
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const result = await callAuthorized("admin.pipeline.health", { game: scope.game, month: scope.month }, 60000);
    assertSuccessfulPayload(result, "First Build pre-check");
    const { rows } = normalizeHealth(result);
    const row = rows.find((item) => (item.game_code || item.game) === scope.game && (item.period_key || item.month) === scope.month);
    if (!row) throw new Error("ไม่พบ Health row ของ Scope นี้");
    if (!isUsableRawStatus(row.raw_status)) {
      throw new Error("Raw ยังไม่พร้อม กรุณารัน Check Raw ก่อน");
    }
    if (String(row.action_status || "") !== "build_required") {
      if (String(row.action_status || "") === "ready") throw new Error("Scope นี้มี Master พร้อมใช้แล้ว ไม่ต้อง First Build");
      if (String(row.action_status || "") === "repair") throw new Error("Scope นี้มี Master เดิม ต้องใช้ Repair Flow");
      throw new Error(`Scope นี้ไม่อยู่ในสถานะ build_required (${row.action_status || "unknown"})`);
    }
    if (!row.raw_hash) throw new Error("Raw Hash ว่าง กรุณารัน Check Raw ใหม่");
    applyFirstBuildScope(firstBuildScopeFromRow(row));
    setRoute("data-control-build");
  } catch (error) {
    setControl({ error: error.message || String(error) });
  } finally {
    actionBusy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

export function bindDataControlPreviewPage() {
  if (consumeHandoff()) return;
  document.getElementById("lookup-run")?.addEventListener("click", lookup);
  document.getElementById("preview-run")?.addEventListener("click", preview);
  document.getElementById("preview-repair-scope")?.addEventListener("click", previewRepairScope);
  document.getElementById("reload-repair-scope")?.addEventListener("click", () => recoverRepairScope(true));
  document.getElementById("continue-first-build")?.addEventListener("click", prepareFirstBuild);
  document.querySelectorAll('input[name="run-select"]').forEach((radio) => radio.addEventListener("change", () => setControl({
    selectedRuns: [radio.value],
    buildMode: "repair",
    previewToken: "",
    previewScope: null,
    previewResult: null,
    lastClearAt: "",
    clearResult: null,
    lastBuildAt: "",
    buildResult: null,
  })));
  document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.route)));
  if (repairSeedNeedsRecovery()) {
    queueMicrotask(() => recoverRepairScope(false));
  }
}

export function renderDataControlClearPage() {
  const control = getState().control;
  if (control.buildMode === "first_build") {
    const scope = control.buildScope;
    return `<div class="page-grid">${guide("build", "first_build")}
      <article class="surface-card warm-card">
        <div class="card-header"><div><h2 class="card-title">Clear Not Required</h2><p class="card-description">First Build ไม่มี Master เดิม จึงไม่ต้อง Cleanup</p></div>${statusPill("ready", "Safe to skip")}</div>
        <div class="card-body"><div class="notice warning">Scope ${escapeHtml(scope?.game || "-")} / ${escapeHtml(scope?.month || "-")} เป็น First Build ให้ไปหน้า Build โดยตรง</div><button class="button primary" data-route="data-control-build" type="button" style="margin-top:14px">Continue to Build</button></div>
      </article>
    </div>`;
  }
  const scope = control.previewScope;
  const phrase = scope ? `CLEAR ${scope.game} ${scope.month}` : "";
  const clearComplete = Boolean(control.lastClearAt);
  return `<div class="page-grid">${guide("clear")}
    <article class="surface-card danger-card">
      <div class="card-header"><div><h2 class="card-title">Clear Selected Run</h2><p class="card-description">การลบจริงต้องมี Preview Receipt และ Scope ที่ล็อกไว้</p></div>${statusPill(control.lastClearAt ? "ready" : scope ? "warning" : "danger", control.lastClearAt ? "Completed" : scope ? "Confirmation required" : "Preview required")}</div>
      <div class="card-body">${scope ? `<div class="metric-grid">
        <div class="metric-box"><div class="metric-label">Scope</div><div class="metric-value">${escapeHtml(scope.game)} / ${escapeHtml(scope.month)}</div></div>
        <div class="metric-box"><div class="metric-label">Repair Target</div><div class="metric-value code-chip">${escapeHtml(scope.runId || scope.hash || "-")}</div></div>
        <div class="metric-box"><div class="metric-label">Preview Receipt</div><div class="metric-value code-chip">${escapeHtml(control.previewToken)}</div></div>
      </div>
      <div style="display:grid;gap:26px;margin-top:22px">
        <div style="display:grid;gap:18px;padding:20px;border:1px solid rgba(157,46,67,.24);border-radius:14px;background:rgba(255,247,249,.72)">
          <div class="notice danger">พิมพ์ <b>${escapeHtml(phrase)}</b> และยืนยัน Checkbox ก่อนดำเนินการ</div>
          <div style="display:grid;gap:8px;padding:16px;border:1px solid rgba(157,46,67,.16);border-radius:12px;background:#fff">
            <label class="form-field"><span class="form-label">Confirmation phrase</span><input id="clear-phrase" class="form-control" autocomplete="off" ${control.lastClearAt ? "disabled" : ""}></label>
          </div>
          <div style="display:grid;gap:8px;padding:16px;border:1px solid rgba(157,46,67,.16);border-radius:12px;background:#fff">
            <label class="checkbox-row" style="display:grid;grid-template-columns:20px minmax(0,1fr);align-items:start;column-gap:14px;line-height:1.65;margin:0">
              <input id="clear-ack" type="checkbox" style="width:18px;height:18px;margin:4px 0 0" ${control.lastClearAt ? "disabled" : ""}>
              <span>ฉันตรวจ Scope และ Preview Result แล้ว</span>
            </label>
          </div>
        </div>
        <div style="display:grid;gap:12px;padding:18px;border:1px solid rgba(157,46,67,.18);border-radius:14px;background:#fff">
          <div class="metric-label">Clear action</div>
          <button id="clear-run" class="button danger" type="button" ${actionBusy || control.lastClearAt ? "disabled" : ""}>${icon("trash", "nav-icon")} Clear Run</button>
        </div>
      </div>` : '<div class="empty-state">กลับไป Preview และเลือก Run ก่อน</div>'}
      ${(control.error || control.clearResult) ? `<div style="display:grid;gap:16px;margin-top:26px;padding:18px;border:1px solid var(--line);border-radius:14px;background:#fff">
        <div class="metric-label">Clear result</div>
        ${control.error ? `<div class="notice danger">${escapeHtml(control.error)}</div>` : ""}
        ${control.clearResult ? `<pre class="json-preview">${escapeHtml(JSON.stringify(control.clearResult, null, 2))}</pre>` : ""}
      </div>` : ""}
      ${clearComplete ? `<div style="display:grid;gap:14px;margin-top:26px;padding:20px;border:1px solid rgba(23,97,63,.28);border-radius:14px;background:rgba(238,248,243,.95)">
        <div><div class="metric-label">Clear completed</div><div style="font-size:14px;font-weight:800;color:#17613f;margin-top:5px">พร้อมไปขั้นตอน Build สำหรับ Scope เดิม</div></div>
        <button class="button primary" data-route="data-control-build" type="button" style="justify-content:center;min-height:48px;padding:0 22px;width:100%;max-width:320px">${icon("build", "nav-icon")} ไปขั้นตอน Build</button>
      </div>` : ""}
      </div>
    </article>
  </div>`;
}

async function clearNow() {
  const control = getState().control;
  const scope = control.previewScope;
  if (control.buildMode === "first_build") throw new Error("First Build ไม่ต้อง Clear");
  if (!scope || !control.previewToken) return;
  actionBusy = true;
  setControl({ error: "" });
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const result = await callAuthorized("admin.n8n.cleanup.run", {
      ...cleanupParams(scope),
      preview_receipt: control.previewToken,
    }, CLEANUP_RUN_TIMEOUT_MS);
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
  document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.route)));
  const control = getState().control;
  const scope = control.previewScope;
  if (!scope || control.buildMode === "first_build") return;
  const phrase = `CLEAR ${scope.game} ${scope.month}`;
  document.getElementById("clear-run")?.addEventListener("click", () => {
    if (document.getElementById("clear-phrase")?.value.trim() !== phrase || !document.getElementById("clear-ack")?.checked) {
      showToast("Confirmation ยังไม่ครบ");
      return;
    }
    openConfirmModal({
      title: "Final Clear Confirmation",
      message: `ล้างข้อมูล ${scope.runId ? `Run ${scope.runId}` : `Hash ${scope.hash}`} ของ ${scope.game} / ${scope.month}?`,
      confirmLabel: "Clear Scope",
      danger: true,
      onConfirm: clearNow,
    });
  });
}

function firstBuildPrerequisites(scope) {
  return {
    rawReady: isUsableRawStatus(scope?.rawStatus),
    buildRequired: scope?.actionStatus === "build_required",
    specific: Boolean(scope?.game && scope.game !== "ALL" && scope?.month && scope.month !== "ALL"),
    rawHash: Boolean(scope?.rawHash),
  };
}

export function renderDataControlBuildPage() {
  const control = getState().control;
  const firstBuild = control.buildMode === "first_build";
  const scope = firstBuild ? control.buildScope : control.previewScope;
  const firstChecks = firstBuildPrerequisites(scope);
  const firstReady = firstBuild && Object.values(firstChecks).every(Boolean);
  const repairReady = !firstBuild && Boolean(scope && control.previewToken && control.lastClearAt);
  const buildPending = ["processing", "checking", "pending_verification"].includes(String(control.buildVerifyStatus || ""));
  const ready = (firstReady || repairReady) && !buildPending;
  const phrase = firstBuild && scope ? `BUILD ${scope.game} ${scope.month}` : "";
  const modeLabel = firstBuild ? "First Build" : "Repair Build";
  const failedStatus = ["failed", "verification_failed", "dispatch_failed"].includes(String(control.buildVerifyStatus || ""))
    || isTerminalFailureStatus(control.buildRunStatus);
  const buildStatus = failedStatus
    ? statusPill("failed", "Failed")
    : control.lastBuildAt
    ? statusPill("ready", "Verified")
    : ["processing", "checking"].includes(String(control.buildVerifyStatus || ""))
      ? statusPill("running", "Processing")
      : control.buildVerifyStatus === "pending_verification"
        ? statusPill("warning", "Needs verification")
        : statusPill(ready ? "warning" : "danger", ready ? "Ready" : "Blocked");
  const n8nStatusVisible = Boolean(control.buildVerifyStatus || control.buildRunStatus || control.buildRunId || control.buildRunMessage || control.buildRequestId);
  const n8nStatusTone = failedStatus ? "failed" : control.lastBuildAt ? "ready" : ["processing", "checking"].includes(String(control.buildVerifyStatus || "")) ? "running" : "warning";
  const n8nStatusLabel = failedStatus ? "Failed" : control.lastBuildAt ? "Verified" : ["processing", "checking"].includes(String(control.buildVerifyStatus || "")) ? "Processing" : (control.buildVerifyStatus || "Pending");

  return `<div class="page-grid">${guide("build", firstBuild ? "first_build" : "")}
    <article class="surface-card warm-card">
      <div class="card-header"><div><h2 class="card-title">Build Master Data · ${modeLabel}</h2><p class="card-description">${firstBuild ? "สร้าง Master ครั้งแรกจาก Raw ที่ผ่านการตรวจ โดยไม่ต้อง Preview/Clear" : "Build ใช้ Scope เดียวกับ Preview/Clear และต้องผ่าน Prerequisite"}</p></div>${buildStatus}</div>
      <div class="card-body">
        ${firstBuild ? `<div class="metric-grid">
          <div class="metric-box"><div class="metric-label">Scope</div><div class="metric-value">${escapeHtml(scope?.game || "-")} / ${escapeHtml(scope?.month || "-")}</div></div>
          <div class="metric-box"><div class="metric-label">Raw Hash</div><div class="metric-value code-chip">${escapeHtml(scope?.rawHash || "-")}</div></div>
          <div class="metric-box"><div class="metric-label">Raw Check ID</div><div class="metric-value code-chip">${escapeHtml(scope?.rawCheckId || "-")}</div></div>
        </div>
        <div class="prerequisite-list" style="margin-top:16px">
          <div class="prerequisite"><span>Raw Check passed</span>${statusPill(firstChecks.rawReady ? "ready" : "danger", firstChecks.rawReady ? "Pass" : "Missing")}</div>
          <div class="prerequisite"><span>Action is build_required</span>${statusPill(firstChecks.buildRequired ? "ready" : "danger", firstChecks.buildRequired ? "Pass" : "Blocked")}</div>
          <div class="prerequisite"><span>Specific Game and Month</span>${statusPill(firstChecks.specific ? "ready" : "danger", firstChecks.specific ? `${scope.game} / ${scope.month}` : "Missing")}</div>
          <div class="prerequisite"><span>Raw Hash exists</span>${statusPill(firstChecks.rawHash ? "ready" : "danger", firstChecks.rawHash ? "Pass" : "Missing")}</div>
        </div>
        <div class="notice warning" style="margin-top:14px">พิมพ์ <b>${escapeHtml(phrase)}</b> และยืนยันว่า Raw Hash ตรงกับ Pipeline Check ล่าสุด</div>
        <label class="form-field" style="margin-top:12px"><span class="form-label">Confirmation phrase</span><input id="build-phrase" class="form-control" autocomplete="off"></label>
        <div style="display:grid;gap:8px;padding:16px;border:1px solid rgba(157,46,67,.16);border-radius:12px;background:#fff;margin-top:12px">
          <label class="checkbox-row" style="display:grid;grid-template-columns:20px minmax(0,1fr);align-items:start;column-gap:18px;line-height:1.65;margin:0">
            <input id="build-ack" type="checkbox" style="width:18px;height:18px;margin:4px 0 0">
            <span>ฉันตรวจ Game, Month และ Raw Hash แล้ว</span>
          </label>
        </div>` : `<div class="prerequisite-list">
          <div class="prerequisite"><span>Preview receipt exists</span>${statusPill(control.previewToken ? "ready" : "danger", control.previewToken ? "Pass" : "Missing")}</div>
          <div class="prerequisite"><span>Clear completed for locked scope</span>${statusPill(control.lastClearAt ? "ready" : "danger", control.lastClearAt ? "Pass" : "Missing")}</div>
          <div class="prerequisite"><span>Specific Game and Month</span>${statusPill(scope && scope.game !== "ALL" && scope.month !== "ALL" ? "ready" : "danger", scope ? `${scope.game} / ${scope.month}` : "Missing")}</div>
        </div>`}
        ${["processing", "checking"].includes(String(control.buildVerifyStatus || "")) ? `<div class="notice warning" style="margin-top:14px"><b>Build ถูกส่งแล้วและกำลังทำงาน</b><br>ระบบจะยังไม่ขึ้น Completed จนกว่า Pipeline Health จะยืนยัน Scope นี้</div>` : ""}
        ${control.buildVerifyStatus === "pending_verification" ? `<div class="notice warning" style="margin-top:14px"><b>ยังยืนยันผล Build ไม่ได้</b><br>ยังไม่ถือว่า Build สำเร็จ สามารถตรวจสถานะซ้ำได้โดยไม่ยิง Build ใหม่</div>` : ""}
        ${n8nStatusVisible ? `<div style="display:grid;gap:10px;margin-top:14px;padding:14px;border:1px solid var(--line);border-radius:8px;background:#fff">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><div class="metric-label">n8n Build Status</div><div style="font-size:12px;color:var(--muted);margin-top:3px">Source: PipelineLogs / n8n result</div></div>${statusPill(n8nStatusTone, escapeHtml(n8nStatusLabel))}</div>
          <div class="dc-status-list">
            <div><span>Run ID</span><b class="code-chip">${escapeHtml(control.buildRunId || "-")}</b></div>
            <div><span>Run status</span><b>${escapeHtml(control.buildRunStatus || control.buildVerifyStatus || "-")}</b></div>
            <div><span>Request ID</span><b class="code-chip">${escapeHtml(control.buildRequestId || "-")}</b></div>
            <div><span>Message</span><b>${escapeHtml(control.buildRunMessage || control.error || "-")}</b></div>
          </div>
        </div>` : ""}
        <div class="toolbar" style="margin-top:16px">
          <button id="build-run" class="button primary" type="button" ${!ready || actionBusy || control.lastBuildAt || buildPending ? "disabled" : ""}>${icon("build", "nav-icon")} ${firstBuild ? "Run First Build" : "Build Master"}</button>
          ${control.buildVerifyStatus === "pending_verification" ? `<button id="verify-build-status" class="button warm" type="button" ${actionBusy || buildVerifyBusy ? "disabled" : ""}>Verify Build Status</button>` : ""}
          <button class="button" data-route="pipeline-check" type="button">Open Pipeline Check</button>
        </div>
        ${!scope ? '<div class="notice warning">เริ่มจาก Pipeline Check แล้วกด Build Master หรือทำ Repair Preview ก่อน</div>' : ""}
        ${control.error ? `<div class="notice danger">${escapeHtml(control.error)}</div>` : ""}
        ${control.buildResult ? `<pre class="json-preview">${escapeHtml(JSON.stringify(control.buildResult, null, 2))}</pre>` : ""}
      </div>
    </article>
  </div>`;
}


const BUILD_VERIFY_MAX_ATTEMPTS = 9;
const BUILD_VERIFY_WAIT_MS = 15000;
let buildVerifyBusy = false;

function buildHealthRow(rows, scope) {
  return rows.find((item) =>
    (item.game_code || item.game) === scope.game
    && (item.period_key || item.month) === scope.month
  ) || null;
}

function buildVerifiedActionStatus(row) {
  const status = String(row?.action_status || "").toLowerCase();
  return status === "ready" || status === "ready_provisional";
}

function waitMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function verifyBuildCompletion(scope, { oneShot = false } = {}) {
  if (!scope || buildVerifyBusy) return false;
  buildVerifyBusy = true;
  const control = getState().control;
  const dispatchAt = control.buildDispatchAt || new Date().toISOString();
  setControl({
    buildVerifyStatus: "checking",
    buildProgress: Math.max(65, Number(getState().control.buildProgress || 0)),
    buildDispatchAt: dispatchAt,
    error: "",
  });
  window.dispatchEvent(new Event("cqr-page-refresh"));

  try {
    const attempts = oneShot ? 1 : BUILD_VERIFY_MAX_ATTEMPTS;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) await waitMs(BUILD_VERIFY_WAIT_MS);

      const [lookupResult, healthResult] = await Promise.all([
        callAuthorized("admin.pipeline.run.lookup", {
          game: scope.game,
          month: scope.month,
          query: "",
        }, 60000),
        callAuthorized("admin.pipeline.health", {
          game: scope.game,
          month: scope.month,
        }, 60000),
      ]);
      assertSuccessfulPayload(lookupResult, "Build run lookup");
      assertSuccessfulPayload(healthResult, "Build verification");
      const freshRun = newestFreshRun(extractRuns(lookupResult), scope, dispatchAt);
      const { rows } = normalizeHealth(healthResult);
      const row = buildHealthRow(rows, scope);
      if (!row) throw new Error("ไม่พบ Health row หลัง Build สำหรับ Scope นี้");

      if (freshRun) {
        const status = runStatus(freshRun);
        const message = runMessage(freshRun);
        setControl({
          buildRunStatus: status,
          buildRunId: freshRun.run_id || "",
          buildRunMessage: message,
        });
        if (isTerminalFailureStatus(status)) {
          const detail = [freshRun.run_id ? `run_id=${freshRun.run_id}` : "", message].filter(Boolean).join(" · ");
          setControl({
            lastBuildAt: "",
            buildVerifyStatus: "failed",
            buildProgress: 0,
            buildRunStatus: status,
            buildRunId: freshRun.run_id || "",
            buildRunMessage: message || `PipelineLogs status=${status}`,
            error: detail || `PipelineLogs status=${status}`,
          });
          addLog("Build Failed", lookupResult, scope);
          window.dispatchEvent(new Event("cqr-page-refresh"));
          return false;
        }
      }

      const actionStatus = String(row.action_status || "").toLowerCase();
      if (freshRun && isReadyRunStatus(runStatus(freshRun)) && buildVerifiedActionStatus(row)) {
        const previous = getState().control.buildResult;
        setControl({
          lastBuildAt: new Date().toISOString(),
          buildResult: {
            dispatch: previous?.dispatch || previous || null,
            pipelineRun: freshRun,
            verification: row,
          },
          buildProgress: 100,
          buildVerifyStatus: "verified",
          buildRunStatus: runStatus(freshRun),
          buildRunId: freshRun.run_id || "",
          buildRunMessage: runMessage(freshRun) || "PipelineLogs ready and Pipeline Health ready.",
          error: "",
        });
        addLog("Build Verify", healthResult, scope);
        showToast("Build verified");
        window.dispatchEvent(new Event("cqr-page-refresh"));
        return true;
      }

      if (actionStatus === "raw_not_ready" || actionStatus === "raw_missing") {
        throw new Error(`Build หยุดตรวจสอบ: Raw ไม่พร้อม (${row.action_status || "unknown"})`);
      }

      const progress = Math.min(95, 70 + Math.round(((attempt + 1) / attempts) * 20));
      setControl({
        buildVerifyStatus: "checking",
        buildProgress: progress,
        buildRunStatus: freshRun ? runStatus(freshRun) : getState().control.buildRunStatus,
        buildRunId: freshRun?.run_id || getState().control.buildRunId || "",
        buildRunMessage: freshRun ? (runMessage(freshRun) || `PipelineLogs status=${runStatus(freshRun)}`) : "Waiting for fresh PipelineLogs evidence.",
        error: "",
      });
      window.dispatchEvent(new Event("cqr-page-refresh"));
    }

    setControl({
      lastBuildAt: "",
      buildVerifyStatus: "pending_verification",
      buildProgress: 90,
      buildRunMessage: getState().control.buildRunMessage || "No fresh ready PipelineLogs run and ready Pipeline Health confirmation yet.",
      error: "Build ถูกส่งแล้ว แต่ยังยืนยันผลจาก Pipeline ไม่สำเร็จ จึงยังไม่ถือว่า Completed",
    });
    window.dispatchEvent(new Event("cqr-page-refresh"));
    return false;
  } catch (error) {
    setControl({
      lastBuildAt: "",
      buildVerifyStatus: "verification_failed",
      buildProgress: 0,
      buildRunStatus: getState().control.buildRunStatus || "verification_failed",
      buildRunMessage: error.message || String(error),
      error: error.message || String(error),
    });
    window.dispatchEvent(new Event("cqr-page-refresh"));
    return false;
  } finally {
    buildVerifyBusy = false;
  }
}

async function build() {
  const control = getState().control;
  const firstBuild = control.buildMode === "first_build";
  const scope = firstBuild ? control.buildScope : control.previewScope;
  if (!scope) return;

  const payloadParams = firstBuild
    ? {
      game: scope.game,
      month: scope.month,
      build_mode: "first_build",
      raw_data_hash: scope.rawHash,
      raw_hash: scope.rawHash,
      raw_check_id: scope.rawCheckId || "",
      expected_action_status: "build_required",
    }
    : {
      game: scope.game,
      month: scope.month,
      build_mode: "repair",
      run_id: scope.runId || "",
      cleanup_hash: scope.hash || "",
      hash: scope.hash || "",
      preview_receipt: control.previewToken,
    };

  if (firstBuild && !firstBuildIsReady(scope)) {
    setControl({ error: "First Build prerequisites ไม่ครบ กรุณากลับไป Pipeline Check" });
    return;
  }
  if (!firstBuild && (!scope.runId && !scope.hash)) {
    setControl({ error: "Repair Build ไม่มี Run ID หรือ Master Hash สำหรับล็อกขอบเขต" });
    return;
  }
  if (!firstBuild && (!control.previewToken || !control.lastClearAt)) {
    setControl({ error: "Repair Build ต้องผ่าน Preview และ Clear ก่อน" });
    return;
  }

  actionBusy = true;
  setControl({ error: "" });
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    if (firstBuild) {
      const healthResult = await callAuthorized("admin.pipeline.health", {
        game: scope.game,
        month: scope.month,
      }, 60000);
      assertSuccessfulPayload(healthResult, "First Build final health check");
      const { rows } = normalizeHealth(healthResult);
      const latestRow = rows.find((item) =>
        (item.game_code || item.game) === scope.game
        && (item.period_key || item.month) === scope.month
      );
      if (!latestRow) throw new Error("ไม่พบ Health row ล่าสุดของ Scope นี้");
      if (!isUsableRawStatus(latestRow.raw_status)) {
        throw new Error("Raw ไม่อยู่ในสถานะพร้อมใช้แล้ว กรุณารัน Check Raw ใหม่");
      }
      if (String(latestRow.action_status || "") !== "build_required") {
        if (String(latestRow.action_status || "") === "ready") {
          throw new Error("Scope นี้มี Master พร้อมใช้แล้ว ไม่ต้อง First Build");
        }
        if (String(latestRow.action_status || "") === "repair") {
          throw new Error("พบ Master เดิมแล้ว ต้องใช้ Repair Flow");
        }
        throw new Error(`สถานะล่าสุดไม่อนุญาต First Build (${latestRow.action_status || "unknown"})`);
      }
      if (!latestRow.raw_hash) throw new Error("Raw Hash ล่าสุดว่าง กรุณารัน Check Raw ใหม่");
      if (latestRow.raw_hash !== scope.rawHash) {
        throw new Error("Raw Hash เปลี่ยนจากตอนเปิดหน้า กรุณากลับไป Pipeline Check แล้วเริ่มใหม่");
      }
    }

    const dispatchAt = new Date().toISOString();
    const result = await callAuthorized("admin.n8n.master.run", payloadParams, 120000);
    const payload = assertSuccessfulPayload(result, "Master build");
    const requestId = String(result?.request_id || payload?.request_id || "");
    setControl({
      lastBuildAt: "",
      buildResult: { dispatch: payload },
      buildProgress: 60,
      buildVerifyStatus: "processing",
      buildDispatchAt: dispatchAt,
      buildRequestId: requestId,
      buildRunStatus: String(payload?.status || result?.status || "sent").toLowerCase(),
      buildRunId: "",
      buildRunMessage: payload?.message || result?.message || "Build dispatched; waiting for fresh PipelineLogs evidence.",
      error: "",
    });
    addLog(firstBuild ? "First Build Sent" : "Repair Build Sent", result, {
      ...scope,
      runId: scope.runId || "",
      rawHash: scope.rawHash || "",
    });
    if (firstBuild) persistFirstBuild(null);
    showToast(firstBuild ? "First Build sent — verifying" : "Build sent — verifying");
    await verifyBuildCompletion(scope);
  } catch (error) {
    setControl({
      lastBuildAt: "",
      buildResult: null,
      buildProgress: 0,
      buildVerifyStatus: "dispatch_failed",
      buildRunStatus: "failed",
      buildRunMessage: error.message || String(error),
      error: error.message || String(error),
    });
  } finally {
    actionBusy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

export function bindDataControlBuildPage() {
  if (consumeHandoff()) return;
  const control = getState().control;
  if (!control.buildScope && control.buildMode !== "repair") {
    const saved = readFirstBuild();
    if (saved) {
      applyFirstBuildScope(saved);
      return;
    }
  }

  const resumeScope = control.buildMode === "first_build" ? control.buildScope : control.previewScope;
  if (resumeScope && ["processing", "checking"].includes(String(control.buildVerifyStatus || ""))) {
    queueMicrotask(() => verifyBuildCompletion(resumeScope));
  }
  document.getElementById("verify-build-status")?.addEventListener("click", () => {
    const latest = getState().control;
    const verifyScope = latest.buildMode === "first_build" ? latest.buildScope : latest.previewScope;
    if (verifyScope) verifyBuildCompletion(verifyScope, { oneShot: true });
  });

  document.getElementById("build-run")?.addEventListener("click", () => {
    const latest = getState().control;
    const firstBuild = latest.buildMode === "first_build";
    const scope = firstBuild ? latest.buildScope : latest.previewScope;
    if (!scope) return;

    if (firstBuild) {
      const phrase = `BUILD ${scope.game} ${scope.month}`;
      if (document.getElementById("build-phrase")?.value.trim() !== phrase || !document.getElementById("build-ack")?.checked) {
        showToast("Confirmation ยังไม่ครบ");
        return;
      }
      openConfirmModal({
        title: "Final First Build Confirmation",
        message: `สร้าง Master ครั้งแรกสำหรับ ${scope.game} / ${scope.month} จาก Raw Hash ${scope.rawHash}?`,
        confirmLabel: "Run First Build",
        danger: false,
        onConfirm: build,
      });
      return;
    }

    openConfirmModal({
      title: "Final Repair Build Confirmation",
      message: `Build Master ใหม่สำหรับ ${scope.game} / ${scope.month} หลัง Clear สำเร็จ?`,
      confirmLabel: "Build Master",
      danger: false,
      onConfirm: build,
    });
  });

  document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.route)));
}
