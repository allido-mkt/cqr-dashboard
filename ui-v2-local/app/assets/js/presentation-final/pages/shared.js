import { icon } from "../ui.js";
export function accessDeniedPage() {
  return `<article class="surface-card"><div class="empty-state">${icon("lock")}<h2 style="margin:12px 0 5px">Access denied</h2><p>บัญชีนี้ไม่มี Permission สำหรับหน้าที่ร้องขอ Route ถูกป้องกัน ไม่ใช่เพียงซ่อนเมนู</p></div></article>`;
}
