# CHANGELOG — ATM E2E Tests

## [2026-05-12] — Withdraw flow + Payout proxy mock

### Page Objects สร้างใหม่
| ไฟล์ | หน้าที่ |
|---|---|
| `test/pageobjects/withdraw.page.js` | เลือกธนาคาร (WithdrawBankPage) |
| `test/pageobjects/withdraw/terms.page.js` | ยืนยันข้อกำหนด |
| `test/pageobjects/withdraw/denomination.page.js` | แจ้งประเภทธนบัตรในตู้ |
| `test/pageobjects/withdraw/kplus-instruction.page.js` | แนะนำวิธีถอนผ่าน K PLUS (กดถัดไป) |
| `test/pageobjects/withdraw/kplus-check.page.js` | ตรวจสอบช่องทาง K PLUS (กดถูกต้องแล้ว) |
| `test/pageobjects/withdraw/qrcode.page.js` | สแกน QR Code (กดยืนยัน) |
| `test/pageobjects/withdraw/receipt.page.js` | สรุปรายการ + พิมพ์/ไม่พิมพ์สลิป |

### Spec
- `test/specs/withdraw.spec.js` — เขียนใหม่เป็น happy path 10 steps ตาม flow จริง

### Proxy
- `proxy-payout.js` (ใหม่) — mock SPECTRAL_PAYOUT dispenser device บน port 5000
  - `GET /api/CashDevice/GetAllLevels` → คืน 100฿×10 + 500฿×10
  - `POST /api/CashDevice/EnablePayout` → ตอบ success ทันที
  - `POST /api/CashDevice/DispenseValue` → คำนวณธนบัตร greedy + ตอบ COMPLETED ทันที
  - `GET /api/CashDevice/GetDeviceStatus/v2` → คืน DISPENSED + COMPLETED events
  - `POST /test/reset` + `GET /test/status` สำหรับ test control
- `package.json` — เพิ่ม `npm run proxy:payout`

### Flow ถอนเงิน (10 ขั้นตอน)
```
Main → ถอนเงินสด
→ เลือกธนาคาร (กสิกรไทย)
→ ยืนยันข้อกำหนด
→ ยืนยันประเภทธนบัตร
→ กรอกบัตรประชาชน
→ ดูวิธีถอน K PLUS (กดถัดไป)
→ ตรวจสอบช่องทาง (กดถูกต้องแล้ว)
→ สแกน QR Code (กดยืนยัน)
→ รอเงินออก (mock จ่ายทันที)
→ ไม่พิมพ์สลิป
```

### สิ่งที่ยังต้องทำ
- [ ] ตรวจ testTag แต่ละหน้าด้วย Appium Inspector แล้วแก้ใน page objects
- [ ] รัน proxy-payout.js บน port 5000 (ย้าย real device ไป 5004 ถ้ามี)
- [ ] เพิ่ม script รัน proxy-payout พร้อม test ใน run script

---

## [ก่อนหน้า] — Deposit + Topup + Admin flows

### สิ่งที่มีแล้ว
- `test/specs/deposit.spec.js` — ฝากเงินสด (กสิกรไทย, กรอก citizen ID, phone, OTP)
- `test/specs/topup.spec.js` — เติมเงินมือถือ (True 10 บาท, ITL cash input mock)
- `test/specs/admin.spec.js` — admin refill
- `proxy-itl.js` — mock NV200 bill acceptor (deposit device) บน port 5002
  - State machine: IDLE → ACCEPTING → ESCROW → STORING → STORED
  - `POST /test/reset` รับ `notes: [{value, count}]`
  - `GET /test/status` เช็คว่า mock ส่งแบงค์ครบยัง
