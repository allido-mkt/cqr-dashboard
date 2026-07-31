import { NAVIGATION } from "./navigation.js";
import { hasPermission } from "./permissions.js";
import { getState, setRoute, toggleGroup, toggleSidebar } from "./state.js";
import { icon } from "./ui.js";
import { signOutAndRedirect } from "./session.js";

function allowed(item, user) { return !item.permission || hasPermission(user, item.permission); }
function containsRoute(item, route) { return item.id === route || Boolean(item.children?.some((child) => child.id === route)); }
function simpleItem(item, state) {
  const active = item.id === state.route;
  const className = `nav-item${active ? " active" : ""}`;
  const content = `${icon(item.icon,"nav-icon")}<span class="nav-text">${item.label}</span>`;
  if (item.href) return `<a class="${className}" href="${item.href}" aria-current="${active ? "page" : "false"}" title="${item.label}">${content}</a>`;
  return `<button class="${className}" type="button" data-route="${item.id}" aria-current="${active ? "page" : "false"}" title="${item.label}">${content}</button>`;
}
function parentItem(item, state) {
  const open = Boolean(state.openGroups[item.id]);
  const sectionActive = containsRoute(item, state.route);
  const children = item.children.filter((child) => allowed(child, state.user)).map((child) => {
    const active = child.id === state.route;
    return `<button class="nav-child${active ? " active" : ""}" type="button" data-route="${child.id}" aria-current="${active ? "page" : "false"}" title="${child.label}">${icon(child.icon,"nav-icon")}<span class="nav-text">${child.label}</span></button>`;
  }).join("");
  if (!children) return "";
  return `<div class="nav-tree"><button class="nav-parent${sectionActive ? " section-active" : ""}" type="button" data-group="${item.id}" aria-expanded="${open}" title="${item.label}">${icon(item.icon,"nav-icon")}<span class="nav-text">${item.label}</span>${icon("chevron","nav-chevron")}</button><div class="nav-children${open ? " open" : ""}"><div class="nav-children-inner">${children}</div></div></div>`;
}
export function renderSidebar() {
  const state = getState();
  const groups = NAVIGATION.filter((group) => !group.permission || hasPermission(state.user, group.permission)).map((group) => {
    const items = group.items.filter((item) => allowed(item, state.user)).map((item) => item.children ? parentItem(item,state) : simpleItem(item,state)).join("");
    return items ? `<section class="nav-group"><div class="nav-group-label">${group.label}</div><div class="nav-list">${items}</div></section>` : "";
  }).join("");
  return `<div class="brand-block"><div class="brand-mark">${icon("logo")}</div><div class="brand-copy"><div class="brand-name">CQR Report</div><div class="brand-subtitle">Channel Quality</div></div><button class="sidebar-toggle" id="sidebar-toggle" type="button" aria-label="ย่อหรือขยาย Sidebar" title="ย่อหรือขยาย Sidebar">${icon("collapse")}</button></div><div class="sidebar-scroll">${groups}</div><div class="sidebar-footer"><button class="profile-card" id="profile-menu-toggle" type="button" aria-expanded="false"><div class="profile-avatar">${state.user.initials}</div><div class="profile-copy"><div class="profile-name">${state.user.displayName}</div><div class="profile-meta">${state.user.email}</div></div><span class="profile-more">${icon("more","nav-icon")}</span></button><div class="profile-popover" id="profile-popover"><button class="profile-menu-item" type="button" data-route="profile">${icon("profile","nav-icon")} Profile</button><button class="profile-menu-item" type="button" data-route="preferences">${icon("settings","nav-icon")} Preferences</button><button class="profile-menu-item signout" id="signout-button" type="button">${icon("logout","nav-icon")} Sign Out</button></div></div>`;
}
export function bindSidebarEvents() {
  const sidebar = document.getElementById("sidebar");
  sidebar?.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.route)));
  sidebar?.querySelectorAll("[data-group]").forEach((button) => button.addEventListener("click", () => toggleGroup(button.dataset.group)));
  document.getElementById("sidebar-toggle")?.addEventListener("click", toggleSidebar);
  const toggle = document.getElementById("profile-menu-toggle");
  const popover = document.getElementById("profile-popover");
  toggle?.addEventListener("click", (event) => { event.stopPropagation(); const open = popover.classList.toggle("open"); toggle.setAttribute("aria-expanded", String(open)); });
  popover?.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => { popover?.classList.remove("open"); toggle?.setAttribute("aria-expanded", "false"); }, { once:true });
  document.getElementById("signout-button")?.addEventListener("click", signOutAndRedirect);
}
