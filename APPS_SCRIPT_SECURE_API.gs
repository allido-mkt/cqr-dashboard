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

  // Put the private Google Drive file ID that stores the dashboard data.
  // The file can contain either:
  // 1) raw JSON object, or
  // 2) JS format: const CQR_DATA = {...};
  DATA_FILE_ID: '1tOKlCjjGNRqzlvPHKzqhq_Uv285ufyRE'
};

function doGet(e) {
  try {
    const action = String(e.parameter.action || '').toLowerCase();
    const idToken = e.parameter.id_token;
    const callback = e.parameter.callback;
    const profile = verifyIdToken_(idToken);

    if (!isAllowed_(profile.email)) {
      return json_({ ok: false, allowed: false, message: 'Email is not allowed.' }, callback);
    }

    if (action === 'verify') {
      return json_({ ok: true, allowed: true, email: profile.email, name: profile.name || '' }, callback);
    }

    if (action === 'data') {
      const data = readDashboardData_();
      return json_({ ok: true, email: profile.email, data }, callback);
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

function isAllowed_(email) {
  return CONFIG.ALLOWED_EMAILS.map(String).map(v => v.toLowerCase()).includes(String(email || '').toLowerCase());
}

function authorizeOnce() {
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=test', {
    muteHttpExceptions: true
  });
  DriveApp.getFileById(CONFIG.DATA_FILE_ID).getName();
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
