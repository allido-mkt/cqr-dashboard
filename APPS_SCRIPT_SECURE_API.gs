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
    return json_({ ok: false, message: err.message || String(err) }, e.parameter.callback);
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
    max_answer_chars: 900
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
    answer: data.answer || '',
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
