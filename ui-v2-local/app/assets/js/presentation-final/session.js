import { PREVIEW_PERMISSION_SETS } from "./permissions.js";

const SESSION_KEY = "cqr_auth";

function isLocalV2Entry() {
  return /\/ui-v2-local\/app\/(?:dashboard-v2|copilot-v2)\.html$/i.test(window.location.pathname);
}

function dashboardEntryUrl() {
  return new URL(isLocalV2Entry() ? "./dashboard-v2.html" : "./index.html", window.location.href);
}


export function getSavedSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!session?.email || !session?.exp || Number(session.exp) * 1000 <= Date.now()) return null;
    if (!session.sessionToken) return null;
    return session;
  } catch {
    return null;
  }
}

export function updateSavedSession(patch = {}) {
  const current = getSavedSession();
  if (!current) return null;
  const next = { ...current, ...patch };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("cqr-session-changed"));
  return next;
}

function normalizedPermissions(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

export function permissionsForSession(session) {
  const role = String(session?.role_id || session?.role || "").toLowerCase();
  // Apps Script V20 currently protects Admin endpoints with requireSuperAdmin_.
  // Keep Router permissions aligned with the shared Sidebar: super_admin gets the complete set.
  if (role === "super_admin") return [...PREVIEW_PERMISSION_SETS.superAdmin];
  const explicit = normalizedPermissions(session?.permissions || session?.permissions_csv);
  if (explicit.length) return explicit;
  return [...PREVIEW_PERMISSION_SETS.regularUser];
}

export function userFromSession(session) {
  const email = String(session?.email || "").toLowerCase();
  const displayName = session?.name || session?.display_name || email || "CQR User";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "CQR";
  return {
    email,
    displayName,
    roleId: String(session?.role_id || session?.role || "viewer"),
    initials,
    permissions: permissionsForSession(session),
    allowedGames: session?.allowed_games || "ALL",
    allowedRegions: session?.allowed_regions || "ALL",
    exp: Number(session?.exp || 0),
  };
}

export function isPreviewSession(session = getSavedSession()) { return session?.sessionToken === "preview-session"; }
export function clearSession() { sessionStorage.removeItem(SESSION_KEY); }
export function signOutAndRedirect() {
  clearSession();
  if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
  window.location.replace(dashboardEntryUrl().href);
}
