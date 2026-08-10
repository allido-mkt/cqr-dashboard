import { APP_CONFIG } from "./config.js";

const listeners = new Set();
const SPECIFIC_SCOPE_ROUTES = new Set(["check-raw", "data-control-preview", "data-control-clear", "data-control-build"]);
const DEFAULT_GAME = APP_CONFIG.games.find((item) => item.value !== "ALL")?.value || "CBM_TH";
const DEFAULT_MONTH = APP_CONFIG.months[0]?.value || "2026-06";
const AI_MESSAGES_KEY = "cqr_ai_messages";
const CONTROL_STATE_KEY = "cqr_data_control_state_v2";

function readJsonStorage(storage, key, fallback) {
  try {
    const value = JSON.parse(storage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

try {
  localStorage.removeItem("cqr_ai_context");
  localStorage.removeItem("cqr_ai_context_v8");
} catch {}
const INITIAL_CONTEXT = {};
const INITIAL_PREFERENCES = readJsonStorage(localStorage, "cqr_user_preferences", {});
const SAVED_AI_MESSAGES = readJsonStorage(sessionStorage, AI_MESSAGES_KEY, []);
const SAVED_CONTROL_STATE = readJsonStorage(sessionStorage, CONTROL_STATE_KEY, {});
const DEFAULT_AI_MESSAGE = {
  role: "assistant",
  text: "วันนี้มีอะไรให้ช่วยดูหรือวิเคราะห์ไหมครับ",
};

const initialState = {
  route: location.hash.replace(/^#\//, "") || APP_CONFIG.defaultRoute,
  filters: {
    ...APP_CONFIG.defaultFilters,
    game: INITIAL_CONTEXT.game || INITIAL_PREFERENCES.defaultGame || APP_CONFIG.defaultFilters.game,
    month: INITIAL_CONTEXT.period?.match(/^20\d{2}-\d{2}$/) ? INITIAL_CONTEXT.period : APP_CONFIG.defaultFilters.month,
    channel: INITIAL_CONTEXT.channel || APP_CONFIG.defaultFilters.channel,
    periodType: INITIAL_CONTEXT.view === "weekly" ? "week" : (INITIAL_PREFERENCES.defaultView || APP_CONFIG.defaultFilters.periodType),
    week: INITIAL_CONTEXT.view === "weekly" ? INITIAL_CONTEXT.period : APP_CONFIG.defaultFilters.week,
  },
  user: {
    email: "",
    displayName: "CQR User",
    roleId: "viewer",
    initials: "CQR",
    permissions: [],
    allowedGames: "ALL",
    allowedRegions: "ALL",
    exp: 0,
  },
  rawCheck: {
    requestId: "", game: "", month: "", status: "idle", resultStatus: "idle",
    totalJobs: 0, queuedJobs: 0, runningJobs: 0, completedJobs: 0, failedJobs: 0,
    currentGame: "", currentMonth: "", tabsFound: "-", tabsExpected: 5,
    missingTabs: "", rawHash: "", finishedAt: "", progress: 0, errorMessage: "", jobs: [],
  },
  health: { status: "idle", score: null, checkedAt: "", result: null, error: "" },
  pipeline: { status: "idle", checkedAt: "", result: null, error: "" },
  control: {
    ...SAVED_CONTROL_STATE,
    previewToken: "", previewAt: "", selectedRuns: [], lookupRuns: [], lookupResult: null,
    lookupQuery: "", lookupPerformed: false, previewResult: null, previewScope: null,
    lastClearAt: "", clearResult: null, lastBuildAt: "", buildResult: null,
    buildMode: "", buildScope: null, buildRawHash: "", buildRawCheckId: "",
    buildActionStatus: "", buildHealthStatus: "",
    buildProgress: 0, error: "",
  },
  aiMessages: Array.isArray(SAVED_AI_MESSAGES) && SAVED_AI_MESSAGES.length ? SAVED_AI_MESSAGES.slice(-40) : [DEFAULT_AI_MESSAGE],
  aiStatus: { status: "idle", source: "", model: "", grounded: null, updatedAt: "", error: "" },
};

let state = structuredClone(initialState);

function normalizedFilters(route, current) {
  const filters = { ...current };
  if (SPECIFIC_SCOPE_ROUTES.has(route)) {
    if (!filters.game || filters.game === "ALL") filters.game = DEFAULT_GAME;
    if (!filters.month || filters.month === "ALL") filters.month = DEFAULT_MONTH;
  }
  if (filters.month !== "ALL" && (!filters.week || !filters.week.startsWith(filters.month))) {
    filters.week = `${filters.month}-W4`;
  }
  return filters;
}

function persistAiMessages(messages) {
  try { sessionStorage.setItem(AI_MESSAGES_KEY, JSON.stringify(messages.slice(-40))); } catch {}
}

function persistControlState(control) {
  const keys = [
    "buildMode", "buildScope", "buildRawHash", "buildRawCheckId", "buildActionStatus", "buildHealthStatus",
    "previewToken", "previewAt", "previewScope", "lastClearAt", "lastBuildAt", "buildProgress",
    "selectedRuns", "lookupQuery",
  ];
  const value = Object.fromEntries(keys.map((key) => [key, control?.[key] ?? null]));
  try { sessionStorage.setItem(CONTROL_STATE_KEY, JSON.stringify(value)); } catch {}
}

export function getState() { return state; }
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function setState(patch) { state = { ...state, ...patch }; listeners.forEach((listener) => listener(state)); }
export function updateState(updater) {
  const next = updater(state);
  if (next && next !== state) { state = next; listeners.forEach((listener) => listener(state)); }
}
export function setRoute(route) {
  if (!route) return;
  history.replaceState(null, "", `#/${route}`);
  setState({ route, filters: normalizedFilters(route, state.filters) });
}
export function setFilter(name, value) {
  const filters = { ...state.filters, [name]: value };
  if (name === "month" && value !== "ALL") filters.week = `${value}-W4`;
  setState({ filters });
}
export function setFilters(patch) {
  const filters = { ...state.filters, ...patch };
  if (Object.hasOwn(patch, "month") && patch.month !== "ALL" && !String(filters.week || "").startsWith(patch.month)) {
    filters.week = `${patch.month}-W4`;
  }
  setState({ filters });
}
export function setUser(user) { setState({ user: { ...state.user, ...user } }); }
export function setRawCheck(patch) { setState({ rawCheck: { ...state.rawCheck, ...patch } }); }
export function setHealth(patch) { setState({ health: { ...state.health, ...patch } }); }
export function setPipeline(patch) { setState({ pipeline: { ...state.pipeline, ...patch } }); }
export function setControl(patch) {
  const control = { ...state.control, ...patch };
  persistControlState(control);
  setState({ control });
}
export function setAiStatus(patch) { setState({ aiStatus: { ...state.aiStatus, ...patch } }); }
export function addAiMessage(role, text) {
  const aiMessages = [...state.aiMessages, { role, text: String(text || "") }].slice(-40);
  persistAiMessages(aiMessages);
  setState({ aiMessages });
}
export function clearAiMessages() {
  const aiMessages = [{ role: "assistant", text: "วันนี้มีอะไรให้ช่วยดูหรือวิเคราะห์ไหมครับ" }];
  persistAiMessages(aiMessages);
  setState({ aiMessages, aiStatus: { status: "idle", source: "", model: "", grounded: null, updatedAt: "", error: "" } });
}
