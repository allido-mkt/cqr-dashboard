import { APP_CONFIG } from "../config.js";
import { getState, setFilters, addAiMessage, clearAiMessages, setAiStatus } from "../state.js";
import { callAuthorized, assertSuccessfulPayload, normalizePayload } from "../api.js";
import { icon, escapeHtml, downloadText, showToast, statusPill, optionMarkup } from "../ui.js";

const PRESETS = [
  ["Executive Insight", "สรุป Executive Insight จาก Context ปัจจุบัน แยก Key Finding, Risk และ Recommended Action"],
  ["Channel Quality", "วิเคราะห์ Channel Quality จาก Context ปัจจุบัน โดยเทียบ Register, D1, D3, D7 และ D14"],
  ["Retention Audit", "หาจุด Retention Drop ที่น่ากังวลและเสนอรายการที่ควรตรวจต่อ"],
  ["Weekly Alert", "สรุป Weekly Alert ล่าสุดและสิ่งที่ทีมควรติดตามต่อ"],
];
const MONTHS = APP_CONFIG.months.map((item) => ({ value: item.value, label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${item.value}-01T00:00:00Z`)) }));
let busy = false;

function context() {
  const state = getState();
  return { game: state.filters.game || "ALL", period: state.filters.month || "ALL", channel: "ALL", view: "monthly" };
}

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
  return String(value || "ยังไม่มีคำตอบจาก AI").replace(/\\n/g, "\n").trim();
}

function renderMessages(messages) {
  return messages.map((message) => `<div class="ai-message ${message.role}"><div class="ai-avatar">${message.role === "assistant" ? "AI" : "YOU"}</div><div class="ai-bubble">${escapeHtml(message.text).replaceAll("\n", "<br>")}</div></div>`).join("");
}

function recentMarkup(messages) {
  const rows = messages.filter((message) => message.role === "assistant").slice(-3).reverse();
  return rows.length ? rows.map((message, index) => `<div class="insight-card"><h4>${index === 0 ? "Latest Insight" : "Previous Insight"}</h4><p>${escapeHtml(message.text.slice(0, 150))}${message.text.length > 150 ? "…" : ""}</p></div>`).join("") : '<div class="empty-state">ยังไม่มี Insight จากบทสนทนานี้</div>';
}

function groundingMarkup(ai, ctx) {
  const status = ai.status === "loading" ? "running" : ai.status === "completed" ? "ready" : ai.status === "failed" ? "danger" : "warm";
  const label = ai.status === "loading" ? "Reading" : ai.status === "completed" ? "Grounded" : ai.status === "failed" ? "Failed" : "Not checked";
  return `<article class="surface-card"><div class="card-header"><div><h2 class="card-title">Grounding Status</h2><p class="card-description">สถานะจริงจากคำขอ AI ล่าสุด</p></div>${statusPill(status, label)}</div><div class="card-body list-stack">
    <div class="list-item"><div class="list-item-icon">${icon("database")}</div><div><div class="list-item-title">Response Source</div><div class="list-item-meta">${escapeHtml(ai.source || "ยังไม่ได้รับข้อมูลจาก Backend")}</div></div></div>
    <div class="list-item"><div class="list-item-icon">${icon("sparkles")}</div><div><div class="list-item-title">AI Model</div><div class="list-item-meta">${escapeHtml(ai.model || "-")}</div></div></div>
    <div class="list-item"><div class="list-item-icon">${icon("filter")}</div><div><div class="list-item-title">Dashboard Context</div><div class="list-item-meta">${escapeHtml(ctx.game)} · ${escapeHtml(ctx.period)}</div></div></div>
    <div class="list-item"><div class="list-item-icon">${icon("clock")}</div><div><div class="list-item-title">Last Updated</div><div class="list-item-meta">${escapeHtml(ai.updatedAt ? new Date(ai.updatedAt).toLocaleString("th-TH") : "-")}</div></div></div>
    ${ai.error ? `<div class="notice danger">${escapeHtml(ai.error)}</div>` : ""}
  </div></article>`;
}

export function renderAiInsightPage() {
  const state = getState();
  const ctx = context();
  return `<div class="page-grid ai-insight-page"><section class="ai-layout"><div class="page-grid ai-main-column">
    <article class="surface-card ai-soft-warm ai-context-card"><div class="card-body"><div class="ai-context ai-context-compact">
      <label class="form-field"><span class="form-label">Game</span><select class="form-control" id="ai-context-game">${optionMarkup(APP_CONFIG.games, ctx.game)}</select></label>
      <label class="form-field"><span class="form-label">Period</span><select class="form-control" id="ai-context-period">${optionMarkup([{ value: "ALL", label: "All Periods" }, ...MONTHS], ctx.period)}</select></label>
      <button class="button primary" id="apply-ai-context" type="button">${icon("check", "nav-icon")} Apply Context</button>
    </div></div></article>
    <article class="surface-card ai-chat-card ai-soft-warm">
      <div class="ai-chat-head"><div class="ai-chat-head-row"><div class="ai-chat-title"><div class="ai-chat-title-icon">${icon("sparkles")}</div><div><h2 class="card-title">AI Insight Workspace</h2><p class="card-description">Context, Suggested Questions, Export Chat และ Clear Chat</p></div></div><div class="toolbar"><button class="button small" id="export-chat" type="button">${icon("export", "nav-icon")} Export Chat</button><button class="button small ghost" id="clear-chat" type="button">Clear</button></div></div></div>
      <div class="ai-feed" id="ai-feed">${renderMessages(state.aiMessages)}</div>
      <div class="ai-composer"><div class="ai-composer-row"><textarea class="form-control" id="ai-input" maxlength="500" placeholder="ถามเกี่ยวกับ Performance, Retention, Channel Quality หรือ Weekly Alert..." ${busy ? "disabled" : ""}></textarea><button class="send-button" id="ai-send" type="button" aria-label="Send question" ${busy ? "disabled" : ""}>${icon("arrow")}</button><div class="ai-busy-note">${busy ? "กำลังอ่านข้อมูลและเรียบเรียงคำตอบ..." : "คำถามสูงสุด 500 ตัวอักษร"}</div></div><div class="suggest-grid">${PRESETS.map(([label, prompt]) => `<button class="suggest-chip" type="button" data-prompt="${escapeHtml(prompt)}" ${busy ? "disabled" : ""}>${label}</button>`).join("")}</div></div>
    </article></div>
    <aside class="page-grid"><article class="surface-card ai-soft-warm"><div class="card-header"><div><h2 class="card-title">Recent Insights</h2><p class="card-description">ประเด็นล่าสุดจากบทสนทนาใน Session นี้</p></div>${statusPill("warm", `${Math.min(3, state.aiMessages.filter((message) => message.role === "assistant").length)} items`)}</div><div class="card-body list-stack">${recentMarkup(state.aiMessages)}</div></article>
    ${groundingMarkup(state.aiStatus, ctx)}</aside>
  </section></div>`;
}

async function sendQuestion(override) {
  const input = document.getElementById("ai-input");
  const question = String(override || input?.value || "").trim();
  if (!question || busy) return;
  if (question.length > 500) { showToast("คำถามยาวเกิน 500 ตัวอักษร"); return; }
  if (input) input.value = "";
  busy = true;
  addAiMessage("user", question);
  setAiStatus({ status: "loading", error: "" });
  try {
    const ctx = context();
    const result = await callAuthorized("ai.ask", { question, game: ctx.game, period: ctx.period, channel: "ALL", view: "monthly", ai_mode: "gemini", dashboard_state: JSON.stringify(ctx) }, 60000);
    const payload = assertSuccessfulPayload(result, "AI");
    const answer = cleanAnswer(payload);
    addAiMessage("assistant", answer);
    setAiStatus({
      status: "completed",
      source: String(payload?.source || result?.source || "Apps Script → AI backend"),
      model: String(payload?.used_ai_model || payload?.model || result?.used_ai_model || "backend-selected"),
      grounded: payload?.grounded ?? true,
      updatedAt: new Date().toISOString(),
      error: "",
    });
  } catch (error) {
    const message = error.message || String(error);
    addAiMessage("assistant", `ตอนนี้เชื่อม AI ไม่สำเร็จ: ${message}`);
    setAiStatus({ status: "failed", updatedAt: new Date().toISOString(), error: message });
  } finally {
    busy = false;
    window.dispatchEvent(new Event("cqr-page-refresh"));
  }
}

export function bindAiInsightPage() {
  const feed = document.getElementById("ai-feed");
  if (feed) feed.scrollTop = feed.scrollHeight;
  document.getElementById("apply-ai-context")?.addEventListener("click", () => {
    const game = document.getElementById("ai-context-game")?.value || "ALL";
    const period = document.getElementById("ai-context-period")?.value || "ALL";
    setFilters({ game, month: period });
    localStorage.setItem("cqr_ai_context", JSON.stringify({ game, period, channel: "ALL", view: "monthly" }));
    showToast(`Applied context ${game} / ${period}`);
  });
  const input = document.getElementById("ai-input");
  document.getElementById("ai-send")?.addEventListener("click", () => sendQuestion());
  input?.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendQuestion(); } });
  document.querySelectorAll("[data-prompt]").forEach((button) => button.addEventListener("click", () => sendQuestion(button.dataset.prompt)));
  document.getElementById("clear-chat")?.addEventListener("click", clearAiMessages);
  document.getElementById("export-chat")?.addEventListener("click", () => {
    const state = getState();
    downloadText(`cqr-ai-chat-${Date.now()}.md`, ["# CQR AI Insight Log", "", `Context: ${context().game} / ${context().period}`, "", ...state.aiMessages.map((message) => `## ${message.role === "assistant" ? "AI" : "User"}\n\n${message.text}`)].join("\n\n"), "text/markdown;charset=utf-8");
  });
}
