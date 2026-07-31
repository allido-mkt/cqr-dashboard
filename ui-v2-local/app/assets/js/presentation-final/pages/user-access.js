import { callAuthorized, assertSuccessfulPayload, normalizePayload } from "../api.js";
import { escapeHtml, showToast, statusPill, openConfirmModal } from "../ui.js";

let users = [];
let selectedEmail = "";
let loading = false;
let loaded = false;
let actionBusy = false;
let error = "";
const ROLES = ["viewer", "analyst", "manager", "admin", "super_admin", "guest"];

function form(user = {}) {
  return `<div class="form-grid"><label class="form-field"><span class="form-label">Email</span><input id="user-email" class="form-control" value="${escapeHtml(user.email || "")}" placeholder="email@example.com" ${actionBusy ? "disabled" : ""}></label><label class="form-field"><span class="form-label">Display Name</span><input id="user-name" class="form-control" value="${escapeHtml(user.display_name || "")}" ${actionBusy ? "disabled" : ""}></label><label class="form-field"><span class="form-label">Role</span><select id="user-role" class="form-control" ${actionBusy ? "disabled" : ""}>${ROLES.map((role) => `<option${role === (user.role_id || "viewer") ? " selected" : ""}>${role}</option>`).join("")}</select></label><label class="form-field"><span class="form-label">Status</span><select id="user-status" class="form-control" ${actionBusy ? "disabled" : ""}><option${user.status !== "disabled" && user.status !== "pending" ? " selected" : ""}>active</option><option${user.status === "disabled" ? " selected" : ""}>disabled</option><option${user.status === "pending" ? " selected" : ""}>pending</option></select></label><label class="form-field"><span class="form-label">Allowed Games</span><input id="user-games" class="form-control" value="${escapeHtml(user.allowed_games || "ALL")}" ${actionBusy ? "disabled" : ""}></label><label class="form-field"><span class="form-label">Allowed Regions</span><input id="user-regions" class="form-control" value="${escapeHtml(user.allowed_regions || "ALL")}" ${actionBusy ? "disabled" : ""}></label></div>`;
}

function extractUsers(result) {
  const payload = normalizePayload(result);
  if (Array.isArray(result?.users)) return result.users;
  if (Array.isArray(payload?.users)) return payload.users;
  if (Array.isArray(payload)) return payload;
  return [];
}

export function renderUserAccessPage() {
  const selected = users.find((user) => user.email === selectedEmail) || {};
  return `<div class="page-grid"><div class="notice warning"><b>Current backend enforcement:</b> Apps Script V20 ให้สิทธิ์ Admin endpoints เฉพาะ <code>super_admin</code>. Allowed Games/Regions ถูกบันทึกไว้ แต่ยังต้อง enforce ที่ Backend ก่อนใช้เป็น Data Scope ที่เชื่อถือได้.</div><section class="grid-wide-aside"><article class="surface-card"><div class="card-header"><div><h2 class="card-title">User Access</h2><p class="card-description">ข้อมูลจริงจาก Users table ผ่าน Apps Script</p></div><button id="users-refresh" class="button" type="button" ${loading || actionBusy ? "disabled" : ""}>${loading ? "Loading…" : "Refresh"}</button></div><div class="card-body">${error ? `<div class="notice danger">${escapeHtml(error)}</div>` : ""}${loading ? '<div class="empty-state">Loading users…</div>' : users.length ? `<div class="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Games</th><th>Regions</th><th>Last Login</th><th></th></tr></thead><tbody>${users.map((user) => `<tr><td>${escapeHtml(user.email)}</td><td>${escapeHtml(user.display_name || "")}</td><td>${statusPill(user.role_id === "super_admin" ? "ready" : "warm", escapeHtml(user.role_id))}</td><td>${escapeHtml(user.status)}</td><td>${escapeHtml(user.allowed_games || "ALL")}</td><td>${escapeHtml(user.allowed_regions || "ALL")}</td><td>${escapeHtml(user.last_login_at || "-")}</td><td><button class="button small" data-user="${escapeHtml(user.email)}" type="button" ${actionBusy ? "disabled" : ""}>Edit</button></td></tr>`).join("")}</tbody></table></div>` : loaded ? '<div class="empty-state">Users table ยังไม่มีรายการ</div>' : '<div class="empty-state">กำลังเตรียมโหลดผู้ใช้…</div>'}</div></article><aside class="surface-card warm-card"><div class="card-header"><div><h2 class="card-title">${selectedEmail ? "Edit User" : "Add User"}</h2></div>${statusPill(actionBusy ? "running" : "ready", actionBusy ? "Saving" : "Ready")}</div><div class="card-body">${form(selected)}<div class="toolbar" style="margin-top:14px"><button id="user-save" class="button primary" type="button" ${actionBusy ? "disabled" : ""}>Save</button><button id="user-clear" class="button ghost" type="button" ${actionBusy ? "disabled" : ""}>Clear</button>${selectedEmail ? `<button id="user-delete" class="button danger" type="button" ${actionBusy ? "disabled" : ""}>Delete</button>` : ""}</div></div></aside></section></div>`;
}

async function loadUsers({ quiet = false } = {}) {
  if (loading) return;
  loading = true;
  if (!quiet) error = "";
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const result = await callAuthorized("admin.users.list");
    assertSuccessfulPayload(result, "User list");
    users = extractUsers(result);
    loaded = true;
    error = "";
  } catch (requestError) {
    error = requestError.message || String(requestError);
  } finally {
    loading = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

async function save() {
  const email = document.getElementById("user-email")?.value.trim().toLowerCase();
  const displayName = document.getElementById("user-name")?.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("กรอก Email ให้ถูกต้อง"); return; }
  if (!displayName) { showToast("กรอก Display Name"); return; }
  actionBusy = true;
  error = "";
  window.dispatchEvent(new Event("cqr-page-refresh"));
  try {
    const result = await callAuthorized("admin.users.upsert", {
      email, display_name: displayName,
      role_id: document.getElementById("user-role")?.value || "viewer",
      status: document.getElementById("user-status")?.value || "active",
      allowed_games: document.getElementById("user-games")?.value.trim() || "ALL",
      allowed_regions: document.getElementById("user-regions")?.value.trim() || "ALL",
    });
    assertSuccessfulPayload(result, "Save user");
    selectedEmail = email;
    showToast("Saved user");
    await loadUsers({ quiet: true });
  } catch (requestError) {
    error = requestError.message || String(requestError);
  } finally {
    actionBusy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

function remove() {
  if (!selectedEmail || actionBusy) return;
  openConfirmModal({
    title: "Delete user",
    message: `Delete ${selectedEmail}?`,
    confirmLabel: "Delete",
    danger: true,
    onConfirm: async () => {
      actionBusy = true;
      error = "";
      window.dispatchEvent(new Event("cqr-page-refresh"));
      try {
        const result = await callAuthorized("admin.users.delete", { email: selectedEmail });
        assertSuccessfulPayload(result, "Delete user");
        selectedEmail = "";
        showToast("Deleted user");
        await loadUsers({ quiet: true });
      } catch (requestError) {
        error = requestError.message || String(requestError);
      } finally {
        actionBusy = false;
        window.dispatchEvent(new Event("cqr-page-refresh"));
      }
    },
  });
}

export function bindUserAccessPage() {
  document.getElementById("users-refresh")?.addEventListener("click", () => loadUsers());
  document.querySelectorAll("[data-user]").forEach((button) => button.addEventListener("click", () => { selectedEmail = button.dataset.user; window.dispatchEvent(new Event("cqr-page-refresh")); }));
  document.getElementById("user-save")?.addEventListener("click", save);
  document.getElementById("user-clear")?.addEventListener("click", () => { selectedEmail = ""; window.dispatchEvent(new Event("cqr-page-refresh")); });
  document.getElementById("user-delete")?.addEventListener("click", remove);
  if (!loaded && !loading && !error) loadUsers();
}
