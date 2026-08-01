# CQR UI V2 — Production Release Checklist

## BLOCKERS — ต้องผ่านก่อน Deploy

- [ ] เปิด `dashboard-v2.html` แบบไม่มี `?preview=1` แล้ว Sign in ด้วย Google Account จริง
- [ ] Approved account Login สำเร็จและ Dashboard โหลดข้อมูลจริง
- [ ] Unapproved / disabled account ถูกปฏิเสธ
- [ ] Normal user ไม่เห็น Admin Panel และเปิด Hash route ตรงไม่ได้
- [ ] Super Admin ใช้ User Access / Data Health / Check Raw / Pipeline Check ได้
- [ ] AI Insight ส่งคำถามจริงผ่าน Apps Script → n8n และตรวจคำตอบอย่างน้อย 12 รูปแบบ
- [ ] Check Raw เห็นสถานะ queued → running → completed/failed และ Reload แล้วยังติดตาม Request เดิม
- [ ] Data Control Preview ทำงานจริงแบบไม่ลบข้อมูล
- [ ] Clear / Build ทดสอบเฉพาะ Scope ที่อนุมัติ พร้อม Rollback plan
- [ ] Worker V8 Active และ Schedule ทำงานอัตโนมัติ

## Local Preview Security

- [ ] `?preview=1` ทำงานเฉพาะ localhost / 127.0.0.1 / ::1
- [ ] ห้ามใช้ `preview-session` เป็นหลักฐานว่า Production Auth ผ่าน
- [ ] Production URL ต้องไม่เติม `?preview=1`
- [ ] ตรวจว่าไม่มี mock result ถูกแสดงเป็นข้อมูลจริง

## Backend Permission Gap

- [ ] ตัดสินใจ Permission model: ปัจจุบัน Apps Script V20 ใช้ `requireSuperAdmin_` กับ Admin endpoints ทั้งหมด
- [ ] ถ้าต้องการ Data Viewer / Operator จริง ต้องเพิ่ม Backend permission enforcement ก่อน
- [ ] `allowed_games` / `allowed_regions` ยังไม่ถูกส่งกลับและ enforce อย่างสม่ำเสมอใน Dashboard/AI — ห้ามอ้างว่าเป็น Data Scope ที่ปลอดภัยจนกว่าจะแก้ Backend

## Deployment Packaging

- [ ] แปลง `dashboard-v2.html` → `index.html`
- [ ] แปลง `copilot-v2.html` → `copilot.html`
- [ ] แก้ Internal links จากชื่อ Local เป็นชื่อ Production
- [ ] เก็บ Backup ของ Production files ก่อน Replace
- [ ] ตรวจ Git diff เฉพาะไฟล์ UI ที่ตั้งใจแก้
- [ ] Smoke test GitHub Pages หลัง Deploy

## Authentication Regression

- [ ] Approved Google Account
- [ ] Unapproved Google Account
- [ ] Disabled account
- [ ] Expired session
- [ ] Sign Out ล้าง `cqr_auth`
- [ ] Direct admin route as normal user
- [ ] OAuth Authorized JavaScript Origins มี Production URL ที่ถูกต้อง

## Final Smoke Tests

- [ ] Dashboard: Game / Channel / Month / Monthly / Weekly / Week / Export
- [ ] AI: Game / Period / Suggested / Custom / Follow-up / Export / Clear / Timeout
- [ ] User Access: list / add / edit / delete protection
- [ ] Data Health: ALL and specific scope
- [ ] Check Raw: submit / polling / reload / terminal details
- [ ] Pipeline Check: scope and handoff
- [ ] History: เข้าใจว่าเป็น Browser-local; ตรวจ Central DB/n8n สำหรับ Audit กลาง
- [ ] Preview / Clear / Build: scope lock + confirmations + permissions
