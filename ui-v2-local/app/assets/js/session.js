import { PREVIEW_PERMISSION_SETS } from "./permissions.js";

const SESSION_KEY = "cqr_auth";

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

function normalizedPermissions(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

export function permissionsForSession(session) {
  const explicit = normalizedPermissions(session?.permissions || session?.permissions_csv);
  if (explicit.length) return explicit;
  const role = String(session?.role_id || session?.role || "").toLowerCase();
  // Apps Script V20 currently protects every Admin endpoint with requireSuperAdmin_.
  if (role === "super_admin") return [...PREVIEW_PERMISSION_SETS.superAdmin];
  return [...PREVIEW_PERMISSION_SETS.regularUser];
}

export function userFromSession(session) {
  const email = String(session?.email || "").toLowerCase();
  const displayName = session?.name || session?.display_name || email || "CQR User";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "CQR";
  return {
    email,
    displayName,
    roleId:String(session?.role_id || session?.role || "viewer"),
    initials,
    permissions:permissionsForSession(session),
    allowedGames:session?.allowed_games || "ALL",
    allowedRegions:session?.allowed_regions || "ALL",
    exp:Number(session?.exp || 0),
  };
}

export function isPreviewSession(session = getSavedSession()) { return session?.sessionToken === "preview-session"; }
export function clearSession() { sessionStorage.removeItem(SESSION_KEY); }
export function signOutAndRedirect() {
  clearSession();
  if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
  window.location.replace(new URL("./dashboard-v2.html", window.location.href).href);
}
