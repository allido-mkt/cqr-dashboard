import { APP_CONFIG } from "../config.js";
import { callAuthorized, assertSuccessfulPayload, normalizePayload } from "../api.js";
import { getSavedSession, updateSavedSession } from "../session.js";
import { escapeHtml, showToast, statusPill, openConfirmModal } from "../ui.js";

let users = [];
let selectedEmail = "";
let loading = false;
let loaded = false;
let busy = false;
let historyLoading = false;
let error = "";
let info = "";
let configuredSuperAdmins = [];
let currentActorEmail = "";
let accessLogs = [];
let loginLogs = [];

const ROLES = ["viewer", "analyst", "manager", "admin", "super_admin", "guest"];
const STATUSES = ["active", "pending", "disabled"];
const GAMES = APP_CONFIG.games.filter((item) => item.value !== "ALL");
const REGIONS = [
  { value: "TH", label: "Thailand", helper: "เกมที่ลงท้ายด้วย _TH" },
  { value: "SEA", label: "Southeast Asia", helper: "เกมที่ลงท้ายด้วย _SEA" },
];

function csv(value) {
  const text = String(value || "ALL").trim().toUpperCase();
  if (!text || text === "ALL") return ["ALL"];
  return [...new Set(text.split(",").map((item) => item.trim()).filter(Boolean))];
}

function selected(value, current) { return value === current ? " selected" : ""; }

function choice(group, item, checked, all = false) {
  const code = String(item?.value || "").trim().toUpperCase();
  return `<label class="ua-scope-item${all ? " is-all" : ""}">
    <input type="checkbox" name="ua-${group}" value="${escapeHtml(code)}" ${checked ? "checked" : ""} ${busy ? "disabled" : ""}>
    <span class="ua-scope-checkbox" aria-hidden="true"></span>
    <span class="ua-scope-code">${escapeHtml(code)}</span>
  </label>`;
}

function picker(group, title, value, options) {
  const parsed = String(value || "ALL")
    .toUpperCase()
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const selectedValues = parsed.length ? [...new Set(parsed)] : ["ALL"];
  const allSelected = selectedValues.includes("ALL");

  return `<section class="ua-scope-group" data-scope="${escapeHtml(group)}">
    <div class="ua-scope-group-label">${escapeHtml(title)}</div>
    <div class="ua-scope-pill">
      ${choice(group, { value: "ALL" }, allSelected, true)}
      ${options.map((item) => {
        const code = String(item?.value || "").trim().toUpperCase();
        return choice(group, { value: code }, !allSelected && selectedValues.includes(code));
      }).join("")}
    </div>
  </section>`;
}

function form(user = {}) {
  const email = String(user.email || "").toLowerCase();
  const configured = configuredSuperAdmins.includes(email);
  return `<div class="ua-form"><div class="form-grid two"><label class="form-field"><span class="form-label">Email</span><input id="user-email" class="form-control" value="${escapeHtml(user.email || "")}" placeholder="email@example.com" ${busy || selectedEmail ? "disabled" : ""}></label><label class="form-field"><span class="form-label">Display Name</span><input id="user-name" class="form-control" value="${escapeHtml(user.display_name || "")}" ${busy ? "disabled" : ""}></label><label class="form-field"><span class="form-label">Role</span><select id="user-role" class="form-control" ${busy || configured ? "disabled" : ""}>${ROLES.map((role) => `<option value="${role}"${selected(role, user.role_id || "viewer")}>${role.replace("_", " ")}</option>`).join("")}</select></label><label class="form-field"><span class="form-label">Status</span><select id="user-status" class="form-control" ${busy || configured ? "disabled" : ""}>${STATUSES.map((status) => `<option${selected(status, user.status || "active")}>${status}</option>`).join("")}</select></label></div><div class="ua-picker-grid">${picker("games", "Games", user.allowed_games || "ALL", GAMES)}${picker("regions", "Regions", user.allowed_regions || "ALL", REGIONS)}</div><div id="ua-scope-preview" class="ua-scope-preview"></div>${configured ? '<div class="ua-protection-note"><span>Protected account</span><b>Role, status and deletion are locked.</b></div>' : ""}</div>`;
}

function extractUsers(result) {
  const payload = normalizePayload(result);
  if (Array.isArray(result?.users)) return result.users;
  if (Array.isArray(payload?.users)) return payload.users;
  if (Array.isArray(payload)) return payload;
  return [];
}

function checkedValues(group) {
  const values = [...document.querySelectorAll(`input[name="ua-${group}"]:checked`)].map((node) => node.value);
  if (!values.length || values.includes("ALL")) return ["ALL"];
  return [...new Set(values)];
}

function serialize(group) {
  const values = checkedValues(group);
  return values.includes("ALL") ? "ALL" : values.join(",");
}

function mismatch(games, regions) {
  if (games.includes("ALL") || regions.includes("ALL")) return [];
  return games.filter((game) => {
    const region = game.endsWith("_TH") ? "TH" : game.endsWith("_SEA") ? "SEA" : "";
    return region && !regions.includes(region);
  });
}

function labels(values, options, allLabel) {
  if (values.includes("ALL")) return allLabel;
  const map = new Map(options.map((item) => [item.value, item.label]));
  return values.map((value) => map.get(value) || value).join(", ");
}

function updateScopePreview() {
  const target = document.getElementById("ua-scope-preview");
  if (!target) return;
  target.replaceChildren();
  target.hidden = true;
}

function bindPicker(group) {
  document.querySelectorAll(`input[name="ua-${group}"]`).forEach((input) => input.addEventListener("change", () => {
    const all = document.querySelector(`input[name="ua-${group}"][value="ALL"]`);
    const specific = [...document.querySelectorAll(`input[name="ua-${group}"]:not([value="ALL"])`)];
    if (input.value === "ALL" && input.checked) specific.forEach((item) => { item.checked = false; });
    if (input.value !== "ALL" && input.checked && all) all.checked = false;
    if (![...document.querySelectorAll(`input[name="ua-${group}"]:checked`)].length && all) all.checked = true;
    updateScopePreview();
  }));
}

function normalizeScopeParts(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  if (text.toUpperCase() === "ALL") return ["ALL"];
  return text.split(",").map((part) => part.trim()).filter(Boolean);
}

function scopeTagClass(value, kind) {
  const normalized = String(value || "").trim().toUpperCase();

  if (normalized === "ALL") return "scope-tag--all";

  if (kind === "games") {
    if (normalized === "CBM_TH") return "scope-tag--cbm-th";
    if (normalized === "CBPC_TH") return "scope-tag--cbpc-th";
    if (normalized === "CBM_SEA") return "scope-tag--cbm-sea";
    if (normalized === "CBPC_SEA") return "scope-tag--cbpc-sea";
  }

  if (kind === "regions") {
    if (normalized === "TH") return "scope-tag--th";
    if (normalized === "SEA") return "scope-tag--sea";
  }

  return "scope-tag--all";
}

function renderScopeTags(value, kind) {
  const parts = normalizeScopeParts(value);

  if (!parts.length) {
    return '<span class="muted">-</span>';
  }

  return `<div class="scope-tags">${parts.map((part) => (
    `<span class="scope-tag ${scopeTagClass(part, kind)}">${escapeHtml(part)}</span>`
  )).join("")}</div>`;
}

function row(user) {
  return `<tr><td><b>${escapeHtml(user.email)}</b></td><td>${escapeHtml(user.display_name || "-")}</td><td>${statusPill(user.role_id === "super_admin" ? "ready" : "warm", escapeHtml(user.role_id || "viewer"))}</td><td>${statusPill(user.status === "active" ? "ready" : user.status === "disabled" ? "danger" : "warning", escapeHtml(user.status || "active"))}</td><td>${renderScopeTags(user.allowed_games || "ALL", "games")}</td><td>${renderScopeTags(user.allowed_regions || "ALL", "regions")}</td><td>${escapeHtml(user.last_login_at || "-")}</td><td class="ua-actions"><button class="button small" data-user="${escapeHtml(user.email)}" type="button">Edit</button></td></tr>`;
}

function historyTable(rows, type) {
  if (!rows.length) return '<div class="empty-state">ยังไม่มีประวัติ</div>';
  if (type === "access") return `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>By</th><th>Result</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHtml(item.created_at || "-")}</td><td>${escapeHtml(item.action || "-")}</td><td>${escapeHtml(item.target_email || "-")}</td><td>${escapeHtml(item.performed_by || "-")}</td><td>${escapeHtml(item.result || "-")}</td></tr>`).join("")}</tbody></table></div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Login Time</th><th>Email</th><th>Role</th><th>Result</th><th>User Agent</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHtml(item.login_at || "-")}</td><td>${escapeHtml(item.email || "-")}</td><td>${escapeHtml(item.role_id || "-")}</td><td>${escapeHtml(item.result || "-")}</td><td class="ua-agent">${escapeHtml(item.user_agent || "-")}</td></tr>`).join("")}</tbody></table></div>`;
}

export function renderUserAccessPage() {
  const selectedUser = users.find((user) => String(user.email).toLowerCase() === selectedEmail) || {};
  const selectedLower = String(selectedUser.email || "").toLowerCase();
  const deleteBlocked = selectedLower === currentActorEmail || configuredSuperAdmins.includes(selectedLower);
  return `<div class="page-grid ua-page"><div class="ua-info-strip"><span class="ua-info-dot"></span><span>Permissions are verified by the backend. Changes are recorded in Access History.</span></div>${info ? `<div class="notice ready">${escapeHtml(info)}</div>` : ""}<section class="grid-wide-aside ua-layout"><article class="surface-card"><div class="card-header"><div><h2 class="card-title">User Access</h2><p class="card-description">ข้อมูลจริงจาก Apps Script พร้อม Last Login</p></div><button id="users-refresh" class="button" type="button" ${loading || busy ? "disabled" : ""}>${loading ? "Loading…" : "Refresh"}</button></div><div class="card-body">${error ? `<div class="notice danger">${escapeHtml(error)}</div>` : ""}${loading ? '<div class="empty-state">Loading users…</div>' : users.length ? `<div class="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Games</th><th>Regions</th><th>Last Login</th><th></th></tr></thead><tbody>${users.map(row).join("")}</tbody></table></div>` : loaded ? '<div class="empty-state">ยังไม่มี User</div>' : '<div class="empty-state">กำลังโหลด…</div>'}</div></article><aside class="surface-card warm-card ua-form-card"><div class="card-header"><div><h2 class="card-title">${selectedEmail ? "Edit User" : "Add User"}</h2><p class="card-description">Changes are verified after saving.</p></div>${statusPill(busy ? "running" : "ready", busy ? "Saving" : "Ready")}</div><div class="card-body">${form(selectedUser)}<div class="toolbar" style="margin-top:14px"><button id="user-save" class="button primary" type="button" ${busy ? "disabled" : ""}>Save</button><button id="user-clear" class="button ghost" type="button" ${busy ? "disabled" : ""}>Clear</button>${selectedEmail ? `<button id="user-delete" class="button danger" type="button" ${busy || deleteBlocked ? "disabled" : ""}>Delete</button>` : ""}</div></div></aside></section><section class="grid-2 ua-history"><article class="surface-card"><div class="card-header"><div><h2 class="card-title">Access History</h2><p class="card-description">Add / Edit / Delete ของ ${escapeHtml(selectedEmail || "User ที่เลือก")}</p></div></div><div class="card-body">${historyLoading ? '<div class="empty-state">Loading history…</div>' : historyTable(accessLogs, "access")}</div></article><article class="surface-card"><div class="card-header"><div><h2 class="card-title">Login History</h2><p class="card-description">ประวัติ Login หลายรายการ</p></div></div><div class="card-body">${historyLoading ? '<div class="empty-state">Loading history…</div>' : historyTable(loginLogs, "login")}</div></article></section></div>`;
}

async function loadUsers({ quiet = false } = {}) {
  if (loading) return;
  loading = true;
  if (!quiet) { error = ""; info = ""; }
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const result = await callAuthorized("admin.users.list");
    assertSuccessfulPayload(result, "User list");
    const payload = normalizePayload(result);
    users = extractUsers(result);
    configuredSuperAdmins = (result.configured_super_admins || payload.configured_super_admins || []).map((email) => String(email).toLowerCase());
    currentActorEmail = String(result.current_user_email || payload.current_user_email || getSavedSession()?.email || "").toLowerCase();
    loaded = true;
    error = "";
  } catch (requestError) { error = requestError.message || String(requestError); }
  finally { loading = false; window.dispatchEvent(new Event("cqr-page-refresh")); }
}

async function loadHistory(email) {
  const target = String(email || selectedEmail || "").toLowerCase();
  if (!target || historyLoading) return;
  selectedEmail = target;
  historyLoading = true;
  error = "";
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const [auditResult, loginResult] = await Promise.all([callAuthorized("admin.users.audit", { email: target, limit: 50 }), callAuthorized("admin.users.login_history", { email: target, limit: 50 })]);
    const auditPayload = assertSuccessfulPayload(auditResult, "Access history");
    const loginPayload = assertSuccessfulPayload(loginResult, "Login history");
    accessLogs = auditResult.logs || auditPayload.logs || [];
    loginLogs = loginResult.logs || loginPayload.logs || [];
  } catch (requestError) { error = requestError.message || String(requestError); }
  finally { historyLoading = false; window.dispatchEvent(new Event("cqr-page-refresh")); }
}

function verifySaved(saved, requested) {
  const fields = ["email", "display_name", "role_id", "status", "allowed_games", "allowed_regions"];
  const bad = fields.filter((field) => String(saved?.[field] || "") !== String(requested[field] || ""));
  if (bad.length) throw new Error(`Backend saved different values: ${bad.join(", ")}`);
}

async function refreshSelfSession() {
  try {
    const result = await callAuthorized("session.me");
    const payload = normalizePayload(result);
    const user = result.user || payload.user || payload;
    if (!user?.email) return;
    updateSavedSession({ email: user.email, name: user.display_name || user.email, display_name: user.display_name || user.email, role_id: user.role_id, status: user.status, allowed_games: user.allowed_games || "ALL", allowed_regions: user.allowed_regions || "ALL" });
  } catch { /* current session can refresh on next login */ }
}

async function save() {
  const email = document.getElementById("user-email")?.value.trim().toLowerCase();
  const displayName = document.getElementById("user-name")?.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("กรอก Email ให้ถูกต้อง"); return; }
  if (!displayName) { showToast("กรอก Display Name"); return; }
  const games = checkedValues("games");
  const regions = checkedValues("regions");
  const invalid = mismatch(games, regions);
  if (invalid.length) { showToast(`Scope ไม่สอดคล้อง: ${invalid.join(", ")}`); return; }
  const requested = { email, display_name: displayName, role_id: document.getElementById("user-role")?.value || "viewer", status: document.getElementById("user-status")?.value || "active", allowed_games: serialize("games"), allowed_regions: serialize("regions") };
  busy = true; error = ""; info = ""; window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const result = await callAuthorized("admin.users.upsert", requested);
    const payload = assertSuccessfulPayload(result, "Save user");
    const saved = result.user || payload.user || payload;
    verifySaved(saved, requested);
    selectedEmail = email;
    await loadUsers({ quiet: true });
    if (email === String(getSavedSession()?.email || "").toLowerCase()) await refreshSelfSession();
    info = result.audit_warning || payload.audit_warning ? `บันทึก User สำเร็จ แต่ Audit Log มีคำเตือน: ${result.audit_warning || payload.audit_warning}` : `บันทึก ${email} เป็น ${saved.role_id} สำเร็จและตรวจค่าจาก Backend แล้ว`;
    showToast("Saved and verified");
    await loadHistory(email);
  } catch (requestError) { error = requestError.message || String(requestError); }
  finally { busy = false; window.dispatchEvent(new Event("cqr-page-refresh")); }
}

function remove() {
  if (!selectedEmail || busy) return;
  openConfirmModal({ title: "Delete user", message: `Delete ${selectedEmail}?`, confirmLabel: "Delete", danger: true, onConfirm: async () => {
    busy = true; error = ""; info = ""; window.dispatchEvent(new Event("cqr-page-refresh"));
    try { const deleted = selectedEmail; assertSuccessfulPayload(await callAuthorized("admin.users.delete", { email: deleted }), "Delete user"); selectedEmail = ""; accessLogs = []; loginLogs = []; await loadUsers({ quiet: true }); info = `ลบ ${deleted} แล้วและบันทึก Audit Log`; showToast("Deleted user"); }
    catch (requestError) { error = requestError.message || String(requestError); }
    finally { busy = false; window.dispatchEvent(new Event("cqr-page-refresh")); }
  } });
}

export function bindUserAccessPage() {
  document.getElementById("users-refresh")?.addEventListener("click", () => loadUsers());
  document.querySelectorAll("[data-user]").forEach((button) => button.addEventListener("click", () => { selectedEmail = String(button.dataset.user || "").toLowerCase(); info = ""; window.dispatchEvent(new Event("cqr-page-refresh")); }));
  document.querySelectorAll("[data-history]").forEach((button) => button.addEventListener("click", () => loadHistory(button.dataset.history)));
  document.getElementById("user-save")?.addEventListener("click", save);
  document.getElementById("user-clear")?.addEventListener("click", () => { selectedEmail = ""; accessLogs = []; loginLogs = []; error = ""; info = ""; window.dispatchEvent(new Event("cqr-page-refresh")); });
  document.getElementById("user-delete")?.addEventListener("click", remove);
  bindPicker("games"); bindPicker("regions"); updateScopePreview();
  if (!loaded && !loading && !error) loadUsers();
}
