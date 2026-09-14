import { APP_CONFIG } from "../config.js";
import { getState, setHealth, setPipeline, setFilters, setRoute } from "../state.js?v=3506";
import { callAuthorized, assertSuccessfulPayload, normalizePayload } from "../services/admin-api.js";
import { escapeHtml, icon, optionMarkup, statusPill } from "../ui.js";

const HANDOFF_KEY = "cqr_data_control_handoff";

function tone(level) {
  const value = String(level || "").toLowerCase();
  return ["ok", "ready", "healthy", "raw_ready"].includes(value)
    ? "ready"
    : ["danger", "failed", "missing", "raw_missing", "raw_not_ready", "repair"].includes(value)
      ? "danger"
      : "warning";
}

function normalize(result) {
  const payload = normalizePayload(result);
  const source = payload && typeof payload === "object" ? payload : {};
  const rows = Array.isArray(source.scope_rows) ? source.scope_rows : Array.isArray(source.rows) ? source.rows : [];
  const action = (row) => String(row.action_status || "").toLowerCase();
  const direct = (row) => String(row.dashboard_direct_read || "").toLowerCase();
  return {
    rows,
    summary: {
      ...(source.summary || {}),
      build_required: rows.filter((row) => action(row) === "build_required").length,
      cleanup_needed: rows.filter((row) => action(row) === "repair").length,
      dashboard_direct_ready: rows.filter((row) => direct(row) === "ready").length,
      dashboard_direct_issues: rows.filter((row) => direct(row) && direct(row) !== "ready").length,
    },
    issues: Array.isArray(source.issues) ? source.issues : [],
    recommendations: Array.isArray(source.recommendations) ? source.recommendations : [],
    source: source.source || result?.source || "backend",
    readMode: source.dashboard_read_mode || "direct_master_aggregation",
  };
}

function summaryCards(data) {
  const summary = data.summary;
  const total = data.rows.length;
  const actionNeeded = data.rows.filter((row) => nextAction(row).mode).length;
  const healthy = total > 0 && actionNeeded === 0;
  return `<div class="metric-grid" style="grid-template-columns:repeat(auto-fit,minmax(145px,1fr))">
    <div class="metric-box"><div class="metric-label">Scope ที่ตรวจ</div><div class="metric-value">${total}</div></div>
    <div class="metric-box"><div class="metric-label">Scope พร้อมใช้งาน</div><div class="metric-value">${healthy ? "ทั้งหมด" : total - actionNeeded}</div></div>
    <div class="metric-box"><div class="metric-label">ต้องสร้าง Master</div><div class="metric-value">${Number(summary.build_required || 0)}</div></div>
    <div class="metric-box"><div class="metric-label">ต้องซ่อมข้อมูล</div><div class="metric-value">${Number(summary.cleanup_needed || 0)}</div></div>
    <div class="metric-box"><div class="metric-label">ต้องตรวจ Raw</div><div class="metric-value">${data.rows.filter((row) => nextAction(row).mode === "check_raw").length}</div></div>
  </div>`;
}

function simpleStatus(value, fallback = "-") {
  const status = String(value || "").toLowerCase();
  if (["ready", "ok", "healthy", "success", "completed", "raw_ready"].includes(status)) return "พร้อม";
  if (["missing", "raw_missing"].includes(status)) return "ไม่พบข้อมูล";
  if (["failed", "danger", "repair"].includes(status)) return "มีปัญหา";
  if (["pending", "running", "queued"].includes(status)) return "กำลังทำงาน";
  if (["warning", "warn", "partial", "updated", "raw_updated", "raw_partial", "raw_not_ready"].includes(status)) return "ต้องตรวจสอบ";
  return value || fallback;
}

function rawStatus(row) {
  return simpleStatus(row.raw_status || row.raw, "-");
}

function masterStatus(row) {
  const master = row.master || row.master_status || row.dashboard_direct_read || "";
  if (row.dashboard_missing_tabs) return "Dashboard ยังไม่ครบ";
  return simpleStatus(master, "-");
}

function nextAction(row) {
  const action = String(row.action_status || "").toLowerCase();
  if (action === "build_required") {
    return { mode: "first_build", label: "สร้าง Master", buttonClass: "warm", note: "มี Raw แล้ว แต่ยังไม่มี Master/Dashboard สำหรับ Scope นี้" };
  }
  if (action === "repair") {
    return { mode: "repair", label: "เปิด Repair", buttonClass: "danger", note: "ข้อมูลปลายทางไม่ตรงกัน ควรตรวจและซ่อมผ่านขั้นตอน Repair" };
  }
  if (["raw_missing", "raw_not_ready"].includes(action)) {
    return { mode: "check_raw", label: "ตรวจ Raw", buttonClass: "", note: "ยังต้องตรวจ Raw ก่อนเริ่มสร้างหรือซ่อมข้อมูล" };
  }
  return { mode: "", label: "ไม่ต้องทำ Action", buttonClass: "", note: "ข้อมูลพร้อมใช้งานใน Scope นี้" };
}

function actionControl(row, index) {
  const action = nextAction(row);
  if (!action.mode) return statusPill("ready", "ไม่ต้องทำ Action");
  return `<button class="button small ${action.buttonClass}" type="button" data-health-action="${action.mode}" data-row-index="${index}">${escapeHtml(action.label)}</button>`;
}

function healthGuidance(data) {
  return data.rows.length
    ? `<div class="list-stack">${data.rows.map((row, index) => {
        const action = nextAction(row);
        return `<div class="list-item" style="align-items:flex-start;gap:14px">
          <div class="list-item-icon">${icon(action.mode ? "target" : "check")}</div>
          <div style="min-width:0;flex:1">
            <div class="list-item-title">${escapeHtml(row.game_code || "-")} · ${escapeHtml(row.period_key || "-")}</div>
            <div class="metric-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:10px">
              <div class="metric-box"><div class="metric-label">Game</div><div class="metric-value" style="font-size:20px">${escapeHtml(row.game_code || "-")}</div></div>
              <div class="metric-box"><div class="metric-label">Month</div><div class="metric-value" style="font-size:20px">${escapeHtml(row.period_key || "-")}</div></div>
              <div class="metric-box"><div class="metric-label">Raw status</div><div>${statusPill(tone(row.raw_level || row.raw_status), escapeHtml(rawStatus(row)))}</div></div>
              <div class="metric-box"><div class="metric-label">Master/Dashboard status</div><div>${statusPill(tone(row.master_level || row.dashboard_read_level || row.dashboard_direct_read), escapeHtml(masterStatus(row)))}</div></div>
            </div>
            <div class="notice ${action.mode === "repair" ? "danger" : action.mode ? "warning" : "ready"}" style="margin-top:12px">
              <strong>ปัญหา:</strong> ${escapeHtml(action.note)}
            </div>
          </div>
          <div style="display:grid;gap:8px;justify-items:end;min-width:150px">
            <div class="list-item-meta">Action ถัดไป</div>
            ${actionControl(row, index)}
          </div>
        </div>`;
      }).join("")}</div>`
    : '<div class="empty-state">ไม่พบข้อมูลใน Scope ที่เลือก</div>';
}

function filters(prefix, all = true) {
  const state = getState();
  return `<div class="form-grid two">
    <label class="form-field"><span class="form-label">Game</span><select id="${prefix}-game" class="form-control">${optionMarkup(all ? APP_CONFIG.games : APP_CONFIG.games.filter((item) => item.value !== "ALL"), state.filters.game)}</select></label>
    <label class="form-field"><span class="form-label">Month</span><select id="${prefix}-month" class="form-control">${optionMarkup(all ? [{ value: "ALL", label: "All Periods" }, ...APP_CONFIG.months] : APP_CONFIG.months, state.filters.month)}</select></label>
  </div>`;
}

function recommendationAction(recommendation, index) {
  if (recommendation?.build) {
    return `<button class="button small warm" data-recommendation-index="${index}" data-recommendation-mode="first_build" type="button">Build Master</button>`;
  }
  if (recommendation?.cleanup) {
    return `<button class="button small" data-recommendation-index="${index}" data-recommendation-mode="repair" type="button">Send to Data Control</button>`;
  }
  if (recommendation?.check_raw || recommendation?.raw_check) {
    return `<button class="button small" data-recommendation-index="${index}" data-recommendation-mode="check_raw" type="button">Check Raw</button>`;
  }
  return "";
}

function simpleIssueText(issue) {
  const title = issue?.title || issue?.badge || "พบสิ่งที่ต้องตรวจสอบ";
  const detail = issue?.detail ? `: ${issue.detail}` : "";
  return `${title}${detail}`;
}

function simpleRecommendationText(recommendation) {
  if (recommendation?.build) return "มี Scope ที่ควรสร้าง Master ต่อ";
  if (recommendation?.cleanup) return "มี Scope ที่ควรเปิด Repair เพื่อตรวจและซ่อมข้อมูล";
  if (recommendation?.check_raw || recommendation?.raw_check) return "มี Scope ที่ควรตรวจ Raw ก่อน";
  return recommendation?.title || "ไม่มี Action เพิ่มเติม";
}

function guidanceNotes(data) {
  const notes = [
    ...data.issues.map((issue) => simpleIssueText(issue)),
    ...data.recommendations.map((recommendation) => simpleRecommendationText(recommendation)),
  ].filter(Boolean);
  if (!notes.length) return "";
  return `<article class="surface-card"><div class="card-header"><div><h2 class="card-title">สิ่งที่ระบบพบ</h2><p class="card-description">สรุปให้อ่านง่ายจากผลตรวจล่าสุด</p></div></div><div class="card-body list-stack">${notes.slice(0, 6).map((note) => `<div class="list-item"><div class="list-item-icon">${icon("warning")}</div><div class="list-item-title">${escapeHtml(note)}</div></div>`).join("")}</div></article>`;
}

function advancedDetails(data, checkedAt) {
  return `<article class="surface-card">
    <details>
      <summary class="card-header" style="cursor:pointer"><div><h2 class="card-title">Advanced Details</h2><p class="card-description">ข้อมูลเทคนิคสำหรับทีมภายใน · Source: ${escapeHtml(data.source)} · Read mode: ${escapeHtml(data.readMode)} · Checked: ${escapeHtml(checkedAt ? new Date(checkedAt).toLocaleString("th-TH") : "-")}</p></div></summary>
      <div class="card-body">
        ${data.rows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Game</th><th>Month</th><th>Raw Hash</th><th>Master Hash</th><th>Dashboard Direct Read</th><th>Missing Tabs</th><th>Raw Check ID</th><th>Run ID</th><th>Action Status</th></tr></thead>
          <tbody>${data.rows.map((row) => `<tr>
            <td>${escapeHtml(row.game_code || "-")}</td>
            <td>${escapeHtml(row.period_key || "-")}</td>
            <td class="code-chip">${escapeHtml(row.raw_hash || "-")}</td>
            <td class="code-chip">${escapeHtml(row.master_hash || row.previous_hash || "-")}</td>
            <td>${escapeHtml(row.dashboard_direct_read || "-")}</td>
            <td>${escapeHtml(row.dashboard_missing_tabs || "-")}</td>
            <td class="code-chip">${escapeHtml(row.raw_check_id || "-")}</td>
            <td class="code-chip">${escapeHtml(row.review_run_id || row.ready_run_id || row.latest_run_id || "-")}</td>
            <td>${escapeHtml(row.action_status || "-")}</td>
          </tr>`).join("")}</tbody>
        </table></div>` : '<div class="empty-state">ไม่มีรายละเอียดเทคนิค</div>'}
      </div>
    </details>
  </article>`;
}

export function renderDataHealthOverviewPage() {
  const health = getState().health;
  const data = health.result ? normalize(health.result) : null;
  const healthy = data?.rows.length && data.rows.every((row) => !nextAction(row).mode);
  return `<div class="page-grid">
    <article class="surface-card">
      <div class="card-header"><div><h2 class="card-title">Data Health & Repair</h2><p class="card-description">1. ตรวจสถานะข้อมูล 2. ระบบบอกปัญหา 3. กด Action เดียวเพื่อไปขั้นตอนถัดไป</p></div>${statusPill(health.status, health.status === "idle" ? "ยังไม่ได้ตรวจ" : health.status)}</div>
      <div class="card-body">${filters("health", true)}<div class="toolbar" style="margin-top:14px"><button id="health-run" class="button primary" type="button" ${health.status === "loading" ? "disabled" : ""}>${icon("refresh", "nav-icon")} ตรวจสถานะข้อมูล</button></div>${health.error ? `<div class="notice danger" style="margin-top:12px">${escapeHtml(health.error)}</div>` : ""}</div>
    </article>
    ${data ? `<article class="surface-card"><div class="card-body">${summaryCards(data)}</div></article>
      ${healthy ? '<div class="notice ready">ข้อมูลพร้อมใช้งาน ไม่ต้องทำ Action เพิ่มเติม</div>' : ""}
      <article class="surface-card"><div class="card-header"><div><h2 class="card-title">สถานะและ Action ถัดไป</h2><p class="card-description">เลือกดูตาม Game และ Month แล้วทำตาม Action ที่ระบบแนะนำในแต่ละ Scope</p></div></div><div class="card-body">${healthGuidance(data)}</div></article>
      ${guidanceNotes(data)}
      ${advancedDetails(data, health.checkedAt)}` : ""}
  </div>`;
}

async function run(kind) {
  const game = document.getElementById(`${kind}-game`)?.value || "ALL";
  const month = document.getElementById(`${kind}-month`)?.value || "ALL";
  setFilters({ game, month });
  const setter = kind === "pipeline" ? setPipeline : setHealth;
  setter({ status: "loading", error: "" });
  try {
    const result = await callAuthorized("admin.pipeline.health", { game, month: month === "ALL" ? "" : month }, 60000);
    assertSuccessfulPayload(result, kind === "pipeline" ? "Pipeline check" : "Data health");
    setter({ status: "completed", checkedAt: new Date().toISOString(), result, error: "" });
  } catch (error) {
    setter({ status: "failed", error: error.message || String(error) });
  }
}

function handoffFromRow(row, mode) {
  return {
    mode,
    target_game_code: row.game_code || "",
    target_month: row.period_key || "",
    raw_hash: row.raw_hash || "",
    raw_check_id: row.raw_check_id || "",
    raw_status: row.raw_status || "",
    action_status: row.action_status || "",
    run_id: row.review_run_id || row.ready_run_id || row.latest_run_id || "",
    search_hash: row.master_hash || row.previous_hash || "",
  };
}

function bindHealthActions(kind) {
  document.querySelectorAll("[data-health-action]").forEach((button) => button.addEventListener("click", () => {
    const source = kind === "pipeline" ? getState().pipeline.result : getState().health.result;
    const row = normalize(source).rows[Number(button.dataset.rowIndex)];
    if (!row) return;
    const action = button.dataset.healthAction;
    setFilters({ game: row.game_code, month: row.period_key });
    if (action === "check_raw") {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ mode: "check_raw", target_game_code: row.game_code, target_month: row.period_key }));
      setRoute("check-raw");
      return;
    }
    const mode = action === "first_build" ? "first_build" : "repair";
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(handoffFromRow(row, mode)));
    setRoute(mode === "first_build" ? "data-control-build" : "data-control-preview");
  }));
}

export function bindDataHealthOverviewPage() {
  document.getElementById("health-run")?.addEventListener("click", () => run("health"));
  bindHealthActions("health");
  document.querySelectorAll("[data-recommendation-index]").forEach((button) => button.addEventListener("click", () => {
    const recommendation = normalize(getState().health.result).recommendations[Number(button.dataset.recommendationIndex)];
    const mode = button.dataset.recommendationMode;
    const payload = mode === "first_build"
      ? recommendation?.build
      : mode === "check_raw"
        ? (recommendation?.check_raw || recommendation?.raw_check)
        : recommendation?.cleanup;
    if (!payload) return;
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ ...payload, mode }));
    setFilters({
      game: payload.target_game_code || getState().filters.game,
      month: payload.target_month || getState().filters.month,
    });
    if (mode === "check_raw") {
      setRoute("check-raw");
      return;
    }
    setRoute(mode === "first_build" ? "data-control-build" : "data-control-preview");
  }));
}

export function renderPipelineCheckPage() {
  const pipeline = getState().pipeline;
  const data = pipeline.result ? normalize(pipeline.result) : null;
  return `<div class="page-grid">
    <article class="surface-card warm-card">
      <div class="card-header"><div><h2 class="card-title">Pipeline Check</h2><p class="card-description">ตรวจความสอดคล้อง Raw Source → Master Data → Data Index</p></div>${statusPill(pipeline.status, pipeline.status === "idle" ? "Not checked" : pipeline.status)}</div>
      <div class="card-body">${filters("pipeline", true)}<div class="toolbar" style="margin-top:14px"><button id="pipeline-run" class="button primary" type="button" ${pipeline.status === "loading" ? "disabled" : ""}>${icon("play", "nav-icon")} Run Pipeline Check</button></div>${pipeline.error ? `<div class="notice danger">${escapeHtml(pipeline.error)}</div>` : ""}</div>
    </article>
    ${data ? `<article class="surface-card"><div class="card-body">${summaryCards(data)}<div style="margin-top:16px">${healthGuidance(data)}</div></div></article>` : ""}
  </div>`;
}

export function bindPipelineCheckPage() {
  document.getElementById("pipeline-run")?.addEventListener("click", () => run("pipeline"));
  bindHealthActions("pipeline");
}
