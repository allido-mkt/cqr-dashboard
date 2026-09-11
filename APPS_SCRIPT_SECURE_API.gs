/**
 * FINAL MERGE PROVENANCE
 * Authoritative base: APPS_SCRIPT_SECURE_API_V2_1_DIRECT_MASTER_USER_ACCESS_CENTRAL.gs
 * Authoritative base SHA256: 5e924eafd1dcc257ff66dd8a3dcc39f0fd6e3ca51f28ef7e4ba0873f4551e176
 * Preserved: Direct Master, Central UserAccess, Admin/Data Health, Raw Status, First Build Guard.
 * AI patch only: normalized n8n response, failed/empty-answer guard, resolved context metadata.
 * Release: CQR_DIRECT_MASTER_AI_FINAL_2026_08_04
 */

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
 * - Apps Script checks Central DB > UserAccess on login and every authorized request.
 * - Dashboard data is returned only after verification.
 */

const CONFIG = {
  CLIENT_ID: '496972749333-ddnqu2jefebjcuhj8koar6d66v510qou.apps.googleusercontent.com',
  // Bootstrap only. Runtime authorization reads Central DB > UserAccess.
  // Keep only the owner during controlled setup; add users through User & Access.
  ALLOWED_EMAILS: [
    'bwm.workco@gmail.com'
  ],
  SUPER_ADMIN_EMAILS: [
    'bwm.workco@gmail.com'
  ],
  CENTRAL_DB_ID: '1uM85a9Fqt3j4NAM1XcEI2ORIw0Uef7Unr-JmIIbpm2g',
  SESSION_TTL_SECONDS: 14400
};

const CQR_API_RELEASE = 'CQR_DAILY_RETENTION_LOGIN_PERF_2026_08_26';

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || '').toLowerCase();
    const callback = e && e.parameter ? e.parameter.callback : '';

    if (action === 'health') {
      return json_({
        ok: true,
        release: CQR_API_RELEASE,
        dashboard_read_mode: 'direct_master_aggregation',
        ai_response_contract: 'normalized_json_object_v2',
        source: 'apps_script',
        checked_at: new Date().toISOString()
      }, callback);
    }

    if (action === 'login') {
      return handleLogin_(e, callback);
    }

    if (action === 'dashboard.data') {
      const session = validateSession_(e.parameter.session_token);
      const data = readDashboardData_();
      return json_({ ok: true, email: session.email, data }, callback);
    }

    if (action === 'dashboard.daily') {
      const session = validateSession_(e.parameter.session_token);
      const data = readDashboardDailyData_(e.parameter || {});
      return json_({ ok: true, email: session.email, data }, callback);
    }

    // CQR_DAILY_RETENTION_API_V1_ROUTE_START
    if (action.indexOf('retention.daily.') === 0) {
      return handleDailyRetentionApiV1_(e, callback);
    }
    // CQR_DAILY_RETENTION_API_V1_ROUTE_END

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
      return json_({
        ok: true,
        allowed: true,
        email: profile.email,
        name: profile.name || ''
      }, callback);
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
    const callback = e && e.parameter ? e.parameter.callback : '';
    return json_({
      ok: false,
      message,
      required_property: propertyMatch ? propertyMatch[1] : ''
    }, callback);
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

const USER_ACCESS_SHEET = 'UserAccess';
const USER_ACCESS_LOG_SHEET = 'UserAccessLogs';
const USER_LOGIN_LOG_SHEET = 'UserLoginLogs';
const USER_ACCESS_HEADERS = [
  'email', 'display_name', 'role_id', 'status', 'allowed_games',
  'allowed_regions', 'last_login_at', 'created_at', 'updated_at', 'updated_by'
];
const USER_ACCESS_LOG_HEADERS = [
  'log_id', 'target_email', 'action', 'before_json', 'after_json',
  'performed_by', 'result', 'created_at'
];
const USER_LOGIN_LOG_HEADERS = [
  'login_id', 'email', 'login_at', 'result', 'role_id', 'user_agent', 'message'
];
const USER_ACCESS_ROLES = ['viewer', 'analyst', 'manager', 'admin', 'super_admin', 'guest'];
const USER_ACCESS_STATUSES = ['active', 'pending', 'disabled'];
const CQR_USER_GAMES_ = ['CBM_TH', 'CBM_SEA', 'CBPC_TH', 'CBPC_SEA'];
const CQR_USER_REGIONS_ = ['TH', 'SEA'];
const CQR_USER_ACCESS_CACHE_TTL_SECONDS_ = 300;
const CQR_USER_ACCESS_CACHE_VERSION_PROPERTY_ = 'CQR_USER_ACCESS_CACHE_VERSION';
let CQR_USER_ACCESS_CACHE_VERSION_MEMO_ = null;

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeUserStatus_(status) {
  const value = String(status || 'active').trim().toLowerCase();
  if (value === 'inactive' || value === 'suspended' || value === 'deleted') return 'disabled';
  if (USER_ACCESS_STATUSES.indexOf(value) < 0) throw new Error('Invalid user status.');
  return value;
}

function normalizeUserRole_(roleId) {
  const value = String(roleId || 'viewer').trim().toLowerCase();
  if (USER_ACCESS_ROLES.indexOf(value) < 0) throw new Error('Invalid role_id.');
  return value;
}

let CQR_CENTRAL_DB_MEMO_ = null;

function centralDb_() {
  if (!CQR_CENTRAL_DB_MEMO_) {
    CQR_CENTRAL_DB_MEMO_ = SpreadsheetApp.openById(CONFIG.CENTRAL_DB_ID);
  }
  return CQR_CENTRAL_DB_MEMO_;
}

function centralRuntimeSheet_(sheetName, requiredHeaders) {
  return centralDb_().getSheetByName(sheetName) || ensureCentralSheetHeaders_(sheetName, requiredHeaders);
}

function ensureCentralSheetHeaders_(sheetName, requiredHeaders) {
  const ss = centralDb_();
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  const lastColumn = Math.max(sheet.getLastColumn(), requiredHeaders.length, 1);
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(value => String(value || '').trim());
  const normalized = current.map(normalizeHeader_);
  let nextColumn = Math.max(sheet.getLastColumn(), 0) + 1;

  requiredHeaders.forEach(header => {
    const key = normalizeHeader_(header);
    if (normalized.indexOf(key) >= 0) return;
    sheet.getRange(1, nextColumn).setValue(header);
    normalized.push(key);
    nextColumn += 1;
  });

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function userAccessInfrastructure_() {
  const accessSheet = ensureCentralSheetHeaders_(USER_ACCESS_SHEET, USER_ACCESS_HEADERS);
  ensureCentralSheetHeaders_(USER_ACCESS_LOG_SHEET, USER_ACCESS_LOG_HEADERS);
  ensureCentralSheetHeaders_(USER_LOGIN_LOG_SHEET, USER_LOGIN_LOG_HEADERS);

  if (accessSheet.getLastRow() < 2) {
    const now = new Date().toISOString();
    const seeds = CONFIG.ALLOWED_EMAILS.map(email => ({
      email: normalizeEmail_(email),
      display_name: '',
      role_id: roleForSeedEmail_(email),
      status: 'active',
      allowed_games: 'ALL',
      allowed_regions: 'ALL',
      last_login_at: '',
      created_at: now,
      updated_at: now,
      updated_by: 'bootstrap'
    }));
    seeds.forEach(seed => appendObjectToCentralSheet_(USER_ACCESS_SHEET, USER_ACCESS_HEADERS, seed));
  }
  return accessSheet;
}

function sheetHeaderMap_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn) return {};
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const map = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader_(header);
    if (key) map[key] = index + 1;
  });
  return map;
}

function appendObjectToCentralSheet_(sheetName, requiredHeaders, object) {
  const sheet = ensureCentralSheetHeaders_(sheetName, requiredHeaders);
  const headerMap = sheetHeaderMap_(sheet);
  const lastColumn = sheet.getLastColumn();
  const row = new Array(lastColumn).fill('');
  Object.keys(object || {}).forEach(key => {
    const column = headerMap[normalizeHeader_(key)];
    if (column) row[column - 1] = object[key];
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function appendObjectToExistingSheet_(sheet, object) {
  const headerMap = sheetHeaderMap_(sheet);
  const lastColumn = sheet.getLastColumn();
  const row = new Array(lastColumn).fill('');
  Object.keys(object || {}).forEach(key => {
    const column = headerMap[normalizeHeader_(key)];
    if (column) row[column - 1] = object[key];
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function writeObjectToCentralRow_(sheetName, requiredHeaders, rowNumber, object) {
  const sheet = ensureCentralSheetHeaders_(sheetName, requiredHeaders);
  const headerMap = sheetHeaderMap_(sheet);
  Object.keys(object || {}).forEach(key => {
    const column = headerMap[normalizeHeader_(key)];
    if (column) sheet.getRange(rowNumber, column).setValue(object[key]);
  });
}

function updateExistingCentralRow_(sheet, rowNumber, object) {
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn) return;
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(normalizeHeader_);
  const row = sheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0];
  Object.keys(object || {}).forEach(key => {
    const columnIndex = headers.indexOf(normalizeHeader_(key));
    if (columnIndex >= 0) row[columnIndex] = object[key];
  });
  sheet.getRange(rowNumber, 1, 1, lastColumn).setValues([row]);
}

function cleanUserAccessObject_(row) {
  return {
    email: normalizeEmail_(row.email),
    display_name: String(row.display_name || ''),
    role_id: String(row.role_id || 'viewer').toLowerCase(),
    status: String(row.status || 'disabled').toLowerCase(),
    allowed_games: String(row.allowed_games || 'ALL'),
    allowed_regions: String(row.allowed_regions || 'ALL'),
    last_login_at: String(row.last_login_at || ''),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    updated_by: String(row.updated_by || '')
  };
}

function readAdminUsers_() {
  userAccessInfrastructure_();
  return readCentralSheetRows_(USER_ACCESS_SHEET)
    .filter(row => normalizeEmail_(row.email))
    .map(cleanUserAccessObject_);
}

function findUserAccessRow_(email) {
  const normalized = normalizeEmail_(email);
  if (!normalized) return null;
  const sheet = centralDb_().getSheetByName(USER_ACCESS_SHEET);
  if (!sheet) return null;
  const row = rowsFromSheet_(sheet)
    .find(item => normalizeEmail_(item.email) === normalized);
  return row ? Object.assign({ row_number: row.row_number }, cleanUserAccessObject_(row)) : null;
}

function isActiveUserAccess_(user) {
  return !!user && String(user.status || '').toLowerCase() === 'active';
}

function userAccessCacheVersion_() {
  if (CQR_USER_ACCESS_CACHE_VERSION_MEMO_) return CQR_USER_ACCESS_CACHE_VERSION_MEMO_;
  const props = PropertiesService.getScriptProperties();
  let version = props.getProperty(CQR_USER_ACCESS_CACHE_VERSION_PROPERTY_);
  if (!version) {
    version = String(Date.now());
    props.setProperty(CQR_USER_ACCESS_CACHE_VERSION_PROPERTY_, version);
  }
  CQR_USER_ACCESS_CACHE_VERSION_MEMO_ = version;
  return version;
}

function userAccessCacheKey_(email) {
  return ['user_access', userAccessCacheVersion_(), normalizeEmail_(email)].join(':');
}

function cachedUserAccess_(email) {
  const normalized = normalizeEmail_(email);
  if (!normalized) return null;
  return safeJsonParse_(CacheService.getScriptCache().get(userAccessCacheKey_(normalized)) || '', null);
}

function primeUserAccessCache_(user) {
  if (!user || !normalizeEmail_(user.email)) return;
  CacheService.getScriptCache().put(
    userAccessCacheKey_(user.email),
    JSON.stringify(cleanUserAccessObject_(user)),
    CQR_USER_ACCESS_CACHE_TTL_SECONDS_
  );
}

function bumpUserAccessCacheVersion_() {
  const version = String(Date.now()) + '-' + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty(CQR_USER_ACCESS_CACHE_VERSION_PROPERTY_, version);
  CQR_USER_ACCESS_CACHE_VERSION_MEMO_ = version;
  return version;
}

function requireAllowedProfile_(idToken) {
  const profile = verifyIdToken_(idToken);
  const user = findUserAccessRow_(profile.email);
  if (!isActiveUserAccess_(user)) throw new Error('Email is not allowed or is disabled.');
  return profile;
}

function isAllowed_(email) {
  return isActiveUserAccess_(findUserAccessRow_(email));
}

function authorizeOnce() {
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=test',{muteHttpExceptions:true});
  SpreadsheetApp.openById(CONFIG.CENTRAL_DB_ID).getName();
  userAccessInfrastructure_();
  const registry=directRegistry_(); CQR_DIRECT_GAMES.forEach(game=>SpreadsheetApp.openById(registry[game]).getName());
}

function setupUserAccessCentralDb_() {
  userAccessInfrastructure_();
  return {
    ok: true,
    source: 'central_db_user_access',
    central_db_id: CONFIG.CENTRAL_DB_ID,
    users: readAdminUsers_().length,
    sheets: [USER_ACCESS_SHEET, USER_ACCESS_LOG_SHEET, USER_LOGIN_LOG_SHEET]
  };
}

function installUserAccessAuditTriggers_() {
  const handlerNames = ['handleUserAccessSheetEdit_', 'handleUserAccessSheetChange_'];
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (handlerNames.indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('handleUserAccessSheetEdit_')
    .forSpreadsheet(CONFIG.CENTRAL_DB_ID)
    .onEdit()
    .create();
  ScriptApp.newTrigger('handleUserAccessSheetChange_')
    .forSpreadsheet(CONFIG.CENTRAL_DB_ID)
    .onChange()
    .create();
  return { ok: true, installed_handlers: handlerNames };
}

function manualEditorEmail_() {
  try {
    return normalizeEmail_(Session.getActiveUser().getEmail()) || 'unknown_manual_editor';
  } catch (error) {
    return 'unknown_manual_editor';
  }
}

function handleUserAccessSheetEdit_(event) {
  try {
    if (!event || !event.range) return;
    const sheet = event.range.getSheet();
    if (!sheet || sheet.getName() !== USER_ACCESS_SHEET || event.range.getRow() < 2) return;
    const values = event.range.getValues();
    const targetEmail = normalizeEmail_(sheet.getRange(event.range.getRow(), 1).getValue());
    appendUserAccessLog_(targetEmail, 'MANUAL_EDIT', {
      range: event.range.getA1Notation(),
      old_value: Object.prototype.hasOwnProperty.call(event, 'oldValue') ? event.oldValue : ''
    }, {
      range: event.range.getA1Notation(),
      values: values
    }, manualEditorEmail_(), 'success');
    bumpUserAccessCacheVersion_();
  } catch (error) {
    try {
      appendUserAccessLog_('', 'MANUAL_EDIT_FAILED', null, null, manualEditorEmail_(), safeLogMessage_(error.message || error));
    } catch (logError) {}
  }
}

function handleUserAccessSheetChange_(event) {
  try {
    if (!event || !event.source) return;
    const activeSheet = event.source.getActiveSheet();
    if (!activeSheet || activeSheet.getName() !== USER_ACCESS_SHEET) return;
    const changeType = String(event.changeType || 'OTHER').toUpperCase();
    if (['INSERT_ROW', 'REMOVE_ROW', 'INSERT_COLUMN', 'REMOVE_COLUMN', 'OTHER'].indexOf(changeType) < 0) return;
    appendUserAccessLog_('', 'MANUAL_STRUCTURE_CHANGE', null, {
      change_type: changeType,
      sheet: USER_ACCESS_SHEET
    }, manualEditorEmail_(), 'success');
    bumpUserAccessCacheVersion_();
  } catch (error) {
    try {
      appendUserAccessLog_('', 'MANUAL_STRUCTURE_CHANGE_FAILED', null, null, manualEditorEmail_(), safeLogMessage_(error.message || error));
    } catch (logError) {}
  }
}

function migrateLegacyAdminUsersToCentralDb_() {
  const props = PropertiesService.getScriptProperties();
  const legacyText = props.getProperty('CQR_ADMIN_USERS_JSON');
  if (!legacyText) return { ok: true, migrated: 0, message: 'No legacy property found.' };

  const legacyUsers = safeJsonParse_(legacyText, []);
  if (!Array.isArray(legacyUsers)) throw new Error('CQR_ADMIN_USERS_JSON is invalid.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    let migrated = 0;
    legacyUsers.forEach(item => {
      const email = normalizeEmail_(item.email);
      if (!email || findUserAccessRow_(email)) return;
      const now = new Date().toISOString();
      const user = {
        email,
        display_name: String(item.display_name || ''),
        role_id: normalizeUserRole_(item.role_id || roleForSeedEmail_(email)),
        status: normalizeUserStatus_(item.status || 'active'),
        allowed_games: String(item.allowed_games || 'ALL'),
        allowed_regions: String(item.allowed_regions || 'ALL'),
        last_login_at: String(item.last_login_at || ''),
        created_at: now,
        updated_at: now,
        updated_by: 'legacy_migration'
      };
      appendObjectToCentralSheet_(USER_ACCESS_SHEET, USER_ACCESS_HEADERS, user);
      appendUserAccessLog_(email, 'MIGRATE', null, user, 'legacy_migration', 'success');
      migrated += 1;
    });
    return { ok: true, migrated, message: 'Review Central DB before deleting the legacy property.' };
  } finally {
    lock.releaseLock();
  }
}

function removeLegacyAdminUsersProperty_() {
  PropertiesService.getScriptProperties().deleteProperty('CQR_ADMIN_USERS_JSON');
  return { ok: true, deleted_property: 'CQR_ADMIN_USERS_JSON' };
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

function createSession_(profile, userAccess) {
  const user = userAccess || findUserAccessRow_(profile.email);
  if (!isActiveUserAccess_(user)) throw new Error('Email is not allowed or is disabled.');
  primeUserAccessCache_(user);
  const token = Utilities.getUuid() + '-' + Utilities.getUuid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIG.SESSION_TTL_SECONDS * 1000);
  CacheService.getScriptCache().put('session:' + token, JSON.stringify({
    email: profile.email,
    name: profile.name || profile.email,
    role_id: user.role_id,
    allowed_games: user.allowed_games,
    allowed_regions: user.allowed_regions,
    status: user.status,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString()
  }), CONFIG.SESSION_TTL_SECONDS);
  return {
    session_token: token,
    expires_at: expiresAt.toISOString()
  };
}

function roleForEmail_(email) {
  const user = findUserAccessRow_(email);
  return user ? String(user.role_id || 'viewer') : 'viewer';
}

function requireSuperAdmin_(session) {
  if (String(session && session.role_id || '').toLowerCase() !== 'super_admin') {
    throw new Error('Only super_admin can manage users.');
  }
}

function safeLogMessage_(message) {
  return String(message || '').replace(/id_token=[^&\s]+/gi, 'id_token=[REDACTED]').slice(0, 500);
}

function appendUserAccessLog_(targetEmail, action, beforeValue, afterValue, performedBy, result) {
  appendObjectToCentralSheet_(USER_ACCESS_LOG_SHEET, USER_ACCESS_LOG_HEADERS, {
    log_id: 'UAL-' + Utilities.getUuid(),
    target_email: normalizeEmail_(targetEmail),
    action: String(action || '').toUpperCase(),
    before_json: beforeValue ? JSON.stringify(beforeValue) : '',
    after_json: afterValue ? JSON.stringify(afterValue) : '',
    performed_by: normalizeEmail_(performedBy) || String(performedBy || 'system'),
    result: String(result || 'success'),
    created_at: new Date().toISOString()
  });
}

function appendUserLoginLog_(email, result, roleId, userAgent, message) {
  appendObjectToCentralSheet_(USER_LOGIN_LOG_SHEET, USER_LOGIN_LOG_HEADERS, {
    login_id: 'ULL-' + Utilities.getUuid(),
    email: normalizeEmail_(email),
    login_at: new Date().toISOString(),
    result: String(result || 'unknown'),
    role_id: String(roleId || ''),
    user_agent: String(userAgent || '').slice(0, 500),
    message: safeLogMessage_(message)
  });
}

function touchUserLogin_(profile, userAgent, existingUser, accessSheet, loginSheet) {
  const email = normalizeEmail_(profile.email);
  if (!email) throw new Error('Missing profile email.');
  const user = existingUser || findUserAccessRow_(email);
  if (!isActiveUserAccess_(user)) throw new Error('Email is not allowed or is disabled.');
  const loginAt = new Date().toISOString();
  const updated = Object.assign({}, user, {
    display_name: user.display_name || profile.name || '',
    last_login_at: loginAt,
    updated_at: loginAt,
    updated_by: email
  });
  delete updated.row_number;

  if (accessSheet) {
    updateExistingCentralRow_(accessSheet, user.row_number, updated);
  } else {
    writeObjectToCentralRow_(USER_ACCESS_SHEET, USER_ACCESS_HEADERS, user.row_number, updated);
  }

  if (loginSheet) {
    appendObjectToExistingSheet_(loginSheet, {
      login_id: 'ULL-' + Utilities.getUuid(),
      email,
      login_at: loginAt,
      result: 'success',
      role_id: updated.role_id,
      user_agent: String(userAgent || '').slice(0, 500),
      message: safeLogMessage_('Login successful.')
    });
  } else {
    appendUserLoginLog_(email, 'success', updated.role_id, userAgent, 'Login successful.');
  }
  return updated;
}

function handleLogin_(e, callback) {
  const userAgent = String(e.parameter.user_agent || '');
  let email = '';
  let roleId = '';
  let successLogged = false;
  let loginSheet = null;
  try {
    const profile = verifyIdToken_(e.parameter.id_token);
    email = normalizeEmail_(profile.email);
    const centralDb = centralDb_();
    const accessSheet = centralDb.getSheetByName(USER_ACCESS_SHEET);
    loginSheet = centralDb.getSheetByName(USER_LOGIN_LOG_SHEET);
    const userRow = accessSheet ? rowsFromSheet_(accessSheet)
      .find(item => normalizeEmail_(item.email) === email) : null;
    const user = userRow ? Object.assign({ row_number: userRow.row_number }, cleanUserAccessObject_(userRow)) : null;
    roleId = user ? user.role_id : '';
    if (!isActiveUserAccess_(user)) throw new Error('Email is not allowed or is disabled.');
    const updatedUser = touchUserLogin_(profile, userAgent, user, accessSheet, loginSheet);
    successLogged = true;
    const session = createSession_(profile, updatedUser);
    return json_({
      ok: true,
      session_token: session.session_token,
      expires_at: session.expires_at,
      user: {
        email: profile.email,
        display_name: updatedUser.display_name || profile.name || profile.email,
        role_id: updatedUser.role_id,
        allowed_games: updatedUser.allowed_games,
        allowed_regions: updatedUser.allowed_regions,
        is_super_admin: updatedUser.role_id === 'super_admin'
      }
    }, callback);
  } catch (error) {
    if (!successLogged) {
      try {
        if (loginSheet) {
          appendObjectToExistingSheet_(loginSheet, {
            login_id: 'ULL-' + Utilities.getUuid(),
            email: normalizeEmail_(email),
            login_at: new Date().toISOString(),
            result: 'denied',
            role_id: String(roleId || ''),
            user_agent: userAgent.slice(0, 500),
            message: safeLogMessage_(error.message || String(error))
          });
        } else {
          appendUserLoginLog_(email, 'denied', roleId, userAgent, error.message || String(error));
        }
      } catch (logError) {}
    }
    throw error;
  }
}

function roleForSeedEmail_(email) {
  const normalized = normalizeEmail_(email);
  return CONFIG.SUPER_ADMIN_EMAILS.map(normalizeEmail_).includes(normalized)
    ? 'super_admin'
    : 'viewer';
}

function handleAdminUsersList_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);
  const users = readAdminUsers_().sort(function (a, b) {
    return String(a.email).localeCompare(String(b.email));
  });

  return json_({
    ok: true,
    source: 'central_db_user_access',
    users,
    current_user_email: normalizeEmail_(session.email),
    configured_super_admins: CONFIG.SUPER_ADMIN_EMAILS.map(normalizeEmail_)
  }, callback);
}

function handleAdminUsersUpsert_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);

  const email = normalizeEmail_(e.parameter.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Valid email is required.');
  }

  const displayName = String(e.parameter.display_name || '').trim();
  if (!displayName) throw new Error('Display name is required.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const before = findUserAccessRow_(email);
    const now = new Date().toISOString();
    const isConfiguredSuperAdmin =
      CONFIG.SUPER_ADMIN_EMAILS.map(normalizeEmail_).includes(email);

    const roleId = isConfiguredSuperAdmin
      ? 'super_admin'
      : normalizeUserRole_(
          e.parameter.role_id || (before && before.role_id) || 'viewer'
        );

    const status = isConfiguredSuperAdmin
      ? 'active'
      : normalizeUserStatus_(
          e.parameter.status || (before && before.status) || 'active'
        );

    const allowedGames = normalizeAllowedGames_(
      e.parameter.allowed_games || (before && before.allowed_games) || 'ALL'
    );
    const allowedRegions = normalizeAllowedRegions_(
      e.parameter.allowed_regions || (before && before.allowed_regions) || 'ALL'
    );
    validateUserScopeCompatibility_(allowedGames, allowedRegions);

    const nextUser = {
      email,
      display_name: displayName,
      role_id: roleId,
      status,
      allowed_games: allowedGames,
      allowed_regions: allowedRegions,
      last_login_at: before ? before.last_login_at : '',
      created_at: before && before.created_at ? before.created_at : now,
      updated_at: now,
      updated_by: session.email
    };

    if (before) {
      writeObjectToCentralRow_(
        USER_ACCESS_SHEET,
        USER_ACCESS_HEADERS,
        before.row_number,
        nextUser
      );
    } else {
      appendObjectToCentralSheet_(
        USER_ACCESS_SHEET,
        USER_ACCESS_HEADERS,
        nextUser
      );
    }

    appendUserAccessLog_(
      email,
      before ? 'UPDATE' : 'CREATE',
      before ? cleanUserAccessObject_(before) : null,
      nextUser,
      session.email,
      'success'
    );
    bumpUserAccessCacheVersion_();
    primeUserAccessCache_(nextUser);

    const users = readAdminUsers_().sort(function (a, b) {
      return String(a.email).localeCompare(String(b.email));
    });

    return json_({
      ok: true,
      source: 'central_db_user_access',
      user: nextUser,
      users,
      audit_warning: '',
      session_refresh_required:
        email !== normalizeEmail_(session.email)
    }, callback);
  } catch (error) {
    try {
      appendUserAccessLog_(
        email,
        'UPSERT_FAILED',
        null,
        null,
        session.email,
        safeLogMessage_(error.message || error)
      );
    } catch (logError) {}
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function handleAdminUsersDelete_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);

  const email = normalizeEmail_(e.parameter.email);
  if (!email || !email.includes('@')) throw new Error('Valid email is required.');
  if (email === normalizeEmail_(session.email)) throw new Error('Cannot delete the current signed-in account.');
  if (CONFIG.SUPER_ADMIN_EMAILS.map(normalizeEmail_).includes(email)) throw new Error('Cannot delete a configured super_admin account.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const before = findUserAccessRow_(email);
    if (!before) throw new Error('User not found.');
    const sheet = ensureCentralSheetHeaders_(USER_ACCESS_SHEET, USER_ACCESS_HEADERS);
    sheet.deleteRow(before.row_number);
    appendUserAccessLog_(email, 'DELETE', cleanUserAccessObject_(before), null, session.email, 'success');
    bumpUserAccessCacheVersion_();
    const users = readAdminUsers_().sort((a, b) => String(a.email).localeCompare(String(b.email)));
    return json_({ ok: true, source: 'central_db_user_access', deleted_email: email, users }, callback);
  } catch (error) {
    try { appendUserAccessLog_(email, 'DELETE_FAILED', null, null, session.email, safeLogMessage_(error.message || error)); } catch (logError) {}
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function directMasterScopeCheck_(registry, game, month) {
  const fileId=registry[game]; if(!fileId)return {ready:false,missing:['MasterFiles registry']};
  const checks={CohortSummary:directSheetRows_(fileId,'CohortSummary').some(r=>String(r.period_key)===month&&String(r.view)==='monthly'),ChannelMonthly:directSheetRows_(fileId,'ChannelMonthly').some(r=>String(r.period_key)===month),DAUDaily:directSheetRows_(fileId,'DAUDaily').some(r=>String(r.period_key)===month),PlayerTypeMonthly:directSheetRows_(fileId,'PlayerTypeMonthly').some(r=>String(r.period_key)===month),TotalRetentionMonthly:directSheetRows_(fileId,'TotalRetentionMonthly').some(r=>String(r.period_key)===month)};
  return {ready:Object.keys(checks).every(k=>checks[k]),missing:Object.keys(checks).filter(k=>!checks[k]),checks:checks};
}

function handleAdminPipelineHealth_(e, callback) {
  const session=validateSession_(e.parameter.session_token);requireSuperAdmin_(session);
  const wantedGame=normalizeGameCode_(e.parameter.game||'ALL'),wantedMonth=normalizePeriodKey_(e.parameter.month||'');
  const registry=directRegistry_(),pipeline=readCentralSheetRows_('PipelineLogs'),raw=readCentralSheetRows_('RawIngestionLogs'),index=readCentralSheetRows_('DataIndex');
  const games=wantedGame==='ALL'?CQR_DIRECT_GAMES:[wantedGame];const months=wantedMonth?[wantedMonth]:Array.from(new Set(index.map(pipelinePeriod_).filter(Boolean))).sort();const rows=[];const issues=[];const recommendations=[];
  games.forEach(game=>months.forEach(month=>{
    const rawRows=raw.filter(r=>pipelineGame_(r)===game&&pipelinePeriod_(r)===month),pipeRows=pipeline.filter(r=>pipelineGame_(r)===game&&pipelinePeriod_(r)===month),idxRows=index.filter(r=>pipelineGame_(r)===game&&pipelinePeriod_(r)===month);
    const latestRaw=rawRows.sort((a,b)=>String(pipelineTime_(b)).localeCompare(String(pipelineTime_(a))))[0]||{},ready=pipeRows.filter(r=>pipelineStatus_(r)==='ready').sort((a,b)=>String(pipelineTime_(b)).localeCompare(String(pipelineTime_(a))))[0]||{};
    const rawHash=String(rowValue_(latestRaw,['data_hash_after','raw_data_hash','current_hash'])||''),masterHash=String(rowValue_(idxRows[0]||{},['data_hash','data_hash_after'])||rowValue_(ready,['data_hash_after'])||''),direct=directMasterScopeCheck_(registry,game,month),rawStatus=pipelineStatus_(latestRaw),hashMatch=!!rawHash&&!!masterHash&&rawHash===masterHash;
    let action='ready',actionLabel='No action required',level='ok',masterLabel='พร้อมใช้';
    if(rawStatus!=='raw_ready'){action='raw_not_ready';actionLabel='Check Raw';level='danger';masterLabel=direct.ready?'มีข้อมูลเดิม':'ยังไม่พร้อม';}
    else if(!direct.ready){action='repair';actionLabel='Repair Direct Master';level='danger';masterLabel='Direct read ไม่ครบ';issues.push({level:'danger',badge:'Direct Master',game_code:game,period_key:month,title:'Dashboard อ่าน Master ไม่ครบ',detail:'Missing: '+direct.missing.join(', ')});recommendations.push({title:'ซ่อม Master '+game+' '+month,detail:'ตรวจ summary tabs แล้ว Build scope ใหม่',cleanup:{target_game_code:game,target_month:month}});}
    else if(!hashMatch){action='repair';actionLabel='Repair hash/index';level='danger';masterLabel='Hash ไม่ตรง';issues.push({level:'warn',badge:'Hash',game_code:game,period_key:month,title:'Raw/Master hash ไม่ตรง',detail:'Raw '+rawHash+' / Master '+masterHash});}
    rows.push({game_code:game,period_key:month,raw:rawStatus==='raw_ready'?'มีรอบล่าสุดแล้ว':(rawStatus||'ยังไม่มี Raw Check'),raw_level:rawStatus==='raw_ready'?'ok':'danger',master:masterLabel,master_level:level,action:actionLabel,action_level:level,action_status:action,raw_status:rawStatus,raw_hash:rawHash,master_hash:masterHash,dashboard_direct_read:direct.ready?'ready':'missing',dashboard_read_level:direct.ready?'ok':'danger',dashboard_missing_tabs:direct.missing.join(', '),ready_run_id:pipelineRunId_(ready),latest_run_id:pipelineRunId_(ready),raw_checked_at:pipelineTime_(latestRaw),master_updated_at:pipelineTime_(ready)});
  }));
  const readyCount=rows.filter(r=>r.action_status==='ready').length,rawReady=rows.filter(r=>r.raw_status==='raw_ready').length;
  return json_({ok:true,source:'apps_script_direct_master_verified',dashboard_read_mode:'direct_master_aggregation',scope_rows:rows,summary:{health_score:readyCount===rows.length?'Ready':'Needs Review',raw_ready:rawReady,ready:readyCount,build_required:rows.filter(r=>r.action_status==='build_required').length,needs_review:rows.filter(r=>r.action_status==='repair').length,cleanup_needed:rows.filter(r=>r.action_status==='repair').length,dashboard_direct_ready:rows.filter(r=>r.dashboard_direct_read==='ready').length,total_scopes:rows.length},issues:issues,recommendations:recommendations,checked_at:new Date().toISOString()},callback);
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

function buildAdminHealthScopeRows_(pipelineRows, rawRows, dataIndexRows, game, month, dashboardData) {
  const games = adminScopeGames_(game);
  const months = adminScopeMonths_(month, [pipelineRows, rawRows, dataIndexRows]);
  const statusMap = dashboardData && dashboardData.data_status ? dashboardData.data_status : {};
  const rows = [];
  games.forEach(function (gameCode) {
    months.forEach(function (periodKey) {
      const rawForSlot = rawRows.filter(row => pipelineGame_(row) === gameCode && pipelinePeriod_(row) === periodKey);
      const pipeForSlot = pipelineRows.filter(row => pipelineGame_(row) === gameCode && pipelinePeriod_(row) === periodKey);
      const indexForSlot = dataIndexRows.filter(row => pipelineGame_(row) === gameCode && pipelinePeriod_(row) === periodKey && String(rowValue_(row, ['target_sheet']) || '') === 'ChannelMonthly');
      const latestRaw = latestPipelineRow_(rawForSlot);
      const latestReady = latestPipelineRow_(pipeForSlot.filter(row => pipelineStatus_(row) === 'ready'));
      const latestReview = latestPipelineRow_(pipeForSlot.filter(row => pipelineStatus_(row) === 'needs_review'));
      const latestIndex = latestPipelineRow_(indexForSlot);
      const rawStatus = pipelineStatus_(latestRaw || {});
      const rawHash = pipelineHashAfter_(latestRaw || {}) || String(rowValue_(latestRaw || {}, ['raw_data_hash']) || '');
      const readyHash = pipelineHashAfter_(latestReady || {}) || pipelineHashBefore_(latestReady || {});
      const reviewNewHash = pipelineHashAfter_(latestReview || {});
      const reviewOldHash = pipelineHashBefore_(latestReview || {});
      const indexHash = dataIndexHash_(latestIndex);
      const masterHash = indexHash || readyHash;
      const readyMatchesRaw = Boolean(rawHash && masterHash && rawHash === masterHash);
      const reviewMatchesRaw = Boolean(rawHash && reviewNewHash === rawHash);
      const direct_master = statusMap[gameCode + '|' + periodKey] || {};
      const direct_masterHash = String(direct_master.data_hash || '').trim();
      const direct_masterMaturity = String(direct_master.maturity_status || rowValue_(latestIndex || {}, ['maturity_status']) || '').toLowerCase();
      const direct_masterMatchesMaster = Boolean(direct_masterHash && masterHash && direct_masterHash === masterHash);

      let rawLabel = 'ยังไม่มี Raw Check';
      let rawLevel = 'warn';
      let masterLabel = latestReady || latestIndex ? 'มีข้อมูลเดิม' : 'ยังไม่ยืนยัน';
      let masterLevel = 'warn';
      let direct_masterLabel = direct_masterHash ? 'Direct Master มีข้อมูล' : 'ยังไม่มี Direct Master';
      let direct_masterLevel = direct_masterHash ? 'warn' : 'danger';
      let direct_masterStatus = direct_masterHash ? 'stale' : 'missing';
      let actionLabel = 'รัน Raw Check รอบนี้ก่อน';
      let actionLevel = 'warn';
      let actionStatus = 'raw_missing';
      let direct_masterMessage = '';

      if (rawStatus === 'raw_ready') {
        rawLabel = 'Raw พร้อม';
        rawLevel = 'ok';
        if (readyMatchesRaw) {
          masterLabel = 'Master พร้อมใช้';
          masterLevel = 'ok';
          if (!direct_masterHash) {
            actionLabel = 'สร้าง Dashboard Direct Master';
            actionLevel = 'danger';
            actionStatus = 'direct_master_missing';
            direct_masterMessage = 'Master พร้อมแล้ว แต่ cqr_data direct_master ยังไม่มี game/period นี้';
          } else if (!direct_masterMatchesMaster) {
            direct_masterLabel = 'Direct Master เป็นข้อมูลเก่า';
            direct_masterLevel = 'danger';
            actionLabel = 'Rebuild Dashboard Direct Master';
            actionLevel = 'danger';
            actionStatus = 'direct_master_stale';
            direct_masterMessage = 'Direct Master hash ' + direct_masterHash + ' ไม่ตรง Master hash ' + masterHash;
          } else {
            direct_masterLabel = direct_masterMaturity === 'matured' ? 'Direct Master พร้อมใช้' : 'Direct Master Provisional';
            direct_masterLevel = direct_masterMaturity === 'matured' ? 'ok' : 'warn';
            direct_masterStatus = 'ready';
            actionLabel = direct_masterMaturity === 'matured' ? 'ไม่ต้องทำอะไร' : 'รอ Cohort Matured';
            actionLevel = direct_masterMaturity === 'matured' ? 'ok' : 'warn';
            actionStatus = direct_masterMaturity === 'matured' ? 'ready' : 'ready_provisional';
          }
        } else if (reviewMatchesRaw || masterHash) {
          masterLabel = 'Master เป็นข้อมูลเก่า';
          masterLevel = 'danger';
          actionLabel = 'ไป Data Control';
          actionLevel = 'danger';
          actionStatus = 'repair';
        } else {
          masterLabel = 'ยังไม่ได้ Build';
          actionLabel = 'Build รอบนี้';
          actionStatus = 'build_required';
        }
      } else if (rawStatus) {
        rawLabel = rawStatus === 'raw_partial' ? 'Raw ยังไม่ครบ' : 'Raw ยังไม่พร้อม';
        rawLevel = 'danger';
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
        dashboard_direct_master: direct_masterLabel,
        direct_master_level: direct_masterLevel,
        direct_master_status: direct_masterStatus,
        direct_master_hash: direct_masterHash,
        direct_master_message: direct_masterMessage || String(direct_master.message || ''),
        maturity_status: direct_masterMaturity || String(rowValue_(latestIndex || {}, ['maturity_status']) || ''),
        is_provisional: String(rowValue_(latestIndex || {}, ['is_provisional']) || direct_masterMaturity === 'collecting'),
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

function rowsFromSheet_(sheet) {
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

function readCentralSheetRows_(sheetName) {
  const sheet = centralDb_().getSheetByName(sheetName);
  return rowsFromSheet_(sheet);
}

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
  const sessionCacheKey = 'session:' + token;
  const text = cache.get(sessionCacheKey);
  if (!text) throw new Error('Session not found or expired.');

  const cachedSession = JSON.parse(text);
  const cachedUser = cachedUserAccess_(cachedSession.email);
  const liveUser = cachedUser || findUserAccessRow_(cachedSession.email);
  if (!cachedUser && liveUser) primeUserAccessCache_(liveUser);
  if (!isActiveUserAccess_(liveUser)) {
    cache.remove(sessionCacheKey);
    throw new Error('Email is not allowed or is disabled.');
  }
  return Object.assign({}, cachedSession, {
    role_id: liveUser.role_id,
    allowed_games: liveUser.allowed_games,
    allowed_regions: liveUser.allowed_regions,
    status: liveUser.status
  });
}

const CQR_DIRECT_GAMES = ['CBM_TH','CBM_SEA','CBPC_TH','CBPC_SEA'];
const CQR_DIRECT_SCHEMA = 'cqr-dashboard-direct-master-v2';
const CQR_DIRECT_TTL_SECONDS = 21600;
let CQR_DIRECT_REGISTRY_MEMO_ = null;

function directSheetRows_(fileId, sheetName) {
  const sheet = SpreadsheetApp.openById(fileId).getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  const headers = values.shift().map(normalizeHeader_);
  return values.filter(row => row.some(value => value !== '' && value !== null)).map(row => {
    const out = {};
    headers.forEach((header, index) => { if (header) out[header] = row[index]; });
    return out;
  });
}

function directRegistry_() {
  if (CQR_DIRECT_REGISTRY_MEMO_) return CQR_DIRECT_REGISTRY_MEMO_;
  const rows = readCentralSheetRows_('MasterFiles');
  const registry = {};
  rows.forEach(row => {
    const game = normalizeGameCode_(rowValue_(row, ['game_code','game']));
    const fileId = String(rowValue_(row, ['master_file_id','file_id']) || '').trim();
    const status = String(rowValue_(row, ['status']) || '').toLowerCase();
    if (CQR_DIRECT_GAMES.indexOf(game) >= 0 && fileId && (!status || status === 'active' || status === 'ready')) registry[game] = fileId;
  });
  CQR_DIRECT_GAMES.forEach(game => { if (!registry[game]) throw new Error('Missing active MasterFiles row for ' + game); });
  CQR_DIRECT_REGISTRY_MEMO_ = registry;
  return registry;
}

function directFingerprint_() {
  const tables = new Set(['cohortsummary','channelmonthly','channelweekly','daudaily','playertypemonthly','totalretentionmonthly','cohortmaturity']);
  const parts = readCentralSheetRows_('DataIndex').filter(row => tables.has(normalizeHeader_(rowValue_(row, ['table_name','target_sheet'])))).map(row => [
    pipelineGame_(row), pipelinePeriod_(row), normalizeHeader_(rowValue_(row, ['table_name','target_sheet'])),
    String(rowValue_(row, ['data_hash','data_hash_after']) || ''), Number(rowValue_(row, ['record_count']) || 0)
  ].join('|')).sort();
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, parts.join('\n'), Utilities.Charset.UTF_8);
  return bytes.map(value => ('0' + ((value + 256) % 256).toString(16)).slice(-2)).join('').slice(0, 24);
}

function directCacheGet_(key) {
  const cache = CacheService.getScriptCache();
  const meta = safeJsonParse_(cache.get(key + ':meta') || '{}', {});
  if (!meta.chunks) return null;
  let text = '';
  for (let i = 0; i < Number(meta.chunks); i += 1) {
    const part = cache.get(key + ':' + i);
    if (part === null) return null;
    text += part;
  }
  return safeJsonParse_(text, null);
}

function directCachePut_(key, value) {
  const cache = CacheService.getScriptCache();
  const text = JSON.stringify(value);
  const chunkSize = 85000;
  const chunks = Math.ceil(text.length / chunkSize);
  cache.put(key + ':meta', JSON.stringify({chunks: chunks}), CQR_DIRECT_TTL_SECONDS);
  for (let i = 0; i < chunks; i += 1) cache.put(key + ':' + i, text.slice(i * chunkSize, (i + 1) * chunkSize), CQR_DIRECT_TTL_SECONDS);
}

function directNum_(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function directRatePct_(value) { const number = Number(value); return Number.isFinite(number) ? Math.round(number * 1000) / 10 : null; }
function directMonth_(period) { const match = String(period || '').match(/^(20\d{2}-\d{2})/); return match ? match[1] : ''; }
function directWeekNumber_(period) { const match = String(period || '').match(/-W(\d+)$/); return match ? Number(match[1]) : 0; }
function directWeekLabel_(period) {
  const month = directMonth_(period); const week = directWeekNumber_(period);
  if (!month || !week) return String(period || '');
  const days = new Date(Number(month.slice(0,4)), Number(month.slice(5,7)), 0).getDate();
  const start = (week - 1) * 7 + 1; const end = Math.min(week * 7, days);
  return 'W' + week + ' (' + String(start).padStart(2,'0') + '-' + String(end).padStart(2,'0') + '/' + month.slice(5,7) + ')';
}
function directGroup_(rows, keyFn) { const out = {}; rows.forEach(row => { const key = keyFn(row); (out[key] = out[key] || []).push(row); }); return out; }
function directVerdict_(row, averageD14) {
  const register = directNum_(row.register_users); const base = directNum_(row.cohort_base_d14 || row.eligible_d14); const d1 = directNum_(row.d1_rate); const d14 = directNum_(row.d14_rate);
  if (register < 30 || base < 30) return {tier:'warn', text:'ขนาดกลุ่มตัวอย่างยังไม่เพียงพอ (Register ' + register.toLocaleString() + ', Eligible D14 ' + base.toLocaleString() + ')'};
  if (d1 < .10) return {tier:'bad', text:'D1 ต่ำผิดปกติ (' + (d1*100).toFixed(1) + '%) ควรตรวจสอบคุณภาพ Traffic และ First Login'};
  if (d14 >= averageD14 * 1.2) return {tier:'good', text:'D14 สูงกว่าค่าเฉลี่ย (' + (d14*100).toFixed(1) + '% เทียบ ' + (averageD14*100).toFixed(1) + '%)'};
  if (d14 <= averageD14 * .6) return {tier:'bad', text:'D14 ต่ำกว่าค่าเฉลี่ย (' + (d14*100).toFixed(1) + '% เทียบ ' + (averageD14*100).toFixed(1) + '%)'};
  return {tier:'warn', text:'D14 ใกล้เคียงค่าเฉลี่ย (' + (d14*100).toFixed(1) + '% เทียบ ' + (averageD14*100).toFixed(1) + '%)'};
}

function directHeatmap_(dauRows, periodKey) {
  const matrix = Array.from({length:5}, () => Array(7).fill(0));
  const weekWanted = directWeekNumber_(periodKey);
  dauRows.forEach(row => {
    const date = new Date(String(row.date || '') + 'T00:00:00Z'); if (isNaN(date)) return;
    const week = Math.floor((date.getUTCDate() - 1) / 7) + 1; if (weekWanted && week !== weekWanted) return;
    const mondayIndex = (date.getUTCDay() + 6) % 7; matrix[week - 1][mondayIndex] += directNum_(row.dau);
  });
  return matrix;
}

function directLoadGame_(game, fileId) {
  return {
    game: game, fileId: fileId,
    summary: directSheetRows_(fileId,'CohortSummary'),
    monthly: directSheetRows_(fileId,'ChannelMonthly'),
    weekly: directSheetRows_(fileId,'ChannelWeekly'),
    dau: directSheetRows_(fileId,'DAUDaily'),
    player: directSheetRows_(fileId,'PlayerTypeMonthly'),
    retention: directSheetRows_(fileId,'TotalRetentionMonthly'),
    maturity: directSheetRows_(fileId,'CohortMaturity')
  };
}

function directAiMap_() {
  const map = {};
  readCentralSheetRows_('AISummaryCache').filter(row => String(rowValue_(row,['status']) || '').toLowerCase() === 'ready').forEach(row => {
    const game = normalizeGameCode_(rowValue_(row,['game_code','game'])); const period = String(rowValue_(row,['period_key','period']) || '');
    if (game && period) map[game + '|' + period] = {text:String(rowValue_(row,['summary_text','alert_text']) || ''), model:String(rowValue_(row,['model']) || ''), generated_at:rowValue_(row,['generated_at']), data_hash:String(rowValue_(row,['data_hash']) || ''), status:'ready'};
  });
  return map;
}

function directAggregateSummary_(rows, game, period, view) {
  const base = rows.reduce((sum,row)=>sum+directNum_(row.cohort_base_d14),0);
  const retained = {};
  ['d1','d3','d7','d14'].forEach(m => retained[m] = rows.reduce((sum,row)=>sum+directNum_(row['retained_'+m]),0));
  const avgDaysDen = rows.reduce((sum,row)=>sum+directNum_(row.register_users),0);
  const avgDaysNum = rows.reduce((sum,row)=>sum+directNum_(row.avg_days_active)*directNum_(row.register_users),0);
  return {game_code:game,period_key:period,view:view,cohort_base_d14:base,register_users:rows.reduce((s,r)=>s+directNum_(r.register_users),0),first_login_users:rows.reduce((s,r)=>s+directNum_(r.first_login_users),0),paid_register:rows.reduce((s,r)=>s+directNum_(r.paid_register),0),retained_d1:retained.d1,retained_d3:retained.d3,retained_d7:retained.d7,retained_d14:retained.d14,d1_rate:base?retained.d1/base:null,d3_rate:base?retained.d3/base:null,d7_rate:base?retained.d7/base:null,d14_rate:base?retained.d14/base:null,avg_days_active:avgDaysDen?avgDaysNum/avgDaysDen:null,returners:rows.every(r=>r.returners!==''&&r.returners!==null)?rows.reduce((s,r)=>s+directNum_(r.returners),0):null,late_starters:rows.every(r=>r.late_starters!==''&&r.late_starters!==null)?rows.reduce((s,r)=>s+directNum_(r.late_starters),0):null,avg_dau:null,max_dau:null,maturity_status:rows.every(r=>String(r.maturity_status)==='matured')?'matured':'collecting'};
}

function directChannelAggregate_(rows) {
  const groups = directGroup_(rows, row => String(row.channel || 'Organic / Unknown'));
  const result = Object.keys(groups).map(channel => {
    const list=groups[channel], base=list.reduce((s,r)=>s+directNum_(r.cohort_base_d14 || r.eligible_d14),0), out={channel:channel,register_users:list.reduce((s,r)=>s+directNum_(r.register_users),0),first_login_users:list.reduce((s,r)=>s+directNum_(r.first_login_users),0),cohort_base_d14:base};
    ['d1','d3','d7','d14'].forEach(m=>{out['retained_'+m]=list.reduce((s,r)=>s+directNum_(r['retained_'+m]),0);out[m+'_rate']=base?out['retained_'+m]/base:null;}); return out;
  });
  const totalBase=result.reduce((s,r)=>s+r.cohort_base_d14,0),totalD14=result.reduce((s,r)=>s+r.retained_d14,0),avg=totalBase?totalD14/totalBase:0;
  return result.map(row=>{const v=directVerdict_(row,avg);return {channel:row.channel,register:row.register_users,d1:directRatePct_(row.d1_rate),d3:directRatePct_(row.d3_rate),d7:directRatePct_(row.d7_rate),d14:directRatePct_(row.d14_rate),verdict_tier:v.tier,verdict_text:v.text,cohort_base_d14:row.cohort_base_d14,retained:{d1:row.retained_d1,d3:row.retained_d3,d7:row.retained_d7,d14:row.retained_d14}};}).sort((a,b)=>b.register-a.register);
}

function directDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, 'Asia/Bangkok', 'yyyy-MM-dd');
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return dmy[3] + '-' + ('0' + dmy[2]).slice(-2) + '-' + ('0' + dmy[1]).slice(-2);
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? '' : Utilities.formatDate(parsed, 'Asia/Bangkok', 'yyyy-MM-dd');
}

function directDateInPeriod_(dateText, period) {
  const month = directMonth_(period);
  const weekWanted = directWeekNumber_(period);
  const date = new Date(String(dateText || '') + 'T00:00:00Z');
  if (isNaN(date)) return false;
  if (month && String(dateText).slice(0, 7) !== month) return false;
  if (!weekWanted) return true;
  return Math.floor((date.getUTCDate() - 1) / 7) + 1 === weekWanted;
}

function directDailyMetricRows_(game, fileId, period) {
  const byDate = {};
  const channelRows = directSheetRows_(fileId, 'ChannelDaily');
  const dauRows = directSheetRows_(fileId, 'DAUDaily');
  const hasFirstLogin = channelRows.some(function(row) {
    return Object.prototype.hasOwnProperty.call(row, 'first_login_users') || Object.prototype.hasOwnProperty.call(row, 'first_login');
  });

  channelRows.forEach(function(row) {
    const date = directDate_(rowValue_(row, ['date', 'register_date', 'cohort_date']));
    if (!date || !directDateInPeriod_(date, period)) return;
    const item = byDate[date] || {date: date, new_register: 0, paid_register: 0, first_login: hasFirstLogin ? 0 : null, dau: null, has_channel_daily: false};
    const register = directNum_(rowValue_(row, ['register_users', 'register']));
    item.has_channel_daily = true;
    item.new_register += register;
    if (hasFirstLogin) item.first_login += directNum_(rowValue_(row, ['first_login_users', 'first_login']));
    const channel = String(rowValue_(row, ['channel', 'db_channel']) || '');
    if (channel === 'Facebook Ads' || channel === 'Google Ads') item.paid_register += register;
    byDate[date] = item;
  });

  dauRows.forEach(function(row) {
    const date = directDate_(rowValue_(row, ['date', 'login_date', 'metric_date']));
    if (!date || !directDateInPeriod_(date, period)) return;
    const item = byDate[date] || {date: date, new_register: null, paid_register: null, first_login: null, dau: null, has_channel_daily: false};
    item.dau = (item.dau === null ? 0 : item.dau) + directNum_(rowValue_(row, ['dau', 'active_users', 'login_users']));
    byDate[date] = item;
  });

  return {
    rows: Object.keys(byDate).sort().map(function(date) {
      const row = byDate[date];
      if (!row.has_channel_daily) {
        row.new_register = null;
        row.paid_register = null;
        row.first_login = null;
      }
      return row;
    }),
    channel_row_count: channelRows.length,
    dau_row_count: dauRows.length,
    has_first_login: hasFirstLogin,
    game: game
  };
}

function readDashboardDailyData_(params) {
  const registry = directRegistry_();
  const requestedGame = normalizeGameCode_(params.game || 'ALL');
  const period = String(params.period || params.month || '').trim();
  const month = directMonth_(period);
  if (!month) throw new Error('dashboard.daily requires a valid period or month.');
  if (requestedGame !== 'ALL' && CQR_DIRECT_GAMES.indexOf(requestedGame) === -1) throw new Error('Unsupported dashboard.daily game: ' + requestedGame);

  const games = requestedGame === 'ALL' ? CQR_DIRECT_GAMES.slice() : [requestedGame];
  const combined = {};
  let channelRows = 0;
  let dauRows = 0;
  let firstLoginSupported = false;

  games.forEach(function(game) {
    const result = directDailyMetricRows_(game, registry[game], period);
    channelRows += result.channel_row_count;
    dauRows += result.dau_row_count;
    firstLoginSupported = firstLoginSupported || result.has_first_login;
    result.rows.forEach(function(row) {
      const item = combined[row.date] || {date: row.date, new_register: null, paid_register: null, first_login: null, dau: null, has_channel_daily: false};
      if (row.has_channel_daily) {
        item.has_channel_daily = true;
        item.new_register = directNum_(item.new_register) + directNum_(row.new_register);
        item.paid_register = directNum_(item.paid_register) + directNum_(row.paid_register);
        if (firstLoginSupported) item.first_login = directNum_(item.first_login) + directNum_(row.first_login);
      }
      if (row.dau !== null && row.dau !== undefined) item.dau = (item.dau === null ? 0 : item.dau) + directNum_(row.dau);
      combined[row.date] = item;
    });
  });

  const rows = Object.keys(combined).sort().map(function(date) {
    const row = combined[date];
    delete row.has_channel_daily;
    if (!firstLoginSupported) row.first_login = null;
    return row;
  });

  return {
    contract_version: 'dashboard_daily_v1',
    source: 'direct_master_channel_daily',
    read_mode: 'direct_master_daily_endpoint',
    game: requestedGame,
    period: period,
    month: month,
    rows: rows,
    row_count: rows.length,
    supported_fields: {
      new_register: channelRows > 0,
      paid_register: channelRows > 0,
      first_login: firstLoginSupported,
      dau: dauRows > 0
    },
    semantics: {
      new_register: 'ChannelDaily register_users grouped by register/cohort date.',
      paid_register: 'ChannelDaily register_users for Facebook Ads and Google Ads.',
      first_login: firstLoginSupported ? 'ChannelDaily first_login_users for the selected register/cohort date.' : '',
      dau: 'DAUDaily dau grouped by activity date.'
    },
    generated_at: new Date().toISOString()
  };
}

function buildDashboardDataFromMasters_(registry, fingerprint) {
  const loaded = {}; CQR_DIRECT_GAMES.forEach(game => loaded[game]=directLoadGame_(game,registry[game]));
  const allSummary=[]; CQR_DIRECT_GAMES.forEach(game=>loaded[game].summary.forEach(row=>allSummary.push(row)));
  const months=Array.from(new Set(allSummary.filter(r=>String(r.view)==='monthly').map(r=>directMonth_(r.period_key)).filter(Boolean))).sort();
  const payload={months:months,periods:months.map(m=>({key:m,month:m,type:'month',label:m})),weeks_by_month:{},games:['ALL'].concat(CQR_DIRECT_GAMES),channel_data:{},overview_data:{},legacy:{},game_channel_full:{},player_type_breakdown:{},total_user_retention:{},total_mau:{},data_status:{},ai_summary:directAiMap_(),data_version:{schema_version:CQR_DIRECT_SCHEMA,source:'central_masterfiles_direct',read_mode:'direct_master_aggregation',pre_generated_data_file_required:false,data_index_fingerprint:fingerprint,generated_at:new Date().toISOString(),master_file_ids:registry,latest_available_period:months[months.length-1]||'',latest_common_matured_period:''}};
  const maturityByGame={}; CQR_DIRECT_GAMES.forEach(game=>{maturityByGame[game]={};loaded[game].maturity.forEach(r=>maturityByGame[game][String(r.period_key)]=r);});
  const common=months.filter(m=>CQR_DIRECT_GAMES.every(g=>String((maturityByGame[g][m]||{}).maturity_status)==='matured')); payload.data_version.latest_common_matured_period=common[common.length-1]||'';
  months.forEach(month=>{const weeks=Array.from(new Set(allSummary.filter(r=>String(r.view)==='weekly'&&directMonth_(r.period_key)===month).map(r=>String(r.period_key)))).sort();payload.weeks_by_month[month]=weeks.map(w=>({key:w,label:directWeekLabel_(w)}));});
  const periods=[];months.forEach(m=>{periods.push(m);(payload.weeks_by_month[m]||[]).forEach(w=>periods.push(w.key));});
  periods.forEach(period=>{
    const view=directWeekNumber_(period)?'weekly':'monthly', month=directMonth_(period);
    CQR_DIRECT_GAMES.forEach(game=>{
      const source=loaded[game], summaries=source.summary.filter(r=>String(r.period_key)===period&&String(r.view)===view); if(!summaries.length)return;
      const s=summaries[0], key=game+'|'+period, chRows=(view==='monthly'?source.monthly:source.weekly).filter(r=>String(view==='monthly'?r.period_key:r.week_key)===period);
      const daus=source.dau.filter(r=>String(r.period_key)===month).filter(r=>{const w=directWeekNumber_(period);return !w||Math.floor((new Date(String(r.date)+'T00:00:00Z').getUTCDate()-1)/7)+1===w;});
      payload.channel_data[key]=directChannelAggregate_(chRows);
      payload.overview_data[key]={new_register:directNum_(s.register_users),paid_register:directNum_(s.paid_register),first_login:directNum_(s.first_login_users),recall_user:s.returners===''||s.returners===null?null:directNum_(s.returners),avg_days_active:s.avg_days_active===''||s.avg_days_active===null?null:Math.round(directNum_(s.avg_days_active)*10)/10,d1:directRatePct_(s.d1_rate),d3:directRatePct_(s.d3_rate),d7:directRatePct_(s.d7_rate),d14:directRatePct_(s.d14_rate)};
      const avgDau=daus.length?daus.reduce((a,r)=>a+directNum_(r.dau),0)/daus.length:null;
      payload.legacy[key]={funnel:[directNum_(s.register_users),directNum_(s.first_login_users),directNum_(s.retained_d1),directNum_(s.retained_d3)],avg_dau:avgDau===null?0:Math.round(avgDau),wau_est:avgDau===null?0:Math.round(avgDau*3.5),dau_x:daus.map(r=>String(r.date)),dau_y:daus.map(r=>directNum_(r.dau)),heatmap:directHeatmap_(source.dau.filter(r=>String(r.period_key)===month),period)};
      const p=source.player.find(r=>String(r.period_key)===month), tr=source.retention.find(r=>String(r.period_key)===month);
      if(view==='monthly'&&p){payload.player_type_breakdown[key]={has_login:true,new_register:directNum_(p.new_register_active),returners:directNum_(p.returners),late_starters:directNum_(p.late_starters),other_active:directNum_(p.other_active),new_register_inactive:directNum_(p.new_register_inactive),total_active:directNum_(p.total_active),login_rows_unique:directNum_(p.login_rows_unique),data_hash:String(p.data_hash||'')};payload.total_mau[key]=directNum_(p.login_rows_unique);} else {payload.player_type_breakdown[key]={has_login:false,new_register:directNum_(s.register_users),returners:0,late_starters:0,other_active:0,total_active:null};payload.total_mau[key]=null;}
      const trSource=view==='monthly'&&tr?tr:s; const base=directNum_(view==='monthly'&&tr?tr.cohort_size:s.cohort_base_d14);
      payload.total_user_retention[key]={has_login:base>0,base_milestone:'d14',cohort_size:base,d1:directRatePct_(trSource.d1_rate),d3:directRatePct_(trSource.d3_rate),d7:directRatePct_(trSource.d7_rate),d14:directRatePct_(trSource.d14_rate),d30:null,retained:{d1:directNum_(trSource.retained_d1),d3:directNum_(trSource.retained_d3),d7:directNum_(trSource.retained_d7),d14:directNum_(trSource.retained_d14)}};
      const mat=maturityByGame[game][month]||{};payload.data_status[key]={status:String(mat.maturity_status||'collecting'),maturity_status:String(mat.maturity_status||'collecting'),message:String(mat.maturity_status)==='matured'?'Master data พร้อมใช้':'Cohort ยังเก็บ D14 observation window',data_hash:String(s.data_hash||''),dashboard_read_mode:'direct_master_aggregation'};
      payload.game_channel_full[period]=(payload.game_channel_full[period]||[]).concat(payload.channel_data[key].map(row=>Object.assign({game_code:game},row)));
    });
    const gameSummaries=CQR_DIRECT_GAMES.map(g=>loaded[g].summary.find(r=>String(r.period_key)===period&&String(r.view)===view)).filter(Boolean); if(!gameSummaries.length)return;
    const all=directAggregateSummary_(gameSummaries,'ALL',period,view), allKey='ALL|'+period, allChannels=[];CQR_DIRECT_GAMES.forEach(g=>{const src=loaded[g],rs=(view==='monthly'?src.monthly:src.weekly).filter(r=>String(view==='monthly'?r.period_key:r.week_key)===period);allChannels.push.apply(allChannels,rs);});
    payload.channel_data[allKey]=directChannelAggregate_(allChannels);payload.overview_data[allKey]={new_register:all.register_users,paid_register:all.paid_register,first_login:all.first_login_users,recall_user:all.returners,avg_days_active:all.avg_days_active===null?null:Math.round(all.avg_days_active*10)/10,d1:directRatePct_(all.d1_rate),d3:directRatePct_(all.d3_rate),d7:directRatePct_(all.d7_rate),d14:directRatePct_(all.d14_rate)};
    const allDauByDate={};CQR_DIRECT_GAMES.forEach(g=>loaded[g].dau.filter(r=>String(r.period_key)===month).forEach(r=>{const w=directWeekNumber_(period),date=new Date(String(r.date)+'T00:00:00Z');if(w&&Math.floor((date.getUTCDate()-1)/7)+1!==w)return;allDauByDate[String(r.date)]=(allDauByDate[String(r.date)]||0)+directNum_(r.dau);}));const dates=Object.keys(allDauByDate).sort(),av=dates.length?dates.reduce((s,d)=>s+allDauByDate[d],0)/dates.length:null;
    const heatRows=[];Object.keys(allDauByDate).forEach(date=>heatRows.push({date:date,dau:allDauByDate[date]}));payload.legacy[allKey]={funnel:[all.register_users,all.first_login_users,all.retained_d1,all.retained_d3],avg_dau:av===null?0:Math.round(av),wau_est:av===null?0:Math.round(av*3.5),dau_x:dates,dau_y:dates.map(d=>allDauByDate[d]),heatmap:directHeatmap_(heatRows,period)};
    if(view==='monthly'){const pts=CQR_DIRECT_GAMES.map(g=>loaded[g].player.find(r=>String(r.period_key)===month)).filter(Boolean),p={};['new_register_active','returners','late_starters','other_active','new_register_inactive','total_active','login_rows_unique'].forEach(k=>p[k]=pts.reduce((s,r)=>s+directNum_(r[k]),0));payload.player_type_breakdown[allKey]={has_login:true,new_register:p.new_register_active,returners:p.returners,late_starters:p.late_starters,other_active:p.other_active,new_register_inactive:p.new_register_inactive,total_active:p.total_active,login_rows_unique:p.login_rows_unique};payload.total_mau[allKey]=p.login_rows_unique;}else{payload.player_type_breakdown[allKey]={has_login:false,new_register:all.register_users,returners:0,late_starters:0,other_active:0,total_active:null};payload.total_mau[allKey]=null;}
    payload.total_user_retention[allKey]={has_login:all.cohort_base_d14>0,base_milestone:'d14',cohort_size:all.cohort_base_d14,d1:directRatePct_(all.d1_rate),d3:directRatePct_(all.d3_rate),d7:directRatePct_(all.d7_rate),d14:directRatePct_(all.d14_rate),d30:null,retained:{d1:all.retained_d1,d3:all.retained_d3,d7:all.retained_d7,d14:all.retained_d14}};payload.data_status[allKey]={status:all.maturity_status,maturity_status:all.maturity_status,message:all.maturity_status==='matured'?'Master data พร้อมใช้':'บางเกมยังเก็บ D14 observation window',dashboard_read_mode:'direct_master_aggregation'};
  });
  return payload;
}

function readDashboardData_() {
  const registry=directRegistry_(),fingerprint=directFingerprint_(),key='cqr-direct:'+CQR_DIRECT_SCHEMA+':'+fingerprint,cached=directCacheGet_(key);if(cached)return cached;
  const data=buildDashboardDataFromMasters_(registry,fingerprint);directCachePut_(key,data);return data;
}

function normalizeDataText_(text) { throw new Error('Pre-generated dashboard data files are not used in Direct Master V2.'); }



function dashboardStatusFor_(dashboardData, gameCode, periodKey) {
  const status = dashboardData && dashboardData.data_status ? dashboardData.data_status : {};
  return status[String(gameCode || '') + '|' + String(periodKey || '')] || {};
}

function handleAiAsk_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  const question = String(e.parameter.question || '').trim();
  if (!question) return json_({ ok: false, message: 'Missing question.' }, callback);
  if (question.length > 500) return json_({ ok: false, message: 'Question is too long. Max 500 characters.' }, callback);

  // Daily Retention AI Routing V1 — NON-PROD hook.
  // Deterministic routing runs before the existing monthly/direct-master path.
  // Returning null preserves the existing monthly behavior unchanged.
  const dailyRetentionRoute = cqrDailyRetentionAiRouteV1_(e, session, question);
  if (dailyRetentionRoute) {
    return handleDailyRetentionAiAskV1_(e, callback, session, question, dailyRetentionRoute);
  }

  const props = PropertiesService.getScriptProperties();
  const webhookUrl = props.getProperty('CQR_AI_ASK_WEBHOOK_URL');
  const sharedSecret = props.getProperty('CQR_AI_ASK_SHARED_SECRET');
  if (!webhookUrl) throw new Error('Missing Script Property: CQR_AI_ASK_WEBHOOK_URL');
  if (!sharedSecret) throw new Error('Missing Script Property: CQR_AI_ASK_SHARED_SECRET');

  const dashboardData = readDashboardData_();
  const version = dashboardData.data_version || {};
  if (String(version.read_mode || '') !== 'direct_master_aggregation') {
    throw new Error('Apps Script dashboard source is not Direct Master.');
  }

  const requestedGame = String(e.parameter.game || 'ALL').trim().toUpperCase() || 'ALL';
  const requestedPeriod = String(e.parameter.period || 'ALL').trim() || 'ALL';
  const normalizedRequestedPeriod = requestedPeriod.toUpperCase();
  const resolvedPeriod = ['ALL', 'AUTO', ''].indexOf(normalizedRequestedPeriod) >= 0
    ? String(version.latest_common_matured_period || '')
    : requestedPeriod;

  if (!resolvedPeriod) {
    return json_({
      ok: false,
      message: 'No common matured period is available for AI analysis.',
      requested_period: requestedPeriod,
      data_version: version
    }, callback);
  }

  const alertLogContext = buildCqrAlertLogContext_(5);
  const payload = {
    request_id: 'AIASK-' + new Date().toISOString(),
    question,
    game: requestedGame,
    period: resolvedPeriod,
    requested_period: requestedPeriod,
    channel: String(e.parameter.channel || 'ALL'),
    view: String(e.parameter.view || 'monthly'),
    ai_mode: String(e.parameter.ai_mode || 'gemini'),
    prompt_version: String(e.parameter.prompt_version || 'ai-summary-v3-direct-master'),
    central_db_id: CONFIG.CENTRAL_DB_ID,
    user_email: session.email,
    dashboard_state: safeJsonParse_(e.parameter.dashboard_state || '{}', {}),
    dashboard_data_version: version,
    methodology: 'cumulative_retention_d1_ge_d3_ge_d7_ge_d14',
    alert_log_context: alertLogContext,
    alert_log_source: 'CQR_ALERT_LOG',
    alert_log_limit: 5,
    answer_style_instructions: [
      'ตอบเป็นภาษาไทยแบบเข้าใจง่าย กระชับ และใช้คำที่ทีม Marketing อ่านรู้เรื่องทันที',
      'เขียนให้เป็นธรรมชาติ เหมือน analyst อธิบายให้ทีมฟัง',
      'ใช้ Markdown ตัวหนาเฉพาะชื่อเกม ชื่อช่องทาง หัวข้อ และตัวเลขสำคัญ ห้ามทำตัวหนาทุกประโยค',
      'Retention เป็นแบบ Cumulative โดย D1 ต้องมากกว่าหรือเท่ากับ D3, D7 และ D14',
      'ใช้เฉพาะ Matured Cohort สำหรับคำตอบ Final; หากข้อมูลไม่ครบทุกเกมให้ระบุข้อจำกัด',
      'ห้ามพูดศัพท์ระบบภายใน เช่น workflow, cache, webhook, n8n, backend, payload, prompt',
      'จัดคำตอบเป็นย่อหน้าสั้นหรือ bullet และลงท้ายด้วยสิ่งที่ควรตรวจต่อ 1-3 ข้อ'
    ].join('\n'),
    max_answer_chars: 1800
  };

  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-CQR-AI-Secret': sharedSecret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const data = normalizeAiWebhookResponse_(response.getContentText() || '{}');

  if (status < 200 || status >= 300) {
    return json_({
      ok: false,
      message: 'AI Ask n8n webhook failed.',
      status,
      detail: data,
      requested_period: requestedPeriod,
      resolved_period: resolvedPeriod
    }, callback);
  }

  const answer = sanitizeAiAnswerForUsers_(data.answer || '');

  if (data.ok === false) {
    return json_({
      ok: false,
      message: data.message || data.error || 'AI backend returned a failed response.',
      status,
      detail: data,
      requested_period: requestedPeriod,
      resolved_period: resolvedPeriod
    }, callback);
  }

  if (!answer) {
    return json_({
      ok: false,
      message: 'AI backend returned an empty answer.',
      status,
      detail_type: typeof data,
      detail: data,
      requested_period: requestedPeriod,
      resolved_period: resolvedPeriod
    }, callback);
  }

  return json_({
    ok: true,
    answer,
    source: data.source || 'n8n',
    used_ai_model: data.used_ai_model || '',
    grounded: data.grounded === true || Number(data.summaries_used || 0) > 0,
    intent: data.intent || '',
    summaries_used: Number(data.summaries_used || 0),
    expected_summaries: Number(data.expected_summaries || (requestedGame === 'ALL' ? 4 : 1)),
    complete_scope: data.complete_scope !== false,
    request_id: data.request_id || payload.request_id,
    game: data.game || requestedGame,
    requested_period: requestedPeriod,
    period: data.period || resolvedPeriod,
    resolved_period: data.period || resolvedPeriod,
    maturity_status: data.maturity_status || 'matured',
    prompt_version: payload.prompt_version,
    data_version: version,
    warnings: Array.isArray(data.warnings) ? data.warnings : []
  }, callback);
}

function normalizeAiWebhookResponse_(value) {
  let current = value;

  for (let index = 0; index < 8; index += 1) {
    if (typeof current === 'string') {
      const text = current.trim();
      if (!text) return {};
      try {
        current = JSON.parse(text);
        continue;
      } catch (error) {
        return { raw_text: text };
      }
    }

    if (Array.isArray(current) && current.length === 1) {
      current = current[0];
      continue;
    }

    if (!current || typeof current !== 'object' || Array.isArray(current)) break;
    if (Object.prototype.hasOwnProperty.call(current, 'answer')) break;

    const unwrapKeys = ['body', 'data', 'result', 'n8n_result', 'json', 'payload'];
    const key = unwrapKeys.find(function (candidate) {
      return Object.prototype.hasOwnProperty.call(current, candidate)
        && current[candidate] !== undefined
        && current[candidate] !== null;
    });

    if (!key) break;
    current = current[key];
  }

  return current && typeof current === 'object' && !Array.isArray(current)
    ? current
    : {};
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


// ===== V2.2: current-feature compatibility and safety restoration =====

/**
 * Returns the current live Central DB user for an existing session.
 */
function handleSessionMe_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  const user = findUserAccessRow_(session.email);
  if (!isActiveUserAccess_(user)) {
    throw new Error('User not found or disabled.');
  }

  const clean = cleanUserAccessObject_(user);
  clean.is_super_admin = clean.role_id === 'super_admin';
  return json_({ ok: true, user: clean }, callback);
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

function handleAdminRawCheckStatus_(e, callback) {
  const session = validateSession_(e.parameter.session_token);
  requireSuperAdmin_(session);

  const requestId = String(e.parameter.request_id || '').trim();
  const includeJobs = /^(1|true|yes)$/i.test(String(e.parameter.include_jobs || '').trim());
  const result = getRawCheckRequestStatus_(requestId, includeJobs);

  return json_(result, callback);
}

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

function stringValue_(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function numberValue_(value) {
  const number = Number(value);
  return isFinite(number) ? number : 0;
}

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

function auditCqrProductionRelease() {
  const data = readDashboardData_();
  const version = data && data.data_version ? data.data_version : {};
  const result = {
    ok: String(version.read_mode || '') === 'direct_master_aggregation',
    release: CQR_API_RELEASE,
    dashboard_read_mode: String(version.read_mode || ''),
    latest_available_period: String(version.latest_available_period || ''),
    latest_common_matured_period: String(version.latest_common_matured_period || ''),
    games: Array.isArray(data.games) ? data.games : [],
    months_count: Array.isArray(data.months) ? data.months.length : 0,
    ai_response_contract: 'normalized_json_object_v2',
    checked_at: new Date().toISOString()
  };

  if (!result.ok) throw new Error('Direct Master audit failed: ' + JSON.stringify(result));
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Manual pre-deploy authorization and connectivity check.
 *
 * V2.2 checks the Central DB and all four registered Master files.
 * It deliberately does not use a legacy dashboard snapshot file.
 */
function authorizeCqrAllServices() {
  const result = {};

  const tokenCheck = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=test',
    { muteHttpExceptions: true }
  );
  result.url_fetch_status = tokenCheck.getResponseCode();

  const central = SpreadsheetApp.openById(CONFIG.CENTRAL_DB_ID);
  result.central_db = central.getName();
  result.user_access_sheet = userAccessInfrastructure_().getName();

  const registry = directRegistry_();
  result.master_files = {};
  CQR_DIRECT_GAMES.forEach(function (game) {
    result.master_files[game] =
      SpreadsheetApp.openById(registry[game]).getName();
  });

  result.dashboard_read_mode = 'direct_master_aggregation';
  result.checked_at = new Date().toISOString();

  console.log(JSON.stringify(result, null, 2));
  return result;
}
