# CQR Raw File Check Setup

## ไฟล์ที่ต้อง Import ใน n8n

ใช้ไฟล์นี้:

`CQR_N8N_Raw_Data_Check_WORKFLOW_V6_WEBHOOK_SERVICE.json`

Workflow นี้ใช้ได้ 2 แบบ:

- Auto: รันตาม Schedule เพื่อเช็ก Raw หลายเกม/หลายเดือน และบันทึกผลลง Central DB แท็บ `RawIngestionLogs`
- Manual: รับคำสั่งจาก Admin Panel ปุ่ม `CHECK RAW` ผ่าน Webhook

## หลัง Import ต้องทำอะไร

1. เปิด workflow ใน n8n
2. ตรวจว่า node `Webhook - Raw File Check` อยู่ต้นทาง
3. กด `Publish`
4. Copy Production URL ของ webhook path `cqr-raw-file-check-v1`
5. ไปที่ Apps Script > Project Settings > Script Properties
6. เพิ่ม property:

`CQR_N8N_RAW_CHECK_WEBHOOK_URL`

ค่าเป็น Production URL ของ webhook ที่ copy มา

7. กด Save ใน Apps Script
8. Deploy Web App ด้วย deployment เดิม

## วิธีใช้งานบนเว็บ

ไปที่ `Admin Panel > Data Control`

1. เลือก `Game`
2. เลือก `Month`
3. กด `CHECK RAW`

ผลลัพธ์ที่ควรเห็น:

- Raw File ปกติ: ไฟล์ Raw ครบ 5 Tab และ hash เหมือนรอบล่าสุด
- Raw File มีข้อมูลใหม่: ไฟล์ Raw ครบ 5 Tab แต่ hash เปลี่ยน แปลว่ามีรอบใหม่เข้ามา
- Raw File ยังไม่ครบ: ขาด Tab หรืออ่านข้อมูลไม่ได้

ถ้า Raw File มีข้อมูลใหม่ ให้กด `FIND` ต่อเพื่อหา run ที่เกี่ยวข้อง แล้วค่อยทำ `Preview > Clear > Build`
