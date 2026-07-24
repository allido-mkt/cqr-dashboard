# CQR Dashboard Production Runbook

เอกสารนี้ใช้สำหรับดูแลหน้า Production ของ CQR Dashboard หลังขึ้น GitHub Pages แล้ว

## 1. ลิงก์ใช้งานจริง

- Dashboard: https://allido-mkt.github.io/cqr-dashboard/
- GitHub repo: https://github.com/allido-mkt/cqr-dashboard
- Apps Script Web App: `https://script.google.com/macros/s/AKfycbzkTPioC-JPSdZI5df1WDPIsRwlHOxepSOPNZzafX_OMSLsO8Ec0864PP5d6lEKgGdYMQ/exec`

## 2. ไฟล์สำคัญ

- `index.html` - หน้า Dashboard หลักที่ GitHub Pages ใช้งาน
- `cqr_data_v7.js` - ไฟล์ Data ที่ Dashboard อ่าน
- `index_single_backup.html` - ไฟล์สำรองแบบรวมทุกอย่างไว้ในไฟล์เดียว
- `README.md` - สรุปสถานะ repo และ config หลัก

## 3. รายชื่ออีเมลที่เข้า Dashboard ได้

ตอนนี้ whitelist อยู่ใน `index.html`

- `bwm.workco@gmail.com`
- `eveningbs@gmail.com`
- `ksbing34@gmail.com`
- `mkt.performance.center@gmail.com`
- `tipchareon.t@gmail.com`

## 4. วิธีเพิ่มหรือลบอีเมลที่เข้าได้

1. เปิดไฟล์ `index.html`
2. ค้นหาคำว่า `allowedEmails`
3. เพิ่มหรือลบอีเมลใน list นั้น
4. Commit และ push ขึ้น GitHub
5. รอ GitHub Pages deploy ประมาณ 1-3 นาที
6. ให้คนที่ถูกเพิ่มลองเข้า Dashboard ด้วย Google account ของตัวเอง

ข้อควรระวัง:

- ห้ามใส่ `client_secret` ลงใน `index.html`
- อีเมลควรใช้ตัวพิมพ์เล็กทั้งหมด
- ถ้าเพิ่มหลายคน ควรให้ทีมยืนยันอีเมล Google ที่ใช้จริงก่อน

## 5. วิธีอัปเดตข้อมูลเดือนหรือวีคถัดไป

ไฟล์ที่ต้องอัปเดตคือ `cqr_data_v7.js`

ขั้นตอนทำงาน:

1. ขอไฟล์ data export จาก Martech ให้ครบ 4 เกม
2. ตรวจว่าแต่ละเกมมี tab ตาม pattern เดียวกัน เช่น `DAU_YYYY-MM`, `Registered_YYYY-MM`, `Returners_YYYY-MM`, `Late_Starters_YYYY-MM`, `Login_YYYY-MM`
3. แปลง/Mapping data ออกมาเป็น `cqr_data_v7.js`
4. วางไฟล์ใหม่ทับไฟล์เดิมใน repo
5. เปิด Dashboard เช็ก Monthly และ Weekly view
6. Commit และ push ขึ้น GitHub
7. รอ deploy แล้วเปิดลิงก์จริงเพื่อตรวจซ้ำ

เช็กก่อนส่ง Production:

- ตัวเลข Register มี comma ถูกต้อง
- Monthly/Weekly filter ใช้งานได้
- Player Type Breakdown มีข้อมูล
- Total User Retention ใช้ same-cohort cumulative retention
- D30 แสดงเฉพาะเมื่อมี buffer login ครบ 30 วัน
- กราฟไม่หายบน browser ปกติและหน้าจอเล็ก

## 6. วิธี Publish ขึ้น GitHub Pages

หลังแก้ไฟล์ใน repo แล้วใช้คำสั่ง:

```bash
git add index.html cqr_data_v7.js README.md PRODUCTION_RUNBOOK.md
git commit -m "Update CQR dashboard"
git push origin main
```

GitHub Pages จะ deploy อัตโนมัติจาก branch `main` และ folder root

## 7. วิธีตรวจหลัง Deploy

1. เปิด https://allido-mkt.github.io/cqr-dashboard/
2. กด hard refresh ถ้ายังเห็นหน้าเก่า
3. Login ด้วยอีเมลที่อยู่ใน whitelist
4. เช็ก filter หลักทั้งหมด
5. เช็กข้อมูลเดือนล่าสุด
6. ส่งลิงก์ให้ทีมลองเปิดจากเครื่องอื่น

## 8. ปัญหาที่เจอบ่อย

### หน้าเว็บยังเป็นเวอร์ชั่นเก่า

ให้รอ 1-3 นาที แล้วกด hard refresh

บน Mac:

```text
Cmd + Shift + R
```

### Login ไม่ผ่าน

ให้เช็ก 3 จุด:

- อีเมลนั้นอยู่ใน whitelist ใน `index.html` หรือยัง
- Google OAuth มี JavaScript origin เป็น `https://allido-mkt.github.io`
- ใช้ Google account ถูกบัญชีหรือไม่

### Dashboard ขึ้น แต่กราฟไม่ขึ้น

ให้เช็กว่า `cqr_data_v7.js` ถูก upload ไปพร้อมกับ `index.html` หรือไม่

### Weekly view ไม่มีข้อมูล

ให้เช็กว่า data มี period key รายวีค เช่น `2026-06-W2`

## 9. ข้อควรทำก่อนประกาศใช้จริง

- ให้คนใน whitelist อย่างน้อย 2 คนลอง login
- ให้คนที่ไม่ได้อยู่ใน whitelist ลองเข้า เพื่อยืนยันว่าโดน block
- เก็บ screenshot หน้า Dashboard หลัง deploy
- แจ้งทีมว่า data source รอบนี้เป็น June และรองรับ Monthly/Weekly view แล้ว

