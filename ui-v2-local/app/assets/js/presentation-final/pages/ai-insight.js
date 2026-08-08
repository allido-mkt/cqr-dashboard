import { APP_CONFIG } from "../config.js";
import { getState, addAiMessage, clearAiMessages, setAiStatus } from "../state.js";
import { callAuthorized, assertSuccessfulPayload, normalizePayload } from "../services/ai-api.js";
import { icon, escapeHtml, downloadText, showToast, statusPill, optionMarkup } from "../ui.js";

const PRESETS = [
  ["Executive Insight", "สรุป Executive Insight จาก Context ปัจจุบัน แยก Key Finding, Risk และ Recommended Action"],
  ["Channel Quality", "วิเคราะห์ Channel Quality จาก Context ปัจจุบัน โดยเทียบ Register, D1, D3, D7 และ D14"],
  ["Retention Audit", "หาจุด Retention Drop ที่น่ากังวลและเสนอรายการที่ควรตรวจต่อ"],
  ["Weekly Alert", "สรุป Weekly Alert ล่าสุดและสิ่งที่ทีมควรติดตามต่อ"],
];
const MONTHS = APP_CONFIG.months.map((item) => ({ value: item.value, label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${item.value}-01T00:00:00Z`)) }));
let busy = false;

const AI_CHAT_UX_STYLE = `<style>
  .ai-answer-content {
    line-height: 1.72;
    white-space: normal;
  }

  .ai-answer-content p {
    margin: 0 0 0.75rem;
  }

  .ai-answer-content p:last-child {
    margin-bottom: 0;
  }

  .ai-answer-content h4 {
    margin: 1.05rem 0 0.5rem;
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: 0.01em;
  }

  .ai-answer-content h4:first-child {
    margin-top: 0;
  }

  .ai-answer-content ul {
    display: grid;
    gap: 0.5rem;
    margin: 0.3rem 0 0.95rem;
    padding: 0;
    list-style: none;
  }

  .ai-answer-content li {
    position: relative;
    margin: 0;
    padding: 0.62rem 0.75rem 0.62rem 2.15rem;
    border: 1px solid rgba(100, 116, 139, 0.16);
    border-radius: 0.75rem;
    background: rgba(248, 250, 252, 0.78);
  }

  .ai-answer-content li::before {
    position: absolute;
    left: 0.75rem;
    top: 0.65rem;
    content: "•";
    font-weight: 900;
  }

  .ai-answer-content strong {
    color: inherit;
    font-weight: 760;
  }


  .ai-answer-content code {
    padding: 0.08rem 0.3rem;
    border-radius: 0.35rem;
    background: rgba(15, 23, 42, 0.07);
    font-size: 0.92em;
  }

  .ai-insight-section {
    margin: 0.55rem 0 0.85rem;
    padding: 0.78rem 0.85rem;
    border-left: 4px solid rgba(100, 116, 139, 0.5);
    border-radius: 0.75rem;
    background: rgba(248, 250, 252, 0.82);
  }

  .ai-insight-section-title {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-bottom: 0.35rem;
    font-weight: 800;
  }

  .ai-insight-section.is-positive,
  .ai-answer-content li.is-positive {
    border-color: rgba(22, 163, 74, 0.28);
    background: rgba(240, 253, 244, 0.88);
  }

  .ai-insight-section.is-positive {
    border-left-color: rgb(22, 163, 74);
  }

  .ai-answer-content li.is-positive::before {
    content: "✅";
  }

  .ai-insight-section.is-warning,
  .ai-answer-content li.is-warning {
    border-color: rgba(217, 119, 6, 0.3);
    background: rgba(255, 251, 235, 0.92);
  }

  .ai-insight-section.is-warning {
    border-left-color: rgb(217, 119, 6);
  }

  .ai-answer-content li.is-warning::before {
    content: "⚠️";
  }

  .ai-insight-section.is-risk,
  .ai-answer-content li.is-risk {
    border-color: rgba(220, 38, 38, 0.28);
    background: rgba(254, 242, 242, 0.92);
  }

  .ai-insight-section.is-risk {
    border-left-color: rgb(220, 38, 38);
  }

  .ai-answer-content li.is-risk::before {
    content: "🔴";
  }

  .ai-insight-section.is-action,
  .ai-answer-content li.is-action {
    border-color: rgba(37, 99, 235, 0.28);
    background: rgba(239, 246, 255, 0.92);
  }

  .ai-insight-section.is-action {
    border-left-color: rgb(37, 99, 235);
  }

  .ai-answer-content li.is-action::before {
    content: "💡";
  }

  .ai-insight-section.is-neutral {
    border-left-color: rgba(100, 116, 139, 0.72);
  }

  .ai-answer-content li.is-neutral::before {
    content: "•";
  }

  .ai-analyzing .ai-bubble {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 13rem;
  }

  .ai-analyzing-dots {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 1.7rem;
  }

  .ai-analyzing-dot {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.25;
    animation: cqr-ai-dot 1.05s infinite ease-in-out;
  }

  .ai-analyzing-dot:nth-child(2) {
    animation-delay: 0.16s;
  }

  .ai-analyzing-dot:nth-child(3) {
    animation-delay: 0.32s;
  }

  @keyframes cqr-ai-dot {
    0%, 70%, 100% {
      transform: translateY(0);
      opacity: 0.25;
    }

    35% {
      transform: translateY(-0.24rem);
      opacity: 1;
    }
  }
</style>`;

/* CQR_AI_CONTEXT_V9_DIRECT_MASTER_START */
const AI_CONTEXT_KEY = "cqr_ai_context_v9_direct_master";
const AI_CONTEXT_VERSION = 9;
const AI_CONVERSATION_KEY = "cqr_ai_conversation_id";
const AI_PROMPT_VERSION = "ai-summary-v3-direct-master";
let aiCatalogLoaded = false;
let aiDraft = "";
let aiFeedScrollTop = 0;
let aiFeedStickToBottom = true;
let aiInputSelectionStart = 0;
let aiInputSelectionEnd = 0;
let aiInputRestoreFocus = false;

function allowedAiGames() {
  return new Set(APP_CONFIG.games.map((item) => item.value));
}

function configuredAiPeriods() {
  return new Set(["ALL", ...APP_CONFIG.months.map((item) => item.value)]);
}

function readAiContext() {
  try {
    const saved = JSON.parse(localStorage.getItem(AI_CONTEXT_KEY) || "null");
    if (!saved || saved.version !== AI_CONTEXT_VERSION) return { game: "ALL", period: "ALL", channel: "ALL", view: "monthly" };
    return {
      game: allowedAiGames().has(saved.game) ? saved.game : "ALL",
      period: /^20\d{2}-\d{2}$/.test(String(saved.period || "")) || saved.period === "ALL" ? saved.period : "ALL",
      channel: "ALL",
      view: "monthly",
    };
  } catch {
    return { game: "ALL", period: "ALL", channel: "ALL", view: "monthly" };
  }
}

function writeAiContext(value) {
  const next = { version: AI_CONTEXT_VERSION, game: value.game || "ALL", period: value.period || "ALL", channel: "ALL", view: "monthly" };
  localStorage.setItem(AI_CONTEXT_KEY, JSON.stringify(next));
  return next;
}

function monthEnglish(value) {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T00:00:00Z`));
  } catch { return value; }
}

async function loadAiCatalogFromDirectMaster() {
  if (aiCatalogLoaded) return;
  aiCatalogLoaded = true;
  try {
    const result = await callAuthorized("dashboard.data", {}, 60000);
    const payload = normalizePayload(result);
    const data = payload?.data || payload?.CQR_DATA || payload;
    if (String(data?.data_version?.read_mode || "") !== "direct_master_aggregation") {
      throw new Error("Backend is not in Direct Master mode");
    }
    const months = Array.isArray(data?.months) ? data.months.filter((value) => /^20\d{2}-\d{2}$/.test(String(value))) : [];
    const select = document.getElementById("ai-context-period");
    if (!select || !months.length) return;
    const current = readAiContext().period;
    select.innerHTML = optionMarkup([{ value: "ALL", label: "All Periods" }, ...months.slice().reverse().map((value) => ({ value, label: monthEnglish(value) }))], current);
  } catch (error) {
    console.warn("AI catalog load skipped; using configured periods:", error);
  }
}

function aiConversationId() {
  let value = sessionStorage.getItem(AI_CONVERSATION_KEY);
  if (value) return value;
  value = globalThis.crypto?.randomUUID?.() || `CQR-AI-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(AI_CONVERSATION_KEY, value);
  return value;
}

/* CQR_AI_CONTEXT_V9_DIRECT_MASTER_END */

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

function renderMessages(messages) {
  return messages.map((message) => {
    const assistant = message.role === "assistant";
    const content = assistant
      ? formatAiAnswer(message.text)
      : escapeHtml(message.text).replaceAll("\n", "<br>");

    return `<div class="ai-message ${message.role}"><div class="ai-avatar">${assistant ? "AI" : "YOU"}</div><div class="ai-bubble${assistant ? " ai-answer-content" : ""}">${content}</div></div>`;
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

function recentMarkup(messages) {
  const rows = messages.filter((message) => message.role === "assistant").slice(-3).reverse();
  return rows.length ? rows.map((message, index) => `<div class="insight-card"><h4>${index === 0 ? "Latest Insight" : "Previous Insight"}</h4><p>${escapeHtml(message.text.slice(0, 150))}${message.text.length > 150 ? "…" : ""}</p></div>`).join("") : '<div class="empty-state">ยังไม่มี Insight จากบทสนทนานี้</div>';
}

function groundingMarkup(ai, ctx) {
  const isGrounded = ai.status === "completed" && ai.grounded === true;
  const status = ai.status === "loading" ? "running" : ai.status === "completed" ? (isGrounded ? "ready" : "warm") : ai.status === "failed" ? "danger" : "warm";
  const label = ai.status === "loading" ? "Reading" : ai.status === "completed" ? (isGrounded ? "Grounded" : "Answered") : ai.status === "failed" ? "Failed" : "Not checked";
  const resolvedPeriod = ai.resolvedPeriod || ctx.period;
  return `<article class="surface-card"><div class="card-header"><div><h2 class="card-title">AI Status</h2><p class="card-description">สถานะจริงจากคำขอ AI ล่าสุด</p></div>${statusPill(status, label)}</div><div class="card-body list-stack">
    <div class="list-item"><div class="list-item-icon">${icon("database")}</div><div><div class="list-item-title">Data Source</div><div class="list-item-meta">${escapeHtml(ai.source || "Master Data → Summary Cache → Gemini")}</div></div></div>
    <div class="list-item"><div class="list-item-icon">${icon("sparkles")}</div><div><div class="list-item-title">AI Model</div><div class="list-item-meta">${escapeHtml(ai.model || "-")}</div></div></div>
    <div class="list-item"><div class="list-item-icon">${icon("filter")}</div><div><div class="list-item-title">AI Context</div><div class="list-item-meta">Requested ${escapeHtml(ctx.game)} · ${escapeHtml(ctx.period)} / Resolved ${escapeHtml(ai.resolvedGame || ctx.game)} · ${escapeHtml(resolvedPeriod)}</div></div></div>
    <div class="list-item"><div class="list-item-icon">${icon("check")}</div><div><div class="list-item-title">Retention Contract</div><div class="list-item-meta">Same D14-eligible cohort · D1 ≥ D3 ≥ D7 ≥ D14</div></div></div>
    <div class="list-item"><div class="list-item-icon">${icon("clock")}</div><div><div class="list-item-title">Last Updated</div><div class="list-item-meta">${escapeHtml(ai.updatedAt ? new Date(ai.updatedAt).toLocaleString("th-TH") : "-")}</div></div></div>
    ${ai.error ? `<div class="notice danger">${escapeHtml(ai.error)}</div>` : ""}
  </div></article>`;
}

export function renderAiInsightPage() {
  const state = getState();
  const ctx = context();
  return `${AI_CHAT_UX_STYLE}<div class="page-grid ai-insight-page"><section class="ai-layout"><div class="page-grid ai-main-column">
    <article class="surface-card ai-soft-warm ai-context-card"><div class="card-body"><div class="ai-context ai-context-compact ai-context-v2">
      <label class="form-field"><span class="form-label">Game</span><select class="form-control" id="ai-context-game">${optionMarkup(APP_CONFIG.games, ctx.game)}</select></label>
      <label class="form-field"><span class="form-label">Period</span><select class="form-control" id="ai-context-period">${optionMarkup([{ value: "ALL", label: "All Periods" }, ...MONTHS], ctx.period)}</select></label>
      <button class="button primary" id="apply-ai-context" type="button">${icon("check", "nav-icon")} Apply Context</button>
    </div></div></article>
    <article class="surface-card ai-chat-card ai-warm-workspace">
      <div class="ai-chat-head"><div class="ai-chat-head-row"><div class="ai-chat-title"><div class="ai-chat-title-icon">${icon("sparkles")}</div><div><h2 class="card-title">AI INSIGHT WORKSPACE</h2><p class="card-description">อ่าน Master Data ผ่าน Backend, Suggested Questions, Export Chat และ Clear Chat</p></div></div><div class="toolbar"><button class="button small" id="export-chat" type="button">${icon("export", "nav-icon")} Export Chat</button><button class="button small ghost" id="clear-chat" type="button">Clear</button></div></div></div>
      <div class="ai-feed" id="ai-feed">${renderMessages(state.aiMessages)}${analyzingMarkup()}</div>
      <div class="ai-composer"><div class="ai-composer-row"><textarea class="form-control" id="ai-input" maxlength="500" placeholder="ถามเกี่ยวกับ Performance, Retention, Channel Quality หรือ Weekly Alert..." ${busy ? "disabled" : ""}>${escapeHtml(aiDraft)}</textarea><button class="send-button" id="ai-send" type="button" aria-label="Send question" ${busy ? "disabled" : ""}>${icon("arrow")}</button><div class="ai-busy-note">${busy ? "กำลังอ่านข้อมูลและเรียบเรียงคำตอบ..." : "คำถามสูงสุด 500 ตัวอักษร"}</div></div><div class="suggest-grid">${PRESETS.map(([label, prompt]) => `<button class="suggest-chip" type="button" data-prompt="${escapeHtml(prompt)}" ${busy ? "disabled" : ""}>${label}</button>`).join("")}</div></div>
    </article></div>
    <aside class="page-grid"><article class="surface-card ai-minimal-insights"><div class="card-header"><div><h2 class="card-title">Recent Insights</h2><p class="card-description">ประเด็นล่าสุดจากบทสนทนาใน Session นี้</p></div>${statusPill("warm", `${Math.min(3, state.aiMessages.filter((message) => message.role === "assistant").length)} items`)}</div><div class="card-body list-stack">${recentMarkup(state.aiMessages)}</div></article>
    ${groundingMarkup(state.aiStatus, ctx)}</aside>
  </section></div>`;
}

async function sendQuestion(override) {
  const input = document.getElementById("ai-input");
  const question = String(override || input?.value || "").trim();
  if (!question || busy) return;
  if (question.length > 500) { showToast("คำถามยาวเกิน 500 ตัวอักษร"); return; }
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
    const ctx = context();
    const request = {
      question,
      game: ctx.game,
      period: ctx.period,
      channel: "ALL",
      view: "monthly",
      ai_mode: "gemini",
      methodology: "same_cohort_cumulative_d14",
      data_source: "direct_master_aggregation",
      dashboard_state: JSON.stringify({ ...ctx, retention_method: "same_cohort_cumulative_d14", requested_period: ctx.period, source: "direct_master_aggregation" }),
      conversation_id: aiConversationId(),
      prompt_version: AI_PROMPT_VERSION,
    };
    const result = await callAuthorized("ai.ask", request, 60000);
    const payload = assertSuccessfulPayload(result, "AI");
    const answer = cleanAnswer(payload);
    await keepAnalyzingVisible(analyzingStartedAt);
    addAiMessage("assistant", answer);
    setAiStatus({
      status: "completed",
      source: String(payload?.source || result?.source || "Master Data → Summary Cache → Gemini"),
      model: String(payload?.used_ai_model || payload?.model || result?.used_ai_model || "not-reported"),
      grounded: payload?.grounded === true,
      resolvedPeriod: String(payload?.resolved_period || payload?.period || ctx.period),
      resolvedGame: String(payload?.resolved_game || payload?.game || ctx.game),
      maturityStatus: String(payload?.maturity_status || payload?.maturity || "matured"),
      dataVersion: String(payload?.data_version || ""),
      updatedAt: new Date().toISOString(),
      error: "",
    });
  } catch (error) {
    const message = error.message || String(error);
    await keepAnalyzingVisible(analyzingStartedAt);
    addAiMessage("assistant", `ตอนนี้เชื่อม AI ไม่สำเร็จ: ${message}`);
    setAiStatus({ status: "failed", updatedAt: new Date().toISOString(), error: message });
  } finally {
    busy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

export function bindAiInsightPage() {
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

  loadAiCatalogFromDirectMaster();

  document.getElementById("apply-ai-context")?.addEventListener("click", () => {
    const game = document.getElementById("ai-context-game")?.value || "ALL";
    const period = document.getElementById("ai-context-period")?.value || "ALL";
    writeAiContext({ game, period });
    setAiStatus({ status: "idle", source: "", model: "", grounded: null, updatedAt: "", error: "", resolvedPeriod: "", resolvedGame: "", maturityStatus: "" });
    showToast(`Applied AI context ${game} / ${period}`);
    window.dispatchEvent(new Event("cqr-page-refresh"));
  });

  document.getElementById("ai-send")?.addEventListener("click", () => sendQuestion());
  document.getElementById("ai-input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendQuestion(); }
  });
  document.querySelectorAll("[data-prompt]").forEach((button) => button.addEventListener("click", () => sendQuestion(button.dataset.prompt)));
  document.getElementById("clear-chat")?.addEventListener("click", () => {
    aiDraft = "";
    aiInputSelectionStart = 0;
    aiInputSelectionEnd = 0;
    aiInputRestoreFocus = false;
    aiFeedStickToBottom = true;
    clearAiMessages();
    sessionStorage.removeItem(AI_CONVERSATION_KEY);
    window.dispatchEvent(new Event("cqr-page-refresh"));
  });
  document.getElementById("export-chat")?.addEventListener("click", () => {
    const ctx = context();
    const text = ["CQR AI Chat Bot Export", `Game: ${ctx.game}`, `Period: ${ctx.period}`, "Source: Direct Master", "Retention: Same D14-eligible cohort cumulative", "", ...getState().aiMessages.map((message) => `${message.role.toUpperCase()}: ${message.text}`)].join("\n");
    downloadText(`cqr-ai-${ctx.game}-${ctx.period}.txt`, text);
  });
}
