import { APP_CONFIG } from "./config.js";

const listeners = new Set();
const SPECIFIC_SCOPE_ROUTES = new Set(["check-raw", "data-control-preview"]);
const DEFAULT_GAME = APP_CONFIG.games.find((item) => item.value !== "ALL")?.value || "CBM_TH";
const DEFAULT_MONTH = APP_CONFIG.months[0]?.value || "2026-06";

function readJsonStorage(key) {
  try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value && typeof value === "object" ? value : {}; }
  catch { return {}; }
}
const INITIAL_CONTEXT = readJsonStorage("cqr_ai_context");
const INITIAL_PREFERENCES = readJsonStorage("cqr_user_preferences");

const initialState = {
  route:location.hash.replace(/^#\//, "") || APP_CONFIG.defaultRoute,
  sidebarCollapsed:localStorage.getItem("cqr_ui_sidebar_collapsed") === "1",
  openGroups:{ "data-health":true, "data-control":true },
  filters:{
    ...APP_CONFIG.defaultFilters,
    game:INITIAL_CONTEXT.game || INITIAL_PREFERENCES.defaultGame || APP_CONFIG.defaultFilters.game,
    month:INITIAL_CONTEXT.period?.match(/^20\d{2}-\d{2}$/) ? INITIAL_CONTEXT.period : APP_CONFIG.defaultFilters.month,
    channel:INITIAL_CONTEXT.channel || APP_CONFIG.defaultFilters.channel,
    periodType:INITIAL_CONTEXT.view === "weekly" ? "week" : (INITIAL_PREFERENCES.defaultView || APP_CONFIG.defaultFilters.periodType),
    week:INITIAL_CONTEXT.view === "weekly" ? INITIAL_CONTEXT.period : APP_CONFIG.defaultFilters.week,
  },
  user:{ email:"", displayName:"CQR User", roleId:"viewer", initials:"CQR", permissions:[], allowedGames:"ALL", allowedRegions:"ALL", exp:0 },
  rawCheck:{ requestId:"", game:"", month:"", status:"idle", resultStatus:"idle", totalJobs:0, queuedJobs:0, runningJobs:0, completedJobs:0, failedJobs:0, tabsFound:"-", tabsExpected:5, missingTabs:"", rawHash:"", finishedAt:"", progress:0, errorMessage:"" },
  health:{ status:"idle", score:null, checkedAt:"", rawReady:0, review:0, repair:0, updated:0, result:null, error:"" },
  pipeline:{ status:"idle", checkedAt:"", result:null, error:"" },
  control:{ previewToken:"", previewAt:"", selectedRuns:[], lookupRuns:[], lookupResult:null, lookupQuery:"", previewResult:null, previewScope:null, lastClearAt:"", clearResult:null, lastBuildAt:"", buildResult:null, buildProgress:0, error:"" },
  aiMessages:[{ role:"assistant", text:"พร้อมช่วยอ่าน CQR ครับ เลือก Game และ Period แล้วถามเรื่อง Retention, Channel Quality หรือ Weekly Alert ได้เลย" }],
};
let state = structuredClone(initialState);

function normalizedFilters(route, current) {
  const filters = { ...current };
  if (SPECIFIC_SCOPE_ROUTES.has(route)) {
    if (!filters.game || filters.game === "ALL") filters.game = DEFAULT_GAME;
    if (!filters.month || filters.month === "ALL") filters.month = DEFAULT_MONTH;
  }
  if (filters.month !== "ALL" && (!filters.week || !filters.week.startsWith(filters.month))) filters.week = `${filters.month}-W4`;
  return filters;
}

export function getState() { return state; }
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function setState(patch) { state = { ...state, ...patch }; listeners.forEach((listener) => listener(state)); }
export function updateState(updater) { const next = updater(state); if (next && next !== state) { state = next; listeners.forEach((listener) => listener(state)); } }
export function setRoute(route) { if (!route) return; history.replaceState(null, "", `#/${route}`); setState({ route, filters:normalizedFilters(route, state.filters) }); }
export function setFilter(name, value) { const filters = { ...state.filters, [name]:value }; if (name === "month" && value !== "ALL") filters.week = `${value}-W4`; setState({ filters }); }
export function setFilters(patch) { setState({ filters:{ ...state.filters, ...patch } }); }
export function toggleSidebar() { const next = !state.sidebarCollapsed; localStorage.setItem("cqr_ui_sidebar_collapsed", next ? "1" : "0"); setState({ sidebarCollapsed:next }); }
export function toggleGroup(groupId) { setState({ openGroups:{ ...state.openGroups, [groupId]:!state.openGroups[groupId] } }); }
export function setUser(user) { setState({ user:{ ...state.user, ...user } }); }
export function setRawCheck(patch) { setState({ rawCheck:{ ...state.rawCheck, ...patch } }); }
export function setHealth(patch) { setState({ health:{ ...state.health, ...patch } }); }
export function setPipeline(patch) { setState({ pipeline:{ ...state.pipeline, ...patch } }); }
export function setControl(patch) { setState({ control:{ ...state.control, ...patch } }); }
export function addAiMessage(role, text) { setState({ aiMessages:[...state.aiMessages, { role, text }] }); }
export function clearAiMessages() { setState({ aiMessages:[{ role:"assistant", text:"ล้างบทสนทนาแล้วครับ เริ่มถามจาก Context ปัจจุบันได้เลย" }] }); }
