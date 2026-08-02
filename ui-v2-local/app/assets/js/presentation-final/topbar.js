import { APP_CONFIG } from "./config.js";
import { getState, setFilter, setFilters } from "./state.js";
import { icon, optionMarkup, showToast, downloadText } from "./ui.js";

const PAGE_META = {
  dashboard: ["Dashboard", "ภาพรวม Performance, Retention และ Channel Quality"],
  "ai-insight": ["AI Chat Bot", "วิเคราะห์ CQR แบบเต็มหน้าโดยอิง Game และ Period ที่เลือก"],
  "user-access": ["User Access", "จัดการผู้ใช้ Role และขอบเขตที่บันทึกใน Users table"],
  "data-health-overview": ["Data Health", "ภาพรวมความพร้อมของ Raw, Master และ Central DB"],
  "check-raw": ["Check Raw", "ส่งคำขอตรวจ Raw และติดตาม Queue จนเสร็จ"],
  "pipeline-check": ["Pipeline Check", "ตรวจความสอดคล้องระหว่าง Raw, Master และ Data Index"],
  "data-control-history": ["Data Control · History", "ประวัติการสั่งงานใน Browser นี้; ตรวจหลักฐานกลางที่ Central DB / n8n"],
  "data-control-preview": ["Data Control · Preview", "เลือก Game/Month แล้วตรวจขอบเขตก่อนแก้ข้อมูลจริง"],
  "data-control-clear": ["Data Control · Clear", "ล้างเฉพาะ Run ที่ผ่าน Preview แล้ว"],
  "data-control-build": ["Data Control · Build", "สร้าง Master ใหม่จาก Scope ที่ผ่านการตรวจสอบ"],
  profile: ["Profile", "ข้อมูลบัญชีและสิทธิ์ที่กำลังใช้งาน"],
  preferences: ["Preferences", "ค่าเริ่มต้นส่วนบุคคลของ CQR Report"],
};

const ALL_MONTH = { value: "ALL", label: "ทุกเดือน" };
const GAMES_SPECIFIC = APP_CONFIG.games.filter((item) => item.value !== "ALL");
const MONTHS_ALL = [ALL_MONTH, ...APP_CONFIG.months];
const MONTHS_SPECIFIC = APP_CONFIG.months;

function selectControl(name, label, iconName, items, value, hidden = false) {
  return `<label class="filter-control${hidden ? " is-hidden" : ""}">${icon(iconName)}<span class="filter-copy"><span class="filter-label">${label}</span><select data-filter="${name}">${optionMarkup(items, value)}</select></span></label>`;
}

function exportMenu() {
  return `<div class="export-menu" id="export-menu"><button class="export-trigger" id="export-trigger" type="button">${icon("export")} Export</button><div class="export-popover"><button class="export-option" data-export="csv" type="button">${icon("table","nav-icon")} Export current view CSV</button><button class="export-option" data-export="summary" type="button">${icon("file","nav-icon")} Export summary TXT</button><button class="export-option" data-export="print" type="button">${icon("download","nav-icon")} Print / Save PDF</button></div></div>`;
}

function renderActions() { return ""; }

export function renderTopbar() {
  const state = getState();
  const [title, description] = PAGE_META[state.route] || ["CQR Report", "Channel Quality Report"];
  const actions = renderActions(state.route, state);
  return `
    <div class="page-heading"><div class="page-eyebrow">CQR Report</div><h1 class="page-title">${title}</h1><p class="page-description">${description}</p></div>
    ${actions ? `<div class="topbar-actions">${actions}</div>` : ""}`;
}

function exportCurrentView(type) {
  const state = getState();
  const period = state.filters.periodType === "week" ? state.filters.week : state.filters.month;
  const base = `CQR Report\nPage: ${state.route}\nGame: ${state.filters.game}\nChannel: ${state.filters.channel}\nPeriod: ${period}\nGenerated: ${new Date().toLocaleString("th-TH")}`;
  if (type === "print") { window.print(); return; }
  if (type === "csv") {
    downloadText(`cqr-${state.route}-${period}.csv`, `page,game,channel,period\n${state.route},${state.filters.game},${state.filters.channel},${period}\n`, "text/csv;charset=utf-8");
  } else {
    downloadText(`cqr-${state.route}-${period}.txt`, base);
  }
  showToast("Export ไฟล์จาก Current View แล้ว");
}

export function bindTopbarEvents() {
  document.querySelectorAll("[data-filter]").forEach((select) => select.addEventListener("change", () => setFilter(select.dataset.filter, select.value)));
  document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => setFilters({ periodType: button.dataset.period })));
  const menu = document.getElementById("export-menu");
  document.getElementById("export-trigger")?.addEventListener("click", (event) => { event.stopPropagation(); menu.classList.toggle("open"); });
  menu?.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => { exportCurrentView(button.dataset.export); menu.classList.remove("open"); }));
  document.addEventListener("click", () => menu?.classList.remove("open"), { once: true });
}
