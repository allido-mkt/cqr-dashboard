import { renderSidebar } from "./sidebar.js";
import { getState, setRoute, setUser } from "./state.js";
import { getSavedSession, userFromSession, signOutAndRedirect } from "./session.js";

const ICONS = {
  game: '<svg class="app-icon" viewBox="0 0 24 24"><path d="M7 9h10a4 4 0 0 1 3.8 5.2l-1.1 3.3a2.4 2.4 0 0 1-4.2.7L14 16h-4l-1.5 2.2a2.4 2.4 0 0 1-4.2-.7l-1.1-3.3A4 4 0 0 1 7 9Z"/><path d="M8 12v3M6.5 13.5h3M16.5 13.5h.01M18.5 12.5h.01"/></svg>',
  month: '<svg class="app-icon" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  channel: '<svg class="app-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
};

function routeUrl(route) {
  if (route === "dashboard") return new URL("./dashboard-v2.html", location.href).href;
  return new URL(`./copilot-v2.html#/${route}`, location.href).href;
}

function bindSharedSidebar() {
  const session=getSavedSession();
  if(session) setUser(userFromSession(session));
  setRoute("dashboard");
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  sidebar.innerHTML = renderSidebar();

  const collapsedKey = "cqr_ui_sidebar_collapsed";
  document.body.classList.toggle("dashboard-sidebar-collapsed", getState().sidebarCollapsed);

  sidebar.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => { location.href = routeUrl(button.dataset.route); });
  });
  sidebar.querySelectorAll("[data-group]").forEach((button) => {
    button.addEventListener("click", () => {
      const children = button.closest(".nav-tree")?.querySelector(".nav-children");
      const open = !children?.classList.contains("open");
      children?.classList.toggle("open", open);
      button.setAttribute("aria-expanded", String(open));
    });
  });
  document.getElementById("sidebar-toggle")?.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("dashboard-sidebar-collapsed");
    localStorage.setItem(collapsedKey, collapsed ? "1" : "0");
  });

  const profileToggle = document.getElementById("profile-menu-toggle");
  const profilePopover = document.getElementById("profile-popover");
  profileToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = profilePopover?.classList.toggle("open") || false;
    profileToggle.setAttribute("aria-expanded", String(open));
  });
  profilePopover?.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => profilePopover?.classList.remove("open"));
  document.getElementById("signout-button")?.addEventListener("click", signOutAndRedirect);
}

function filterWrapper(select, label, iconName) {
  if (!select || select.closest(".dashboard-filter-control")) return select?.closest(".dashboard-filter-control");
  const wrapper = document.createElement("label");
  wrapper.className = "filter-control dashboard-filter-control";
  wrapper.dataset.dashboardFilter = select.id;
  select.parentNode.insertBefore(wrapper, select);
  wrapper.innerHTML = `${ICONS[iconName]}<span class="filter-copy"><span class="filter-label">${label}</span></span>`;
  wrapper.querySelector(".filter-copy").appendChild(select);
  return wrapper;
}

function setupDashboardHeader() {
  const heading = document.querySelector(".hbar > .brand-title");
  if (heading) {
    heading.className = "page-heading dashboard-page-heading";
    heading.innerHTML = '<div class="page-eyebrow">CQR Report</div><h1 class="page-title">Dashboard</h1><p class="page-description">Performance, Retention and Channel Quality overview</p>';
  }

  filterWrapper(document.getElementById("f-game"), "Game", "game");
  filterWrapper(document.getElementById("f-channel"), "Channel", "channel");
  filterWrapper(document.getElementById("f-month"), "Month", "month");
  const weekWrapper = filterWrapper(document.getElementById("f-week"), "Week", "month");
  weekWrapper?.classList.add("dashboard-week-control");

  const nativeView = document.getElementById("f-period-type");
  if (nativeView && !document.querySelector(".dashboard-period-segment")) {
    nativeView.classList.add("dashboard-native-view");
    const segment = document.createElement("div");
    segment.className = "period-segment dashboard-period-segment";
    segment.setAttribute("aria-label", "Period view");
    segment.innerHTML = '<button class="segment-button" type="button" data-dashboard-period="month">Monthly</button><button class="segment-button" type="button" data-dashboard-period="week">Weekly</button>';
    nativeView.parentNode.insertBefore(segment, nativeView);
    segment.appendChild(nativeView);

    segment.querySelectorAll("[data-dashboard-period]").forEach((button) => {
      button.addEventListener("click", () => {
        nativeView.value = button.dataset.dashboardPeriod;
        nativeView.dispatchEvent(new Event("change", { bubbles:true }));
        syncPeriodControls();
      });
    });
  }

  syncPeriodControls();
  document.getElementById("f-period-type")?.addEventListener("change", () => setTimeout(syncPeriodControls, 0));
}

function syncPeriodControls() {
  const view = document.getElementById("f-period-type")?.value || "month";
  document.querySelectorAll("[data-dashboard-period]").forEach((button) => button.classList.toggle("active", button.dataset.dashboardPeriod === view));
  const week = document.getElementById("f-week");
  const wrapper = week?.closest(".dashboard-week-control");
  wrapper?.classList.toggle("is-hidden", view !== "week" || week?.classList.contains("period-hidden"));
}

function init() {
  document.body.classList.add("shared-dashboard-shell");
  bindSharedSidebar();
  setupDashboardHeader();
  window.addEventListener("cqr-dashboard-auth", (event) => {
    if(event.detail) setUser(userFromSession(event.detail));
    bindSharedSidebar();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
else init();
