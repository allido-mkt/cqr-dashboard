/**
 * CQR Auth Client
 *
 * Frontend helper for GitHub Pages.
 * Requires Google Identity Services:
 * <script src="https://accounts.google.com/gsi/client" async defer></script>
 */

window.CQRAuth = (() => {
  const storageKey = 'cqr_secure_session';
  let config = null;

  function init(userConfig) {
    config = {
      clientId: userConfig.clientId,
      backendUrl: userConfig.backendUrl,
      buttonEl: userConfig.buttonEl,
      onLogin: userConfig.onLogin || function () {},
      onLogout: userConfig.onLogout || function () {},
      onError: userConfig.onError || function () {},
      onSessionExpired: userConfig.onSessionExpired || function () {}
    };

    const saved = getSession();
    if (saved) {
      verifySession(saved.session_token)
        .then(result => {
          if (result.ok) config.onLogin(result.user, saved);
          else clearSessionAndExpire();
        })
        .catch(clearSessionAndExpire);
    }

    waitForGoogle();
  }

  function waitForGoogle() {
    if (!window.google || !google.accounts || !google.accounts.id) {
      setTimeout(waitForGoogle, 250);
      return;
    }
    google.accounts.id.initialize({
      client_id: config.clientId,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: false
    });
    if (config.buttonEl) {
      google.accounts.id.renderButton(config.buttonEl, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
        width: 260
      });
    }
  }

  async function handleGoogleCredential(response) {
    try {
      const result = await callBackend('login', { id_token: response.credential });
      if (!result.ok) throw new Error(result.message || 'Login failed');
      saveSession(result);
      config.onLogin(result.user, result);
    } catch (err) {
      config.onError(err.message || String(err));
    }
  }

  function saveSession(result) {
    sessionStorage.setItem(storageKey, JSON.stringify({
      session_token: result.session_token,
      expires_at: result.expires_at,
      user: result.user
    }));
  }

  function getSession() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (!saved || !saved.session_token || !saved.expires_at) return null;
      if (new Date(saved.expires_at).getTime() <= Date.now()) {
        clearSessionAndExpire();
        return null;
      }
      return saved;
    } catch (err) {
      return null;
    }
  }

  async function verifySession(sessionToken) {
    return callBackend('session.verify', { session_token: sessionToken });
  }

  async function fetchDashboardData(options = {}) {
    const session = getSession();
    if (!session) throw new Error('Session expired');
    const result = await callBackend('dashboard.data', {
      session_token: session.session_token,
      period: options.period || '',
      game: options.game || 'ALL'
    });
    if (!result.ok) throw new Error(result.message || 'Cannot load dashboard data');
    return result;
  }

  async function logout() {
    const session = getSession();
    if (session) {
      try {
        await callBackend('logout', { session_token: session.session_token });
      } catch (err) {}
    }
    sessionStorage.removeItem(storageKey);
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    config.onLogout();
  }

  function clearSessionAndExpire() {
    sessionStorage.removeItem(storageKey);
    if (config) config.onSessionExpired();
  }

  function callBackend(action, params) {
    return new Promise((resolve, reject) => {
      const callback = `cqrAuth_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const query = new URLSearchParams({
        action,
        callback,
        t: String(Date.now()),
        user_agent: navigator.userAgent
      });
      Object.keys(params || {}).forEach(key => query.set(key, params[key]));

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Backend timeout'));
      }, 25000);

      function cleanup() {
        clearTimeout(timer);
        delete window[callback];
        script.remove();
      }

      window[callback] = payload => {
        cleanup();
        resolve(payload || {});
      };

      script.onerror = () => {
        cleanup();
        reject(new Error('Cannot call backend'));
      };

      script.src = `${config.backendUrl}?${query.toString()}`;
      document.head.appendChild(script);
    });
  }

  return {
    init,
    getSession,
    fetchDashboardData,
    logout,
    callBackend
  };
})();

