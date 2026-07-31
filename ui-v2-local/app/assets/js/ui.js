const ICONS = {
  logo: '<path d="M12 2.5 20 7.1v9.8L12 21.5 4 16.9V7.1L12 2.5Z"/><path d="m9 12 2 2 4-4"/>',
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="4" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/>',
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
  game: '<path d="M8 8h8l2.5 3v5.5a2 2 0 0 1-3.4 1.4L13.2 16h-2.4l-1.9 1.9a2 2 0 0 1-3.4-1.4V11L8 8Z"/><path d="M8 12h3m-1.5-1.5v3M15.5 11.5h.01M17.5 13.5h.01"/>',
  calendar: '<path d="M6 3v3m12-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/>',
  channel: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21M12 3C9.5 5.6 8.2 8.6 8.2 12S9.5 18.4 12 21"/>',
  export: '<path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 17v3h14v-3"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  database: '<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5m-14 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  warning: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  retention: '<path d="M4 18V6m0 12h16"/><path d="m6 8 4 4 3-2 5 5"/>',
  chart: '<path d="M4 20V10m5 10V5m5 15v-8m5 8V3"/>',
  filter: '<path d="M4 6h16M7 12h10m-7 6h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9m16 6-2 2.5A7 7 0 0 1 5.5 15"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  file: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5M9 12h6m-6 4h6"/>',
  queue: '<path d="M5 5h14M5 12h14M5 19h14"/><circle cx="3" cy="5" r=".5" fill="currentColor"/><circle cx="3" cy="12" r=".5" fill="currentColor"/><circle cx="3" cy="19" r=".5" fill="currentColor"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16"/>',
  download: '<path d="M12 4v11m-4-4 4 4 4-4M5 20h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};

export function icon(name, className = "app-icon") {
  const body = ICONS[name] || ICONS.dashboard;
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function optionMarkup(items, selectedValue) {
  return items.map((item) => `<option value="${escapeHtml(item.value)}"${item.value === selectedValue ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("");
}

export function showToast(message) {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 2900);
}

export function downloadText(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

export function statusPill(status, label) {
  const tone = ["completed", "ready", "healthy", "success", "ok", "raw_ready"].includes(status) ? "ready"
    : ["running", "queued", "pending"].includes(status) ? "running"
    : ["warning", "warn", "partial", "updated", "raw_updated", "raw_partial"].includes(status) ? "warning"
    : ["failed", "missing", "danger", "raw_missing"].includes(status) ? "danger" : "warm";
  return `<span class="status-pill ${tone}">${label || status}</span>`;
}

export function openConfirmModal({ title, message, confirmLabel = "Confirm", danger = false, onConfirm }) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-backdrop" id="confirm-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h3 id="confirm-title">${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="toolbar" style="justify-content:flex-end;margin-top:18px">
          <button class="button ghost" id="confirm-cancel" type="button">Cancel</button>
          <button class="button ${danger ? "danger" : "primary"}" id="confirm-ok" type="button">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    </div>`;
  const close = () => { root.innerHTML = ""; };
  document.getElementById("confirm-cancel")?.addEventListener("click", close);
  document.getElementById("confirm-backdrop")?.addEventListener("click", (event) => { if (event.target.id === "confirm-backdrop") close(); });
  document.getElementById("confirm-ok")?.addEventListener("click", () => { close(); onConfirm?.(); });
}
