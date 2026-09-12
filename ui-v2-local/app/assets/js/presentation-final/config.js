const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value) {
  const [year, month] = String(value).split("-").map(Number);
  return `${THAI_MONTHS[month - 1] || value} ${year}`;
}

function monthRange(startMonth, endMonth = monthKey(new Date())) {
  const start = new Date(`${startMonth}-01T00:00:00`);
  const end = new Date(`${endMonth}-01T00:00:00`);
  const values = [];
  for (let cursor = new Date(end); cursor >= start; cursor.setMonth(cursor.getMonth() - 1)) {
    const value = monthKey(cursor);
    values.push({ value, label: monthLabel(value) });
  }
  return values;
}

function weeksForMonth(value) {
  const [year, month] = String(value).split("-").map(Number);
  const days = new Date(year, month, 0).getDate();
  return Array.from({ length: Math.ceil(days / 7) }, (_, index) => `${value}-W${index + 1}`);
}

const DATA_START_MONTH = "2026-02";
const MONTHS = monthRange(DATA_START_MONTH);

export const APP_CONFIG = Object.freeze({
  appName: "CQR Report",
  appVersion: "UI V2 Production V2 Direct Master",
  googleClientId: "496972749333-ddnqu2jefebjcuhj8koar6d66v510qou.apps.googleusercontent.com",
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbyZwor9CRKgKWTf2Zs0rTWHDo3qGniF7swEv1cszTHJ5oAZbKCiMzp_86UGUuiecI-mQQ/exec",
  dataStartMonth: DATA_START_MONTH,
  defaultRoute: "dashboard",
  defaultFilters: {
    game: "ALL",
    month: "ALL",
    channel: "ALL",
    periodType: "month",
    week: "2026-07-W5",
  },
  games: [
    { value: "ALL", label: "All Games" },
    { value: "CBM_TH", label: "CBM TH" },
    { value: "CBM_SEA", label: "CBM SEA" },
    { value: "CBPC_TH", label: "CBPC TH" },
    { value: "CBPC_SEA", label: "CBPC SEA" },
  ],
  months: MONTHS,
  weeksByMonth: Object.fromEntries(MONTHS.map((item) => [item.value, weeksForMonth(item.value)])),
  channels: [
    { value: "ALL", label: "All Channels" },
    { value: "Facebook Ads", label: "Facebook Ads" },
    { value: "Google Ads", label: "Google Ads" },
    { value: "In-App Register", label: "In-App Register" },
    { value: "Organic / Unknown", label: "Organic / Unknown" },
    { value: "Other Campaign", label: "Other Campaign" },
  ],
});
