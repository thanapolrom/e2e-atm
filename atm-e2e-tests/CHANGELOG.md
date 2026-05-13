# CHANGELOG — ATM E2E Tests

## [2026-05-13] — Acceptor mock + Deposit flow ครบ end-to-end

### proxy-payout.js — เพิ่ม Acceptor mode
| Endpoint | พฤติกรรม |
|---|---|
| `POST /api/CashDevice/EnableAcceptor` | เปิด acceptor mode, ตั้ง phase = P1 |
| `POST /api/CashDevice/DisableAcceptor` | ปิด acceptor mode |
| `GET /api/CashDevice/GetDeviceStatus/v2` | ถ้า acceptor เปิดอยู่ → คืน acceptor state machine; ถ้าปิด → คืน payout state เดิม |

**Acceptor state machine** (เลียนแบบ log จากอุปกรณ์จริง):
```
EnableAcceptor
  → P1:  { DeviceState: DISABLED, PollBuffer: [] }
  → P2:  { DeviceState: IDLE, PollBuffer: [IDLE] }
  → P3a: { DeviceState: IDLE, PollBuffer: [] }
  → P3b: { DeviceState: IDLE, PollBuffer: [] }
  → ACCEPTING: { PollBuffer: [ACCEPTING] }
  → ESCROW:    { PollBuffer: [ESCROW, CashEvent(value)] }
  → STACKING:  { PollBuffer: [STORED|STACKED, CashEvent(value), IDLE] }
  → (วนซ้ำต่อแบงค์ถัดไป หรือ DONE)
DisableAcceptor
```

**กฎ STORED vs STACKED:**
- 100฿ (10000 satang) และ 500฿ (50000 satang) → `STORED` (AcceptRoute = PAYOUT)
- 20฿, 50฿, 1000฿ → `STACKED` (AcceptRoute = CASHBOX)

**`/test/reset` รับ 2 รูปแบบ:**
- `{ notes: [{value}] }` → preset แบงค์ที่จะถูกใส่เข้า acceptor
- `{ denoms: [{value, count}] }` → reset สต็อกธนบัตรใน payout
- ทั้งคู่ส่งพร้อมกันได้

### proxy-itl.js — แก้ bug
- เพิ่ม `&& !path.includes('/api/CashDevice/')` ที่เงื่อนไข intercept `GetDeviceStatus` (line 261)
- ก่อนแก้: proxy-itl จะ intercept **ทุก** GetDeviceStatus รวมถึง SPECTRAL_PAYOUT ด้วย → mock ผิดตัว
- หลังแก้: `/api/CashDevice/GetDeviceStatus` ผ่านไปถึง proxy-payout ตามที่ควร

### Page Objects ใหม่ — deposit flow ครบ
| ไฟล์ | หน้าที่ |
|---|---|
| `test/pageobjects/deposit/account.page.js` | กรอกเลขที่บัญชีธนาคารปลายทาง |
| `test/pageobjects/deposit/amount.page.js` | เลือกจำนวนเงิน (preset หรือ custom amount) |
| `test/pageobjects/deposit/confirm.page.js` | ตรวจสอบและยืนยันข้อมูลก่อนฝาก |
| `test/pageobjects/deposit/cashinput.page.js` | หน้ารอใส่แบงค์จริง / mock |
| `test/pageobjects/deposit/receipt.page.js` | สรุปรายการ + ไม่พิมพ์สลิป |

### deposit.spec.js — ขยาย flow เป็น 11 ขั้นตอน
- Step 7: กรอกเลขบัญชีปลายทาง (`TEST_ACCOUNT = '0000000000'`)
- Step 8: กรอก custom amount (`DEPOSIT_AMOUNT = 1670` บาท)
- Step 9: ยืนยันข้อมูลการฝาก
- Step 10: เรียก `POST /test/reset` แจ้ง proxy-payout ก่อน `waitForPage()` แล้วกดยืนยัน
- Step 11: ไม่พิมพ์สลิป
- ลบ `browser.pause()` ที่ไม่จำเป็นออกทั้งหมด

### package.json — แก้ deposit script
- `npm run deposit` เปลี่ยนจาก `run-admin-refill.ps1` → `run-withdraw.ps1`
- เหตุผล: deposit ต้องการ proxy-payout รันอยู่ด้วย (เหมือน withdraw)

### Flow ฝากเงิน (11 ขั้นตอน) — ครบแล้ว
```
Main → ฝากเงินสด
→ เลือกธนาคาร (กสิกรไทย)
→ ยืนยันข้อกำหนด
→ กรอกบัตรประชาชน
→ กรอกเบอร์โทรศัพท์
→ กรอก OTP
→ กรอกเลขบัญชีปลายทาง
→ เลือกจำนวนเงิน (100 บาท)
→ ยืนยันข้อมูล
→ [reset acceptor] → รอหน้าฝากเงิน (mock รับแบงค์ STORED 100฿)
→ ไม่พิมพ์สลิป
```

---

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
