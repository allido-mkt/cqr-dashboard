/**
 * CQR Dashboard secure API for Google Apps Script.
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Security model:
 * - Frontend sends Google ID token.
 * - Apps Script verifies token with Google.
 * - Apps Script checks allowed email list.
 * - Dashboard data is returned only after verification.
 */

const CONFIG = {
  CLIENT_ID: '496972749333-ddnqu2jefebjcuhj8koar6d66v510qou.apps.googleusercontent.com',
  ALLOWED_EMAILS: [
    'bwm.workco@gmail.com',
    'eveningbs@gmail.com',
    'ksbing34@gmail.com',
    'mkt.performance.center@gmail.com',
    'tipchareon.t@gmail.com'
  ],
  SUPER_ADMIN_EMAILS: [
    'bwm.workco@gmail.com'
  ],

  // Put the private Google Drive file ID that stores the dashboard data.
  // The file can contain either:
  // 1) raw JSON object, or
  // 2) JS format: const CQR_DATA = {...};
  DATA_FILE_ID: '1tOKlCjjGNRqzlvPHKzqhq_Uv285ufyRE',
  CENTRAL_DB_ID: '1uM85a9Fqt3j4NAM1XcEI2ORIw0Uef7Unr-JmIIbpm2g',
  SESSION_TTL_SECONDS: 14400
};

function doGet(e) {
  try {
    const action = String(e.parameter.action || '').toLowerCase();
    const callback = e.parameter.callback;

    if (action === 'login') {
      const profile = requireAllowedProfile_(e.parameter.id_token);
      touchUserLogin_(profile);
      const session = createSession_(profile);
      return json_({
        ok: true,
        session_token: session.session_token,
        expires_at: session.expires_at,
        user: {
          email: profile.email,
          display_name: profile.name || profile.email,
          role_id: roleForEmail_(profile.email),
          is_super_admin: roleForEmail_(profile.email) === 'super_admin'
        }
      }, callback);
    }

    if (action === 'dashboard.data') {
      const session = validateSession_(e.parameter.session_token);
      const data = readDashboardData_();
      return json_({ ok: true, email: session.email, data }, callback);
    }

    if (action === 'ai.ask') {
      return handleAiAsk_(e, callback);
    }

    if (action === 'admin.users.list') {
      return handleAdminUsersList_(e, callback);
    }

    if (action === 'admin.users.upsert') {
      return handleAdminUsersUpsert_(e, callback);
    }

    if (action === 'admin.users.delete') {
      return handleAdminUsersDelete_(e, callback);
    }

    if (action === 'admin.pipeline.health') {
      return handleAdminPipelineHealth_(e, callback);
    }

    if (action === 'admin.pipeline.run.lookup') {
      return handleAdminPipelineRunLookup_(e, callback);
    }

    if (action === 'admin.n8n.cleanup.preview') {
      return handleAdminN8nCommand_(e, callback, 'cleanup.preview');
    }

    if (action === 'admin.n8n.cleanup.run') {
      return handleAdminN8nCommand_(e, callback, 'cleanup.run');
    }

    if (action === 'admin.n8n.master.run') {
      return handleAdminN8nCommand_(e, callback, 'master.run');
    }

    if (action === 'verify') {
      const profile = requireAllowedProfile_(e.parameter.id_token);
      return json_({ ok: true, allowed: true, email: profile.email, name: profile.name || '' }, callback);
    }

    if (action === 'data') {
      requireAllowedProfile_(e.parameter.id_token);
      const data = readDashboardData_();
      return json_({ ok: true, data }, callback);
    }

    return json_({ ok: true, message: 'CQR API is running.' }, callback);
  } catch (err) {
    const message = err.message || String(err);
    const propertyMatch = String(message).match(/Missing Script Property:\s*([A-Z0-9_]+)/);
    return json_({
      ok: false,
      message,
      required_property: propertyMatch ? propertyMatch[1] : ''
    }, e.parameter.callback);
  }
}

function verifyIdToken_(idToken) {
  if (!idToken) throw new Error('Missing id_token.');

  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('Invalid Google token.');

  const payload = JSON.parse(response.getContentText());
  if (payload.aud !== CONFIG.CLIENT_ID) throw new Error('Token audience mismatch.');
  if (!payload.email_verified || payload.email_verified === 'false') throw new Error('Email is not verified.');

  return {
    email: String(payload.email || '').toLowerCase(),
    name: payload.name || ''
  };
}

function requireAllowedProfile_(idToken) {
  const profile = verifyIdToken_(idToken);
  if (!isAllowed_(profile.email)) {
    throw new Error('Email is not allowed.');
  }
  return profile;
}

function isAllowed_(email) {
  const normalized = String(email || '').toLowerCase();
  if (CONFIG.SUPER_ADMIN_EMAILS.map(String).map(v => v.toLowerCase()).includes(normalized)) return true;
  return readAdminUsers_().some(user => String(user.email || '').toLowerCase() === normalized && user.status === 'active');
}

function authorizeOnce() {
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=test', {
    muteHttpExceptions: true
  });
  DriveApp.getFileById(CONFIG.DATA_FILE_ID).getName();
}

function setupAiAskN8nConfig_() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CQR_AI_ASK_WEBHOOK_URL')) {
    props.setProperty('CQR_AI_ASK_WEBHOOK_URL', 'https://n8n-external.exservice.io/webhook/cqr-ai-ask-box-v3');
  }
  if (!props.getProperty('CQR_AI_ASK_SHARED_SECRET')) {
    throw new Error('Set Script Property CQR_AI_ASK_SHARED_SECRET before enabling AI Ask Box.');
  }
}

function createSession_(profile) {
  const token = Utilities.getUuid() + '-' + Utilities.getUuid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIG.SESSION_TTL_SECONDS * 1000);
  CacheService.getScriptCache().put('session:' + token, JSON.stringify({
    email: profile.email,
    name: profile.name || profile.email,
    role_id: roleForEmail_(profile.email),
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString()
  }), CONFIG.SESSION_TTL_SECONDS);
  return {
    session_token: token,
    expires_at: expiresAt.toISOString()
  };
}

function roleForEmail_(email) {
  const normalized = String(email || '').toLowerCase();
  if (CONFIG.SUPER_ADMIN_EMAILS.map(String).map(e => e.toLowerCase()).includes(normalized)) return 'super_admin';
  const user = readAdminUsers_().find(item => String(item.email || '').toLowerCase() === normalized);
  return user ? String(user.role_id || 'viewer') : 'viewer';
}

function requireSuperAdmin_(session) {
  if (roleForEmail_(session.email) !== 'super_admin') {
    throw new Error('Only super_admin can manage users.');
  }
}

function readAdminUsers_() {
  const props = PropertiesService.getScriptProperties();
  const text = props.getProperty('CQR_ADMIN_USERS_JSON');
  if (text) {
    return safeJsonParse_(text, []);
  }
  return CONFIG.ALLOWED_EMAILS.map(email => ({
    email: String(email).toLowerCase(),
    display_name: '',
    role_id: roleForSeedEmail_(email),
    status: 'active',
    allowed_games: 'ALL',
    allowed_regions: 'ALL',
    last_login_at: ''
  }));
}

function writeAdminUsers_(users) {
  PropertiesService.getScriptProperties().setProperty('CQR_ADMIN_USERS_JSON', JSON.stringify(users || []));
}

function touchUserLogin_(profile) {
  const email = String(profile.email || '').trim().toLowerCase();
  if (!email) return;

  const users = readAdminUsers_();
  const index = users.findIndex(user => String(user.email || '').toLowerCase() === email);
  const loginAt = new Date().toISOString();
  if (index >= 0) {
    users[index] = Object.assign({}, users[index], {
      display_name: users[index].display_name || profile.name || '',
      last_login_at: loginAt
    });
  } else {
    users.push({
      email,
      display_name: profile.name || '',
      role_id: roleForSeedEmail_(email),
      status: 'active',
      allowed_games: 'ALL',
      allowed_regions: 'ALL',
      last_login_at: loginAt
    });
  }
  writeAdminUsers_(users);
}

function roleForSeedEmail_(email) {
  const normalized = String(email || '').toLowerCase();
  return CONFIG.SUPER_ADMIN_EMAILS.map(String).map(e => e.toLowerCase()).includes(normalized)
    ? 'super_admin'
    : 'viewer';
}

function handleAdminUsersList_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);
  const users = readAdminUsers_().sort((a, b) => String(a.email).localeCompare(String(b.email)));
  return json_({ ok: true, users }, callback);
}

function handleAdminUsersUpsert_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);

  const email = String(e.parameter.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Valid email is required.');

  const nextUser = {
    email,
    display_name: String(e.parameter.display_name || '').trim(),
    role_id: String(e.parameter.role_id || 'viewer').trim(),
    status: String(e.parameter.status || 'active').trim(),
    allowed_games: String(e.parameter.allowed_games || 'ALL').trim(),
    allowed_regions: String(e.parameter.allowed_regions || 'ALL').trim(),
    last_login_at: ''
  };
  if (CONFIG.SUPER_ADMIN_EMAILS.map(String).map(item => item.toLowerCase()).includes(email)) {
    nextUser.role_id = 'super_admin';
    nextUser.status = 'active';
  }

  const users = readAdminUsers_();
  const index = users.findIndex(user => String(user.email || '').toLowerCase() === email);
  if (index >= 0) {
    nextUser.last_login_at = users[index].last_login_at || '';
    users[index] = Object.assign({}, users[index], nextUser);
  } else {
    users.push(nextUser);
  }
  writeAdminUsers_(users);
  return json_({ ok: true, user: nextUser, users }, callback);
}

function handleAdminUsersDelete_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);

  const email = String(e.parameter.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Valid email is required.');
  if (email === String(session.email || '').toLowerCase()) {
    throw new Error('Cannot delete the current signed-in account.');
  }
  if (CONFIG.SUPER_ADMIN_EMAILS.map(String).map(item => item.toLowerCase()).includes(email)) {
    throw new Error('Cannot delete a configured super_admin account.');
  }

  const users = readAdminUsers_();
  const nextUsers = users.filter(user => String(user.email || '').toLowerCase() !== email);
  if (nextUsers.length === users.length) throw new Error('User not found.');
  writeAdminUsers_(nextUsers);
  return json_({ ok: true, deleted_email: email, users: nextUsers }, callback);
}

function handleAdminPipelineHealth_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);

  const game = String(e.parameter.game || 'ALL').trim();
  const month = String(e.parameter.month || '2026-06').trim();
  const n8nHealth = tryAdminPipelineHealthViaN8n_(session, game, month);
  if (n8nHealth) return json_(n8nHealth, callback);

  const pipelineRows = readCentralSheetRows_('PipelineLogs');
  const dataIndexRows = readCentralSheetRows_('DataIndex');
  const rawRows = readCentralSheetRows_('RawIngestionLogs');
  const targetRows = filterPipelineRows_(pipelineRows, game, month);
  const targetRawRows = filterPipelineRows_(rawRows, game, month);
  const readyRows = targetRows.filter(row => pipelineStatus_(row) === 'ready');
  const reviewRows = targetRows.filter(row => pipelineStatus_(row) === 'needs_review');
  const expectedGames = ['CBM_TH', 'CBM_SEA', 'CBPC_TH', 'CBPC_SEA'];
  const rawReadyRows = targetRawRows.filter(row => pipelineStatus_(row) === 'raw_ready');

  const issues = [];
  const recommendations = [];
  reviewRows.forEach(row => {
    const gameCode = pipelineGame_(row);
    const periodKey = pipelinePeriod_(row);
    const previousHash = pipelineHashBefore_(row);
    const currentHash = pipelineHashAfter_(row);
    const oldRun = findOldReadyRunForHash_(pipelineRows, gameCode, periodKey, previousHash);
    const oldRunId = oldRun ? pipelineRunId_(oldRun) : '';
    issues.push({
      level: 'warn',
      badge: 'Hash mismatch',
      game_code: gameCode,
      title: gameCode + ' มีข้อมูลเก่าค้างอยู่',
      detail: 'เดือน ' + periodKey + ' เจอ previous=' + (previousHash || '-') + ' แต่ข้อมูลรอบใหม่เป็น ' + (currentHash || '-') + ' จึงยังไม่เขียนข้อมูลใหม่'
    });
    recommendations.push({
      title: 'Cleanup ' + gameCode + ' ก่อนรัน Master Data Update ใหม่',
      detail: oldRunId
        ? 'ใช้เครื่องมือ Clean Old Run Data แบบ Preview ก่อน ถ้าตัวเลขถูกต้องค่อย confirm_delete=YES แล้วรัน Master Data Update อีกครั้ง'
        : 'ยังไม่เจอ run_id เก่าจาก hash นี้ ให้ใช้ Run Inspector ค้นด้วย hash ' + (previousHash || '-') + ' หรือเปิด PipelineLogs ตรวจแถว ready ของเกม/เดือนเดียวกัน',
      cleanup: {
        target_game_code: gameCode,
        target_month: periodKey,
        run_id: oldRunId,
        search_hash: previousHash,
        previous_hash: previousHash,
        current_hash: currentHash
      }
    });
  });

  const dataIndexTargetRows = dataIndexRows.filter(row =>
    (normalizeGameCode_(game) === 'ALL' || pipelineGame_(row) === normalizeGameCode_(game)) &&
    pipelinePeriod_(row) === normalizePeriodKey_(month)
  );
  if (!targetRows.length) {
    issues.push({
      level: 'warn',
      badge: 'No logs',
      title: 'ยังไม่พบ PipelineLogs สำหรับเงื่อนไขนี้',
      detail: 'ยังอ่าน log ของเกม/เดือนนี้ไม่ได้ แนะนำตรวจว่า Central DB ID ถูกต้อง, มีแท็บ PipelineLogs และ n8n เขียน log เข้ามาแล้วหรือยัง'
    });
    recommendations.push({
      title: 'ตรวจแหล่งข้อมูลของ Data Health ก่อน',
      detail: 'ถ้ามี n8n health workflow แล้ว ให้ตั้ง Script Property CQR_N8N_HEALTH_WEBHOOK_URL เพื่อให้ Data Health ยิง n8n โดยตรง หรือเช็กว่า PipelineLogs ใน Central DB มีข้อมูลของเดือนนี้แล้ว',
      cleanup: {
        target_game_code: game,
        target_month: month,
        run_id: '',
        search_hash: ''
      }
    });
  }

  const dataIndexGameSet = new Set(dataIndexTargetRows.map(pipelineGame_).filter(Boolean));
  const readyGameSet = new Set(readyRows.map(pipelineGame_).filter(Boolean));
  const rawReadyGameSet = new Set(rawReadyRows.map(pipelineGame_).filter(Boolean));
  const gamesToCheck = normalizeGameCode_(game) === 'ALL' ? expectedGames : [normalizeGameCode_(game)];
  const missingRawGames = targetRawRows.length ? gamesToCheck.filter(gameCode => gameCode && !rawReadyGameSet.has(gameCode)) : gamesToCheck;
  const missingReadyGames = targetRows.length ? gamesToCheck.filter(gameCode => gameCode && !readyGameSet.has(gameCode)) : [];
  const missingIndexGames = dataIndexTargetRows.length ? gamesToCheck.filter(gameCode => gameCode && !dataIndexGameSet.has(gameCode)) : [];

  missingRawGames.forEach(gameCode => {
    const latestRaw = targetRawRows
      .filter(row => pipelineGame_(row) === gameCode)
      .sort((a, b) => String(pipelineTime_(b) || '').localeCompare(String(pipelineTime_(a) || '')))[0] || null;
    const status = latestRaw ? pipelineStatus_(latestRaw) || 'no status' : 'no raw log';
    issues.push({
      level: 'warn',
      badge: 'Raw check',
      game_code: gameCode,
      title: gameCode + ' ยังไม่ผ่าน Raw Check ในเดือนนี้',
      detail: latestRaw
        ? 'Raw log ล่าสุดเป็นสถานะ ' + status + ' และพบ ' + (rowValue_(latestRaw, ['tab_count_found']) || 0) + '/' + (rowValue_(latestRaw, ['tab_count_expected']) || 5) + ' tab แนะนำตรวจ Raw file ก่อน Build'
        : 'ยังไม่พบ RawIngestionLogs ของ ' + gameCode + ' สำหรับรอบ ' + month + ' แนะนำรัน Raw Data Check หรือรอ Auto Pipeline รอบวันอาทิตย์'
    });
    recommendations.push({
      title: 'ตรวจ Raw Data ของ ' + gameCode,
      detail: 'ตรวจว่า Raw file เดือน ' + month + ' มีครบ 5 tab และอ่านแถวได้ ก่อนสั่ง Build Master ใหม่',
      cleanup: {
        target_game_code: gameCode,
        target_month: month,
        run_id: '',
        search_hash: ''
      }
    });
  });

  missingReadyGames.forEach(gameCode => {
    if (reviewRows.some(row => pipelineGame_(row) === gameCode)) return;
    issues.push({
      level: 'warn',
      badge: 'Missing ready run',
      game_code: gameCode,
      title: gameCode + ' ยังไม่มี ready run ในเดือนนี้',
      detail: 'ยังไม่พบ run สถานะ ready ของ ' + gameCode + ' ในรอบ ' + month + ' แนะนำตรวจ PipelineLogs หรือรัน Master Data Update ใหม่หลังเคลียร์ข้อมูลเก่าเรียบร้อย'
    });
    recommendations.push({
      title: 'ตรวจ run ล่าสุดของ ' + gameCode,
      detail: 'ไปที่ Data Control เลือกเกมนี้และเดือน ' + month + ' แล้วกด FIND เพื่อดู run ล่าสุดก่อนตัดสินใจ Clear หรือ Build',
      cleanup: {
        target_game_code: gameCode,
        target_month: month,
        run_id: '',
        search_hash: ''
      }
    });
  });

  missingIndexGames.forEach(gameCode => {
    issues.push({
      level: 'warn',
      badge: 'Missing index',
      game_code: gameCode,
      title: gameCode + ' ยังไม่เจอใน DataIndex',
      detail: 'Central DB ยังไม่มี index ของ ' + gameCode + ' สำหรับรอบ ' + month + ' อาจทำให้ Dashboard หรือ AI CHAT อ่านข้อมูลไม่ครบ'
    });
  });

  return json_({
    ok: true,
    game,
    month,
    summary: {
      health_score: issues.length ? 'Needs Review' : 'Healthy',
      raw_ready: rawReadyRows.length,
      raw_logs: targetRawRows.length,
      ready_runs: readyRows.length,
      needs_review: reviewRows.length,
      cleanup_needed: recommendations.length,
      pipeline_logs: targetRows.length,
      data_index_rows: dataIndexTargetRows.length
    },
    source: 'apps_script_central_db',
    auto_pipeline_note: 'Auto Pipeline วันอาทิตย์: Raw Check 15:00, Master Build 16:00, Controller 17:00. Manual tools ใช้ซ่อมเฉพาะเคส',
    issues,
    recommendations
  }, callback);
}

function tryAdminPipelineHealthViaN8n_(session, game, month) {
  const props = PropertiesService.getScriptProperties();
  const webhookUrl = props.getProperty('CQR_N8N_HEALTH_WEBHOOK_URL');
  if (!webhookUrl) return null;

  const sharedSecret = props.getProperty('CQR_N8N_ADMIN_SHARED_SECRET') || '';
  const payload = {
    request_id: 'ADMIN-HEALTH-' + new Date().toISOString(),
    command: 'pipeline.health',
    requested_by: session.email,
    target_game_code: game,
    target_month: month,
    central_db_id: CONFIG.CENTRAL_DB_ID,
    source: 'cqr_admin_panel'
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    headers: {}
  };
  if (sharedSecret) options.headers['X-CQR-Admin-Secret'] = sharedSecret;

  const response = UrlFetchApp.fetch(webhookUrl, options);
  const status = response.getResponseCode();
  const text = response.getContentText() || '';
  const data = safeJsonParse_(text, { raw: text });
  if (status < 200 || status >= 300) {
    return {
      ok: true,
      game,
      month,
      source: 'n8n_health_error',
      summary: {
        health_score: 'Needs Review',
        ready_runs: '-',
        needs_review: 1,
        cleanup_needed: 1,
        pipeline_logs: '-',
        data_index_rows: '-'
      },
      issues: [{
        level: 'warn',
        badge: 'n8n health',
        title: 'Data Health ยิง n8n ไม่สำเร็จ',
        detail: 'เช็ก CQR_N8N_HEALTH_WEBHOOK_URL หรือ execution ล่าสุดของ n8n health workflow ก่อนใช้งานต่อ'
      }],
      recommendations: [{
        title: 'ตรวจ n8n health workflow',
        detail: 'เปิด n8n แล้วดู execution ของ Health workflow ว่ารับ request จาก Admin Panel ได้หรือไม่',
        cleanup: {
          target_game_code: game,
          target_month: month,
          run_id: '',
          search_hash: ''
        }
      }],
      n8n_status: status,
      n8n_detail: data
    };
  }

  data.ok = data.ok !== false;
  data.game = data.game || game;
  data.month = data.month || month;
  data.source = data.source || 'n8n_health';
  data.summary = data.summary || {};
  data.issues = data.issues || [];
  data.recommendations = data.recommendations || [];
  return data;
}

function handleAdminPipelineRunLookup_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);

  const game = String(e.parameter.game || 'ALL').trim();
  const month = String(e.parameter.month || '').trim();
  const query = String(e.parameter.query || '').trim().toLowerCase();
  const wantedGame = normalizeGameCode_(game);
  const wantedMonth = normalizePeriodKey_(month);
  const pipelineRows = readCentralSheetRows_('PipelineLogs');
  const enrichedRows = pipelineRows.map(row => ({
    row,
    game_code: pipelineGame_(row),
    period_key: pipelinePeriod_(row),
    run_id: pipelineRunId_(row),
    status: pipelineStatus_(row),
    data_hash_before: pipelineHashBefore_(row),
    data_hash_after: pipelineHashAfter_(row),
    sort_time: pipelineTime_(row)
  }));
  const gameRows = enrichedRows.filter(item => wantedGame === 'ALL' || item.game_code === wantedGame);
  const monthRows = gameRows.filter(item => !wantedMonth || item.period_key === wantedMonth);
  const candidateRows = monthRows
    .filter(item => {
      if (!query) return true;
      const row = item.row;
      return [
        item.run_id,
        item.data_hash_before,
        item.data_hash_after,
        item.status,
        rowValue_(row, ['error_message', 'error message']),
        rowValue_(row, ['message'])
      ].join(' ').toLowerCase().indexOf(query) >= 0;
    })
    .filter(item => isPipelineLookupCandidate_(item, !!query));

  const rows = compactPipelineLookupRows_(candidateRows, !!query)
    .sort((a, b) => String(b.sort_time || '').localeCompare(String(a.sort_time || '')))
    .slice(0, 30);

  const firstReady = rows.find(item => item.status === 'ready') || rows[0] || null;
  return json_({
    ok: true,
    title: rows.length ? 'พบ run ที่เกี่ยวข้อง' : 'ไม่พบ run ที่ตรงเงื่อนไข',
    summary: rows.length
      ? 'ใช้ข้อมูลนี้เพื่อกรอก Cleanup Config หรือยืนยันว่ารอบล่าสุดเขียนสำเร็จแล้ว'
      : buildRunLookupEmptySummary_(pipelineRows.length, gameRows.length, monthRows.length, query),
    risk_level: rows.some(item => item.status === 'needs_review') ? 'warn' : 'ok',
    badge: rows.length + ' match',
    matches: rows.map(item => ({
      run_id: item.run_id || '',
      game_code: item.game_code || '',
      period_key: item.period_key || '',
      status: item.status || '',
      data_hash_before: item.data_hash_before || '',
      data_hash_after: item.data_hash_after || '',
      rows_read: rowValue_(item.row, ['rows_read', 'rows read']) || '',
      rows_written: rowValue_(item.row, ['rows_written', 'rows written']) || '',
      run_started_at: rowValue_(item.row, ['run_started_at', 'run started at']) || '',
      run_finished_at: rowValue_(item.row, ['run_finished_at', 'run finished at']) || '',
      message: rowValue_(item.row, ['error_message', 'error message']) || rowValue_(item.row, ['message']) || ''
    })),
    cleanup_suggestion: firstReady ? {
      target_game_code: firstReady.game_code || wantedGame || game,
      target_month: firstReady.period_key || wantedMonth || month,
      run_id: firstReady.run_id || '',
      hash: firstReady.data_hash_after || firstReady.data_hash_before || '',
      status: firstReady.status || '',
      rows_written: rowValue_(firstReady.row, ['rows_written', 'rows written']) || ''
    } : null,
    debug: {
      requested_game: game,
      normalized_game: wantedGame,
      requested_month: month,
      normalized_month: wantedMonth,
      query: query,
      total_pipeline_logs: pipelineRows.length,
      matching_game: gameRows.length,
      matching_game_month: monthRows.length,
      sample_games: uniqueValues_(enrichedRows.map(item => item.game_code)).slice(0, 8),
      sample_periods: uniqueValues_(enrichedRows.map(item => item.period_key)).slice(0, 8)
    }
  }, callback);
}

function isPipelineLookupCandidate_(item, hasQuery) {
  const status = String(item.status || '').toLowerCase();
  const runId = String(item.run_id || '');
  if (/^CLEANUP/i.test(runId)) return false;
  if (status.indexOf('cleanup') >= 0 || status.indexOf('deleted') >= 0) return false;
  if (hasQuery) return true;
  return ['ready', 'needs_review', 'raw_ready'].indexOf(status) >= 0;
}

function compactPipelineLookupRows_(rows, hasQuery) {
  if (hasQuery) return rows;
  const byKey = {};
  rows.forEach(function (item) {
    const key = [
      item.game_code || 'ALL',
      item.period_key || '',
      item.status || '',
      item.data_hash_before || '',
      item.data_hash_after || ''
    ].join('|');
    const current = byKey[key];
    if (!current || String(item.sort_time || '').localeCompare(String(current.sort_time || '')) > 0) {
      byKey[key] = item;
    }
  });
  return Object.keys(byKey).map(function (key) { return byKey[key]; });
}

function handleAdminN8nCommand_(e, callback, command) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);

  const game = String(e.parameter.game || 'ALL').trim();
  const month = String(e.parameter.month || '').trim();
  const runId = String(e.parameter.run_id || '').trim();
  const runIds = safeJsonParse_(e.parameter.run_ids || '[]', [])
    .map(function (value) { return String(value || '').trim(); })
    .filter(Boolean);
  const runItems = safeJsonParse_(e.parameter.run_items || '[]', []);
  const cleanupHash = String(e.parameter.cleanup_hash || e.parameter.hash || '').trim();
  if (!month) throw new Error('Month is required.');
  if ((command === 'cleanup.preview' || command === 'cleanup.run') && !runId && !runIds.length && !cleanupHash) {
    throw new Error('Run ID or hash is required for cleanup.');
  }
  if ((command === 'cleanup.preview' || command === 'cleanup.run') && game === 'ALL' && !runIds.length && !cleanupHash) {
    throw new Error('Cleanup requires one selected game, not ALL.');
  }

  const props = PropertiesService.getScriptProperties();
  const webhookUrl = n8nWebhookUrlForCommand_(props, command);
  const sharedSecret = props.getProperty('CQR_N8N_ADMIN_SHARED_SECRET') || '';
  const payload = {
    request_id: 'ADMIN-' + command.toUpperCase().replace(/\./g, '-') + '-' + new Date().toISOString(),
    command,
    requested_by: session.email,
    target_game_code: game,
    target_month: month,
    run_id: runId,
    run_ids: runIds,
    run_items: runItems,
    cleanup_hash: cleanupHash,
    old_hash: cleanupHash,
    hash: cleanupHash,
    confirm_delete: command === 'cleanup.run' ? 'YES' : 'NO',
    run_mode: command === 'master.run' ? 'force' : '',
    source: 'cqr_admin_panel'
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    headers: {}
  };
  if (sharedSecret) options.headers['X-CQR-Admin-Secret'] = sharedSecret;

  const response = UrlFetchApp.fetch(webhookUrl, options);
  const status = response.getResponseCode();
  const text = response.getContentText() || '';
  const data = safeJsonParse_(text, { raw: text });
  if (status < 200 || status >= 300) {
    return json_({
      ok: false,
      message: 'n8n command failed.',
      status,
      detail: data
    }, callback);
  }
  return json_({
    ok: true,
    command,
    game,
    month,
    status: 'sent',
    n8n_result: data,
    request_id: payload.request_id
  }, callback);
}

function n8nWebhookUrlForCommand_(props, command) {
  const map = {
    'cleanup.preview': 'CQR_N8N_CLEANUP_WEBHOOK_URL',
    'cleanup.run': 'CQR_N8N_CLEANUP_WEBHOOK_URL',
    'master.run': 'CQR_N8N_MASTER_UPDATE_WEBHOOK_URL'
  };
  const propertyName = map[command];
  const url = props.getProperty(propertyName);
  if (!url) throw new Error('Missing Script Property: ' + propertyName);
  return url;
}

function readCentralSheetRows_(sheetName) {
  const sheet = SpreadsheetApp.openById(CONFIG.CENTRAL_DB_ID).getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(normalizeHeader_);
  return values.slice(1).map((row, index) => {
    const object = { row_number: index + 2 };
    headers.forEach((header, columnIndex) => {
      if (!header) return;
      object[header] = row[columnIndex] instanceof Date ? row[columnIndex].toISOString() : row[columnIndex];
    });
    return object;
  });
}

function normalizeHeader_(header) {
  return String(header || '').trim().toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, '_');
}

function filterPipelineRows_(rows, game, month) {
  const wantedGame = normalizeGameCode_(game);
  const wantedMonth = normalizePeriodKey_(month);
  return rows.filter(row =>
    (wantedGame === 'ALL' || pipelineGame_(row) === wantedGame) &&
    (!wantedMonth || pipelinePeriod_(row) === wantedMonth)
  );
}

function findOldReadyRunForHash_(rows, game, month, hash) {
  if (!hash) return null;
  const wantedGame = normalizeGameCode_(game);
  const wantedMonth = normalizePeriodKey_(month);
  const wantedHash = String(hash || '').trim();
  return rows
    .filter(row => pipelineGame_(row) === wantedGame)
    .filter(row => pipelinePeriod_(row) === wantedMonth)
    .filter(row => pipelineStatus_(row) === 'ready')
    .filter(row => pipelineHashAfter_(row) === wantedHash || pipelineHashBefore_(row) === wantedHash)
    .sort((a, b) => String(pipelineTime_(b) || '').localeCompare(String(pipelineTime_(a) || '')))[0] || null;
}

function buildRunLookupEmptySummary_(totalRows, gameRows, monthRows, query) {
  if (!totalRows) return 'ยังไม่พบข้อมูลใน PipelineLogs ของ Central DB ที่ Apps Script อ่านอยู่';
  if (!gameRows) return 'PipelineLogs มีข้อมูลแล้ว แต่ยังไม่เจอเกมนี้ แนะนำเช็กชื่อเกมหรือ Central DB ที่ n8n เขียน log';
  if (!monthRows) return 'เจอเกมนี้ใน PipelineLogs แล้ว แต่ยังไม่เจอเดือนที่เลือก แนะนำเช็ก period_key ของ run';
  if (query) return 'เจอเกมและเดือนแล้ว แต่ไม่พบ run/hash ตามคำค้น ลองล้างช่องค้นหาแล้วกด FIND อีกครั้ง';
  return 'เจอเกมและเดือนแล้ว แต่ยังไม่มี run ที่ใช้แสดงผลได้';
}

function rowValue_(row, keys) {
  const aliases = keys.map(normalizeHeader_);
  for (let i = 0; i < aliases.length; i += 1) {
    if (Object.prototype.hasOwnProperty.call(row, aliases[i])) return row[aliases[i]];
  }
  return '';
}

function normalizeGameCode_(value) {
  const text = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return text || 'ALL';
}

function normalizePeriodKey_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, 'Asia/Bangkok', 'yyyy-MM');
  }
  const text = String(value || '').trim();
  if (!text || text.toUpperCase() === 'ALL') return '';
  const match = text.match(/(20\d{2})[-\/_\s]?(\d{1,2})/);
  if (match) return match[1] + '-' + ('0' + match[2]).slice(-2);
  return text;
}

function pipelineGame_(row) {
  return normalizeGameCode_(rowValue_(row, ['game_code', 'game', 'target_game_code', 'source_game_code']));
}

function pipelinePeriod_(row) {
  return normalizePeriodKey_(rowValue_(row, ['period_key', 'period', 'target_month', 'month']));
}

function pipelineRunId_(row) {
  return String(rowValue_(row, ['run_id', 'run id', 'runid', 'cleanup_target_run_id']) || '').trim();
}

function pipelineStatus_(row) {
  return String(rowValue_(row, ['status', 'workflow_status']) || '').trim().toLowerCase();
}

function pipelineHashBefore_(row) {
  return String(rowValue_(row, ['data_hash_before', 'data hash before', 'previous_hash', 'cleanup_hash']) || '').trim();
}

function pipelineHashAfter_(row) {
  return String(rowValue_(row, ['data_hash_after', 'data hash after', 'current_hash', 'raw_data_hash']) || '').trim();
}

function pipelineTime_(row) {
  return rowValue_(row, ['run_finished_at', 'run_started_at', 'checked_at', 'finished_at', 'started_at']) || '';
}

function uniqueValues_(values) {
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
}

function validateSession_(sessionToken) {
  const token = String(sessionToken || '').trim();
  if (!token) throw new Error('Missing session_token.');

  const text = CacheService.getScriptCache().get('session:' + token);
  if (!text) throw new Error('Session not found or expired.');

  const session = JSON.parse(text);
  if (!isAllowed_(session.email)) throw new Error('Email is not allowed.');
  return session;
}

function readDashboardData_() {
  if (!CONFIG.DATA_FILE_ID) {
    throw new Error('CONFIG.DATA_FILE_ID is not set.');
  }

  const text = DriveApp.getFileById(CONFIG.DATA_FILE_ID).getBlob().getDataAsString('UTF-8').trim();
  const jsonText = normalizeDataText_(text);
  return JSON.parse(jsonText);
}

function normalizeDataText_(text) {
  if (text.startsWith('{')) return text;

  const match = text.match(/(?:const|let|var)\s+CQR_DATA\s*=\s*([\s\S]*?)\s*;?\s*$/);
  if (!match) throw new Error('Data file must be JSON or `const CQR_DATA = {...};` format.');

  return match[1];
}

function handleAiAsk_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  const question = String(e.parameter.question || '').trim();

  if (!question) {
    return json_({ ok: false, message: 'Missing question.' }, callback);
  }
  if (question.length > 500) {
    return json_({ ok: false, message: 'Question is too long. Max 500 characters.' }, callback);
  }

  const props = PropertiesService.getScriptProperties();
  const webhookUrl = props.getProperty('CQR_AI_ASK_WEBHOOK_URL');
  const sharedSecret = props.getProperty('CQR_AI_ASK_SHARED_SECRET');
  if (!webhookUrl) throw new Error('Missing Script Property: CQR_AI_ASK_WEBHOOK_URL');
  if (!sharedSecret) throw new Error('Missing Script Property: CQR_AI_ASK_SHARED_SECRET');

  const alertLogContext = buildCqrAlertLogContext_(5);

  const payload = {
    request_id: 'AIASK-' + new Date().toISOString(),
    question,
    game: String(e.parameter.game || 'ALL'),
    period: String(e.parameter.period || '2026-06'),
    channel: String(e.parameter.channel || 'ALL'),
    view: String(e.parameter.view || 'monthly'),
    ai_mode: String(e.parameter.ai_mode || 'cache_only'),
    central_db_id: '1uM85a9Fqt3j4NAM1XcEI2ORIw0Uef7Unr-JmIIbpm2g',
    user_email: session.email,
    dashboard_state: safeJsonParse_(e.parameter.dashboard_state || '{}', {}),
    alert_log_context: alertLogContext,
    alert_log_source: 'CQR_ALERT_LOG',
    alert_log_limit: 5,
    answer_style_instructions: [
      'ตอบเป็นภาษาไทยแบบเข้าใจง่าย กระชับ และใช้คำที่ทีม Marketing อ่านรู้เรื่องทันที',
      'เขียนให้เป็นธรรมชาติ เหมือน analyst อธิบายให้ทีมฟัง ไม่ต้องใช้ markdown หนัก ๆ หรือทำตัวหนาทุกบรรทัด',
      'ห้ามพูดศัพท์ระบบภายใน เช่น Flow A, Flow B, cache, webhook, n8n, backend, payload, prompt',
      'ถ้าข้อมูลยังไม่พอ ให้พูดว่า "ข้อมูลส่วนนี้ยังไม่ครบพอสำหรับสรุปชัดเจน แนะนำดูใน Dashboard เพิ่มเติม" แทนการพูดถึง flow หรือ cache',
      'ถ้าต้องแนะนำให้ดูข้อมูลเพิ่ม ให้บอกสิ่งที่ควรดู เช่น เกม, Channel, Period, D1/D3/D7/D14 โดยไม่พูดถึงวิธีทำงานหลังบ้าน',
      'จัดคำตอบเป็นย่อหน้าสั้นหรือ bullet ที่อ่านง่าย และลงท้ายด้วยสิ่งที่ควรตรวจต่อ 1-3 ข้อ'
    ].join('\n'),
    max_answer_chars: 1800
  };

  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-CQR-AI-Secret': sharedSecret
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const data = safeJsonParse_(response.getContentText() || '{}', {});

  if (status < 200 || status >= 300) {
    return json_({
      ok: false,
      message: 'AI Ask n8n webhook failed.',
      status,
      detail: data
    }, callback);
  }

  return json_({
    ok: data.ok !== false,
    answer: sanitizeAiAnswerForUsers_(data.answer || ''),
    source: data.source || 'n8n',
    used_ai_model: data.used_ai_model || '',
    intent: data.intent || '',
    summaries_used: data.summaries_used || 0,
    request_id: data.request_id || payload.request_id,
    warnings: data.warnings || []
  }, callback);
}

function safeJsonParse_(text, fallback) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
}

function sanitizeAiAnswerForUsers_(answer) {
  let text = String(answer || '').trim();
  if (!text) return '';

  const replacements = [
    {
      pattern: /ถ้าอยากเจาะลึกเกมไหนเป็นพิเศษ[^]*?Flow B[^.\n]*(?:ครับ|ค่ะ|นะครับ|นะคะ)?/gi,
      value: 'ถ้าอยากดูเจาะลึกเป็นรายเกมหรือรายสัปดาห์ แนะนำเปิด Dashboard แล้วเลือก Game / Weekly View เพิ่มเติม เพราะข้อมูลบางส่วนยังไม่ครบพอสำหรับสรุปชัดเจนในคำตอบนี้ครับ'
    },
    {
      pattern: /ต้องรัน\s*Flow\s*[A-Z][^.\n]*(?:ครับ|ค่ะ|นะครับ|นะคะ)?/gi,
      value: 'ข้อมูลส่วนนี้ยังไม่ครบพอสำหรับสรุปชัดเจน แนะนำดูใน Dashboard เพิ่มเติมครับ'
    },
    {
      pattern: /เพิ่ม\s*cache\s*ข้อมูล[^.\n]*(?:ครับ|ค่ะ|นะครับ|นะคะ)?/gi,
      value: 'รอข้อมูลส่วนนี้ Update เพิ่มเติมก่อน จึงจะสรุปได้ชัดเจนขึ้นครับ'
    }
  ];

  replacements.forEach(item => {
    text = text.replace(item.pattern, item.value);
  });

  return text
    .replace(/\bFlow\s*[A-Z]\b/gi, 'ขั้นตอนข้อมูล')
    .replace(/\bcache\b/gi, 'ข้อมูลที่บันทึกไว้')
    .replace(/\bn8n\b/gi, 'ระบบอัตโนมัติ')
    .replace(/\bbackend\b/gi, 'ระบบหลังบ้าน')
    .replace(/\bwebhook\b/gi, 'จุดเชื่อมต่อข้อมูล')
    .replace(/\bpayload\b/gi, 'ชุดข้อมูล')
    .replace(/\bprompt\b/gi, 'คำสั่งให้ AI')
    .trim();
}

function json_(payload, callback) {
  const body = JSON.stringify(payload);
  if (callback) {
    const safeCallback = String(callback).replace(/[^\w.$]/g, '');
    return ContentService
      .createTextOutput(safeCallback + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}
function setupCqrAlertLogSheet() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('CQR_AI_SUMMARY_SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Missing Script Property: CQR_AI_SUMMARY_SPREADSHEET_ID');

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('CQR_ALERT_LOG') || ss.insertSheet('CQR_ALERT_LOG');
  const headers = [
    'alert_id',
    'cache_key',
    'period_key',
    'game_code',
    'summary_type',
    'discord_message',
    'executive_summary',
    'key_findings_json',
    'risks_json',
    'recommended_actions_json',
    'generated_at',
    'sent_to_discord',
    'discord_sent_at',
    'dashboard_url',
    'run_id',
    'source_summary_ids'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#1f4e78')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setWrap(true);
  sheet.autoResizeColumns(1, headers.length);
}
function getRecentCqrAlertLogs_(limit) {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty('CQR_AI_SUMMARY_SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Missing Script Property: CQR_AI_SUMMARY_SPREADSHEET_ID');

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('CQR_ALERT_LOG');
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(String);
  const rows = values
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const item = {};
      headers.forEach((header, index) => item[header] = row[index]);
      return item;
    })
    .sort((a, b) => new Date(b.generated_at || 0) - new Date(a.generated_at || 0))
    .slice(0, limit || 5);

  return rows;
}

function buildCqrAlertLogContext_(limit) {
  const logs = getRecentCqrAlertLogs_(limit || 5);
  if (!logs.length) return 'ยังไม่มีข้อมูลใน CQR_ALERT_LOG';

  return logs.map(log => {
    const period = log.period_key || 'n/a';
    const game = log.game_code || 'ALL';
    const message = String(log.discord_message || '').slice(0, 1800);
    return [
      '---',
      'Period: ' + period,
      'Game: ' + game,
      'Discord Weekly Alert:',
      message
    ].join('\n');
  }).join('\n\n');
}
