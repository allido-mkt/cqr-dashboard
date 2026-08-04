import { APP_CONFIG } from "./config.js";
import { getSavedSession, isPreviewSession } from "./session.js";

const previewRawRequests = new Map();
const previewUsers = [
  { email: "bwm.workco@gmail.com", display_name: "Bew WM", role_id: "super_admin", status: "active", allowed_games: "ALL", allowed_regions: "ALL", last_login_at: new Date().toISOString() },
  { email: "viewer@example.com", display_name: "CQR Viewer", role_id: "viewer", status: "active", allowed_games: "ALL", allowed_regions: "ALL", last_login_at: "" },
];
const previewUserAuditLogs = [];
const previewUserLoginLogs = [
  { login_id: "PREVIEW-LOGIN-1", email: "bwm.workco@gmail.com", login_at: new Date().toISOString(), result: "success", role_id: "super_admin", user_agent: "Preview Browser" },
];

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function previewHealth(params = {}) {
  const games = params.game && params.game !== "ALL" ? [params.game] : ["CBM_TH", "CBM_SEA", "CBPC_TH", "CBPC_SEA"];
  const month = params.month && params.month !== "ALL" ? params.month : "2026-06";
  const scope_rows = games.map((game, index) => {
    const firstBuild = game === "CBM_TH" && month === "2026-02";
    const repair = !firstBuild && index === 2;
    return {
      game_code: game,
      period_key: month,
      raw: repair ? "Raw updated" : "Raw ready",
      raw_level: repair ? "warn" : "ok",
      raw_status: repair ? "raw_updated" : "raw_ready",
      raw_hash: `${game.toLowerCase()}-${month}-new`,
      raw_check_id: `PREVIEW-RAW-${game}-${month}`,
      master: firstBuild ? "Not built" : repair ? "Master behind" : "Master ready",
      master_level: firstBuild || repair ? "warn" : "ok",
      master_hash: firstBuild ? "" : repair ? `${game.toLowerCase()}-${month}-old` : `${game.toLowerCase()}-${month}-new`,
      action: firstBuild ? "Build this scope" : repair ? "Preview, Clear, Build" : "No action",
      action_level: firstBuild || repair ? "warn" : "ok",
      action_status: firstBuild ? "build_required" : repair ? "repair" : "ready",
      ready_run_id: firstBuild ? "" : repair ? `RUN-${game}-${month}-OLD` : `RUN-${game}-${month}-READY`,
      latest_run_id: firstBuild ? "" : `RUN-${game}-${month}-LATEST`,
    };
  });
  const buildRows = scope_rows.filter((row) => row.action_status === "build_required");
  const repairRows = scope_rows.filter((row) => row.action_status === "repair");
  const issues = [];
  const recommendations = [];
  buildRows.forEach((row) => {
    issues.push({ level: "warn", badge: "Build required", game_code: row.game_code, period_key: row.period_key, title: `${row.game_code} ยังไม่ได้ Build Master`, detail: "Raw พร้อมแล้วและไม่มี Master เดิม" });
    recommendations.push({ title: `Build Master ${row.game_code} รอบ ${row.period_key}`, detail: "First Build ไม่ต้อง Preview หรือ Clear", build: { mode: "first_build", target_game_code: row.game_code, target_month: row.period_key, raw_hash: row.raw_hash, raw_check_id: row.raw_check_id, raw_status: row.raw_status, action_status: row.action_status } });
  });
  repairRows.forEach((row) => {
    issues.push({ level: "warn", badge: "Hash mismatch", game_code: row.game_code, period_key: row.period_key, title: `${row.game_code} ยังใช้ข้อมูลเก่าอยู่`, detail: "Raw hash ใหม่กว่า Master hash" });
    recommendations.push({ title: `ซ่อมข้อมูล ${row.game_code} รอบ ${row.period_key}`, detail: "Preview ก่อน แล้วค่อย Clear และ Build", cleanup: { target_game_code: row.game_code, target_month: row.period_key, run_id: row.ready_run_id, search_hash: row.master_hash } });
  });
  return {
    ok: true,
    source: "preview",
    game: params.game || "ALL",
    month: params.month || "ALL",
    summary: {
      health_score: issues.length ? "Needs Review" : "Healthy",
      raw_ready: scope_rows.filter((row) => row.raw_status === "raw_ready").length,
      build_required: buildRows.length,
      needs_review: repairRows.length,
      cleanup_needed: repairRows.length,
      data_index_rows: scope_rows.filter((row) => row.master_hash).length,
    },
    scope_rows,
    issues,
    recommendations,
  };
}

function previewLookup(params = {}) {
  const game = params.game || "CBM_TH";
  const month = params.month || "2026-06";
  if (game === "CBM_TH" && month === "2026-02") {
    return { ok: true, game, month, query: params.query || "", runs: [], matches: [], title: "No Master run yet" };
  }
  return {
    ok: true,
    game,
    month,
    query: params.query || "",
    runs: [
      { run_id: `RUN-${game}-${month}-001`, game_code: game, period_key: month, status: "ready", data_hash_before: `${game}-${month}-old`, data_hash_after: `${game}-${month}-new`, created_at: new Date(Date.now() - 86400000).toISOString() },
      { run_id: `RUN-${game}-${month}-002`, game_code: game, period_key: month, status: "needs_review", data_hash_before: `${game}-${month}-new`, data_hash_after: `${game}-${month}-newer`, created_at: new Date().toISOString() },
    ],
  };
}

function previewRawStatus(requestId, includeJobs) {
  const item = previewRawRequests.get(requestId);
  if (!item) return { ok: false, found: false, request_id: requestId, status: "not_found", jobs: [], poll_after_ms: 500, message: "Request not found" };
  const elapsed = Date.now() - item.createdAt;
  const status = elapsed < 700 ? "queued" : elapsed < 1600 ? "running" : "completed";
  const completed = status === "completed" ? 1 : 0;
  const running = status === "running" ? 1 : 0;
  const queued = status === "queued" ? 1 : 0;
  const result = {
    ok: true, found: true, request_id: requestId, batch_id: item.batchId,
    target_games_csv: item.game, target_months_csv: item.month,
    total_jobs: 1, queued_jobs: queued, running_jobs: running, completed_jobs: completed, failed_jobs: 0,
    raw_ready_count: completed, raw_updated_count: 0, raw_partial_count: 0, raw_missing_count: 0,
    status, current_job_id: running ? item.jobId : "", current_game_code: running ? item.game : "",
    current_period_key: running ? item.month : "", requested_by: "local.preview@cqr.local",
    check_mode: "manual", source: "preview", created_at: new Date(item.createdAt).toISOString(),
    updated_at: new Date().toISOString(), finished_at: completed ? new Date().toISOString() : "",
    error_message: "", jobs_included: Boolean(includeJobs), poll_after_ms: 500,
  };
  if (includeJobs) {
    result.jobs = [{ job_id: item.jobId, request_id: requestId, game_code: item.game, period_key: item.month, status: "completed", result_status: "raw_ready", tab_count_found: 5, tab_count_expected: 5, missing_tabs: "", raw_data_hash: `preview-${item.game}-${item.month}-hash`, finished_at: new Date().toISOString(), error_message: "" }];
  }
  return result;
}

async function previewBackend(action, params = {}) {
  await wait(120);
  if (action === "ai.ask") return { ok: true, answer: `จากข้อมูลตัวอย่างของ ${params.game || "ALL"} ช่วง ${params.period || "ALL"} ภาพรวมยังแข็งแรง แต่ควรติดตามการลดลงระหว่าง D1 → D3 ของกลุ่มที่ได้จากแคมเปญแบบติดตั้ง\n\nสิ่งที่ควรตรวจต่อ\n• เทียบ D1, D3 และ D7 แยกตาม Channel\n• ดูขนาดตัวอย่างก่อนปรับงบ\n• ตรวจว่าแนวโน้มเกิดซ้ำในสัปดาห์ล่าสุดหรือไม่`, source: "preview", used_ai_model: "preview-evaluator", grounded: true };
  if (action === "session.me") return { ok: true, user: { ...previewUsers[0] } };
  if (action === "admin.users.list") return { ok: true, users: previewUsers, current_user_email: "bwm.workco@gmail.com", configured_super_admins: ["bwm.workco@gmail.com"] };
  if (action === "admin.users.upsert") {
    const now = new Date().toISOString();
    const next = { email: String(params.email || "").toLowerCase(), display_name: params.display_name || "", role_id: params.role_id || "viewer", status: params.status || "active", allowed_games: params.allowed_games || "ALL", allowed_regions: params.allowed_regions || "ALL", last_login_at: "", created_at: now, created_by: "preview@cqr.local", updated_at: now, updated_by: "preview@cqr.local" };
    const index = previewUsers.findIndex((user) => user.email === next.email);
    const before = index >= 0 ? { ...previewUsers[index] } : null;
    if (index >= 0) { next.last_login_at = previewUsers[index].last_login_at || ""; next.created_at = previewUsers[index].created_at || now; next.created_by = previewUsers[index].created_by || "preview@cqr.local"; previewUsers[index] = { ...previewUsers[index], ...next }; }
    else previewUsers.push(next);
    previewUserAuditLogs.unshift({ log_id: `PREVIEW-AUDIT-${Date.now()}`, target_email: next.email, action: before ? "update" : "create", performed_by: "bwm.workco@gmail.com", result: "completed", created_at: now });
    return { ok: true, user: { ...next } };
  }
  if (action === "admin.users.delete") {
    const email = String(params.email || "").toLowerCase();
    const index = previewUsers.findIndex((user) => user.email === email);
    if (index >= 0) previewUsers.splice(index, 1);
    previewUserAuditLogs.unshift({ log_id: `PREVIEW-AUDIT-${Date.now()}`, target_email: email, action: "delete", performed_by: "bwm.workco@gmail.com", result: "completed", created_at: new Date().toISOString() });
    return { ok: true, deleted_email: email };
  }
  if (action === "admin.users.audit") return { ok: true, logs: previewUserAuditLogs.filter((row) => !params.email || row.target_email === String(params.email).toLowerCase()) };
  if (action === "admin.users.login_history") return { ok: true, logs: previewUserLoginLogs.filter((row) => !params.email || row.email === String(params.email).toLowerCase()) };
  if (action === "admin.pipeline.health") return previewHealth(params);
  if (action === "admin.pipeline.run.lookup") return previewLookup(params);
  if (action === "admin.n8n.raw.check") {
    const request_id = `PREVIEW-RAW-${Date.now()}`;
    previewRawRequests.set(request_id, { createdAt: Date.now(), game: params.game || params.target_game_code, month: params.month || params.target_month, batchId: `BATCH-${Date.now()}`, jobId: `JOB-${Date.now()}` });
    return { ok: true, status: "accepted", request_id, n8n_result: { ok: true, status: "accepted", request_id, total_jobs: 1, queued_jobs: 1, message: "Raw Check request queued: 1 job(s)." } };
  }
  if (action === "admin.n8n.raw.status") return previewRawStatus(params.request_id, /^(1|true|yes)$/i.test(String(params.include_jobs || "")));
  if (action === "admin.n8n.cleanup.preview") return { ok: true, command: "cleanup.preview", status: "sent", request_id: `PREVIEW-CLEANUP-${Date.now()}`, n8n_result: { ok: true, status: "preview_ready", matched_rows: 184320, table_count: 6, cross_game_rows: 0, message: "Preview completed" } };
  if (action === "admin.n8n.cleanup.run") return { ok: true, command: "cleanup.run", status: "sent", request_id: `CLEAR-${Date.now()}`, n8n_result: { ok: true, status: "completed", deleted_rows: 184320, message: "Clear completed" } };
  if (action === "admin.n8n.master.run") return { ok: true, command: "master.run", build_mode: params.build_mode || "repair", status: "sent", request_id: `BUILD-${Date.now()}`, n8n_result: { ok: true, status: "completed", build_mode: params.build_mode || "repair", registered_rows: 184320, dau_rows: 1024550, returners_rows: 51420, login_rows: 812770, data_hash_after: params.raw_data_hash || `${params.game}-${params.month}-built`, message: "Build completed" } };
  throw new Error(`Preview backend does not implement ${action}`);
}

const appsScriptInFlight = new Map();

function appsScriptRequestKey(action, params) {
  const entries = Object.entries(params || {})
    .filter(([key]) => key !== "_timeout_ms")
    .map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])
    .sort(([left], [right]) => left.localeCompare(right));

  return `${String(action || "")}|${JSON.stringify(entries)}`;
}

function callAppsScriptOnce(action, params = {}, timeoutMs = 25000, attempt = 1) {
  return new Promise((resolve, reject) => {
    const callback = `cqrApi_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      delete window[callback];
      script.remove();
    };

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      handler(value);
    };

    const timer = setTimeout(() => {
      finish(
        reject,
        new Error(`Apps Script ไม่ตอบกลับภายในเวลาที่กำหนด (ครั้งที่ ${attempt})`)
      );
    }, timeoutMs);

    window[callback] = (payload) => finish(resolve, payload || {});

    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.onerror = () => {
      finish(
        reject,
        new Error(`เรียก Apps Script ไม่สำเร็จ (ครั้งที่ ${attempt})`)
      );
    };

    const query = new URLSearchParams({
      action,
      callback,
      t: String(Date.now()),
      attempt: String(attempt),
      user_agent: navigator.userAgent,
    });

    Object.entries(params || {}).forEach(([key, value]) => {
      // Apps Script is called by JSONP GET. Never put chat history in the URL:
      // it is not consumed by the current Apps Script handler and can exceed
      // the script-src / Google request URL limit, causing script.onerror.
      const skipLargeAiHistory = action === "ai.ask" && key === "previous_messages";
      if (!skipLargeAiHistory && value !== undefined && value !== null && key !== "_timeout_ms") {
        query.set(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    });

    script.src = `${APP_CONFIG.appsScriptUrl}?${query.toString()}`;
    document.head.appendChild(script);
  });
}

export function callAppsScript(action, params = {}, timeoutMs = 25000) {
  const safeAction = String(action || "");
  const retryable = new Set([
    "dashboard.data",
    "session.me",
    "admin.users.list",
    "admin.pipeline.health",
    "admin.pipeline.run.lookup",
  ]).has(safeAction);

  const key = retryable ? appsScriptRequestKey(safeAction, params) : "";
  if (key && appsScriptInFlight.has(key)) return appsScriptInFlight.get(key);

  const task = (async () => {
    const attempts = retryable ? 2 : 1;
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (attempt > 1) await wait(1800);

      try {
        return await callAppsScriptOnce(
          safeAction,
          params,
          timeoutMs,
          attempt
        );
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("เรียก Apps Script ไม่สำเร็จ");
  })();

  if (!key) return task;

  appsScriptInFlight.set(key, task);
  const clearInFlight = () => {
    if (appsScriptInFlight.get(key) === task) appsScriptInFlight.delete(key);
  };
  task.then(clearInFlight, clearInFlight);

  return task;
}

function parseJsonString(value) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text || !/^[\[{]/.test(text)) return value;
  try { return JSON.parse(text); } catch { return value; }
}

export function normalizePayload(result) {
  let value = result;
  const unwrapKeys = ["n8n_result", "result", "data", "body", "json", "payload"];
  for (let index = 0; index < 10; index += 1) {
    value = parseJsonString(value);
    if (Array.isArray(value) && value.length === 1) { value = value[0]; continue; }
    if (!value || typeof value !== "object" || Array.isArray(value)) break;
    const key = unwrapKeys.find((candidate) => Object.hasOwn(value, candidate) && value[candidate] !== undefined && value[candidate] !== null);
    if (!key) break;
    value = value[key];
  }
  return parseJsonString(value) ?? {};
}

export function assertSuccessfulPayload(result, label = "Backend") {
  const payload = normalizePayload(result);
  const candidates = [result, payload].filter((value) => value && typeof value === "object" && !Array.isArray(value));
  for (const value of candidates) {
    if (value.ok === false || value.success === false) {
      throw new Error(value.message || value.error || `${label} returned a failed response`);
    }
    const status = String(value.status || "").toLowerCase();
    if (["failed", "error", "rejected", "unauthorized", "forbidden", "not_found"].includes(status)) {
      throw new Error(value.message || value.error_message || value.error || `${label} status: ${status}`);
    }
  }
  return payload;
}

export async function callAuthorized(action, params = {}, timeoutMs) {
  const session = getSavedSession();
  if (!session?.sessionToken) throw new Error("Session หมดอายุ กรุณา Sign in ใหม่");
  if (isPreviewSession(session)) return previewBackend(action, params);
  const result = await callAppsScript(action, { ...params, session_token: session.sessionToken }, timeoutMs || Number(params?._timeout_ms || 25000));
  if (result?.ok === false) throw new Error(result.message || result.error || "Backend request failed");
  return result;
}
