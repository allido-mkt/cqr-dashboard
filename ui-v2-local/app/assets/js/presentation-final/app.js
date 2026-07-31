import { getState, subscribe, setRoute, setUser } from "./state.js";
import { renderTopbar, bindTopbarEvents } from "./topbar.js";
import { renderCurrentPage } from "./router.js";
import { getSavedSession, userFromSession } from "./session.js";


function isLocalV2Entry() {
  return /\/ui-v2-local\/app\/(?:dashboard-v2|copilot-v2)\.html$/i.test(window.location.pathname);
}

function dashboardEntryUrl() {
  return new URL(isLocalV2Entry() ? "./dashboard-v2.html" : "./index.html", window.location.href);
}

function redirectLegacyDashboard() {
  if (getState().route !== "dashboard") return false;
  const target = dashboardEntryUrl();
  if (new URLSearchParams(location.search).get("preview") === "1") target.searchParams.set("preview", "1");
  if (window.location.pathname !== target.pathname) window.location.replace(target.href);
  return true;
}

function renderApp() {
  if (redirectLegacyDashboard()) return;
  const topbar = document.getElementById("topbar");
  if (topbar) {
    topbar.innerHTML = renderTopbar();
    topbar.classList.toggle("topbar-title-only", !topbar.querySelector(".topbar-actions"));
  }
  bindTopbarEvents();
  renderCurrentPage();
}

async function maybeRunSelfTest() {
  const params = new URLSearchParams(location.search);
  if (params.get("selftest") !== "1") return;
  const { runFunctionalSelfTest } = await import("./functional-self-test.js");
  await runFunctionalSelfTest();
}


function ensurePreviewSelfTestSession() {
  const params = new URLSearchParams(location.search);
  if (params.get("preview") !== "1" || params.get("selftest") !== "1") return;
  try {
    const existing = JSON.parse(sessionStorage.getItem("cqr_auth") || "null");
    if (existing?.sessionToken && Number(existing.exp || 0) * 1000 > Date.now()) return;
  } catch {}
  sessionStorage.setItem("cqr_auth", JSON.stringify({
    email: "local.preview@cqr.local",
    name: "CQR Local Preview",
    display_name: "CQR Local Preview",
    role_id: "super_admin",
    role: "super_admin",
    sessionToken: "preview-session",
    exp: Math.floor(Date.now() / 1000) + 3600,
    allowed_games: "ALL",
    allowed_regions: "ALL",
  }));
}

function bootstrap() {
  ensurePreviewSelfTestSession();
  const session = getSavedSession();
  if (!session) {
    const target = dashboardEntryUrl();
    target.searchParams.set("return", getState().route);
    if (new URLSearchParams(location.search).get("preview") === "1") target.searchParams.set("preview", "1");
    window.location.replace(target.href);
    return;
  }

  setUser(userFromSession(session));
  window.dispatchEvent(new CustomEvent("cqr-user-changed"));

  try {
    const preferences = JSON.parse(localStorage.getItem("cqr_user_preferences") || "null") || {};
    document.documentElement.classList.toggle("compact-tables", Boolean(preferences.compactTables));
  } catch {
    document.documentElement.classList.remove("compact-tables");
  }

  window.addEventListener("cqr-page-refresh", renderApp);
  window.addEventListener("hashchange", () => {
    const route = location.hash.replace(/^#\//, "");
    if (route && route !== getState().route) setRoute(route);
  });
  subscribe(renderApp);
  renderApp();
  maybeRunSelfTest().catch((error) => {
    console.error("CQR self-test failed to start", error);
  });
}

bootstrap();
