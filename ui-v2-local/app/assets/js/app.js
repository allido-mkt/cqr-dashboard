import { getState, subscribe, setRoute, setUser } from "./state.js";
import { renderSidebar, bindSidebarEvents } from "./sidebar.js";
import { renderTopbar, bindTopbarEvents } from "./topbar.js";
import { renderCurrentPage } from "./router.js";
import { getSavedSession, userFromSession } from "./session.js";

function redirectLegacyDashboard() {
  if (getState().route !== "dashboard") return false;
  const target = new URL("./dashboard-v2.html", window.location.href);
  if (window.location.pathname !== target.pathname) window.location.replace(target.href);
  return true;
}
function renderApp() {
  if (redirectLegacyDashboard()) return;
  const state = getState();
  document.getElementById("app").classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  document.getElementById("sidebar").innerHTML = renderSidebar();
  document.getElementById("topbar").innerHTML = renderTopbar();
  document.getElementById("topbar").classList.toggle("topbar-title-only", !document.querySelector("#topbar .topbar-actions"));
  bindSidebarEvents(); bindTopbarEvents(); renderCurrentPage();
}
function bootstrap() {
  const session = getSavedSession();
  if (!session) {
    const target = new URL("./dashboard-v2.html", window.location.href);
    target.searchParams.set("return", getState().route);
    window.location.replace(target.href);
    return;
  }
  setUser(userFromSession(session));
  try { const preferences = JSON.parse(localStorage.getItem("cqr_user_preferences") || "null") || {}; document.documentElement.classList.toggle("compact-tables", Boolean(preferences.compactTables)); }
  catch { document.documentElement.classList.remove("compact-tables"); }
  window.addEventListener("cqr-page-refresh", renderApp);
  window.addEventListener("hashchange", () => { const route = location.hash.replace(/^#\//, ""); if (route && route !== getState().route) setRoute(route); });
  subscribe(renderApp); renderApp();
}
bootstrap();
