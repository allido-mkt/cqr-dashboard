import { APP_CONFIG } from "../config.js";
import { getState, setHealth, setPipeline, setFilters, setRoute } from "../state.js";
import { callAuthorized, assertSuccessfulPayload, normalizePayload } from "../api.js";
import { escapeHtml, icon, optionMarkup, statusPill } from "../ui.js";

function tone(level) {
  const value = String(level || "").toLowerCase();
  return ["ok", "ready", "healthy", "raw_ready"].includes(value) ? "ready" : ["danger", "failed", "missing", "raw_missing"].includes(value) ? "danger" : "warning";
}

function normalize(result) {
  const payload = normalizePayload(result);
  const source = payload && typeof payload === "object" ? payload : {};
  const rows = Array.isArray(source.scope_rows) ? source.scope_rows : Array.isArray(source.rows) ? source.rows : [];
  return { rows, summary: source.summary || {}, issues: Array.isArray(source.issues) ? source.issues : [], recommendations: Array.isArray(source.recommendations) ? source.recommendations : [], source: source.source || result?.source || "backend" };
}

function summaryCards(data) {
  const summary = data.summary;
  return `<div class="metric-grid four"><div class="metric-box"><div class="metric-label">Health Score</div><div class="metric-value">${escapeHtml(summary.health_score ?? "-")}</div></div><div class="metric-box"><div class="metric-label">Raw Ready</div><div class="metric-value">${Number(summary.raw_ready || 0)}</div></div><div class="metric-box"><div class="metric-label">Need Review</div><div class="metric-value">${Number(summary.needs_review || 0)}</div></div><div class="metric-box"><div class="metric-label">Need Repair</div><div class="metric-value">${Number(summary.cleanup_needed || 0)}</div></div></div>`;
}

function healthTable(data) {
  return data.rows.length ? `<div class="table-wrap"><table><thead><tr><th>Game</th><th>Month</th><th>Raw</th><th>Master / Central</th><th>Raw Hash</th><th>Master Hash</th><th>Action</th></tr></thead><tbody>${data.rows.map((row) => `<tr><td>${escapeHtml(row.game_code)}</td><td>${escapeHtml(row.period_key)}</td><td>${statusPill(tone(row.raw_level || row.raw_status), escapeHtml(row.raw || row.raw_status || "-"))}</td><td>${statusPill(tone(row.master_level), escapeHtml(row.master || "-"))}</td><td class="code-chip">${escapeHtml(row.raw_hash || "-")}</td><td class="code-chip">${escapeHtml(row.master_hash || row.previous_hash || "-")}</td><td>${statusPill(tone(row.action_level || row.action_status), escapeHtml(row.action || row.action_status || "-"))}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state">ไม่พบข้อมูลใน Scope ที่เลือก</div>';
}

function filters(prefix, all = true) {
  const state = getState();
  return `<div class="form-grid two"><label class="form-field"><span class="form-label">Game</span><select id="${prefix}-game" class="form-control">${optionMarkup(all ? APP_CONFIG.games : APP_CONFIG.games.filter((item) => item.value !== "ALL"), state.filters.game)}</select></label><label class="form-field"><span class="form-label">Month</span><select id="${prefix}-month" class="form-control">${optionMarkup(all ? [{ value: "ALL", label: "All Periods" }, ...APP_CONFIG.months] : APP_CONFIG.months, state.filters.month)}</select></label></div>`;
}

export function renderDataHealthOverviewPage() {
  const health = getState().health;
  const data = health.result ? normalize(health.result) : null;
  return `<div class="page-grid"><article class="surface-card"><div class="card-header"><div><h2 class="card-title">Data Health Overview</h2><p class="card-description">ตรวจ Raw, Master และ Central DB ใน Scope เดียวกัน</p></div>${statusPill(health.status, health.status === "idle" ? "Not checked" : health.status)}</div><div class="card-body">${filters("health", true)}<div class="toolbar" style="margin-top:14px"><button id="health-run" class="button primary" type="button" ${health.status === "loading" ? "disabled" : ""}>${icon("refresh", "nav-icon")} Run Health Check</button></div>${health.error ? `<div class="notice danger" style="margin-top:12px">${escapeHtml(health.error)}</div>` : ""}</div></article>${data ? `<article class="surface-card"><div class="card-body">${summaryCards(data)}</div></article><article class="surface-card"><div class="card-header"><div><h2 class="card-title">Health by Game</h2><p class="card-description">ข้อมูลจาก admin.pipeline.health · Source: ${escapeHtml(data.source)} · Checked: ${escapeHtml(health.checkedAt ? new Date(health.checkedAt).toLocaleString("th-TH") : "-")}</p></div></div><div class="card-body">${healthTable(data)}</div></article><section class="grid-2"><article class="surface-card"><div class="card-header"><div><h2 class="card-title">Issues</h2></div></div><div class="card-body list-stack">${data.issues.length ? data.issues.map((issue) => `<div class="list-item"><div class="list-item-icon">${icon("warning")}</div><div><div class="list-item-title">${escapeHtml(issue.title || issue.badge)}</div><div class="list-item-meta">${escapeHtml(issue.detail || "")}</div></div></div>`).join("") : '<div class="empty-state">ไม่พบ Issue</div>'}</div></article><article class="surface-card"><div class="card-header"><div><h2 class="card-title">Recommendations</h2></div></div><div class="card-body list-stack">${data.recommendations.length ? data.recommendations.map((recommendation, index) => `<div class="list-item"><div><div class="list-item-title">${escapeHtml(recommendation.title)}</div><div class="list-item-meta">${escapeHtml(recommendation.detail)}</div></div>${recommendation.cleanup ? `<button class="button small" data-handoff="${index}" type="button">Send to Data Control</button>` : ""}</div>`).join("") : '<div class="empty-state">ไม่มี Action ที่ต้องทำ</div>'}</div></article></section>` : ""}</div>`;
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

export function bindDataHealthOverviewPage() {
  document.getElementById("health-run")?.addEventListener("click", () => run("health"));
  document.querySelectorAll("[data-handoff]").forEach((button) => button.addEventListener("click", () => {
    const recommendation = normalize(getState().health.result).recommendations[Number(button.dataset.handoff)];
    const cleanup = recommendation?.cleanup || {};
    sessionStorage.setItem("cqr_data_control_handoff", JSON.stringify(cleanup));
    setRoute("data-control-preview");
  }));
}

export function renderPipelineCheckPage() {
  const pipeline = getState().pipeline;
  const data = pipeline.result ? normalize(pipeline.result) : null;
  return `<div class="page-grid"><article class="surface-card warm-card"><div class="card-header"><div><h2 class="card-title">Pipeline Check</h2><p class="card-description">ตรวจความสอดคล้อง Raw Source → Master Data → Data Index</p></div>${statusPill(pipeline.status, pipeline.status === "idle" ? "Not checked" : pipeline.status)}</div><div class="card-body">${filters("pipeline", true)}<div class="toolbar" style="margin-top:14px"><button id="pipeline-run" class="button primary" type="button" ${pipeline.status === "loading" ? "disabled" : ""}>${icon("play", "nav-icon")} Run Pipeline Check</button></div>${pipeline.error ? `<div class="notice danger">${escapeHtml(pipeline.error)}</div>` : ""}</div></article>${data ? `<article class="surface-card"><div class="card-body">${summaryCards(data)}<div style="margin-top:16px">${healthTable(data)}</div></div></article>` : ""}</div>`;
}

export function bindPipelineCheckPage() {
  document.getElementById("pipeline-run")?.addEventListener("click", () => run("pipeline"));
}
