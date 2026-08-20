(() => {
  "use strict";

  const SESSION_KEY = "cqr_auth";
  const COLLAPSE_KEY = "cqr_ui_sidebar_collapsed";
  const GROUP_PREFIX = "cqr_ui_sidebar_group_";
  const ALL_PERMISSIONS = [
    "view_admin_panel",
    "manage_user_access",
    "view_data_health",
    "run_raw_check",
    "run_pipeline_check",
    "view_data_control_history",
    "run_data_preview",
    "run_data_clear",
    "run_data_build",
  ];

  const ICONS = {
    logo: '<path d="M12 2.5 20 7.1v9.8L12 21.5 4 16.9V7.1L12 2.5Z"/><path d="m9 12 2 2 4-4"/>',
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="4" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/>',
    retention: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v6h-6"/>',
    sparkles: '<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/><path d="m18.5 13 1 2.4L22 16.5l-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z"/><path d="m5 14 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20v-1.3c0-3.1 2.4-5.4 5.5-5.4s5.5 2.3 5.5 5.4V20"/><circle cx="17" cy="8.5" r="2.3"/><path d="M16 13.6c2.7.2 4.5 2 4.5 4.5V20"/>',
    health: '<path d="M12 21s-8-4.7-9.4-9.8C1.5 7.5 4 4 7.4 4c2 0 3.7 1.1 4.6 2.5C12.9 5.1 14.6 4 16.6 4c3.4 0 5.9 3.5 4.8 7.2C20 16.3 12 21 12 21Z"/><path d="M6.5 12h3l1.5-3 2 6 1.4-3h3"/>',
    overview: '<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/>',
    raw: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M5.5 13h3l2-6 3 10 2-5h3"/>',
    pipeline: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.5 6h4a4 4 0 0 1 4 4v5.5M13 13l2.5 2.5L18 13"/>',
    control: '<path d="M4 7h10m4 0h2M4 17h3m4 0h9"/><path d="M14 4v6M8 14v6"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.1-5.4L4 9"/><path d="M4 4v5h5M12 8v5l3 2"/>',
    eye: '<path d="M2.5 12s3.3-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.3 5.5-9.5 5.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    trash: '<path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/>',
    build: '<path d="M14 4 20 10 10 20H4v-6L14 4Z"/><path d="m12 6 6 6M3 21h18"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21v-1.5c0-3.6 3.3-6.5 7.5-6.5s7.5 2.9 7.5 6.5V21"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    logout: '<path d="M10 5H5v14h5M14 8l4 4-4 4m4-4H9"/>',
    chevron: '<path d="m7 9 5 5 5-5"/>',
    collapse: '<path d="m14 7-5 5 5 5"/>',
    more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  };

  const NAVIGATION = [
    {
      id: "main",
      label: "Main Menu",
      items: [
        { id: "dashboard", label: "Dashboard", icon: "dashboard" },
        { id: "daily-retention", label: "Daily Retention", icon: "retention" },
        { id: "ai-insight", label: "AI Chat Bot", icon: "sparkles" },
      ],
    },
    {
      id: "admin",
      label: "Admin Panel",
      permission: "view_admin_panel",
      items: [
        { id: "user-access", label: "User Access", icon: "users", permission: "manage_user_access" },
        {
          id: "data-health",
          label: "Data Health",
          icon: "health",
          permission: "view_data_health",
          children: [
            { id: "data-health-overview", label: "Overview", icon: "overview", permission: "view_data_health" },
            { id: "check-raw", label: "Check Raw", icon: "raw", permission: "run_raw_check" },
            { id: "pipeline-check", label: "Pipeline Check", icon: "pipeline", permission: "run_pipeline_check" },
          ],
        },
        {
          id: "data-control",
          label: "Data Control",
          icon: "control",
          permission: "view_data_control_history",
          children: [
            { id: "data-control-history", label: "History", icon: "history", permission: "view_data_control_history" },
            { id: "data-control-preview", label: "Preview", icon: "eye", permission: "run_data_preview" },
            { id: "data-control-clear", label: "Clear", icon: "trash", permission: "run_data_clear" },
            { id: "data-control-build", label: "Build", icon: "build", permission: "run_data_build" },
          ],
        },
      ],
    },
  ];

  const css = String.raw`
    :host {
      display:block;
      width:100%;
      height:100%;
      color:#596579;
      font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","Sukhumvit Set","Thonburi","Sarabun",sans-serif;
      --surface:#eef2f7;
      --surface-2:#f7f9fc;
      --ink:#171a21;
      --sub:#748095;
      --line:rgba(121,136,159,.14);
      --warm:#f47a25;
      --shadow:12px 12px 28px rgba(135,149,170,.16),-10px -10px 24px rgba(255,255,255,.88);
      --shadow-sm:7px 7px 18px rgba(135,149,170,.12),-7px -7px 16px rgba(255,255,255,.82);
    }
    * { box-sizing:border-box; }
    button,a { font:inherit; }
    button { border:0; }
    .shell {
      position:relative;
      height:100%;
      min-height:0;
      display:flex;
      flex-direction:column;
      border:1px solid rgba(255,255,255,.78);
      border-radius:24px;
      background:linear-gradient(145deg,rgba(247,249,252,.94),rgba(232,237,244,.92));
      box-shadow:var(--shadow);
      overflow:visible;
      backdrop-filter:blur(20px);
    }
    .brand {
      min-height:70px;
      display:grid;
      grid-template-columns:38px minmax(0,1fr) 31px;
      gap:9px;
      align-items:center;
      padding:15px 13px 10px;
    }
    .brand-mark {
      width:38px;height:38px;border-radius:12px;
      display:grid;place-items:center;color:#fff;
      background:linear-gradient(145deg,#292d35,#111318);
      box-shadow:0 11px 22px rgba(20,24,31,.18);
    }
    .brand-copy { min-width:0; }
    .brand-name { color:var(--ink);font-size:15.5px;font-weight:720;letter-spacing:-.025em;white-space:nowrap; }
    .brand-sub { margin-top:3px;color:var(--sub);font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap; }
    .toggle {
      width:31px;height:31px;border-radius:10px;display:grid;place-items:center;cursor:pointer;
      color:#667389;background:rgba(255,255,255,.54);box-shadow:var(--shadow-sm);
    }
    .toggle:hover { color:var(--ink);transform:translateY(-1px); }
    .scroll { min-height:0;flex:1;overflow:auto;padding:4px 11px 12px;scrollbar-width:thin; }
    .group + .group { margin-top:19px; }
    .group-label { margin:0 9px 7px;color:#8a94a5;font-size:8.8px;font-weight:760;letter-spacing:.10em;text-transform:uppercase; }
    .list { display:grid;gap:4px; }
    .item,.parent,.child {
      width:100%;min-height:38px;display:flex;align-items:center;gap:9px;padding:0 11px;
      border-radius:13px;color:#667389;background:transparent;text-decoration:none;text-align:left;cursor:pointer;
      transition:transform .16s ease,background .16s ease,color .16s ease,box-shadow .16s ease;
    }
    .item:hover,.parent:hover,.child:hover { color:var(--ink);background:rgba(255,255,255,.60);box-shadow:var(--shadow-sm);transform:translateY(-1px); }
    .item.active,.child.active {
      color:#fff;background:linear-gradient(145deg,#2a2d34,#15171c);
      box-shadow:0 12px 24px rgba(18,21,27,.20),inset 0 1px 0 rgba(255,255,255,.08);
    }
    .parent.section-active { color:var(--ink);font-weight:690; }
    .nav-text { min-width:0;flex:1;font-size:12px;font-weight:620;white-space:nowrap; }
    .children { display:grid;grid-template-rows:0fr;transition:grid-template-rows .18s ease; }
    .children.open { grid-template-rows:1fr; }
    .children-inner { min-height:0;overflow:hidden;display:grid;gap:3px;padding-left:15px; }
    .child { min-height:34px;padding-left:9px; }
    .chevron { transition:transform .18s ease; }
    .parent[aria-expanded="true"] .chevron { transform:rotate(180deg); }
    .footer { position:relative;padding:11px; }
    /* CQR_SHARED_SIDEBAR_AUTH_PROFILE_FIX_V1 */
    .profile {
      width:100%;min-height:62px;display:grid;grid-template-columns:36px minmax(0,1fr) 20px;gap:10px;align-items:center;
      padding:9px;border-radius:15px;color:var(--ink);background:rgba(255,255,255,.55);box-shadow:var(--shadow-sm);cursor:pointer;text-align:left;
    }
    .avatar { width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(145deg,#fff0df,#f2cfa8);color:#8a4707;font-size:11.5px;font-weight:800; }
    .profile-copy {
      min-width:0;overflow:hidden;display:grid;gap:3px;align-content:center;line-height:1.2;
    }
    .profile-name {
      display:block;min-width:0;color:var(--ink);font-size:12px;font-weight:720;line-height:1.25;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    }
    .profile-meta {
      display:block;min-width:0;margin:0;color:var(--sub);font-size:8.6px;line-height:1.25;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    }
    .popover {
      display:none;position:absolute;z-index:30;left:11px;right:11px;bottom:72px;padding:8px;border:1px solid rgba(255,255,255,.80);border-radius:15px;
      background:rgba(246,248,251,.98);box-shadow:0 22px 45px rgba(79,92,112,.22);
    }
    .popover.open { display:grid;gap:4px; }
    .menu-item { min-height:38px;display:flex;align-items:center;gap:9px;padding:0 10px;border-radius:10px;background:transparent;color:#596579;cursor:pointer;text-align:left; }
    .menu-item:hover { background:#fff;color:var(--ink); }
    .menu-item.signout { color:#a84917; }
    .icon { width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none; }
    .logo-icon { width:20px;height:20px; }
    .more { width:18px;height:18px;color:#7d8798; }
    :host([collapsed]) .brand { grid-template-columns:1fr;padding-inline:9px;justify-items:center; }
    :host([collapsed]) .brand-copy,:host([collapsed]) .group-label,:host([collapsed]) .nav-text,:host([collapsed]) .chevron,:host([collapsed]) .profile-copy,:host([collapsed]) .more { display:none; }
    :host([collapsed]) .toggle { position:absolute;z-index:3;top:18px;right:-8px;width:28px;height:28px; }
    :host([collapsed]) .scroll { padding-inline:9px; }
    :host([collapsed]) .item,:host([collapsed]) .parent,:host([collapsed]) .child { justify-content:center;padding:0; }
    :host([collapsed]) .children { display:none; }
    :host([collapsed]) .profile { grid-template-columns:1fr;padding:8px; }
    :host([collapsed]) .avatar { margin:auto; }
    :host([collapsed]) .popover { left:76px;right:auto;bottom:14px;width:190px; }
    @media (max-width:980px) {
      .shell { border-radius:18px; }
      .brand { min-height:62px;grid-template-columns:38px minmax(0,1fr) 31px;padding:10px 12px; }
      .scroll,.footer { display:none; }
      :host([collapsed]) .brand-copy { display:block; }
      :host([collapsed]) .brand { grid-template-columns:38px minmax(0,1fr) 31px;justify-items:stretch;padding:10px 12px; }
      :host([collapsed]) .toggle { position:static;width:31px;height:31px; }
    }
  `;

  function icon(name, className = "icon") {
    return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.dashboard}</svg>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parsePermissions(value) {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    if (typeof value === "string") return value.split(",").map((x) => x.trim()).filter(Boolean);
    return [];
  }

  function getSession() {
    try {
      const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }

  function getUser() {
    const session = getSession();
    const preview = new URLSearchParams(location.search).get("preview") === "1" || session?.sessionToken === "preview-session";
    const email = String(session?.email || (preview ? "local.preview@cqr.local" : "")).toLowerCase();
    const displayName = String(session?.name || session?.display_name || (preview ? "CQR Local Preview" : email || "CQR User"));
    const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "CQR";
    const role = String(session?.role_id || session?.role || (preview ? "super_admin" : "viewer")).toLowerCase();
    let permissions = parsePermissions(session?.permissions || session?.permissions_csv);
    if (preview || role === "super_admin") permissions = [...ALL_PERMISSIONS];
    return { email, displayName, initials, role, permissions, preview };
  }

  /* === CQR_PRODUCTION_ENTRY_ROUTING_START === */
  function isLocalV2Entry() {
    return /\/ui-v2-local\/app\/(?:dashboard-v2|copilot-v2)\.html$/i.test(location.pathname);
  }

  function isProductionEntry() {
    return !isLocalV2Entry();
  }


  function dashboardEntryName() {
    return isProductionEntry() ? "index.html" : "dashboard-v2.html";
  }


  function copilotEntryName() {
    return isProductionEntry() ? "copilot.html" : "copilot-v2.html";
  }


  function currentRoute() {
    if (/(?:dashboard-v2|index)\.html$/i.test(location.pathname)) return "dashboard";
    const route = String(location.hash || "").replace(/^#\/?/, "").split("?")[0].trim();
    return route || "dashboard";
  }
  /* === CQR_PRODUCTION_ENTRY_ROUTING_END === */

  function preservedPreview(target) {
    const current = new URLSearchParams(location.search);
    if (current.get("preview") === "1") target.searchParams.set("preview", "1");
    return target;
  }

  function routeUrl(route) {
    if (route === "dashboard") {
      return preservedPreview(new URL(`./${dashboardEntryName()}`, location.href));
    }
    const target = preservedPreview(new URL(`./${copilotEntryName()}`, location.href));
    target.hash = `/${route}`;
    return target;
  }

  function hasPermission(user, permission) {
    return !permission || user.permissions.includes(permission);
  }

  function itemAllowed(user, item) {
    if (hasPermission(user, item.permission)) return true;
    return Boolean(item.children?.some((child) => hasPermission(user, child.permission)));
  }

  class CqrSharedSidebar extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._onHashChange = () => this.render();
      this._onSessionChange = () => this.render();
      this._onDocumentClick = (event) => {
        if (!this.contains(event.target) && !this.shadowRoot?.contains(event.target)) this.closePopover();
      };
    }

    connectedCallback() {
      this.applyCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1", false);
      this.render();
      window.addEventListener("hashchange", this._onHashChange);
      window.addEventListener("cqr-dashboard-auth", this._onSessionChange);
      window.addEventListener("cqr-session-changed", this._onSessionChange);
      window.addEventListener("pageshow", this._onSessionChange);
      document.addEventListener("click", this._onDocumentClick);
    }

    disconnectedCallback() {
      window.removeEventListener("hashchange", this._onHashChange);
      window.removeEventListener("cqr-dashboard-auth", this._onSessionChange);
      window.removeEventListener("cqr-session-changed", this._onSessionChange);
      window.removeEventListener("pageshow", this._onSessionChange);
      document.removeEventListener("click", this._onDocumentClick);
    }

    applyCollapsed(collapsed, persist = true) {
      this.toggleAttribute("collapsed", collapsed);
      document.documentElement.style.setProperty(
        "--cqr-sidebar-current-width",
        collapsed ? "var(--cqr-sidebar-collapsed-width)" : "var(--cqr-sidebar-expanded-width)",
      );
      document.getElementById("app")?.classList.toggle("sidebar-collapsed", collapsed);
      document.body.classList.toggle("cqr-sidebar-collapsed", collapsed);
      if (persist) localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    }

    groupOpen(id) {
      const stored = localStorage.getItem(`${GROUP_PREFIX}${id}`);
      return stored == null ? true : stored === "1";
    }

    setGroupOpen(id, open) {
      localStorage.setItem(`${GROUP_PREFIX}${id}`, open ? "1" : "0");
    }

    renderSimple(item, route) {
      const active = item.id === route;
      return `<button class="item${active ? " active" : ""}" type="button" data-route="${item.id}" aria-current="${active ? "page" : "false"}" title="${escapeHtml(item.label)}">${icon(item.icon)}<span class="nav-text">${escapeHtml(item.label)}</span></button>`;
    }

    renderParent(item, route, user) {
      const children = item.children.filter((child) => hasPermission(user, child.permission));
      if (!children.length) return "";
      const open = this.groupOpen(item.id);
      const active = children.some((child) => child.id === route);
      const childHtml = children.map((child) => {
        const childActive = child.id === route;
        return `<button class="child${childActive ? " active" : ""}" type="button" data-route="${child.id}" aria-current="${childActive ? "page" : "false"}" title="${escapeHtml(child.label)}">${icon(child.icon)}<span class="nav-text">${escapeHtml(child.label)}</span></button>`;
      }).join("");
      return `<div class="tree"><button class="parent${active ? " section-active" : ""}" type="button" data-group="${item.id}" aria-expanded="${open}" title="${escapeHtml(item.label)}">${icon(item.icon)}<span class="nav-text">${escapeHtml(item.label)}</span>${icon("chevron", "icon chevron")}</button><div class="children${open ? " open" : ""}"><div class="children-inner">${childHtml}</div></div></div>`;
    }

    render() {
      const user = getUser();
      const route = currentRoute();
      const groups = NAVIGATION
        .filter((group) => hasPermission(user, group.permission))
        .map((group) => {
          const items = group.items
            .filter((item) => itemAllowed(user, item))
            .map((item) => item.children ? this.renderParent(item, route, user) : this.renderSimple(item, route))
            .join("");
          return items ? `<section class="group"><div class="group-label">${escapeHtml(group.label)}</div><div class="list">${items}</div></section>` : "";
        })
        .join("");

      this.shadowRoot.innerHTML = `
        <style>${css}</style>
        <aside class="shell" aria-label="CQR navigation">
          <div class="brand">
            <div class="brand-mark">${icon("logo", "icon logo-icon")}</div>
            <div class="brand-copy"><div class="brand-name">CQR REPORT</div><div class="brand-sub">Channel Quality</div></div>
            <button class="toggle" id="toggle" type="button" aria-label="ย่อหรือขยาย Sidebar" title="ย่อหรือขยาย Sidebar">${icon("collapse")}</button>
          </div>
          <div class="scroll">${groups}</div>
          <div class="footer">
            <button class="profile" id="profile-toggle" type="button" aria-expanded="false">
              <span class="avatar">${escapeHtml(user.initials)}</span>
              <span class="profile-copy"><span class="profile-name">${escapeHtml(user.displayName)}</span><span class="profile-meta">${escapeHtml(user.email || user.role)}</span></span>
              <span class="more">${icon("more")}</span>
            </button>
            <div class="popover" id="popover">
              <button class="menu-item" type="button" data-route="profile">${icon("profile")} Profile</button>
              <button class="menu-item" type="button" data-route="preferences">${icon("settings")} Preferences</button>
              <button class="menu-item signout" id="signout" type="button">${icon("logout")} Sign Out</button>
            </div>
          </div>
        </aside>`;
      this.bind();
    }

    bind() {
      this.shadowRoot.querySelector("#toggle")?.addEventListener("click", () => this.applyCollapsed(!this.hasAttribute("collapsed")));
      this.shadowRoot.querySelectorAll("[data-route]").forEach((button) => {
        button.addEventListener("click", () => {
          const route = button.getAttribute("data-route");
          if (!route) return;
          this.closePopover();
          const target = routeUrl(route);
          if (target.href === location.href) return;
          location.assign(target.href);
        });
      });
      this.shadowRoot.querySelectorAll("[data-group]").forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.getAttribute("data-group");
          const children = button.closest(".tree")?.querySelector(".children");
          const open = !children?.classList.contains("open");
          children?.classList.toggle("open", open);
          button.setAttribute("aria-expanded", String(open));
          if (id) this.setGroupOpen(id, open);
        });
      });
      const profile = this.shadowRoot.querySelector("#profile-toggle");
      profile?.addEventListener("click", (event) => {
        event.stopPropagation();
        const popover = this.shadowRoot.querySelector("#popover");
        const open = popover?.classList.toggle("open") || false;
        profile.setAttribute("aria-expanded", String(open));
      });
      this.shadowRoot.querySelector("#signout")?.addEventListener("click", () => {
        sessionStorage.removeItem(SESSION_KEY);
        try { window.google?.accounts?.id?.disableAutoSelect(); } catch {}
        location.replace(routeUrl("dashboard").href);
      });
    }

    closePopover() {
      this.shadowRoot?.querySelector("#popover")?.classList.remove("open");
      this.shadowRoot?.querySelector("#profile-toggle")?.setAttribute("aria-expanded", "false");
    }
  }

  if (!customElements.get("cqr-shared-sidebar")) customElements.define("cqr-shared-sidebar", CqrSharedSidebar);
  document.body.classList.add(currentRoute() === "dashboard" ? "cqr-page-dashboard" : "cqr-page-copilot");
})();
