import { callAuthorized, assertSuccessfulPayload, normalizePayload } from "./api.js";
import { getSavedSession, isPreviewSession } from "./session.js";
import { escapeHtml, statusPill } from "./ui.js";

function row(name, passed, detail = "") { return { name, passed: Boolean(passed), detail: String(detail || "") }; }
async function test(name, fn, rows) {
  try { const detail = await fn(); rows.push(row(name, true, detail)); }
  catch (error) { rows.push(row(name, false, error.message || String(error))); }
}
function render(rows, running = false) {
  const content = document.getElementById("page-content");
  if (!content) return;
  const passed = rows.filter((item) => item.passed).length;
  const failed = rows.filter((item) => !item.passed).length;
  content.innerHTML = `<div class="page-grid"><article class="surface-card warm-card"><div class="card-header"><div><h2 class="card-title">Copilot Functional Self-Test</h2><p class="card-description">ทดสอบ Preview backend contracts เท่านั้น ไม่เรียก Clear/Build Production</p></div>${statusPill(running ? "running" : failed ? "danger" : "ready", running ? "Running" : `${passed} PASS / ${failed} FAIL`)}</div><div class="card-body"><div class="table-wrap"><table><thead><tr><th>Feature</th><th>Result</th><th>Detail</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${statusPill(item.passed ? "ready" : "danger", item.passed ? "PASS" : "FAIL")}</td><td>${escapeHtml(item.detail || "-")}</td></tr>`).join("")}</tbody></table></div></div></article></div>`;
  document.body.dataset.cqrSelftest = running ? "RUNNING" : failed ? "FAIL" : "PASS";
}

export async function runFunctionalSelfTest() {
  const session = getSavedSession();
  const rows = [];
  if (!session || !isPreviewSession(session) || new URLSearchParams(location.search).get("preview") !== "1") {
    rows.push(row("Safety guard", false, "Self-test requires preview=1 and preview-session"));
    render(rows, false);
    return rows;
  }
  render(rows, true);

  await test("AI Insight · ai.ask", async () => {
    const result = await callAuthorized("ai.ask", { question: "Self-test", game: "CBM_TH", period: "2026-06", channel: "ALL", view: "monthly" });
    const payload = assertSuccessfulPayload(result, "AI");
    if (!String(payload.answer || payload.text || "").trim()) throw new Error("empty answer");
    return payload.used_ai_model || payload.model || "answer received";
  }, rows);

  const testEmail = `cqr-selftest-${Date.now()}@example.com`;
  await test("User Access · list", async () => {
    const result = await callAuthorized("admin.users.list");
    assertSuccessfulPayload(result, "Users list");
    const payload = normalizePayload(result);
    const users = result.users || payload.users || payload;
    if (!Array.isArray(users)) throw new Error("users is not an array");
    return `${users.length} users`;
  }, rows);
  await test("User Access · role and scope integrity", async () => {
    const requested = { email: testEmail, display_name: "CQR Self Test", role_id: "super_admin", status: "active", allowed_games: "CBM_TH,CBPC_TH", allowed_regions: "TH" };
    const savedResult = await callAuthorized("admin.users.upsert", requested);
    const savedPayload = assertSuccessfulPayload(savedResult, "User upsert");
    const saved = savedResult.user || savedPayload.user || savedPayload;
    if (saved.role_id !== "super_admin") throw new Error(`saved role=${saved.role_id}`);
    if (saved.allowed_games !== requested.allowed_games || saved.allowed_regions !== requested.allowed_regions) throw new Error("saved scope mismatch");
    const listResult = await callAuthorized("admin.users.list");
    assertSuccessfulPayload(listResult, "Users list after save");
    const listPayload = normalizePayload(listResult);
    const list = listResult.users || listPayload.users || [];
    const reloaded = list.find((user) => user.email === testEmail);
    if (!reloaded || reloaded.role_id !== "super_admin") throw new Error("role did not persist after reload");
    assertSuccessfulPayload(await callAuthorized("admin.users.delete", { email: testEmail }), "User delete");
    return "super_admin and checkbox scopes persisted";
  }, rows);

  await test("User Access · audit and login history", async () => {
    const audit = assertSuccessfulPayload(await callAuthorized("admin.users.audit", { email: testEmail, limit: 10 }), "Audit history");
    const login = assertSuccessfulPayload(await callAuthorized("admin.users.login_history", { email: "bwm.workco@gmail.com", limit: 10 }), "Login history");
    if (!Array.isArray(audit.logs || [])) throw new Error("audit logs missing");
    if (!Array.isArray(login.logs || [])) throw new Error("login logs missing");
    return `${(audit.logs || []).length} audit / ${(login.logs || []).length} login`;
  }, rows);

  await test("Data Health / Pipeline", async () => {
    const payload = assertSuccessfulPayload(await callAuthorized("admin.pipeline.health", { game: "CBM_TH", month: "2026-06" }), "Health");
    if (!Array.isArray(payload.scope_rows || payload.rows)) throw new Error("health rows missing");
    return `${(payload.scope_rows || payload.rows).length} scope row(s)`;
  }, rows);

  await test("Data Control · first build contract", async () => {
    const health = assertSuccessfulPayload(await callAuthorized("admin.pipeline.health", { game: "CBM_TH", month: "2026-02" }), "First build health");
    const scopeRows = health.scope_rows || health.rows || [];
    const row = scopeRows.find((item) => item.game_code === "CBM_TH" && item.period_key === "2026-02");
    if (!row || row.raw_status !== "raw_ready" || row.action_status !== "build_required" || !row.raw_hash) {
      throw new Error("first build health contract missing");
    }
    const result = await callAuthorized("admin.n8n.master.run", {
      game: row.game_code,
      month: row.period_key,
      build_mode: "first_build",
      raw_data_hash: row.raw_hash,
      raw_check_id: row.raw_check_id || "",
      expected_action_status: "build_required",
    });
    const payload = assertSuccessfulPayload(result, "First build");
    return payload.build_mode || "first_build completed";
  }, rows);

  let requestId = "";
  await test("Check Raw · request", async () => {
    const result = await callAuthorized("admin.n8n.raw.check", { game: "CBM_TH", month: "2026-06", target_game_code: "CBM_TH", target_month: "2026-06", check_mode: "manual" });
    const payload = assertSuccessfulPayload(result, "Raw request");
    requestId = payload.request_id || result.request_id;
    if (!requestId) throw new Error("request_id missing");
    return requestId;
  }, rows);
  if (requestId) {
    await test("Check Raw · queued → running → completed", async () => {
      let payload = null;
      for (let index = 0; index < 12; index += 1) {
        payload = assertSuccessfulPayload(await callAuthorized("admin.n8n.raw.status", { request_id: requestId, include_jobs: "true" }), "Raw status");
        if (["completed", "failed"].includes(String(payload.status))) break;
        await new Promise((resolve) => setTimeout(resolve, Number(payload.poll_after_ms || 300)));
      }
      if (payload?.status !== "completed") throw new Error(`terminal status=${payload?.status || "missing"}`);
      if (!Array.isArray(payload.jobs) || !payload.jobs.length) throw new Error("jobs missing");
      return `${payload.status}, ${payload.jobs.length} job(s)`;
    }, rows);
  }

  let run = null;
  await test("Data Control · lookup", async () => {
    const result = await callAuthorized("admin.pipeline.run.lookup", { game: "CBM_TH", month: "2026-06", query: "" });
    assertSuccessfulPayload(result, "Lookup");
    const payload = normalizePayload(result);
    const runs = result.runs || result.matches || payload.runs || payload.matches || payload;
    if (!Array.isArray(runs) || !runs.length) throw new Error("no matching runs");
    run = runs[0];
    return run.run_id;
  }, rows);
  if (run) {
    const params = { game: "CBM_TH", month: "2026-06", run_id: run.run_id, run_ids: JSON.stringify([run.run_id]), run_items: JSON.stringify([{ run_id: run.run_id, game_code: "CBM_TH", period_key: "2026-06" }]), cleanup_hash: run.data_hash_after || run.data_hash_before || "", hash: run.data_hash_after || run.data_hash_before || "" };
    await test("Data Control · preview", async () => { const payload = assertSuccessfulPayload(await callAuthorized("admin.n8n.cleanup.preview", params), "Preview"); return payload.status || "preview success"; }, rows);
    await test("Data Control · clear preview backend", async () => { const payload = assertSuccessfulPayload(await callAuthorized("admin.n8n.cleanup.run", params), "Clear"); return payload.status || "clear success"; }, rows);
    await test("Data Control · repair build preview backend", async () => { const payload = assertSuccessfulPayload(await callAuthorized("admin.n8n.master.run", { game: "CBM_TH", month: "2026-06", build_mode: "repair", run_id: run.run_id, preview_receipt: "PREVIEW-SELFTEST" }), "Build"); return payload.status || "build success"; }, rows);
  }

  await test("Profile / Preferences storage", async () => {
    const key = "cqr_user_preferences";
    const before = localStorage.getItem(key);
    localStorage.setItem(key, JSON.stringify({ defaultGame: "CBM_TH", defaultView: "month", compactTables: true }));
    const parsed = JSON.parse(localStorage.getItem(key));
    if (parsed.defaultGame !== "CBM_TH" || !parsed.compactTables) throw new Error("preference persistence failed");
    if (before == null) localStorage.removeItem(key); else localStorage.setItem(key, before);
    return "read/write passed";
  }, rows);

  render(rows, false);
  return rows;
}
