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
      touchUserLogin_(profile, e.parameter.user_agent || '');
      const session = createSession_(profile);
      return json_({
        ok: true,
        session_token: session.session_token,
        expires_at: session.expires_at,
        user: Object.assign({}, session.user || currentAdminUser_(profile.email), {
          is_super_admin: roleForEmail_(profile.email) === 'super_admin'
        })
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

    if (action === 'session.me') {
      return handleSessionMe_(e, callback);
    }

    if (action === 'admin.users.audit') {
      return handleAdminUsersAudit_(e, callback);
    }

    if (action === 'admin.users.login_history') {
      return handleAdminUsersLoginHistory_(e, callback);
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

    if (action === 'admin.n8n.raw.check') {
      return handleAdminN8nCommand_(e, callback, 'raw.check');
    }

    if (action === 'admin.n8n.raw.status') {
      return handleAdminRawCheckStatus_(e, callback);
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

const CQR_USER_ROLES_ = ['viewer', 'analyst', 'manager', 'admin', 'super_admin', 'guest'];
const CQR_USER_STATUSES_ = ['active', 'pending', 'disabled'];
const CQR_USER_GAMES_ = ['CBM_TH', 'CBM_SEA', 'CBPC_TH', 'CBPC_SEA'];
const CQR_USER_REGIONS_ = ['TH', 'SEA'];
const CQR_USER_ACCESS_LOG_HEADERS_ = ['log_id', 'target_email', 'action', 'before_json', 'after_json', 'performed_by', 'result', 'created_at'];
const CQR_USER_LOGIN_LOG_HEADERS_ = ['login_id', 'email', 'login_at', 'result', 'role_id', 'user_agent'];

function configuredSuperAdminEmails_() {
  return CONFIG.SUPER_ADMIN_EMAILS.map(String).map(function (email) { return email.trim().toLowerCase(); }).filter(Boolean);
}

function normalizeUserCsv_(value, allowedValues, label) {
  const text = String(value || 'ALL').trim().toUpperCase();
  if (!text || text === 'ALL') return 'ALL';
  const values = Array.from(new Set(text.split(',').map(function (item) { return item.trim(); }).filter(Boolean)));
  const invalid = values.filter(function (item) { return allowedValues.indexOf(item) === -1; });
  if (invalid.length) throw new Error(label + ' contains invalid values: ' + invalid.join(', '));
  return values.join(',');
}

function normalizeAllowedGames_(value) { return normalizeUserCsv_(value, CQR_USER_GAMES_, 'allowed_games'); }
function normalizeAllowedRegions_(value) { return normalizeUserCsv_(value, CQR_USER_REGIONS_, 'allowed_regions'); }

function validateUserScopeCompatibility_(gamesCsv, regionsCsv) {
  if (gamesCsv === 'ALL' || regionsCsv === 'ALL') return;
  const regions = regionsCsv.split(',');
  const mismatch = gamesCsv.split(',').filter(function (game) {
    const region = /_TH$/.test(game) ? 'TH' : /_SEA$/.test(game) ? 'SEA' : '';
    return region && regions.indexOf(region) === -1;
  });
  if (mismatch.length) throw new Error('Allowed Games and Regions conflict: ' + mismatch.join(', '));
}

function normalizeAdminUser_(user) {
  const source = user || {};
  const email = String(source.email || '').trim().toLowerCase();
  const configuredSuper = configuredSuperAdminEmails_().indexOf(email) !== -1;
  const requestedRole = String(source.role_id || '').trim();
  const requestedStatus = String(source.status || '').trim();
  const role = configuredSuper ? 'super_admin' : CQR_USER_ROLES_.indexOf(requestedRole) !== -1 ? requestedRole : 'viewer';
  const status = configuredSuper ? 'active' : CQR_USER_STATUSES_.indexOf(requestedStatus) !== -1 ? requestedStatus : 'active';
  let games = 'ALL';
  let regions = 'ALL';
  try { games = normalizeAllowedGames_(source.allowed_games || 'ALL'); } catch (err) { games = 'ALL'; }
  try { regions = normalizeAllowedRegions_(source.allowed_regions || 'ALL'); } catch (err) { regions = 'ALL'; }
  return {
    email: email,
    display_name: String(source.display_name || '').trim(),
    role_id: role,
    status: status,
    allowed_games: games,
    allowed_regions: regions,
    last_login_at: String(source.last_login_at || ''),
    created_at: String(source.created_at || ''),
    created_by: String(source.created_by || ''),
    updated_at: String(source.updated_at || ''),
    updated_by: String(source.updated_by || '')
  };
}

function readAdminUsers_() {
  const props = PropertiesService.getScriptProperties();
  const text = props.getProperty('CQR_ADMIN_USERS_JSON');
  const source = text ? safeJsonParse_(text, []) : CONFIG.ALLOWED_EMAILS.map(function (email) {
    return { email: String(email).toLowerCase(), display_name: '', role_id: roleForSeedEmail_(email), status: 'active', allowed_games: 'ALL', allowed_regions: 'ALL', last_login_at: '' };
  });
  return (Array.isArray(source) ? source : []).map(normalizeAdminUser_).filter(function (user) { return Boolean(user.email); });
}

function writeAdminUsers_(users) {
  const normalized = (users || []).map(normalizeAdminUser_).filter(function (user) { return Boolean(user.email); });
  PropertiesService.getScriptProperties().setProperty('CQR_ADMIN_USERS_JSON', JSON.stringify(normalized));
}

function withUserStoreLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return callback(); } finally { lock.releaseLock(); }
}

function roleForSeedEmail_(email) {
  return configuredSuperAdminEmails_().indexOf(String(email || '').trim().toLowerCase()) !== -1 ? 'super_admin' : 'viewer';
}

function roleForEmail_(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (configuredSuperAdminEmails_().indexOf(normalized) !== -1) return 'super_admin';
  const user = readAdminUsers_().find(function (item) { return item.email === normalized; });
  return user ? String(user.role_id || 'viewer') : 'viewer';
}

function currentAdminUser_(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const user = readAdminUsers_().find(function (item) { return item.email === normalized; });
  if (user) return normalizeAdminUser_(user);
  if (configuredSuperAdminEmails_().indexOf(normalized) !== -1) return normalizeAdminUser_({ email: normalized, role_id: 'super_admin', status: 'active', allowed_games: 'ALL', allowed_regions: 'ALL' });
  return null;
}

function userForClient_(user) { return normalizeAdminUser_(user || {}); }

function createSession_(profile) {
  const token = Utilities.getUuid() + '-' + Utilities.getUuid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIG.SESSION_TTL_SECONDS * 1000);
  const user = currentAdminUser_(profile.email) || normalizeAdminUser_({ email: profile.email, display_name: profile.name || profile.email, role_id: roleForEmail_(profile.email), status: 'active', allowed_games: 'ALL', allowed_regions: 'ALL' });
  CacheService.getScriptCache().put('session:' + token, JSON.stringify({ email: user.email, name: user.display_name || profile.name || user.email, role_id: user.role_id, status: user.status, allowed_games: user.allowed_games, allowed_regions: user.allowed_regions, created_at: now.toISOString(), expires_at: expiresAt.toISOString() }), CONFIG.SESSION_TTL_SECONDS);
  return { session_token: token, expires_at: expiresAt.toISOString(), user: userForClient_(user) };
}

function requireSuperAdmin_(session) {
  if (roleForEmail_(session.email) !== 'super_admin') throw new Error('Only super_admin can manage users.');
}

function activeSuperAdminCount_(users) {
  return (users || []).filter(function (user) { return user.role_id === 'super_admin' && user.status === 'active'; }).length;
}

function ensureCentralLogSheet_(sheetName, headers) {
  const ss = SpreadsheetApp.openById(CONFIG.CENTRAL_DB_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendCentralLogRow_(sheetName, headers, row) {
  ensureCentralLogSheet_(sheetName, headers).appendRow(headers.map(function (header) { return row[header] == null ? '' : row[header]; }));
}

function appendUserAccessLog_(targetEmail, action, beforeValue, afterValue, performedBy, result) {
  appendCentralLogRow_('UserAccessLogs', CQR_USER_ACCESS_LOG_HEADERS_, { log_id: 'UAL-' + Utilities.getUuid(), target_email: String(targetEmail || '').toLowerCase(), action: action, before_json: beforeValue ? JSON.stringify(beforeValue) : '', after_json: afterValue ? JSON.stringify(afterValue) : '', performed_by: String(performedBy || '').toLowerCase(), result: result || 'completed', created_at: new Date().toISOString() });
}

function appendUserLoginLog_(email, roleId, result, userAgent) {
  appendCentralLogRow_('UserLoginLogs', CQR_USER_LOGIN_LOG_HEADERS_, { login_id: 'ULL-' + Utilities.getUuid(), email: String(email || '').toLowerCase(), login_at: new Date().toISOString(), result: result || 'success', role_id: roleId || 'viewer', user_agent: String(userAgent || '').slice(0, 500) });
}

function touchUserLogin_(profile, userAgent) {
  const email = String(profile.email || '').trim().toLowerCase();
  if (!email) return;
  const loginAt = new Date().toISOString();
  let savedUser = null;
  withUserStoreLock_(function () {
    const users = readAdminUsers_();
    const index = users.findIndex(function (user) { return user.email === email; });
    if (index >= 0) {
      users[index] = normalizeAdminUser_(Object.assign({}, users[index], { display_name: users[index].display_name || profile.name || '', last_login_at: loginAt }));
      savedUser = users[index];
    } else {
      savedUser = normalizeAdminUser_({ email: email, display_name: profile.name || '', role_id: roleForSeedEmail_(email), status: 'active', allowed_games: 'ALL', allowed_regions: 'ALL', last_login_at: loginAt, created_at: loginAt, created_by: 'login', updated_at: loginAt, updated_by: 'login' });
      users.push(savedUser);
    }
    writeAdminUsers_(users);
  });
  try { appendUserLoginLog_(email, savedUser ? savedUser.role_id : roleForEmail_(email), 'success', userAgent); }
  catch (auditError) { console.warn('UserLoginLogs append failed: ' + (auditError.message || auditError)); }
}

function handleSessionMe_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  const user = currentAdminUser_(session.email);
  if (!user) throw new Error('User not found.');
  return json_({ ok: true, user: userForClient_(user) }, callback);
}

function handleAdminUsersList_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);
  const users = readAdminUsers_().sort(function (a, b) { return String(a.email).localeCompare(String(b.email)); });
  return json_({ ok: true, users: users.map(userForClient_), current_user_email: String(session.email || '').toLowerCase(), configured_super_admins: configuredSuperAdminEmails_() }, callback);
}

function handleAdminUsersUpsert_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);
  const email = String(e.parameter.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Valid email is required.');
  const displayName = String(e.parameter.display_name || '').trim();
  if (!displayName) throw new Error('Display name is required.');
  let roleId = String(e.parameter.role_id || 'viewer').trim();
  let status = String(e.parameter.status || 'active').trim();
  if (CQR_USER_ROLES_.indexOf(roleId) === -1) throw new Error('Invalid role_id: ' + roleId);
  if (CQR_USER_STATUSES_.indexOf(status) === -1) throw new Error('Invalid status: ' + status);
  const allowedGames = normalizeAllowedGames_(e.parameter.allowed_games || 'ALL');
  const allowedRegions = normalizeAllowedRegions_(e.parameter.allowed_regions || 'ALL');
  validateUserScopeCompatibility_(allowedGames, allowedRegions);
  if (configuredSuperAdminEmails_().indexOf(email) !== -1) { roleId = 'super_admin'; status = 'active'; }
  const now = new Date().toISOString();
  let beforeUser = null;
  let savedUser = null;
  withUserStoreLock_(function () {
    const users = readAdminUsers_();
    const index = users.findIndex(function (user) { return user.email === email; });
    beforeUser = index >= 0 ? normalizeAdminUser_(users[index]) : null;
    savedUser = normalizeAdminUser_({ email: email, display_name: displayName, role_id: roleId, status: status, allowed_games: allowedGames, allowed_regions: allowedRegions, last_login_at: beforeUser ? beforeUser.last_login_at : '', created_at: beforeUser && beforeUser.created_at ? beforeUser.created_at : now, created_by: beforeUser && beforeUser.created_by ? beforeUser.created_by : session.email, updated_at: now, updated_by: session.email });
    const removesActiveSuper = beforeUser && beforeUser.role_id === 'super_admin' && beforeUser.status === 'active' && !(savedUser.role_id === 'super_admin' && savedUser.status === 'active');
    if (removesActiveSuper && activeSuperAdminCount_(users) <= 1) throw new Error('Cannot remove or disable the last active super_admin.');
    if (index >= 0) users[index] = savedUser; else users.push(savedUser);
    writeAdminUsers_(users);
  });
  let auditWarning = '';
  try { appendUserAccessLog_(email, beforeUser ? 'update' : 'create', beforeUser, savedUser, session.email, 'completed'); }
  catch (auditError) { auditWarning = auditError.message || String(auditError); }
  return json_({ ok: true, user: userForClient_(savedUser), audit_warning: auditWarning, session_refresh_required: email !== String(session.email || '').toLowerCase() }, callback);
}

function handleAdminUsersDelete_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);
  const email = String(e.parameter.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Valid email is required.');
  if (email === String(session.email || '').toLowerCase()) throw new Error('Cannot delete the current signed-in account.');
  if (configuredSuperAdminEmails_().indexOf(email) !== -1) throw new Error('Cannot delete a configured super_admin account.');
  let deletedUser = null;
  withUserStoreLock_(function () {
    const users = readAdminUsers_();
    const index = users.findIndex(function (user) { return user.email === email; });
    if (index < 0) throw new Error('User not found.');
    deletedUser = normalizeAdminUser_(users[index]);
    if (deletedUser.role_id === 'super_admin' && deletedUser.status === 'active' && activeSuperAdminCount_(users) <= 1) throw new Error('Cannot delete the last active super_admin.');
    users.splice(index, 1);
    writeAdminUsers_(users);
  });
  let auditWarning = '';
  try { appendUserAccessLog_(email, 'delete', deletedUser, null, session.email, 'completed'); }
  catch (auditError) { auditWarning = auditError.message || String(auditError); }
  return json_({ ok: true, deleted_email: email, audit_warning: auditWarning }, callback);
}

function recentUserLogs_(sheetName, email, limit, timeField) {
  const targetEmail = String(email || '').trim().toLowerCase();
  const maxRows = Math.max(1, Math.min(Number(limit || 50), 200));
  return readCentralSheetRows_(sheetName).filter(function (row) {
    const rowEmail = String(row.target_email || row.email || '').trim().toLowerCase();
    return !targetEmail || rowEmail === targetEmail;
  }).sort(function (a, b) { return String(b[timeField] || '').localeCompare(String(a[timeField] || '')); }).slice(0, maxRows);
}

function handleAdminUsersAudit_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);
  return json_({ ok: true, logs: recentUserLogs_('UserAccessLogs', e.parameter.email, e.parameter.limit, 'created_at') }, callback);
}

function handleAdminUsersLoginHistory_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);
  return json_({ ok: true, logs: recentUserLogs_('UserLoginLogs', e.parameter.email, e.parameter.limit, 'login_at') }, callback);
}

function handleAdminPipelineHealth_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);

  const game = String(e.parameter.game || 'ALL').trim();
  const month = String(e.parameter.month || 'ALL').trim();
  const n8nHealth = tryAdminPipelineHealthViaN8n_(session, game, month);
  if (n8nHealth && adminHealthResponseHasScope_(n8nHealth, game, month)) return json_(n8nHealth, callback);

  const pipelineRows = readCentralSheetRows_('PipelineLogs');
  const dataIndexRows = readCentralSheetRows_('DataIndex');
  const rawRows = readCentralSheetRows_('RawIngestionLogs');
  const targetRows = filterPipelineRows_(pipelineRows, game, month);
  const targetRawRows = filterPipelineRows_(rawRows, game, month);
  const readyRows = targetRows.filter(row => pipelineStatus_(row) === 'ready');
  const reviewRows = targetRows.filter(row => pipelineStatus_(row) === 'needs_review');
  const expectedGames = ['CBM_TH', 'CBM_SEA', 'CBPC_TH', 'CBPC_SEA'];
  const rawReadyRows = targetRawRows.filter(row => pipelineStatus_(row) === 'raw_ready');
  const scopeRows = buildAdminHealthScopeRows_(pipelineRows, rawRows, dataIndexRows, game, month);

  const issues = [];
  const recommendations = [];
  scopeRows
    .filter(row => row.action_status === 'repair')
    .forEach(row => {
      const oldRunId = row.ready_run_id || '';
      issues.push({
        level: 'warn',
        badge: 'Hash mismatch',
        game_code: row.game_code,
        period_key: row.period_key,
        title: row.game_code + ' ยังใช้ข้อมูลเก่าอยู่',
        detail: 'เดือน ' + row.period_key + ' ไฟล์ Raw มีรอบใหม่แล้ว แต่ Master/Central DB ยังตามไม่ทัน'
      });
      recommendations.push({
        title: 'ซ่อมข้อมูล ' + row.game_code + ' รอบ ' + row.period_key,
        detail: oldRunId
          ? 'ส่งไป Data Control เพื่อ Preview ก่อน ถ้าจำนวนแถวถูกต้องค่อย Clear และ Build ใหม่'
          : 'ส่งไป Data Control เพื่อหา Run ID จาก hash เก่าก่อน แล้วค่อย Preview, Clear และ Build',
        cleanup: {
          target_game_code: row.game_code,
          target_month: row.period_key,
          run_id: oldRunId,
          search_hash: row.master_hash || row.previous_hash || '',
          previous_hash: row.master_hash || row.previous_hash || '',
          current_hash: row.raw_hash || ''
        }
      });
    });

  scopeRows
    .filter(row => row.action_status === 'build_required')
    .forEach(row => {
      issues.push({
        level: 'warn',
        badge: 'Build required',
        game_code: row.game_code,
        period_key: row.period_key,
        title: row.game_code + ' ยังไม่ได้ Build Master',
        detail: 'เดือน ' + row.period_key + ' ผ่าน Raw Check แล้ว แต่ยังไม่มี Master/Central พร้อมใช้'
      });
      recommendations.push({
        title: 'Build Master ' + row.game_code + ' รอบ ' + row.period_key,
        detail: 'ใช้ First Build จาก Raw Hash ล่าสุด โดยไม่ต้อง Preview หรือ Clear',
        build: {
          mode: 'first_build',
          target_game_code: row.game_code,
          target_month: row.period_key,
          raw_hash: row.raw_hash || '',
          raw_check_id: row.raw_check_id || '',
          raw_status: row.raw_status || '',
          action_status: row.action_status || ''
        }
      });
    });

  reviewRows.forEach(row => {
    const gameCode = pipelineGame_(row);
    const periodKey = pipelinePeriod_(row);
    if (issues.some(issue => issue.badge === 'Hash mismatch' && issue.game_code === gameCode && issue.period_key === periodKey)) return;
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
    (!normalizePeriodKey_(month) || pipelinePeriod_(row) === normalizePeriodKey_(month))
  );
  if (!targetRows.length && !scopeRows.some(row => row.action_status === 'build_required')) {
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
  const missingRawGames = normalizePeriodKey_(month) ? (targetRawRows.length ? gamesToCheck.filter(gameCode => gameCode && !rawReadyGameSet.has(gameCode)) : gamesToCheck) : [];
  const missingReadyGames = normalizePeriodKey_(month) && targetRows.length ? gamesToCheck.filter(gameCode => gameCode && !readyGameSet.has(gameCode)) : [];
  const missingIndexGames = normalizePeriodKey_(month) && dataIndexTargetRows.length ? gamesToCheck.filter(gameCode => gameCode && !dataIndexGameSet.has(gameCode)) : [];

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
        target_month: normalizePeriodKey_(month) || month,
        run_id: '',
        search_hash: ''
      }
    });
  });

  missingReadyGames.forEach(gameCode => {
    if (scopeRows.some(row => row.game_code === gameCode && row.action_status === 'build_required')) return;
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
      build_required: scopeRows.filter(row => row.action_status === 'build_required').length,
      needs_review: reviewRows.length,
      cleanup_needed: scopeRows.filter(row => row.action_status === 'repair').length,
      pipeline_logs: targetRows.length,
      data_index_rows: dataIndexTargetRows.length,
      scope_rows: scopeRows.length
    },
    source: 'apps_script_central_db',
    auto_pipeline_note: 'Auto Pipeline วันอาทิตย์: Raw Check 15:00, Master Build 16:00, Controller 17:00. Manual tools ใช้ซ่อมเฉพาะเคส',
    scope_rows: scopeRows,
    issues,
    recommendations
  }, callback);
}

function adminHealthResponseHasScope_(data, game, month) {
  const rows = data.scope_rows || data.overview_rows || [];
  if (!Array.isArray(rows) || !rows.length) return false;
  const wantedMonth = normalizePeriodKey_(month);
  if (wantedMonth) {
    const expectedCount = adminScopeGames_(game).length;
    return rows.filter(function (row) {
      return normalizePeriodKey_(row.period_key || row.month) === wantedMonth;
    }).length >= expectedCount;
  }
  return rows.some(function (row) {
    return adminScopeGames_(game).indexOf(normalizeGameCode_(row.game_code || row.game)) >= 0;
  });
}

function adminScopeGames_(game) {
  const expectedGames = ['CBM_TH', 'CBM_SEA', 'CBPC_TH', 'CBPC_SEA'];
  const wantedGame = normalizeGameCode_(game);
  return wantedGame === 'ALL' ? expectedGames : [wantedGame].filter(Boolean);
}

function adminScopeMonths_(month, rowGroups) {
  const wantedMonth = normalizePeriodKey_(month);
  if (wantedMonth) return [wantedMonth];
  const knownMonths = [];
  (rowGroups || []).forEach(function (rows) {
    (rows || []).forEach(function (row) {
      const period = pipelinePeriod_(row);
      if (period) knownMonths.push(period);
    });
  });
  const uniqueMonths = uniqueValues_(knownMonths).filter(Boolean).sort();
  if (!uniqueMonths.length) {
    const currentMonth = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM');
    return monthRange_('2026-02', currentMonth);
  }
  return monthRange_('2026-02', uniqueMonths[uniqueMonths.length - 1]);
}

function monthRange_(startMonth, endMonth) {
  const start = normalizePeriodKey_(startMonth);
  const end = normalizePeriodKey_(endMonth);
  if (!start || !end) return [];
  const months = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const endMonthNum = Number(end.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonthNum)) {
    months.push(year + '-' + ('0' + month).slice(-2));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function latestPipelineRow_(rows) {
  return rows
    .filter(Boolean)
    .sort(function (a, b) {
      return String(pipelineTime_(b) || rowValue_(b, ['last_updated_at', 'updated_at']) || '').localeCompare(String(pipelineTime_(a) || rowValue_(a, ['last_updated_at', 'updated_at']) || ''));
    })[0] || null;
}

function dataIndexHash_(row) {
  return String(rowValue_(row || {}, ['data_hash', 'data hash']) || '').trim();
}

function buildAdminHealthScopeRows_(pipelineRows, rawRows, dataIndexRows, game, month) {
  const games = adminScopeGames_(game);
  const months = adminScopeMonths_(month, [pipelineRows, rawRows, dataIndexRows]);
  const rows = [];
  games.forEach(function (gameCode) {
    months.forEach(function (periodKey) {
      const rawForSlot = rawRows.filter(function (row) {
        return pipelineGame_(row) === gameCode && pipelinePeriod_(row) === periodKey;
      });
      const pipeForSlot = pipelineRows.filter(function (row) {
        return pipelineGame_(row) === gameCode && pipelinePeriod_(row) === periodKey;
      });
      const indexForSlot = dataIndexRows.filter(function (row) {
        return pipelineGame_(row) === gameCode && pipelinePeriod_(row) === periodKey;
      });
      const latestRaw = latestPipelineRow_(rawForSlot);
      const latestReady = latestPipelineRow_(pipeForSlot.filter(function (row) { return pipelineStatus_(row) === 'ready'; }));
      const latestReview = latestPipelineRow_(pipeForSlot.filter(function (row) { return pipelineStatus_(row) === 'needs_review'; }));
      const latestIndex = latestPipelineRow_(indexForSlot);
      const rawStatus = pipelineStatus_(latestRaw || {});
      const rawHash = pipelineHashAfter_(latestRaw || {});
      const readyHash = pipelineHashAfter_(latestReady || {}) || pipelineHashBefore_(latestReady || {});
      const reviewNewHash = pipelineHashAfter_(latestReview || {});
      const reviewOldHash = pipelineHashBefore_(latestReview || {});
      const indexHash = dataIndexHash_(latestIndex);
      const masterHash = indexHash || readyHash;
      const readyMatchesRaw = rawHash && (readyHash === rawHash || indexHash === rawHash);
      const reviewMatchesRaw = rawHash && reviewNewHash === rawHash;

      let rawLabel = 'ยังไม่มี Raw Check';
      let rawLevel = 'warn';
      let masterLabel = latestReady || latestIndex ? 'มีข้อมูลเดิม' : 'ยังไม่ยืนยัน';
      let masterLevel = latestReady || latestIndex ? 'warn' : 'warn';
      let actionLabel = 'รัน Raw Check รอบนี้ก่อน';
      let actionLevel = 'warn';
      let actionStatus = 'raw_missing';

      if (rawStatus === 'raw_ready') {
        rawLabel = 'มีรอบล่าสุดแล้ว';
        rawLevel = 'ok';
        if (readyMatchesRaw) {
          masterLabel = 'พร้อมใช้';
          masterLevel = 'ok';
          actionLabel = 'ไม่ต้องทำอะไร';
          actionLevel = 'ok';
          actionStatus = 'ready';
        } else if (reviewMatchesRaw || masterHash) {
          masterLabel = 'ยังเป็นข้อมูลเก่า';
          masterLevel = 'danger';
          actionLabel = 'ไป Data Control';
          actionLevel = 'danger';
          actionStatus = 'repair';
        } else {
          masterLabel = 'ยังไม่ได้ Build';
          masterLevel = 'warn';
          actionLabel = 'Build รอบนี้';
          actionLevel = 'warn';
          actionStatus = 'build_required';
        }
      } else if (rawStatus) {
        rawLabel = rawStatus === 'raw_partial' ? 'Raw ยังไม่ครบ' : 'Raw ยังไม่พร้อม';
        rawLevel = 'danger';
        masterLabel = latestReady || latestIndex ? 'มีข้อมูลเดิม' : 'ยังไม่ยืนยัน';
        actionLabel = 'ตรวจไฟล์ Raw ก่อน';
        actionStatus = 'raw_not_ready';
      }

      rows.push({
        game_code: gameCode,
        period_key: periodKey,
        raw: rawLabel,
        raw_level: rawLevel,
        master: masterLabel,
        master_level: masterLevel,
        action: actionLabel,
        action_level: actionLevel,
        action_status: actionStatus,
        raw_status: rawStatus || '',
        raw_hash: rawHash || '',
        master_hash: masterHash || '',
        previous_hash: reviewOldHash || readyHash || masterHash || '',
        raw_check_id: pipelineRunId_(latestRaw || {}) || rowValue_(latestRaw || {}, ['raw_check_id']) || '',
        ready_run_id: pipelineRunId_(latestReady || {}),
        review_run_id: pipelineRunId_(latestReview || {}),
        latest_run_id: pipelineRunId_(latestReview || {}) || pipelineRunId_(latestReady || {}),
        raw_checked_at: pipelineTime_(latestRaw || {}),
        master_updated_at: pipelineTime_(latestReady || {}) || rowValue_(latestIndex || {}, ['last_updated_at', 'updated_at']) || '',
        raw_rows: rowValue_(latestRaw || {}, ['registered_rows']) || '',
        master_rows: rowValue_(latestReady || {}, ['rows_written', 'rows written']) || ''
      });
    });
  });
  return rows;
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
    .slice(0, 160);

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
  const targetGamesCsv = String(e.parameter.target_games_csv || game || 'ALL').trim();
  const targetMonthsCsv = String(e.parameter.target_months_csv || month || 'AUTO').trim();
  const expectedTabsCsv = String(e.parameter.expected_tabs_csv || 'Registered,DAU,Returners,Late_Starters,Login').trim();
  const requestedBuildMode = String(e.parameter.build_mode || '').trim().toLowerCase();
  const requestedRawHash = String(e.parameter.raw_data_hash || e.parameter.raw_hash || '').trim();
  const requestedRawCheckId = String(e.parameter.raw_check_id || '').trim();
  const previewReceipt = String(e.parameter.preview_receipt || '').trim();
  let effectiveBuildMode = requestedBuildMode;
  let firstBuildGuard = null;
  if (command === 'raw.check' && (game.toUpperCase() === 'ALL' || month.toUpperCase() === 'ALL')) {
    throw new Error('Manual Raw Check ต้องเลือก Game และ Month อย่างละ 1 ค่า ห้ามใช้ ALL; ALL จะใช้ Background Raw Check.');
  }
  if (!month) throw new Error('Month is required.');
  if ((command === 'cleanup.preview' || command === 'cleanup.run') && !runId && !runIds.length && !cleanupHash) {
    throw new Error('Run ID or hash is required for cleanup.');
  }
  if ((command === 'cleanup.preview' || command === 'cleanup.run') && game === 'ALL' && !runIds.length && !cleanupHash) {
    throw new Error('Cleanup requires one selected game, not ALL.');
  }

  if (command === 'master.run') {
    const normalizedGame = normalizeGameCode_(game);
    const normalizedMonth = normalizePeriodKey_(month);
    if (!normalizedGame || normalizedGame === 'ALL') {
      throw new Error('Master Build requires one selected game, not ALL.');
    }
    if (!normalizedMonth) {
      throw new Error('Master Build requires a valid month.');
    }

    effectiveBuildMode = effectiveBuildMode || ((runId || previewReceipt) ? 'repair' : 'first_build');

    if (effectiveBuildMode === 'first_build') {
      firstBuildGuard = validateFirstBuildScope_(
        normalizedGame,
        normalizedMonth,
        requestedRawHash,
        requestedRawCheckId
      );
    } else if (effectiveBuildMode === 'repair') {
      if (!runId) throw new Error('Repair Build requires run_id.');
      if (!previewReceipt) throw new Error('Repair Build requires preview_receipt.');
    } else {
      throw new Error('Unsupported build_mode: ' + effectiveBuildMode);
    }
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
    build_mode: command === 'master.run' ? effectiveBuildMode : '',
    raw_data_hash: command === 'master.run'
      ? (firstBuildGuard ? firstBuildGuard.raw_hash : requestedRawHash)
      : '',
    raw_hash: command === 'master.run'
      ? (firstBuildGuard ? firstBuildGuard.raw_hash : requestedRawHash)
      : '',
    raw_check_id: command === 'master.run'
      ? (firstBuildGuard ? firstBuildGuard.raw_check_id : requestedRawCheckId)
      : '',
    preview_receipt: previewReceipt,
    idempotency_key: command === 'master.run' && effectiveBuildMode === 'first_build'
      ? [
          'FIRST-BUILD',
          normalizeGameCode_(game),
          normalizePeriodKey_(month),
          firstBuildGuard ? firstBuildGuard.raw_hash : requestedRawHash
        ].join('|')
      : '',
    confirm_delete: command === 'cleanup.run' ? 'YES' : 'NO',
    run_mode: command === 'master.run' ? 'force' : command === 'raw.check' ? 'manual_check' : '',
    check_mode: command === 'raw.check' ? String(e.parameter.check_mode || 'manual') : '',
    target_games_csv: targetGamesCsv,
    target_months_csv: targetMonthsCsv,
    expected_tabs_csv: expectedTabsCsv,
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
    build_mode: command === 'master.run' ? effectiveBuildMode : '',
    raw_data_hash: command === 'master.run' ? payload.raw_data_hash : '',
    raw_check_id: command === 'master.run' ? payload.raw_check_id : '',
    idempotency_key: command === 'master.run' ? payload.idempotency_key : '',
    status: 'sent',
    n8n_result: data,
    request_id: payload.request_id
  }, callback);
}

/**
 * Validates that a scope is safe for First Build.
 *
 * A First Build is allowed only when:
 * - one concrete Game and Month are selected;
 * - the latest RawIngestionLogs row is raw_ready;
 * - the client Raw Hash still matches the latest Raw Hash;
 * - no ready Master run, needs_review run, or non-empty DataIndex hash exists.
 *
 * This guard deliberately reads Central DB directly instead of trusting
 * frontend state or an n8n health response.
 */
function validateFirstBuildScope_(game, month, requestedRawHash, requestedRawCheckId) {
  const wantedGame = normalizeGameCode_(game);
  const wantedMonth = normalizePeriodKey_(month);

  if (!wantedGame || wantedGame === 'ALL') {
    throw new Error('First Build requires one selected game.');
  }
  if (!wantedMonth) {
    throw new Error('First Build requires a valid month.');
  }

  const rawRows = readCentralSheetRows_('RawIngestionLogs').filter(function (row) {
    return pipelineGame_(row) === wantedGame && pipelinePeriod_(row) === wantedMonth;
  });
  const latestRaw = latestPipelineRow_(rawRows);
  const rawStatus = pipelineStatus_(latestRaw || {});
  const rawHash = pipelineHashAfter_(latestRaw || {});
  const rawCheckId = pipelineRunId_(latestRaw || {})
    || String(rowValue_(latestRaw || {}, ['raw_check_id', 'request_id']) || '').trim();

  if (!latestRaw || rawStatus !== 'raw_ready') {
    throw new Error('Raw is not ready. Run Check Raw first.');
  }
  if (!rawHash) {
    throw new Error('Latest Raw Hash is missing. Run Check Raw again.');
  }
  if (!requestedRawHash) {
    throw new Error('First Build requires raw_data_hash from the latest Pipeline Check.');
  }
  if (requestedRawHash !== rawHash) {
    throw new Error('Raw Hash changed after Pipeline Check. Refresh Data Health before Build.');
  }
  if (requestedRawCheckId && rawCheckId && requestedRawCheckId !== rawCheckId) {
    throw new Error('Raw Check ID changed after Pipeline Check. Refresh Data Health before Build.');
  }

  const pipelineRows = readCentralSheetRows_('PipelineLogs').filter(function (row) {
    return pipelineGame_(row) === wantedGame && pipelinePeriod_(row) === wantedMonth;
  });
  const dataIndexRows = readCentralSheetRows_('DataIndex').filter(function (row) {
    return pipelineGame_(row) === wantedGame && pipelinePeriod_(row) === wantedMonth;
  });

  const latestReady = latestPipelineRow_(pipelineRows.filter(function (row) {
    return pipelineStatus_(row) === 'ready';
  }));
  const latestReview = latestPipelineRow_(pipelineRows.filter(function (row) {
    return pipelineStatus_(row) === 'needs_review';
  }));
  const latestIndex = latestPipelineRow_(dataIndexRows);
  const indexHash = dataIndexHash_(latestIndex || {});

  if (latestReady || indexHash) {
    throw new Error('Existing Master data found. Use Repair Flow.');
  }
  if (latestReview) {
    throw new Error('Existing needs_review run found. Use Preview/Clear Repair Flow.');
  }

  return {
    game_code: wantedGame,
    period_key: wantedMonth,
    raw_status: rawStatus,
    raw_hash: rawHash,
    raw_check_id: rawCheckId
  };
}

function n8nWebhookUrlForCommand_(props, command) {
  const map = {
    'raw.check': 'CQR_N8N_RAW_CHECK_WEBHOOK_URL',
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

/**
 * Returns Raw Check queue status to the Admin Dashboard.
 *
 * Required query parameters:
 * - session_token
 * - request_id
 *
 * Optional query parameter:
 * - include_jobs=true
 *
 * Normal polling should omit include_jobs so Apps Script reads only one
 * RawCheckRequests row. Job details are loaded only when explicitly requested.
 */
function handleAdminRawCheckStatus_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);

  const requestId = String(e.parameter.request_id || '').trim();
  const includeJobs = /^(1|true|yes)$/i.test(String(e.parameter.include_jobs || '').trim());
  const result = getRawCheckRequestStatus_(requestId, includeJobs);

  return json_(result, callback);
}

/**
 * Reads one RawCheckRequests row efficiently.
 *
 * Performance notes:
 * - Opens the Central DB once per API request.
 * - Uses TextFinder on the request_id column instead of reading the whole tab.
 * - Caches normalized headers for five minutes.
 * - Skips RawCheckJobs during normal polling.
 */
function getRawCheckRequestStatus_(requestId, includeJobs) {
  const normalizedRequestId = String(requestId || '').trim();

  if (!normalizedRequestId) {
    throw new Error('Missing request_id.');
  }

  const spreadsheet = SpreadsheetApp.openById(CONFIG.CENTRAL_DB_ID);
  const requestSheet = spreadsheet.getSheetByName('RawCheckRequests');

  if (!requestSheet) {
    throw new Error('Missing Central DB sheet: RawCheckRequests');
  }

  const requestHeaders = getSheetHeaderInfo_(requestSheet);
  const request = findSheetRowByValue_(
    requestSheet,
    requestHeaders,
    'request_id',
    normalizedRequestId
  );

  if (!request) {
    return {
      ok: false,
      found: false,
      request_id: normalizedRequestId,
      status: 'not_found',
      message: 'Raw Check request not found.',
      jobs_included: false,
      jobs: [],
      poll_after_ms: 5000,
      server_time: new Date().toISOString()
    };
  }

  const result = {
    ok: true,
    found: true,

    request_id: normalizedRequestId,
    batch_id: stringValue_(request.batch_id),
    target_games_csv: stringValue_(request.target_games_csv),
    target_months_csv: stringValue_(request.target_months_csv),

    total_jobs: numberValue_(request.total_jobs),
    queued_jobs: numberValue_(request.queued_jobs),
    running_jobs: numberValue_(request.running_jobs),
    completed_jobs: numberValue_(request.completed_jobs),
    failed_jobs: numberValue_(request.failed_jobs),

    raw_ready_count: numberValue_(request.raw_ready_count),
    raw_updated_count: numberValue_(request.raw_updated_count),
    raw_partial_count: numberValue_(request.raw_partial_count),
    raw_missing_count: numberValue_(request.raw_missing_count),

    status: stringValue_(request.status),
    current_job_id: stringValue_(request.current_job_id),
    current_game_code: stringValue_(request.current_game_code),
    current_period_key: stringValue_(request.current_period_key),

    requested_by: stringValue_(request.requested_by),
    check_mode: stringValue_(request.check_mode),
    source: stringValue_(request.source),

    created_at: stringValue_(request.created_at),
    updated_at: stringValue_(request.updated_at),
    finished_at: stringValue_(request.finished_at),
    error_message: stringValue_(request.error_message),

    jobs_included: false,
    jobs: [],
    poll_after_ms: 5000,
    server_time: new Date().toISOString()
  };

  if (includeJobs) {
    result.jobs = readRawCheckJobsForRequest_(spreadsheet, normalizedRequestId);
    result.jobs_included = true;
  }

  return result;
}

/**
 * Reads RawCheckJobs only when include_jobs=true.
 */
function readRawCheckJobsForRequest_(spreadsheet, requestId) {
  const jobsSheet = spreadsheet.getSheetByName('RawCheckJobs');

  if (!jobsSheet || jobsSheet.getLastRow() < 2) {
    return [];
  }

  const headerInfo = getSheetHeaderInfo_(jobsSheet);
  const requestIdIndex = headerInfo.index_by_name.request_id;

  if (requestIdIndex === undefined) {
    throw new Error('Missing request_id column in RawCheckJobs.');
  }

  const rowCount = jobsSheet.getLastRow() - 1;
  const columnCount = headerInfo.headers.length;
  const values = jobsSheet.getRange(2, 1, rowCount, columnCount).getValues();

  return values
    .map(function (row, index) {
      return sheetRowToObject_(headerInfo.headers, row, index + 2);
    })
    .filter(function (row) {
      return String(row.request_id || '').trim() === requestId;
    })
    .map(function (row) {
      return {
        job_id: stringValue_(row.job_id),
        request_id: stringValue_(row.request_id),
        batch_id: stringValue_(row.batch_id),

        game_code: stringValue_(row.game_code),
        period_key: stringValue_(row.period_key),
        raw_file_id: stringValue_(row.raw_file_id),
        raw_file_name: stringValue_(row.raw_file_name),

        status: stringValue_(row.status),
        result_status: stringValue_(row.result_status),
        tab_count_found: numberValue_(row.tab_count_found),
        tab_count_expected: numberValue_(row.tab_count_expected),
        missing_tabs: stringValue_(row.missing_tabs),

        raw_previous_hash: stringValue_(row.raw_previous_hash),
        raw_data_hash: stringValue_(row.raw_data_hash),

        registered_rows: numberValue_(row.registered_rows),
        dau_rows: numberValue_(row.dau_rows),
        returners_rows: numberValue_(row.returners_rows),
        late_starters_rows: numberValue_(row.late_starters_rows),
        login_rows: numberValue_(row.login_rows),

        attempt_count: numberValue_(row.attempt_count),
        created_at: stringValue_(row.created_at),
        started_at: stringValue_(row.started_at),
        updated_at: stringValue_(row.updated_at),
        finished_at: stringValue_(row.finished_at),
        error_message: stringValue_(row.error_message)
      };
    })
    .sort(function (a, b) {
      return String(a.job_id).localeCompare(String(b.job_id));
    });
}

/**
 * Returns normalized sheet headers and their zero-based indexes.
 * The value is cached for five minutes to reduce repeated header reads.
 */
function getSheetHeaderInfo_(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    throw new Error('Sheet has no columns: ' + sheet.getName());
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = [
    'cqr-sheet-headers',
    CONFIG.CENTRAL_DB_ID,
    sheet.getSheetId(),
    lastColumn
  ].join(':');

  const cached = cache.get(cacheKey);

  if (cached) {
    const parsed = safeJsonParse_(cached, null);

    if (parsed && Array.isArray(parsed.headers) && parsed.index_by_name) {
      return parsed;
    }
  }

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(normalizeHeader_);

  const indexByName = {};

  headers.forEach(function (header, index) {
    if (header) indexByName[header] = index;
  });

  const result = {
    headers: headers,
    index_by_name: indexByName
  };

  cache.put(cacheKey, JSON.stringify(result), 300);
  return result;
}

/**
 * Finds an exact cell in one key column, then reads only that matching row.
 */
function findSheetRowByValue_(sheet, headerInfo, headerName, wantedValue) {
  const normalizedHeader = normalizeHeader_(headerName);
  const columnIndex = headerInfo.index_by_name[normalizedHeader];

  if (columnIndex === undefined) {
    throw new Error(
      'Missing column "' + normalizedHeader + '" in sheet "' + sheet.getName() + '".'
    );
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const match = sheet
    .getRange(2, columnIndex + 1, lastRow - 1, 1)
    .createTextFinder(String(wantedValue))
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();

  if (!match) return null;

  const rowNumber = match.getRow();
  const values = sheet
    .getRange(rowNumber, 1, 1, headerInfo.headers.length)
    .getValues()[0];

  return sheetRowToObject_(headerInfo.headers, values, rowNumber);
}

function sheetRowToObject_(headers, row, rowNumber) {
  const result = { row_number: rowNumber };

  headers.forEach(function (header, index) {
    if (!header) return;
    const value = row[index];
    result[header] = value instanceof Date ? value.toISOString() : value;
  });

  return result;
}

function stringValue_(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function numberValue_(value) {
  const number = Number(value);
  return isFinite(number) ? number : 0;
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
  const cache = CacheService.getScriptCache();
  const text = cache.get('session:' + token);
  if (!text) throw new Error('Session not found or expired.');
  const session = JSON.parse(text);
  const liveUser = currentAdminUser_(session.email);
  if (!liveUser || liveUser.status !== 'active' || !isAllowed_(session.email)) {
    cache.remove('session:' + token);
    throw new Error('User is disabled, pending, deleted, or not allowed.');
  }
  const expiresAt = new Date(session.expires_at || 0).getTime();
  const remainingSeconds = Math.floor((expiresAt - Date.now()) / 1000);
  if (remainingSeconds <= 0) {
    cache.remove('session:' + token);
    throw new Error('Session not found or expired.');
  }
  const refreshed = Object.assign({}, session, { name: liveUser.display_name || session.name || liveUser.email, role_id: liveUser.role_id, status: liveUser.status, allowed_games: liveUser.allowed_games, allowed_regions: liveUser.allowed_regions });
  cache.put('session:' + token, JSON.stringify(refreshed), Math.min(remainingSeconds, CONFIG.SESSION_TTL_SECONDS));
  return refreshed;
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
function authorizeCqrAllServices() {
  const result = {};

  const tokenCheck = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=test',
    { muteHttpExceptions: true }
  );
  result.url_fetch_status = tokenCheck.getResponseCode();

  result.data_file = DriveApp
    .getFileById(CONFIG.DATA_FILE_ID)
    .getName();

  result.central_db = SpreadsheetApp
    .openById(CONFIG.CENTRAL_DB_ID)
    .getName();

  console.log(JSON.stringify(result, null, 2));
  return result;
}