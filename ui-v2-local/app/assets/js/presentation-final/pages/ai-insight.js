import { APP_CONFIG } from "../config.js";
import { getState, addAiMessage, clearAiMessages, setAiStatus } from "../state.js";
import { callAuthorized, assertSuccessfulPayload, normalizePayload } from "../services/ai-api.js";
import { icon, escapeHtml, downloadText, showToast, statusPill, optionMarkup } from "../ui.js";

const PRESETS = [
  ["เปรียบเทียบ Retention ของทุกเกมใน Context นี้ และบอกเกมที่ควรจับตา", "เปรียบเทียบ Retention ของทุกเกมใน Context นี้ และบอกเกมที่ควรจับตา"],
  ["Channel ไหนมีคุณภาพดีที่สุดเมื่อเทียบ Register, D1, D3, D7 และ D14?", "Channel ไหนมีคุณภาพดีที่สุดเมื่อเทียบ Register, D1, D3, D7 และ D14?"],
  ["มี Retention Drop จุดไหนที่ผิดปกติ และควรตรวจอะไรต่อ?", "มี Retention Drop จุดไหนที่ผิดปกติ และควรตรวจอะไรต่อ?"],
  ["สรุป Performance เดือนล่าสุด พร้อม Key Finding, Risk และสิ่งที่ควรทำต่อ", "สรุป Performance เดือนล่าสุด พร้อม Key Finding, Risk และสิ่งที่ควรทำต่อ"],
];
const MONTHS = APP_CONFIG.months.map((item) => ({ value: item.value, label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${item.value}-01T00:00:00Z`)) }));
let busy = false;

const AI_CHAT_UX_STYLE = `<style>
/* CQR_AI_UI_V8_CLEAN_REBUILD */
.ai-selected-page{
  --ink:#202733;
  --text:#4d596b;
  --muted:#929cab;
  --line:rgba(130,143,162,.16);
  --line2:rgba(130,143,162,.10);
  --orange:#f47721;
  --orange-soft:#fff1e6;
  --panel:#ffffff;
  --soft:#f6f7f9;
  --user:#f1f2f4;
  width:100%;
}

.ai-selected-page,
.ai-selected-page *{box-sizing:border-box}

.ai-selected-page .surface-card{
  box-shadow:none;
}

.ai-selected-shell{
  display:grid;
  gap:14px;
  width:100%;
}

.ai-selected-header{
  display:flex;
  align-items:center;
  gap:14px;
  min-height:68px;
  padding:2px 8px 8px;
}

.ai-selected-logo{
  width:46px;
  height:46px;
  flex:0 0 46px;
}
.ai-selected-logo img{
  display:block;
  width:100%;
  height:100%;
  object-fit:contain;
}

.ai-selected-title{
  color:var(--ink);
  font-size:28px;
  line-height:1.05;
  font-weight:850;
  letter-spacing:-.025em;
}

.ai-selected-subtitle{
  margin-top:5px;
  color:var(--muted);
  font-size:13px;
  line-height:1.5;
}

.ai-selected-workspace{
  display:grid;
  grid-template-columns:330px minmax(0,1fr);
  min-height:calc(100vh - 150px);
  overflow:hidden;
  border:1px solid var(--line);
  border-radius:20px;
  background:var(--panel);
  box-shadow:0 20px 55px -44px rgba(15,23,42,.22);
}

.ai-selected-rail{
  min-width:0;
  padding:20px 18px;
  border-right:1px solid var(--line);
  background:#fff;
}

.ai-selected-rail-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:20px;
}

.ai-selected-label{
  color:var(--ink);
  font-size:12px;
  line-height:1.2;
  font-weight:850;
  letter-spacing:.11em;
}

.ai-selected-new{
  display:inline-flex;
  align-items:center;
  gap:7px;
  min-height:34px;
  padding:0 13px;
  border:1px solid rgba(244,119,33,.78);
  border-radius:999px;
  background:#fff;
  color:var(--ink);
  font-size:11px;
  font-weight:800;
  cursor:pointer;
}
.ai-selected-new .plus{
  color:var(--orange);
  font-size:16px;
}

.ai-selected-section + .ai-selected-section{
  margin-top:20px;
  padding-top:18px;
  border-top:1px solid var(--line2);
}

.ai-selected-question-list{
  display:grid;
  margin-top:9px;
}

.ai-selected-question{
  width:100%;
  display:grid;
  grid-template-columns:minmax(0,1fr) 16px;
  gap:10px;
  align-items:center;
  padding:13px 0;
  border:0;
  border-bottom:1px solid var(--line2);
  background:transparent;
  text-align:left;
  cursor:pointer;
}
.ai-selected-question:last-child{border-bottom:0}
.ai-selected-question:hover{
  background:linear-gradient(90deg,rgba(244,119,33,.04),transparent 80%);
}
.ai-selected-question-text{
  min-width:0;
  color:#536074;
  font-size:12px;
  line-height:1.55;
  font-weight:650;
  white-space:normal;
  word-break:normal;
  overflow-wrap:break-word;
}
.ai-selected-question-arrow{
  color:#9ba6b6;
  font-size:13px;
  text-align:right;
}

.ai-selected-today{
  margin:10px 0 5px;
  color:#a0a9b7;
  font-size:10px;
  font-weight:750;
  letter-spacing:.09em;
}

.ai-selected-rail .ai-recent-question{
  width:100%!important;
  display:block!important;
  margin:0!important;
  padding:10px 10px!important;
  border:0!important;
  border-radius:10px!important;
  background:transparent!important;
  color:#677386!important;
  box-shadow:none!important;
  font-size:11px!important;
  line-height:1.5!important;
  text-align:left!important;
}
.ai-selected-rail .ai-recent-question:hover{
  background:rgba(130,143,162,.06)!important;
}
.ai-selected-rail .ai-recent-question:first-child{
  background:linear-gradient(90deg,#fff0e5,#fff8f3)!important;
  color:#d65e13!important;
}

.ai-selected-view-all{
  margin-top:14px;
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:0;
  border:0;
  background:transparent;
  color:var(--orange);
  font-size:11px;
  font-weight:750;
  cursor:pointer;
}

.ai-selected-discussion{
  min-width:0;
  display:flex;
  flex-direction:column;
  background:#fff;
}

.ai-selected-discussion-head{
  min-height:58px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px;
  padding:12px 18px;
  border-bottom:1px solid var(--line);
  background:#fff;
}
.ai-selected-discussion-title{
  color:var(--ink);
  font-size:12px;
  font-weight:850;
  letter-spacing:.11em;
}
.ai-selected-export{
  min-height:34px!important;
  padding:0 14px!important;
  border:1px solid var(--line)!important;
  border-radius:999px!important;
  background:#fff!important;
  color:#303846!important;
  box-shadow:none!important;
}

.ai-selected-page .ai-feed{
  flex:1;
  min-height:535px!important;
  max-height:calc(100vh - 315px)!important;
  overflow-y:auto!important;
  padding:24px 24px 20px!important;
  background:#fff!important;
  scroll-behavior:smooth;
}

.ai-selected-page .ai-feed > .ai-message,
.ai-selected-page .ai-feed > .ai-analyzing{
  width:100%!important;
  max-width:930px!important;
  margin-left:auto!important;
  margin-right:auto!important;
}

.ai-selected-page .ai-message{
  display:flex!important;
  margin-bottom:22px!important;
}

.ai-selected-page .ai-message.user{
  justify-content:flex-end!important;
  gap:0!important;
  padding:0!important;
}
.ai-selected-page .ai-message.user .ai-avatar{
  display:none!important;
}
.ai-selected-page .ai-message.user .ai-bubble{
  max-width:min(58%,560px)!important;
  padding:11px 14px!important;
  border:0!important;
  border-radius:14px!important;
  background:var(--user)!important;
  color:#475163!important;
  box-shadow:none!important;
  font-size:13px!important;
  line-height:1.55!important;
}

.ai-selected-page .ai-message.assistant{
  align-items:flex-start!important;
  gap:13px!important;
  padding:0!important;
}
.ai-selected-page .ai-message.assistant .ai-avatar{
  width:38px!important;
  height:38px!important;
  flex:0 0 38px!important;
  border:0!important;
  border-radius:0!important;
  background:transparent url("./assets/images/ask-ai-logo.png") center/contain no-repeat!important;
  box-shadow:none!important;
  color:transparent!important;
  font-size:0!important;
}
.ai-selected-page .ai-message.assistant .ai-avatar::before,
.ai-selected-page .ai-message.assistant .ai-avatar::after{
  content:none!important;
}

.ai-selected-page .ai-message.assistant .ai-bubble{
  width:min(100%,820px)!important;
  max-width:820px!important;
  padding:0!important;
  border:0!important;
  border-radius:0!important;
  background:transparent!important;
  box-shadow:none!important;
}

.ai-selected-page .ai-answer-content{
  width:100%;
  padding:18px 20px!important;
  border:1px solid var(--line)!important;
  border-radius:14px!important;
  background:#fff!important;
  color:#3f4b5d!important;
  box-shadow:0 15px 34px -32px rgba(15,23,42,.20)!important;
  font-size:13px!important;
  line-height:1.7!important;
}

.ai-selected-page .ai-answer-content > :first-child{margin-top:0!important}
.ai-selected-page .ai-answer-content > :last-child{margin-bottom:0!important}

.ai-selected-page .ai-answer-content h1,
.ai-selected-page .ai-answer-content h2,
.ai-selected-page .ai-answer-content h3,
.ai-selected-page .ai-answer-content h4,
.ai-selected-page .ai-answer-title,
.ai-selected-page .ai-insight-section-title{
  margin:0 0 9px!important;
  color:var(--ink)!important;
  font-size:14px!important;
  line-height:1.4!important;
  font-weight:850!important;
}

.ai-selected-page .ai-answer-content h2,
.ai-selected-page .ai-answer-content h3,
.ai-selected-page .ai-insight-section + .ai-insight-section{
  margin-top:16px!important;
  padding-top:14px!important;
  border-top:1px solid var(--line2)!important;
}

.ai-selected-page .ai-insight-section{
  margin:0!important;
  padding:0!important;
  border:0!important;
  border-radius:0!important;
  background:transparent!important;
  box-shadow:none!important;
}

.ai-selected-page .ai-answer-content p{
  margin:6px 0 10px!important;
}
.ai-selected-page .ai-answer-content ul,
.ai-selected-page .ai-answer-content ol{
  margin:7px 0 10px 20px!important;
  padding:0!important;
}
.ai-selected-page .ai-answer-content li{
  margin:5px 0!important;
}

.ai-selected-page .ai-answer-content strong{
  color:var(--ink)!important;
  font-weight:850!important;
}

.ai-selected-page .ai-answer-content table{
  width:100%!important;
  margin:10px 0!important;
  border-collapse:collapse!important;
  font-size:12px!important;
}
.ai-selected-page .ai-answer-content th,
.ai-selected-page .ai-answer-content td{
  padding:8px 9px!important;
  border-bottom:1px solid var(--line2)!important;
  text-align:left!important;
}
.ai-selected-page .ai-answer-content th{
  color:#778397!important;
  font-weight:750!important;
  background:#fbfbfc!important;
}

.ai-selected-page .ai-answer-content blockquote{
  margin:12px 0 0!important;
  padding:11px 13px!important;
  border:1px solid rgba(244,119,33,.16)!important;
  border-left:3px solid var(--orange)!important;
  border-radius:10px!important;
  background:#fffaf6!important;
  color:#4d596b!important;
}

.ai-selected-page .ai-answer-content .pill,
.ai-selected-page .ai-answer-content .tag{
  border-color:rgba(244,119,33,.22)!important;
  background:var(--orange-soft)!important;
  color:#cf5d16!important;
}

.ai-selected-composer{
  padding:15px 18px 13px;
  border-top:1px solid var(--line);
  background:#fff;
}
.ai-selected-composer-inner{
  width:100%;
  max-width:930px;
  margin:0 auto;
}
.ai-selected-input-shell{
  display:grid;
  grid-template-columns:auto auto minmax(0,1fr) auto;
  gap:8px;
  align-items:center;
  min-height:66px;
  padding:9px 10px;
  border:1px solid rgba(130,143,162,.19);
  border-radius:22px;
  background:#fff;
  box-shadow:0 14px 28px -25px rgba(15,23,42,.22);
}

.ai-selected-plus,
.ai-selected-library{
  min-height:34px;
  border:0;
  border-radius:999px;
  background:#f5f6f8;
  color:#647084;
  cursor:pointer;
}
.ai-selected-plus{
  width:34px;
  padding:0;
  font-size:17px;
}
.ai-selected-library{
  padding:0 12px;
  font-size:11px;
  white-space:nowrap;
}

.ai-selected-page #ai-input{
  width:100%!important;
  min-height:42px!important;
  max-height:110px!important;
  padding:9px 4px!important;
  border:0!important;
  border-radius:0!important;
  outline:0!important;
  background:transparent!important;
  color:#303846!important;
  box-shadow:none!important;
  resize:none!important;
  font-size:13px!important;
}
.ai-selected-page #ai-input::placeholder{
  color:#a0a9b7!important;
}

.ai-selected-page .send-button{
  position:static!important;
  width:40px!important;
  height:40px!important;
  margin:0!important;
  border-radius:50%!important;
  background:#181c22!important;
  color:#fff!important;
  box-shadow:none!important;
}

.ai-selected-hint{
  margin-top:7px;
  color:#a0a9b7;
  font-size:10px;
  text-align:center;
}

/* Retire legacy V3-V7 presentation fragments if any stale nodes remain */
.ai-selected-page .ai-ask-hero,
.ai-selected-page .ai-auto-scope-helper,
.ai-selected-page .suggest-grid,
.ai-selected-page .ai-busy-note{
  display:none!important;
}

@media(max-width:1180px){
  .ai-selected-workspace{grid-template-columns:300px minmax(0,1fr)}
}
@media(max-width:980px){
  .ai-selected-workspace{grid-template-columns:1fr}
  .ai-selected-rail{
    border-right:0;
    border-bottom:1px solid var(--line);
  }
  .ai-selected-page .ai-feed{max-height:none!important}
}

/* CQR_FRONTEND_V10_ADAPTIVE_BLOCKS */
.topbar.topbar-ai{min-height:96px!important;display:flex!important;align-items:center!important;padding:18px 26px!important;background:#fff!important}
.topbar-ai-brand{display:flex;align-items:center;gap:15px;min-width:0}
.topbar-ai-logo{width:48px;height:48px;flex:0 0 48px;object-fit:contain;display:block}
.topbar-ai-title{font-size:27px;line-height:1.05;font-weight:850;letter-spacing:-.025em;color:#202733}
.topbar-ai-subtitle{margin-top:6px;font-size:13px;line-height:1.45;color:#929cab}
.ai-selected-page .ai-selected-shell{gap:0}
.ai-selected-page .ai-selected-header{display:none!important}
.ai-selected-page .ai-selected-workspace{grid-template-columns:320px minmax(0,1fr);min-height:calc(100vh - 145px)}
.ai-selected-page .ai-selected-rail{padding:20px 18px 24px}
.ai-selected-page .ai-selected-rail-head{margin-bottom:0}
.ai-selected-page .ai-selected-section{margin-top:32px!important;padding-top:0!important;border-top:0!important}
.ai-selected-page .ai-selected-section+.ai-selected-section{margin-top:30px!important;padding-top:0!important;border-top:0!important}
.ai-selected-page .ai-selected-question{padding:12px 0}
.ai-selected-page .ai-selected-today,.ai-selected-page .ai-selected-view-all{display:none!important}
.ai-selected-page .ai-feed{padding:24px clamp(18px,3vw,42px) 30px!important}
.ai-selected-page .ai-feed>.ai-message,.ai-selected-page .ai-feed>.ai-analyzing{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important}
.ai-selected-page .ai-message{width:100%!important;max-width:none!important}
.ai-selected-page .ai-message.assistant{justify-content:flex-start!important}
.ai-selected-page .ai-message.user{justify-content:flex-end!important}
.ai-selected-page .ai-message.user .ai-avatar{display:none!important}
.ai-selected-page .ai-message.user .ai-bubble{max-width:min(72%,680px)!important;background:#20242a!important;color:#fff!important;border:0!important;border-radius:16px 16px 5px 16px!important;padding:11px 15px!important}
.ai-selected-page .ai-message.assistant .ai-bubble{width:min(100%,940px)!important;max-width:calc(100% - 48px)!important}
.ai-selected-page .ai-message.assistant .ai-avatar{width:36px!important;height:36px!important;flex:0 0 36px!important;background:transparent url("./assets/images/ask-ai-logo.png") center/contain no-repeat!important}
.ai-selected-page .ai-answer-content{padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}
.ai-adaptive{display:grid;gap:12px;width:100%}
.ai-adaptive-block{overflow:hidden;border:1px solid rgba(130,143,162,.16);border-radius:14px;background:#fff}
.ai-adaptive-title{display:flex;align-items:center;gap:8px;padding:13px 15px 10px;color:#202733;font-size:13px;font-weight:820}
.ai-adaptive-dot{width:6px;height:6px;border-radius:50%;background:#f47721}
.ai-adaptive-body{padding:0 15px 14px;color:#526072;font-size:12.5px;line-height:1.6}
.ai-adaptive-summary{padding:15px 17px;border-left:3px solid #f47721;color:#445164;font-size:13px;line-height:1.65}
.ai-adaptive-row{display:grid;grid-template-columns:minmax(150px,.8fr) minmax(100px,.42fr) minmax(0,1.1fr);gap:12px;padding:10px 0;border-top:1px solid rgba(130,143,162,.14)}
.ai-adaptive-row:first-child{border-top:0}
.ai-adaptive-label{color:#202733;font-weight:760}
.ai-adaptive-value{font-weight:820;color:#354154}
.ai-adaptive-note{color:#6f7988}
.ai-adaptive-up{color:#27824e}.ai-adaptive-down{color:#c64a43}.ai-adaptive-neutral{color:#667085}
.ai-adaptive-table-wrap{overflow-x:auto}
.ai-adaptive-table{width:100%;min-width:620px;border-collapse:collapse;font-size:12px}
.ai-adaptive-table th,.ai-adaptive-table td{padding:9px 10px;border-top:1px solid rgba(130,143,162,.14);text-align:left;vertical-align:top}
.ai-adaptive-table th{background:#fafbfc;color:#7a8595;font-weight:760}
.ai-adaptive-rank{display:grid;grid-template-columns:34px minmax(140px,.8fr) minmax(90px,.4fr) minmax(0,1fr);gap:10px;padding:10px 0;border-top:1px solid rgba(130,143,162,.14)}
.ai-adaptive-rank:first-child{border-top:0}
.ai-adaptive-rank-no{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#fff1e6;color:#d65e13;font-weight:850}
.ai-adaptive-warning{background:#fffdf7;border-color:rgba(211,154,33,.26)}
.ai-adaptive-limitations{background:#fafbfc}
.ai-adaptive-action .ai-adaptive-row{grid-template-columns:minmax(140px,.45fr) minmax(0,1fr)}
.ai-selected-page .ai-selected-input-shell{grid-template-columns:minmax(0,1fr) auto!important}
.ai-selected-page .ai-selected-plus,.ai-selected-page .ai-selected-library{display:none!important}
.ai-selected-page .ai-selected-composer-inner{max-width:none!important}
.ai-selected-page .ai-selected-hint{font-size:11px!important;color:#9aa3af!important}
@media(max-width:1180px){.ai-selected-page .ai-selected-workspace{grid-template-columns:280px minmax(0,1fr)}}
@media(max-width:980px){
  .topbar.topbar-ai{min-height:84px!important;padding:14px 16px!important}
  .topbar-ai-logo{width:40px;height:40px;flex-basis:40px}.topbar-ai-title{font-size:23px}
  .ai-selected-page .ai-selected-workspace{grid-template-columns:1fr}
  .ai-selected-page .ai-selected-rail{border-right:0;border-bottom:1px solid rgba(130,143,162,.16)}
  .ai-selected-page .ai-message.user .ai-bubble{max-width:86%!important}
  .ai-adaptive-row{grid-template-columns:1fr}
  .ai-adaptive-rank{grid-template-columns:34px 1fr}
}

</style>`;

/* CQR_AI_CONTEXT_V10_DYNAMIC_REGISTRY_START */
const AI_CONTEXT_KEY = "cqr_ai_context_v10_dynamic_registry";
const AI_LEGACY_CONTEXT_KEY = "cqr_ai_context_v9_direct_master";
const AI_CONTEXT_VERSION = 10;
const AI_CONVERSATION_KEY = "cqr_ai_conversation_id";
const AI_PROMPT_VERSION = "ai-summary-v3-direct-master";

let aiCatalogLoaded = false;
let aiCatalogLoading = false;
let aiCatalog = {
  defaultContextGroup: "",
  activeGames: [],
  groups: {},
  months: APP_CONFIG.months.map((item) => item.value),
  latestAvailablePeriod: "",
  latestCommonMaturedPeriod: "",
  selectedGames: [],
};
let aiDraft = "";
let aiFeedScrollTop = 0;
let aiFeedStickToBottom = true;
let aiInputSelectionStart = 0;
let aiInputSelectionEnd = 0;
let aiInputRestoreFocus = false;

function normalizeAiCode(value) {
  return String(value || "").trim().toUpperCase();
}

function uniqueAiGames(values) {
  const active = new Set(aiCatalog.activeGames.map((item) => normalizeAiCode(item.game_code)));
  const seen = new Set();
  const out = [];

  (Array.isArray(values) ? values : []).forEach((value) => {
    const game = normalizeAiCode(value);
    if (!game || seen.has(game)) return;
    if (aiCatalogLoaded && !active.has(game)) return;
    seen.add(game);
    out.push(game);
  });

  return out;
}

function aiGroupCodes(group) {
  const key = normalizeAiCode(group);
  const values = Array.isArray(aiCatalog.groups?.[key]) ? aiCatalog.groups[key] : [];
  return uniqueAiGames(values);
}

function aiGameEntry(gameCode) {
  const wanted = normalizeAiCode(gameCode);
  return aiCatalog.activeGames.find((item) => normalizeAiCode(item.game_code) === wanted) || null;
}

function aiGameLabel(gameCode) {
  const entry = aiGameEntry(gameCode);
  if (!entry) return normalizeAiCode(gameCode);
  return String(entry.game_name || entry.game_code || gameCode).trim();
}

function baseAiContext() {
  return {
    context_group: "",
    game: "ALL",
    requested_games: [],
    period: "ALL",
    channel: "ALL",
    view: "monthly",
  };
}

function readAiContext() {
  try {
    const saved = JSON.parse(localStorage.getItem(AI_CONTEXT_KEY) || "null");
    if (saved && saved.version === AI_CONTEXT_VERSION) {
      return {
        context_group: normalizeAiCode(saved.context_group),
        game: normalizeAiCode(saved.game || "ALL") || "ALL",
        requested_games: Array.isArray(saved.requested_games) ? saved.requested_games : [],
        period: /^20\d{2}-\d{2}$/.test(String(saved.period || "")) || saved.period === "ALL" ? saved.period : "ALL",
        channel: "ALL",
        view: "monthly",
      };
    }

    const legacy = JSON.parse(localStorage.getItem(AI_LEGACY_CONTEXT_KEY) || "null");
    if (legacy && legacy.version === 9) {
      return {
        context_group: "",
        game: normalizeAiCode(legacy.game || "ALL") || "ALL",
        requested_games: legacy.game && legacy.game !== "ALL" ? [legacy.game] : [],
        period: /^20\d{2}-\d{2}$/.test(String(legacy.period || "")) || legacy.period === "ALL" ? legacy.period : "ALL",
        channel: "ALL",
        view: "monthly",
      };
    }
  } catch (error) {
    console.warn("AI context read skipped:", error);
  }

  return baseAiContext();
}

function normalizeAiContextAgainstCatalog(value) {
  const source = { ...baseAiContext(), ...(value || {}) };
  const knownGroups = new Set(Object.keys(aiCatalog.groups || {}).map(normalizeAiCode));
  let contextGroup = normalizeAiCode(source.context_group);

  if (aiCatalogLoaded) {
    if (!contextGroup || (!knownGroups.has(contextGroup) && contextGroup !== "CUSTOM")) {
      contextGroup = normalizeAiCode(aiCatalog.defaultContextGroup) || Array.from(knownGroups)[0] || "";
    }
  }

  let game = normalizeAiCode(source.game || "ALL") || "ALL";
  let requestedGames = uniqueAiGames(source.requested_games);

  if (aiCatalogLoaded && contextGroup !== "CUSTOM") {
    const groupGames = aiGroupCodes(contextGroup);

    if (game !== "ALL" && groupGames.includes(game)) {
      requestedGames = [game];
    } else {
      game = "ALL";
      requestedGames = groupGames;
    }
  }

  if (aiCatalogLoaded && contextGroup === "CUSTOM") {
    game = "ALL";
    requestedGames = uniqueAiGames(requestedGames);
  }

  return {
    context_group: contextGroup,
    game,
    requested_games: requestedGames,
    period: /^20\d{2}-\d{2}$/.test(String(source.period || "")) || source.period === "ALL" ? source.period : "ALL",
    channel: "ALL",
    view: "monthly",
  };
}

function writeAiContext(value) {
  const normalized = normalizeAiContextAgainstCatalog(value);
  const next = {
    version: AI_CONTEXT_VERSION,
    context_group: normalized.context_group,
    game: normalized.game,
    requested_games: normalized.requested_games,
    period: normalized.period,
    channel: "ALL",
    view: "monthly",
  };
  localStorage.setItem(AI_CONTEXT_KEY, JSON.stringify(next));
  return next;
}

function monthEnglish(value) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}-01T00:00:00Z`));
  } catch {
    return value;
  }
}

function aiGroupOptions(currentGroup) {
  if (!aiCatalogLoaded) {
    return [{ value: "", label: "Loading Context Groups..." }];
  }

  const groups = Object.keys(aiCatalog.groups || {})
    .filter((group) => Array.isArray(aiCatalog.groups[group]) && aiCatalog.groups[group].length)
    .sort()
    .map((group) => ({ value: group, label: group }));

  groups.push({ value: "CUSTOM", label: "Custom" });
  return groups;
}

function aiGameOptions(ctx) {
  if (!aiCatalogLoaded) return [{ value: "ALL", label: "Loading Games..." }];

  const groupGames = aiGroupCodes(ctx.context_group);
  return [
    { value: "ALL", label: `All Games in ${ctx.context_group}` },
    ...groupGames.map((game) => ({ value: game, label: aiGameLabel(game) })),
  ];
}

function aiCustomGameChipsMarkup(ctx) {
  const selected = new Set(uniqueAiGames(ctx.requested_games));

  return aiCatalog.activeGames.map((entry) => {
    const game = normalizeAiCode(entry.game_code);
    const isSelected = selected.has(game);
    const meta = [entry.market, entry.platform].filter(Boolean).join(" · ");
    const label = meta ? `${aiGameLabel(game)} · ${meta}` : aiGameLabel(game);

    return `<button class="ai-context-chip${isSelected ? " is-selected" : ""}" type="button" data-ai-custom-game="${escapeHtml(game)}" aria-pressed="${isSelected ? "true" : "false"}">`
      + `<span class="ai-context-chip-check">${isSelected ? "✓" : "✓"}</span>`
      + `<span>${escapeHtml(label)}</span>`
      + `</button>`;
  }).join("");
}

function aiPeriodOptions(ctx) {
  const months = (Array.isArray(aiCatalog.months) ? aiCatalog.months : [])
    .filter((value) => /^20\d{2}-\d{2}$/.test(String(value)))
    .slice()
    .sort()
    .reverse();

  const source = months.length
    ? months.map((value) => ({ value, label: monthEnglish(value) }))
    : MONTHS;

  return [{ value: "ALL", label: "All Periods" }, ...source];
}

function aiCoverageText(ctx) {
  if (!aiCatalogLoaded) return "กำลังโหลด Game Registry และ Data Coverage...";
  const requested = uniqueAiGames(ctx.requested_games);
  const scope = ctx.context_group === "CUSTOM"
    ? `Custom · ${requested.length} game${requested.length === 1 ? "" : "s"}`
    : `${ctx.context_group} · ${ctx.game === "ALL" ? `${requested.length} games` : aiGameLabel(ctx.game)}`;

  const latest = aiCatalog.latestAvailablePeriod || "-";
  const matured = aiCatalog.latestCommonMaturedPeriod || "-";
  return `Scope: ${scope} · Latest: ${latest} · Common Matured: ${matured}`;
}

function aiContextControlsMarkup(ctx) {
  const groupOptions = aiGroupOptions(ctx.context_group);
  const custom = ctx.context_group === "CUSTOM";

  return `
    <div class="ai-context-toolbar">
      <label class="form-field">
        <span class="form-label">Context Group</span>
        <select class="form-control" id="ai-context-group"${aiCatalogLoaded ? "" : " disabled"}>${optionMarkup(groupOptions, ctx.context_group)}</select>
      </label>

      <label class="form-field" id="ai-context-game-field"${custom ? ' style="display:none"' : ""}>
        <span class="form-label">Game Scope</span>
        <select class="form-control" id="ai-context-game"${aiCatalogLoaded ? "" : " disabled"}>${optionMarkup(aiGameOptions(ctx), ctx.game)}</select>
      </label>

      <label class="form-field">
        <span class="form-label">Period</span>
        <select class="form-control" id="ai-context-period">${optionMarkup(aiPeriodOptions(ctx), ctx.period)}</select>
      </label>

      <button class="button primary ai-context-apply" id="apply-ai-context" type="button">${icon("check", "nav-icon")} Apply</button>
    </div>

    <div class="ai-context-custom-panel" id="ai-context-custom-games-field"${custom ? "" : ' style="display:none"'}>
      <div class="ai-context-custom-label">เลือกเกมที่ต้องการเปรียบเทียบ</div>
      <div class="ai-context-chip-list" id="ai-context-custom-games">
        ${aiCustomGameChipsMarkup(ctx)}
      </div>
    </div>

    <div class="ai-context-coverage-row${aiCatalogLoaded ? "" : " is-loading"}" id="ai-context-coverage-row">
      <span class="ai-context-coverage-dot" aria-hidden="true"></span>
      <span id="ai-context-coverage">${escapeHtml(aiCoverageText(ctx))}</span>
    </div>`;
}

function contextFromControls() {
  const current = context();
  const contextGroup = normalizeAiCode(
    document.getElementById("ai-context-group")?.value || current.context_group
  );
  const period = document.getElementById("ai-context-period")?.value || current.period || "ALL";

  if (contextGroup === "CUSTOM") {
    const requestedGames = Array.from(
      document.querySelectorAll("[data-ai-custom-game].is-selected")
    ).map((button) => button.dataset.aiCustomGame);

    return normalizeAiContextAgainstCatalog({
      context_group: "CUSTOM",
      game: "ALL",
      requested_games: requestedGames,
      period,
    });
  }

  const game = normalizeAiCode(document.getElementById("ai-context-game")?.value || "ALL") || "ALL";
  return normalizeAiContextAgainstCatalog({
    context_group: contextGroup,
    game,
    requested_games: game === "ALL" ? aiGroupCodes(contextGroup) : [game],
    period,
  });
}

function syncAiContextControls(value) {
  const ctx = normalizeAiContextAgainstCatalog(value);

  const groupSelect = document.getElementById("ai-context-group");
  if (groupSelect) {
    groupSelect.disabled = !aiCatalogLoaded;
    groupSelect.innerHTML = optionMarkup(aiGroupOptions(ctx.context_group), ctx.context_group);
    groupSelect.value = ctx.context_group;
  }

  const gameField = document.getElementById("ai-context-game-field");
  const gameSelect = document.getElementById("ai-context-game");
  const customField = document.getElementById("ai-context-custom-games-field");
  const customGames = document.getElementById("ai-context-custom-games");
  const custom = ctx.context_group === "CUSTOM";

  if (gameField) gameField.style.display = custom ? "none" : "";
  if (customField) customField.style.display = custom ? "" : "none";

  if (gameSelect) {
    gameSelect.disabled = !aiCatalogLoaded || custom;
    gameSelect.innerHTML = optionMarkup(aiGameOptions(ctx), ctx.game);
    gameSelect.value = ctx.game;
  }

  if (customGames) {
    customGames.innerHTML = aiCustomGameChipsMarkup(ctx);
  }

  const periodSelect = document.getElementById("ai-context-period");
  if (periodSelect) {
    periodSelect.innerHTML = optionMarkup(aiPeriodOptions(ctx), ctx.period);
    periodSelect.value = ctx.period;
  }

  const coverage = document.getElementById("ai-context-coverage");
  if (coverage) coverage.textContent = aiCoverageText(ctx);

  const coverageRow = document.getElementById("ai-context-coverage-row");
  if (coverageRow) {
    coverageRow.classList.toggle("is-loading", !aiCatalogLoaded);
    coverageRow.classList.remove("is-error");
  }

  updateAiCoverageSummary(ctx);
}

function parseAiRegistry(data) {
  const version = data?.data_version || {};
  const registry = version?.game_registry || {};
  const activeGames = Array.isArray(registry.active_games) ? registry.active_games : [];
  const groups = registry && typeof registry.groups === "object" && registry.groups ? registry.groups : {};

  if (String(version.read_mode || "") !== "direct_master_aggregation") {
    throw new Error("Backend is not in Direct Master mode");
  }
  if (!activeGames.length) {
    throw new Error("GameRegistry returned no active games");
  }
  if (!Object.keys(groups).length) {
    throw new Error("GameRegistry returned no context groups");
  }

  aiCatalog.defaultContextGroup = normalizeAiCode(
    registry.default_context_group || version.context_group || ""
  );
  aiCatalog.activeGames = activeGames.map((entry) => ({
    game_code: normalizeAiCode(entry.game_code),
    game_name: String(entry.game_name || entry.game_code || "").trim(),
    market: String(entry.market || "").trim(),
    platform: String(entry.platform || "").trim(),
    context_group: normalizeAiCode(entry.context_group),
  }));
  aiCatalog.groups = Object.fromEntries(
    Object.entries(groups).map(([group, games]) => [
      normalizeAiCode(group),
      uniqueAiGames(Array.isArray(games) ? games : []),
    ])
  );
}

function applyAiCoverageFromData(data) {
  const version = data?.data_version || {};
  aiCatalog.months = Array.isArray(data?.months)
    ? data.months.filter((value) => /^20\d{2}-\d{2}$/.test(String(value)))
    : [];
  aiCatalog.latestAvailablePeriod = String(version.latest_available_period || "");
  aiCatalog.latestCommonMaturedPeriod = String(version.latest_common_matured_period || "");
  aiCatalog.selectedGames = Array.isArray(version.selected_games)
    ? uniqueAiGames(version.selected_games)
    : [];
}

async function loadAiCatalogFromDirectMaster() {
  if (aiCatalogLoading) return;
  if (aiCatalogLoaded) {
    syncAiContextControls(context());
    return;
  }

  aiCatalogLoading = true;
  try {
    const result = await callAuthorized("dashboard.data", {}, 60000);
    const payload = normalizePayload(result);
    const data = payload?.data || payload?.CQR_DATA || payload;

    parseAiRegistry(data);
    aiCatalogLoaded = true;
    applyAiCoverageFromData(data);

    const normalized = writeAiContext(readAiContext());
    syncAiContextControls(normalized);
  } catch (error) {
    console.warn("AI GameRegistry load failed:", error);
    const coverage = document.getElementById("ai-context-coverage");
    if (coverage) coverage.textContent = `โหลด Game Registry ไม่สำเร็จ: ${error.message || error}`;
    const coverageRow = document.getElementById("ai-context-coverage-row");
    if (coverageRow) {
      coverageRow.classList.remove("is-loading");
      coverageRow.classList.add("is-error");
    }
  } finally {
    aiCatalogLoading = false;
  }
}

async function loadAiCoverageForContext(value) {
  const ctx = normalizeAiContextAgainstCatalog(value);
  if (!aiCatalogLoaded) return ctx;
  if (!ctx.requested_games.length) {
    syncAiContextControls(ctx);
    return ctx;
  }

  const coverage = document.getElementById("ai-context-coverage");
  if (coverage) coverage.textContent = "กำลังตรวจ Data Coverage จาก Direct Master...";

  const request = {
    context_group: ctx.context_group,
    games_csv: ctx.requested_games.join(","),
  };

  const result = await callAuthorized("dashboard.data", request, 60000);
  const payload = normalizePayload(result);
  const data = payload?.data || payload?.CQR_DATA || payload;

  if (String(data?.data_version?.read_mode || "") !== "direct_master_aggregation") {
    throw new Error("Backend is not in Direct Master mode");
  }

  const returnedGames = Array.isArray(data?.data_version?.selected_games)
    ? uniqueAiGames(data.data_version.selected_games)
    : [];

  if (returnedGames.length !== ctx.requested_games.length) {
    throw new Error("Dashboard selected_games does not match requested AI scope");
  }

  applyAiCoverageFromData(data);
  syncAiContextControls(ctx);
  return ctx;
}

function aiConversationId() {
  let value = sessionStorage.getItem(AI_CONVERSATION_KEY);
  if (value) return value;
  value = globalThis.crypto?.randomUUID?.() || `CQR-AI-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(AI_CONVERSATION_KEY, value);
  return value;
}

/* CQR_AI_CONTEXT_V10_DYNAMIC_REGISTRY_END */

function context() { return readAiContext(); }

function cleanAnswer(result) {
  const payload = normalizePayload(result);
  let value = payload?.answer ?? payload?.text ?? payload?.message ?? payload?.output ?? payload?.content ?? payload;
  for (let index = 0; index < 4; index += 1) {
    if (typeof value !== "string") break;
    const text = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      const parsed = JSON.parse(text);
      value = parsed.answer ?? parsed.text ?? parsed.message ?? parsed.output ?? text;
    } catch {
      value = text;
      break;
    }
  }
  if (value && typeof value === "object") value = value.answer ?? value.text ?? value.message ?? JSON.stringify(value, null, 2);
  const answer = String(value || "").replace(/\\n/g, "\n").trim();
  if (!answer) throw new Error("AI backend returned an empty answer");
  return answer;
}

function formatAiInline(value) {
  return escapeHtml(String(value || ""))
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong>$1</strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*/g, "");
}

function classifyAiInsight(value) {
  const text = String(value || "").toLowerCase();

  const actionTerms = [
    "สิ่งที่ควรทำต่อ", "ข้อเสนอแนะ", "แนะนำ", "ควรตรวจ", "ควรปรับ",
    "recommended action", "next step", "action item", "recommend"
  ];
  const riskTerms = [
    "ความเสี่ยง", "น่ากังวล", "ผิดปกติ", "ต่ำสุด", "ลดลงมาก", "ตกลงมาก",
    "critical", "high risk", "risk", "anomaly", "severe", "weakest"
  ];
  const warningTerms = [
    "ควรติดตาม", "เฝ้าระวัง", "ต่ำกว่าค่าเฉลี่ย", "ลดลงเล็กน้อย", "watch",
    "monitor", "warning", "ต้องจับตา"
  ];
  const positiveTerms = [
    "จุดแข็ง", "ทำได้ดี", "สูงสุด", "เหนือค่าเฉลี่ย", "แข็งแรง", "เติบโต",
    "improved", "healthy", "strong", "best", "positive"
  ];

  if (actionTerms.some((term) => text.includes(term))) return "action";
  if (riskTerms.some((term) => text.includes(term))) return "risk";
  if (warningTerms.some((term) => text.includes(term))) return "warning";
  if (positiveTerms.some((term) => text.includes(term))) return "positive";
  return "neutral";
}

function insightEmoji(kind) {
  return {
    positive: "✅",
    warning: "⚠️",
    risk: "🔴",
    action: "💡",
    neutral: "📌",
  }[kind] || "📌";
}

function cleanAiMarkdown(value) {
  return String(value || "")
    .replace(/^\s*\*{1,3}\s*/, "")
    .replace(/\s*\*{1,3}\s*$/, "")
    .trim();
}

function formatAiAnswer(value) {
  const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) return;

    blocks.push(
      `<ul>${listItems.map((item) => {
        const kind = classifyAiInsight(item);
        return `<li class="is-${kind}">${formatAiInline(cleanAiMarkdown(item))}</li>`;
      }).join("")}</ul>`
    );

    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      continue;
    }

    const bullet = line.match(/^(?:[-*•]\s+)(.+)$/);
    if (bullet) {
      listItems.push(bullet[1].trim());
      continue;
    }

    flushList();

    const plain = cleanAiMarkdown(line);
    const isSectionTitle =
      plain.endsWith(":")
      && plain.length <= 85
      && !/[.!?]$/.test(plain.slice(0, -1));

    if (isSectionTitle) {
      const title = plain.slice(0, -1).trim();
      const kind = classifyAiInsight(title);
      const isGameTitle = /^[A-Z0-9_/-]{3,30}$/.test(title);
      const finalKind = isGameTitle ? "neutral" : kind;
      const emoji = isGameTitle ? "🎯" : insightEmoji(finalKind);

      blocks.push(
        `<div class="ai-insight-section is-${finalKind}">`
        + `<div class="ai-insight-section-title"><span>${emoji}</span><span>${formatAiInline(title)}</span></div>`
        + `</div>`
      );
      continue;
    }

    const kind = classifyAiInsight(plain);

    if (kind !== "neutral") {
      blocks.push(
        `<div class="ai-insight-section is-${kind}">`
        + `<div class="ai-insight-section-title"><span>${insightEmoji(kind)}</span><span>${formatAiInline(plain)}</span></div>`
        + `</div>`
      );
      continue;
    }

    blocks.push(`<p>${formatAiInline(plain)}</p>`);
  }

  flushList();
  return blocks.join("");
}

const AI_ADAPTIVE_BLOCKS_KEY = "cqr_ai_adaptive_answer_blocks_v1";
const AI_ADAPTIVE_TYPES = new Set(["summary","key_findings","metrics","comparison_table","ranking","recommendation","next_actions","warning","limitations"]);

function normalizeAiAnswerBlocks(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0,12).map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const type=String(raw.type||"").trim();
    if (!AI_ADAPTIVE_TYPES.has(type)) return null;
    const b={type,title:String(raw.title||"").trim()};
    if(type==="summary"){b.content=String(raw.content||"").trim();return b.content?b:null;}
    if(type==="comparison_table"){
      b.columns=Array.isArray(raw.columns)?raw.columns.map(v=>String(v??"")):[];
      b.rows=Array.isArray(raw.rows)?raw.rows.filter(Array.isArray).map(r=>r.map(v=>String(v??""))):[];
      return b.columns.length>=2&&b.rows.length?b:null;
    }
    b.items=(Array.isArray(raw.items)?raw.items:[]).filter(i=>i&&typeof i==="object"&&!Array.isArray(i)).map(i=>({
      rank:Number(i.rank||0),label:String(i.label||"").trim(),metric:String(i.metric||"").trim(),
      value:String(i.value||"").trim(),direction:["up","down","neutral"].includes(String(i.direction||""))?String(i.direction):"neutral",
      note:String(i.note||"").trim()
    }));
    return b.items.length?b:null;
  }).filter(Boolean);
}
function readAiAdaptiveStore(){try{const v=JSON.parse(sessionStorage.getItem(AI_ADAPTIVE_BLOCKS_KEY)||"[]");return Array.isArray(v)?v:[]}catch{return []}}
function writeAiAdaptiveBlocks(text,blocks){
  const b=normalizeAiAnswerBlocks(blocks);
  const key=String(text||"");
  const remaining=readAiAdaptiveStore().filter(x=>String(x?.text||"")!==key);
  const next=(b.length?[{text:key,blocks:b,at:Date.now()},...remaining]:remaining).slice(0,30);
  sessionStorage.setItem(AI_ADAPTIVE_BLOCKS_KEY,JSON.stringify(next));
}
function readAiAdaptiveBlocks(text){
  const found=readAiAdaptiveStore().find(x=>String(x?.text||"")===String(text||""));
  return normalizeAiAnswerBlocks(found?.blocks);
}
function clearAiAdaptiveBlocks(){sessionStorage.removeItem(AI_ADAPTIVE_BLOCKS_KEY)}
function aiAdaptiveTitle(b){
  const m={summary:"Summary",key_findings:"Key Findings",metrics:"Metrics",comparison_table:"Comparison",ranking:"Ranking",recommendation:"Recommendations",next_actions:"Next Actions",warning:"Warning",limitations:"Limitations"};
  return String(b?.title||m[b?.type]||"");
}
function aiAdaptiveDirection(item){
  const d=["up","down","neutral"].includes(item.direction)?item.direction:"neutral";
  const s=d==="up"?"▲":d==="down"?"▼":"•";
  return `<span class="ai-adaptive-${d}">${s} ${escapeHtml(item.value||"-")}</span>`;
}
function renderAiAdaptiveBlock(b){
  const type=String(b?.type||""), title=aiAdaptiveTitle(b);
  if(type==="summary") return `<section class="ai-adaptive-block"><div class="ai-adaptive-summary">${escapeHtml(b.content)}</div></section>`;
  if(type==="comparison_table") return `<section class="ai-adaptive-block"><div class="ai-adaptive-title"><i class="ai-adaptive-dot"></i>${escapeHtml(title)}</div><div class="ai-adaptive-body"><div class="ai-adaptive-table-wrap"><table class="ai-adaptive-table"><thead><tr>${b.columns.map(c=>`<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${b.rows.map(r=>`<tr>${r.map(c=>`<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div></section>`;
  if(type==="ranking") return `<section class="ai-adaptive-block"><div class="ai-adaptive-title"><i class="ai-adaptive-dot"></i>${escapeHtml(title)}</div><div class="ai-adaptive-body">${b.items.map(i=>`<div class="ai-adaptive-rank"><span class="ai-adaptive-rank-no">${escapeHtml(String(i.rank||"-"))}</span><div><div class="ai-adaptive-label">${escapeHtml(i.label||"-")}</div><div class="ai-adaptive-note">${escapeHtml(i.metric||"")}</div></div><div class="ai-adaptive-value">${escapeHtml(i.value||"-")}</div><div class="ai-adaptive-note">${escapeHtml(i.note||"")}</div></div>`).join("")}</div></section>`;
  const action=["recommendation","next_actions","warning","limitations"].includes(type);
  const cls=`ai-adaptive-block${action?" ai-adaptive-action":""}${type==="warning"?" ai-adaptive-warning":""}${type==="limitations"?" ai-adaptive-limitations":""}`;
  return `<section class="${cls}"><div class="ai-adaptive-title"><i class="ai-adaptive-dot"></i>${escapeHtml(title)}</div><div class="ai-adaptive-body">${b.items.map(i=>action?`<div class="ai-adaptive-row"><div class="ai-adaptive-label">${escapeHtml(i.label||"-")}</div><div class="ai-adaptive-note">${escapeHtml(i.note||"")}</div></div>`:`<div class="ai-adaptive-row"><div><div class="ai-adaptive-label">${escapeHtml(i.label||"-")}</div><div class="ai-adaptive-note">${escapeHtml(i.metric||"")}</div></div><div class="ai-adaptive-value">${aiAdaptiveDirection(i)}</div><div class="ai-adaptive-note">${escapeHtml(i.note||"")}</div></div>`).join("")}</div></section>`;
}
function renderAiAdaptiveBlocks(blocks,fallback){
  const b=normalizeAiAnswerBlocks(blocks);
  const answerHtml=formatAiAnswer(fallback);
  return b.length?`${answerHtml}<div class="ai-adaptive">${b.map(renderAiAdaptiveBlock).join("")}</div>`:answerHtml;
}

function renderMessages(messages) {
  return messages.map((message) => {
    if (message.role !== "assistant") {
      return `<div class="ai-message user"><div class="ai-bubble">${escapeHtml(message.text).replaceAll("\n","<br>")}</div></div>`;
    }
    const content=renderAiAdaptiveBlocks(readAiAdaptiveBlocks(message.text),message.text);
    return `<div class="ai-message assistant"><div class="ai-avatar" aria-hidden="true"></div><div class="ai-bubble ai-answer-content">${content}</div></div>`;
  }).join("");
}

function analyzingMarkup() {
  if (!busy) return "";

  return `<div class="ai-message assistant ai-analyzing">`
    + `<div class="ai-avatar">AI</div>`
    + `<div class="ai-bubble">`
    + `<span class="ai-analyzing-dots" aria-hidden="true">`
    + `<span class="ai-analyzing-dot"></span>`
    + `<span class="ai-analyzing-dot"></span>`
    + `<span class="ai-analyzing-dot"></span>`
    + `</span>`
    + `<span>AI กำลังวิเคราะห์ข้อมูล</span>`
    + `</div>`
    + `</div>`;
}

async function keepAnalyzingVisible(startedAt) {
  const remaining = Math.max(0, 1200 - (Date.now() - startedAt));
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

function recentQuestionList(messages) {
  const seen = new Set();
  const rows = [];

  (Array.isArray(messages) ? messages : [])
    .filter((message) => message.role === "user")
    .slice()
    .reverse()
    .forEach((message) => {
      const text = String(message.text || "").trim();
      if (!text || seen.has(text)) return;
      seen.add(text);
      rows.push(text);
    });

  return rows.slice(0, 5);
}

function recentQuestionsMarkup(messages) {
  const rows = recentQuestionList(messages);

  if (!rows.length) {
    return `<div class="ai-side-empty">คำถามที่คุณถามจะขึ้นตรงนี้ เพื่อกดถามซ้ำได้ทันที</div>`;
  }

  return `<div class="ai-recent-question-list">${rows.map((text) =>
    `<button class="ai-recent-question" type="button" data-recent-question="${escapeHtml(text)}">${escapeHtml(text)}</button>`
  ).join("")}</div>`;
}

function coverageGameCodes(ctx) {
  return uniqueAiGames(ctx.requested_games);
}

function coverageGamesMarkup(ctx) {
  const games = coverageGameCodes(ctx);

  if (!games.length) {
    return `<div class="ai-side-empty">ยังไม่ได้เลือก Game Scope</div>`;
  }

  return games.map((game) =>
    `<span class="ai-coverage-game">${escapeHtml(aiGameLabel(game))}</span>`
  ).join("");
}

function coveragePanelMarkup(ctx) {
  const games = coverageGameCodes(ctx);
  const sourceLabel = aiCatalogLoaded ? "Direct Master" : "Loading";
  const groupLabel = ctx.context_group || "-";

  return `<article class="surface-card ai-side-card">
    <div class="card-header">
      <div>
        <h2 class="card-title">Data Coverage</h2>
        <p class="card-description">ขอบเขตข้อมูลที่ AI จะใช้ตอบคำถามนี้</p>
      </div>
    </div>
    <div class="card-body">
      <div class="ai-coverage-grid">
        <div class="ai-coverage-stat">
          <div class="ai-coverage-stat-label">Context</div>
          <div class="ai-coverage-stat-value" id="ai-coverage-context">${escapeHtml(groupLabel)}</div>
        </div>
        <div class="ai-coverage-stat">
          <div class="ai-coverage-stat-label">Games</div>
          <div class="ai-coverage-stat-value" id="ai-coverage-count">${games.length}</div>
        </div>
        <div class="ai-coverage-stat">
          <div class="ai-coverage-stat-label">Latest</div>
          <div class="ai-coverage-stat-value" id="ai-coverage-latest">${escapeHtml(aiCatalog.latestAvailablePeriod || "-")}</div>
        </div>
        <div class="ai-coverage-stat">
          <div class="ai-coverage-stat-label">Common Matured</div>
          <div class="ai-coverage-stat-value" id="ai-coverage-matured">${escapeHtml(aiCatalog.latestCommonMaturedPeriod || "-")}</div>
        </div>
      </div>
      <div class="ai-coverage-games" id="ai-coverage-games">${coverageGamesMarkup(ctx)}</div>
      <div class="card-description" style="margin-top:.5rem">Source: <span id="ai-coverage-source">${escapeHtml(sourceLabel)}</span></div>
    </div>
  </article>`;
}

function aiRuntimeErrorMarkup(ai) {
  if (!ai?.error && ai?.status !== "failed") return "";

  return `<div class="ai-runtime-error">
    <strong>AI connection error</strong><br>
    ${escapeHtml(ai.error || "AI request failed")}
  </div>`;
}

function updateAiCoverageSummary(value) {
  const ctx = normalizeAiContextAgainstCatalog(value);
  const games = coverageGameCodes(ctx);

  const contextNode = document.getElementById("ai-coverage-context");
  const countNode = document.getElementById("ai-coverage-count");
  const latestNode = document.getElementById("ai-coverage-latest");
  const maturedNode = document.getElementById("ai-coverage-matured");
  const gamesNode = document.getElementById("ai-coverage-games");
  const sourceNode = document.getElementById("ai-coverage-source");

  if (contextNode) contextNode.textContent = ctx.context_group || "-";
  if (countNode) countNode.textContent = String(games.length);
  if (latestNode) latestNode.textContent = aiCatalog.latestAvailablePeriod || "-";
  if (maturedNode) maturedNode.textContent = aiCatalog.latestCommonMaturedPeriod || "-";
  if (gamesNode) gamesNode.innerHTML = coverageGamesMarkup(ctx);
  if (sourceNode) sourceNode.textContent = aiCatalogLoaded ? "Direct Master" : "Loading";
}

function chatContextSummary(ctx) {
  const games = uniqueAiGames(ctx.requested_games);
  const group = ctx.context_group || "Context";
  const scope = ctx.game === "ALL" ? `${games.length} Games` : aiGameLabel(ctx.game);
  const period = ctx.period === "ALL" ? "All Periods" : monthEnglish(ctx.period);
  return `${group} · ${scope} · ${period}`;
}

function aiPromptExamples() {
  return PRESETS.map((item) => String(item[0] || "").trim()).filter(Boolean);
}

function aiPromptPlaceholder() {
  return "พิมพ์คำถามที่ต้องการให้ช่วยดู...";
}

const AI_AUTO_SCOPE_PREVIOUS_KEY = "cqr_ai_previous_scope_v1";
const AI_AUTO_SCOPE_VIEW_KEY = "cqr_ai_resolved_scope_view_v1";

function readAiAutoScopePrevious() {
  try {
    const value = JSON.parse(sessionStorage.getItem(AI_AUTO_SCOPE_PREVIOUS_KEY) || "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function readAiAutoScopeView() {
  try {
    const value = JSON.parse(sessionStorage.getItem(AI_AUTO_SCOPE_VIEW_KEY) || "null");
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function writeAiAutoScopeResult(scope, coverage, intent) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return;

  const previous = {
    ...scope,
    intent: String(intent || scope.intent || "").trim(),
  };

  sessionStorage.setItem(AI_AUTO_SCOPE_PREVIOUS_KEY, JSON.stringify(previous));
  sessionStorage.setItem(AI_AUTO_SCOPE_VIEW_KEY, JSON.stringify({
    scope,
    coverage: coverage && typeof coverage === "object" ? coverage : {},
    intent: String(intent || "").trim(),
    updated_at: new Date().toISOString(),
  }));
}

function clearAiAutoScopeResult() {
  sessionStorage.removeItem(AI_AUTO_SCOPE_PREVIOUS_KEY);
  sessionStorage.removeItem(AI_AUTO_SCOPE_VIEW_KEY);
}

function aiAutoScopePeriodShort(value) {
  const match = String(value || "").match(/^(20\d{2})-(\d{2})$/);
  if (!match) return String(value || "");
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}-01T00:00:00Z`));
  } catch {
    return value;
  }
}

function aiAutoScopePeriodsLabel(periods) {
  const values = (Array.isArray(periods) ? periods : [])
    .filter((value) => /^20\d{2}-\d{2}$/.test(String(value)));

  if (!values.length) return "-";
  if (values.length === 1) return aiAutoScopePeriodShort(values[0]);

  const parsed = values.map((value) => {
    const [year, month] = value.split("-");
    return { value, year, month };
  });

  const sameYear = parsed.every((item) => item.year === parsed[0].year);

  if (sameYear) {
    const names = parsed.map((item) => {
      try {
        return new Intl.DateTimeFormat("en-US", {
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${item.value}-01T00:00:00Z`));
      } catch {
        return item.month;
      }
    });
    return `${names.join(" ↔ ")} ${parsed[0].year}`;
  }

  return values.map(aiAutoScopePeriodShort).join(" ↔ ");
}

function aiAutoScopeMetricLabel(scope, intent) {
  const metrics = Array.isArray(scope?.metrics) ? scope.metrics.map((value) => String(value).toLowerCase()) : [];
  const normalizedIntent = String(intent || scope?.intent || "").toLowerCase();

  if (normalizedIntent.includes("retention") || metrics.some((value) => /^d(1|3|7|14)_rate$/.test(value))) {
    return "Retention";
  }
  if (normalizedIntent.includes("channel") || (Array.isArray(scope?.channels) && scope.channels.length)) {
    return "Channel";
  }
  if (normalizedIntent.includes("performance")) {
    return "Performance";
  }
  return "Analysis";
}

function aiAutoScopeSummary(scope, intent) {
  if (!scope || typeof scope !== "object") return "";
  const group = String(scope.context_group || "Custom").trim() || "Custom";
  const games = Array.isArray(scope.games) ? scope.games : [];
  const periods = aiAutoScopePeriodsLabel(scope.periods);
  const metric = aiAutoScopeMetricLabel(scope, intent);
  return `${group} · ${games.length} Game${games.length === 1 ? "" : "s"} · ${periods} · ${metric}`;
}

function aiAutoScopePanelMarkup() {
  const examples = [
    "สรุป Performance ของทุกเกมเดือนล่าสุด",
    "เปรียบเทียบ Retention เดือน May กับ June ของ CABAL",
    "Channel ไหนดีที่สุดของ CBM_TH เดือน June",
  ];

  return `<article class="surface-card ai-auto-scope-panel">
    <div class="card-header">
      <div style="width:100%">
        <div class="ai-auto-scope-panel-title-row">
          <div>
            <h2 class="card-title">ลองถามแบบนี้</h2>
            <p class="card-description">กดเพื่อถามได้ทันที ไม่ต้องพิมพ์ใหม่</p>
          </div>
          <span class="ai-auto-scope-status is-empty">Quick Ask</span>
        </div>
      </div>
    </div>
    <div class="card-body">
      <div class="ai-quick-list">
        ${examples.map((question, index) => `
          <button
            class="ai-quick-question"
            type="button"
            data-ai-example="${escapeHtml(question)}"
            title="กดเพื่อถามทันที"
          >
            <span class="ai-quick-icon">${index + 1}</span>
            <span class="ai-quick-copy">${escapeHtml(question)}</span>
            <span class="ai-quick-arrow">&rarr;</span>
          </button>
        `).join("")}
      </div>
    </div>
  </article>`;
}

function aiAutoScopeHeaderMarkup() {
  const view = readAiAutoScopeView();
  if (!view?.scope) return "";
  return `<div class="ai-auto-scope-head-summary"><span>Scope ล่าสุด:</span><strong>${escapeHtml(aiAutoScopeSummary(view.scope, view.intent))}</strong></div>`;
}





export function renderAiInsightPage() {
  const state=getState();
  const popularQuestions=[
    "สรุป Performance ของทุกเกมเดือนล่าสุด",
    "เปรียบเทียบ Retention เดือน May กับ June ของ CABAL",
    "Channel ไหนดีที่สุดของ CBM_TH เดือน June",
    "สาเหตุที่ทำให้ D14 ลดลงในเดือนล่าสุด",
    "แนะนำวิธีเพิ่มจำนวนผู้เล่นใหม่ให้มากขึ้น",
  ];
  return `${AI_CHAT_UX_STYLE}
  <div class="page-grid ai-insight-page ai-auto-scope-page ai-selected-page">
    <div class="ai-selected-shell">
      <article class="ai-selected-workspace">
        <aside class="ai-selected-rail">
          <div class="ai-selected-rail-head">
            <div class="ai-selected-label">AI ASSISTANT</div>
            <button class="ai-selected-new" id="clear-chat" type="button"><span class="plus">＋</span><span>NEW CHAT</span></button>
          </div>
          <section class="ai-selected-section" id="ai-popular-questions">
            <div class="ai-selected-label">SUGGESTED QUESTIONS</div>
            <div class="ai-selected-question-list">${popularQuestions.map(q=>`<button class="ai-selected-question" type="button" data-ai-example="${escapeHtml(q)}"><span class="ai-selected-question-text">${escapeHtml(q)}</span><span class="ai-selected-question-arrow">→</span></button>`).join("")}</div>
          </section>
          <section class="ai-selected-section">
            <div class="ai-selected-label">RECENT QUESTIONS</div>
            <div>${recentQuestionsMarkup(state.aiMessages)}</div>
          </section>
        </aside>
        <section class="ai-selected-discussion">
          <div class="ai-selected-discussion-head">
            <div class="ai-selected-discussion-title">DISCUSSION</div>
            <button class="button small ai-selected-export" id="export-chat" type="button">${icon("export","nav-icon")} Export</button>
          </div>
          <div class="ai-feed" id="ai-feed">${renderMessages(state.aiMessages)}${analyzingMarkup()}</div>
          <div class="ai-selected-composer">
            <div class="ai-selected-composer-inner">
              <div class="ai-selected-input-shell">
                <textarea class="form-control" id="ai-input" maxlength="500" placeholder="ถามได้ทั้งข้อมูล CQR การวิเคราะห์ หรือคำถามทั่วไป..." ${busy?"disabled":""}>${escapeHtml(aiDraft)}</textarea>
                <button class="send-button" id="ai-send" type="button" aria-label="Send question" ${busy?"disabled":""}>${icon("arrow")}</button>
              </div>
              <div class="ai-selected-hint">${busy?"กำลังวิเคราะห์ข้อมูล...":"Enter เพื่อส่ง · Shift+Enter ขึ้นบรรทัดใหม่"}</div>
            </div>
          </div>
        </section>
      </article>
      ${aiRuntimeErrorMarkup(state.aiStatus)}
    </div>
  </div>`;
}

async function sendQuestion(override) {
  const input = document.getElementById("ai-input");
  const question = String(override || input?.value || "").trim();
  if (!question || busy) return;
  if (question.length > 500) {
    showToast("คำถามยาวเกิน 500 ตัวอักษร");
    return;
  }

  if (input) input.value = "";
  aiDraft = "";
  aiInputSelectionStart = 0;
  aiInputSelectionEnd = 0;
  aiInputRestoreFocus = false;
  aiFeedStickToBottom = true;
  busy = true;

  const analyzingStartedAt = Date.now();
  window.dispatchEvent(new Event("cqr-page-refresh"));
  addAiMessage("user", question);
  setAiStatus({ status: "loading", error: "", resolvedPeriod: "", resolvedGame: "", maturityStatus: "" });

  try {
    const previousScope = readAiAutoScopePrevious();

    const request = {
      question,
      conversation_id: aiConversationId(),
      ai_mode: "gemini",
      data_source: "direct_master_aggregation",
      prompt_version: "universal_chat_v4_1",
      previous_scope: previousScope ? JSON.stringify(previousScope) : "",
    };

    const result = await callAuthorized("ai.ask", request, 60000);
    const payload = assertSuccessfulPayload(result, "AI");
    const status = String(payload?.status || result?.status || "").trim().toLowerCase();

    if (status === "needs_clarification") {
      const clarification = String(
        payload?.question
        || result?.question
        || "ขอรายละเอียด Scope เพิ่มเติมครับ"
      ).trim();

      await keepAnalyzingVisible(analyzingStartedAt);
      addAiMessage("assistant", clarification);
      setAiStatus({
        status: "completed",
        source: "Auto Scope",
        model: "",
        grounded: null,
        resolvedPeriod: "",
        resolvedGame: "",
        maturityStatus: "needs_clarification",
        updatedAt: new Date().toISOString(),
        error: "",
      });
      return;
    }

    const resolvedScope = payload?.resolved_scope || result?.resolved_scope || null;
    const coverage = payload?.coverage || result?.coverage || {};
    const intent = String(payload?.intent || result?.intent || "").trim();

    if (
      resolvedScope &&
      typeof resolvedScope === "object" &&
      coverage?.complete_scope === true
    ) {
      writeAiAutoScopeResult(resolvedScope, coverage, intent);
    }

    const answer = cleanAnswer(payload);
    const answerBlocks=normalizeAiAnswerBlocks(payload?.answer_blocks || result?.answer_blocks || []);
    writeAiAdaptiveBlocks(answer,answerBlocks);

    await keepAnalyzingVisible(analyzingStartedAt);
    addAiMessage("assistant", answer);

    const periods = Array.isArray(resolvedScope?.periods) ? resolvedScope.periods : [];
    const games = Array.isArray(resolvedScope?.games) ? resolvedScope.games : [];

    setAiStatus({
      status: "completed",
      source: String(payload?.source || result?.source || "Auto Scope → Direct Master → Gemini"),
      model: String(payload?.used_ai_model || payload?.model || result?.used_ai_model || "not-reported"),
      grounded: payload?.grounded === true,
      resolvedPeriod: periods.join(", "),
      resolvedGame: String(resolvedScope?.context_group || (games.length === 1 ? games[0] : "")),
      maturityStatus: coverage?.complete_scope === true ? "complete_scope" : "",
      dataVersion: String(payload?.data_version || ""),
      updatedAt: new Date().toISOString(),
      error: "",
    });
  } catch (error) {
    const message = error.message || String(error);
    await keepAnalyzingVisible(analyzingStartedAt);
    addAiMessage("assistant", `ตอนนี้เชื่อม AI ไม่สำเร็จ: ${message}`);
    setAiStatus({
      status: "failed",
      updatedAt: new Date().toISOString(),
      error: message,
    });
  } finally {
    busy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}



export function bindAiInsightPage() {
  /* CQR_AI_BIND_V8 */
  const inputV8 = document.getElementById("ai-input");
  if (inputV8) inputV8.placeholder = "ถามได้ทั้งข้อมูล CQR การวิเคราะห์ หรือคำถามทั่วไป...";

  document.querySelectorAll("[data-ai-example]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = String(button.getAttribute("data-ai-example") || "").trim();
      if (!question || busy) return;
      sendQuestion(question);
    });
  });

  document.querySelector("[data-ai-new-shortcut]")?.addEventListener("click", () => {
    document.getElementById("clear-chat")?.click();
  });

  document.querySelector("[data-ai-prompt-library]")?.addEventListener("click", () => {
    document.getElementById("ai-popular-questions")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  document.querySelector("[data-ai-view-recent]")?.addEventListener("click", () => {
    document.querySelector(".ai-selected-rail .ai-recent-question")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  /* CQR_AI_SELECTED_BIND_V7 */
  document.querySelectorAll("[data-ai-example]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = String(button.getAttribute("data-ai-example") || "").trim();
      if (!question || busy) return;
      sendQuestion(question);
    });
  });

  document.querySelector("[data-ai-prompt-library]")?.addEventListener("click", () => {
    document.getElementById("ai-popular-questions")?.scrollIntoView({ behavior:"smooth", block:"nearest" });
  });

  document.querySelector("[data-ai-new-shortcut]")?.addEventListener("click", () => {
    document.getElementById("clear-chat")?.click();
  });

  document.querySelector("[data-ai-view-recent]")?.addEventListener("click", () => {
    document.querySelector(".ai-selected-rail .ai-recent-question")?.scrollIntoView({ behavior:"smooth", block:"nearest" });
  });

  /* CQR_AI_HIDE_TOP_HEADER_V4_FIX */
  const askPage = document.querySelector(".ai-ask-page");
  const topHeader = askPage?.previousElementSibling;
  if (topHeader && !topHeader.dataset.aiHiddenV4Fix) {
    topHeader.style.display = "none";
    topHeader.dataset.aiHiddenV4Fix = "1";
  }

  /* CQR_AI_QUICK_ASK_BIND_V2 */
  document.querySelectorAll("[data-ai-example]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = String(button.getAttribute("data-ai-example") || "").trim();
      if (!question || busy) return;
      sendQuestion(question);
    });
  });

  const feed = document.getElementById("ai-feed");

  if (feed) {
    const maxScrollTop = Math.max(0, feed.scrollHeight - feed.clientHeight);

    if (aiFeedStickToBottom || busy) {
      feed.scrollTop = feed.scrollHeight;
      aiFeedScrollTop = feed.scrollTop;
    } else {
      feed.scrollTop = Math.min(aiFeedScrollTop, maxScrollTop);
    }

    feed.addEventListener("scroll", () => {
      aiFeedScrollTop = feed.scrollTop;
      aiFeedStickToBottom =
        feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
    }, { passive: true });
  }

  const draftInput = document.getElementById("ai-input");

  if (draftInput) {
    draftInput.value = aiDraft;

    const saveDraftState = () => {
      aiDraft = draftInput.value;
      aiInputSelectionStart = Number(draftInput.selectionStart || 0);
      aiInputSelectionEnd = Number(draftInput.selectionEnd || aiInputSelectionStart);
      aiInputRestoreFocus = true;
    };

    draftInput.addEventListener("focus", saveDraftState);
    draftInput.addEventListener("input", saveDraftState);
    draftInput.addEventListener("keyup", saveDraftState);
    draftInput.addEventListener("select", saveDraftState);

    if (aiInputRestoreFocus && !busy) {
      requestAnimationFrame(() => {
        const currentInput = document.getElementById("ai-input");
        if (!currentInput) return;
        currentInput.focus({ preventScroll: true });
        currentInput.setSelectionRange(
          Math.min(aiInputSelectionStart, currentInput.value.length),
          Math.min(aiInputSelectionEnd, currentInput.value.length)
        );
      });
    }
  }

  const promptInput = document.getElementById("ai-input");
  if (promptInput && !busy) {
    const examples = aiPromptExamples();
    let promptIndex = 0;

    const rotatePrompt = () => {
      if (!examples.length) return;
      if (document.activeElement === promptInput || String(promptInput.value || "").trim()) return;
      promptIndex = (promptIndex + 1) % examples.length;
      promptInput.placeholder = aiPromptPlaceholder(promptIndex);
    };

    const promptTimer = window.setInterval(rotatePrompt, 4500);

    promptInput.addEventListener("focus", () => {
      if (!String(promptInput.value || "").trim()) {
        promptInput.placeholder = "พิมพ์คำถามของคุณ...";
      }
    });

    promptInput.addEventListener("blur", () => {
      if (!String(promptInput.value || "").trim()) {
        promptInput.placeholder = aiPromptPlaceholder(promptIndex);
      }
    });

    promptInput.addEventListener("input", () => {
      if (String(promptInput.value || "").trim()) {
        promptInput.placeholder = "";
      } else if (document.activeElement === promptInput) {
        promptInput.placeholder = "พิมพ์คำถามของคุณ...";
      } else {
        promptInput.placeholder = aiPromptPlaceholder(promptIndex);
      }
    });

    window.setTimeout(() => {
      if (!document.body.contains(promptInput)) {
        window.clearInterval(promptTimer);
      }
    }, 1000);
  }

  loadAiCatalogFromDirectMaster();

  document.getElementById("ai-context-group")?.addEventListener("change", (event) => {
    const group = normalizeAiCode(event.target?.value);
    const period = document.getElementById("ai-context-period")?.value || context().period || "ALL";

    const next = group === "CUSTOM"
      ? {
          context_group: "CUSTOM",
          game: "ALL",
          requested_games: [],
          period,
        }
      : {
          context_group: group,
          game: "ALL",
          requested_games: aiGroupCodes(group),
          period,
        };

    syncAiContextControls(next);
  });


  document.getElementById("ai-context-custom-games-field")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ai-custom-game]");
    if (!button) return;

    const selected = !button.classList.contains("is-selected");
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");

    const preview = contextFromControls();
    const coverage = document.getElementById("ai-context-coverage");
    if (coverage) coverage.textContent = aiCoverageText(preview);
    updateAiCoverageSummary(preview);
  });

  document.getElementById("apply-ai-context")?.addEventListener("click", async () => {
    try {
      const next = contextFromControls();

      if (!next.context_group) {
        showToast("กรุณาเลือก Context Group");
        return;
      }
      if (!next.requested_games.length) {
        showToast("กรุณาเลือกอย่างน้อย 1 เกม");
        return;
      }

      const saved = writeAiContext(next);
      setAiStatus({
        status: "idle",
        source: "",
        model: "",
        grounded: null,
        updatedAt: "",
        error: "",
        resolvedPeriod: "",
        resolvedGame: "",
        maturityStatus: "",
      });

      await loadAiCoverageForContext(saved);
      showToast(`Applied AI context ${saved.context_group} / ${saved.game} / ${saved.period}`);
      window.dispatchEvent(new Event("cqr-page-refresh"));
    } catch (error) {
      const message = error.message || String(error);
      showToast(`Apply Context ไม่สำเร็จ: ${message}`);
    }
  });

  document.querySelectorAll("[data-recent-question]").forEach((button) => {
    button.addEventListener("click", () => sendQuestion(button.dataset.recentQuestion));
  });

  document.getElementById("ai-send")?.addEventListener("click", () => sendQuestion());
  document.getElementById("ai-input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendQuestion();
    }
  });

  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => sendQuestion(button.dataset.prompt));
  });

  document.getElementById("clear-chat")?.addEventListener("click", () => {
    aiDraft = "";
    aiInputSelectionStart = 0;
    aiInputSelectionEnd = 0;
    aiInputRestoreFocus = false;
    aiFeedStickToBottom = true;
    clearAiMessages();
    clearAiAdaptiveBlocks();
    sessionStorage.removeItem(AI_CONVERSATION_KEY);
    clearAiAutoScopeResult();
    window.dispatchEvent(new Event("cqr-page-refresh"));
  });

  document.getElementById("export-chat")?.addEventListener("click", () => {
    const ctx = context();
    const text = [
      "CQR AI Chat Bot Export",
      `Context Group: ${ctx.context_group || "-"}`,
      `Game: ${ctx.game}`,
      `Requested Games: ${ctx.requested_games.join(", ") || "-"}`,
      `Period: ${ctx.period}`,
      "Source: Direct Master",
      "Retention: Same D14-eligible cohort cumulative",
      "",
      ...getState().aiMessages.map((message) => `${message.role.toUpperCase()}: ${message.text}`),
    ].join("\n");

    downloadText(`cqr-ai-${ctx.context_group || "scope"}-${ctx.game}-${ctx.period}.txt`, text);
  });
}
