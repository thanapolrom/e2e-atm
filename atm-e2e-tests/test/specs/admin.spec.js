import MainPage        from '../pageobjects/main.page.js';
import AdminLoginPage  from '../pageobjects/admin/login.page.js';
import CurrentCashPage from '../pageobjects/admin/currentcash.page.js';
import { tag }         from '../pageobjects/base.page.js';
import { log }         from '../helpers/logger.js';

const ADMIN_USER = 'sitsupqa01';
const ADMIN_PASS = 'Kbao#12345';
const PROXY_URL  = 'http://127.0.0.1:5002';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchProxyJson(path, options = {}, {
    retries = 5,
    retryDelayMs = 500,
} = {}) {
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(`${PROXY_URL}${path}`, options);

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Proxy responded ${response.status} ${response.statusText}: ${body}`);
            }

            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                return await response.json();
            }

            return null;
        } catch (error) {
            const cause = error?.cause?.message ? ` | cause: ${error.cause.message}` : '';
            lastError = new Error(`Proxy request failed (${path}) attempt ${attempt}/${retries}: ${error.message}${cause}`);

            if (attempt < retries) {
                await sleep(retryDelayMs);
                continue;
            }
        }
    }

    throw lastError;
}

// ── shared setup: login → เงินในตู้ → เติมเงิน → หน้ากรอกแบงค์ ──────────────
async function setupToFillBankPage() {
    await driver.switchContext('NATIVE_APP');
    log.step(1, 'รอหน้าเมนูหลัก');
    await MainPage.waitForPage(MainPage.screen);

    log.step(2, 'Login admin');
    await AdminLoginPage.openAdminPanel();
    await AdminLoginPage.login(ADMIN_USER, ADMIN_PASS);
    await AdminLoginPage.waitForPage(tag('screen_maServiceSelection'));
    log.pass('login admin สำเร็จ');

    log.step(3, 'กดเงินในตู้');
    await $('~btn_maServiceSelection_currentCash').click();
    await CurrentCashPage.waitForPage(CurrentCashPage.screen);
    log.pass('เข้าหน้าเงินในตู้สำเร็จ');

    log.step(4, 'กดเติมเงิน');
    await CurrentCashPage.goToRefillCash();
    log.pass('กดเติมเงินสำเร็จ');

    log.step(5, 'ตรวจสอบ dialog');
    try {
        await $('~dialog_customAlert').waitForDisplayed({ timeout: 2000 });
        await $('~btn_customAlert_enter').click();
        log.pass('กล่องล่างมีเงิน → กดดำเนินการต่อสำเร็จ');
    } catch {
        log.pass('กล่องล่างว่าง → ข้ามไปหน้าถัดไปเลย');
    }
    try {
        await $('~dialog_customAlert').waitForDisplayed({ timeout: 2000 });
        await $('~btn_customAlert_enter').click();
        log.pass('สลิปหมด → กดดำเนินการต่อสำเร็จ');
    } catch {
        log.pass('ไม่มี dialog สลิปหมด → ข้าม');
    }

    log.step(6, 'หน้าเติมเงินสดเข้าตู้ → กดเติมเงินสด');
    await $('~btn_fillBankDetail_submit').waitForDisplayed({ timeout: 10000 });
    await $('~btn_fillBankDetail_submit').click();
    log.pass('กดเติมเงินสดสำเร็จ');

    log.step(7, 'หน้าเติมเงิน');
    await $('~btn_fillBankForPayout_cancel').waitForDisplayed({ timeout: 10000 });
    log.pass('เข้าถึงหน้าเติมเงินสำเร็จ');
}

// ── core refill: จำลองแบงค์ → ยืนยัน → สรุป ──────────────────────────────────
async function runRefill(notes, stepOffset = 8) {
    const s = (n, msg) => log.step(stepOffset + n, msg);

    s(0, 'ตั้งค่า proxy จำลองแบงค์');
    await fetchProxyJson('/test/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
    });
    log.pass(`proxy พร้อม: ${notes.map(n => `${n.value/100}฿×${n.count}`).join(', ')}`);

    s(1, 'รอใส่แบงค์ครบ');
    await browser.waitUntil(async () => {
        const status = await fetchProxyJson('/test/status', {}, { retries: 3, retryDelayMs: 300 });
        if (!status.done) return false;
        return ($('~btn_fillBankForPayout_confirm')).isEnabled();
    }, { timeout: 120000, timeoutMsg: 'รอแบงค์ครบ timeout 120s' });
    log.pass('ใส่แบงค์ครบแล้ว');

    s(2, 'กดยืนยัน');
    await $('~btn_fillBankForPayout_confirm').click();
    log.pass('กดยืนยันสำเร็จ');

    s(3, 'รอ dialog ยืนยันยอดรวมขึ้นและปุ่ม enable');
    const confirmDialogBtn = $('~btn_refillCashModal_enter');
    await confirmDialogBtn.waitForEnabled({ timeout: 10000 });
    log.pass('dialog ยืนยันยอดรวมขึ้นและปุ่ม enable แล้ว');

    s(4, 'รอ countdown 5 วิแล้วกดยืนยัน');
    await browser.pause(5000);
    await confirmDialogBtn.click();
    log.pass('กดยืนยันใน dialog สำเร็จ');

    s(5, 'รอหน้าสรุปรายการ');
    await $('~screen_fillBankSummary').waitForDisplayed({ timeout: 30000 });
    log.pass('เข้าหน้าสรุปรายการสำเร็จ');

    s(6, 'กดเสร็จสิ้น');
    await $('~btn_fillBankSummary_done').click();
    log.pass('กดเสร็จสิ้นสำเร็จ');

    s(7, 'รอหน้าเมนู admin → กดออกจากระบบ');
    await $('~btn_maServiceSelection_logout').waitForDisplayed({ timeout: 10000 });
    await $('~btn_maServiceSelection_logout').click();
    log.pass('ออกจากระบบสำเร็จ');

    s(8, 'รอกลับหน้าเมนูหลัก');
    await driver.switchContext('NATIVE_APP');
    await MainPage.waitForPage(MainPage.screen);
    log.pass('กลับหน้าเมนูหลักสำเร็จ');
}

// ═══════════════════════════════════════════════════════════════
describe('Admin — เงินในตู้', () => {

    it('happy case — เติมแบงค์หลาย denomination', async () => {
        log.banner('happy case — เติมแบงค์หลาย denomination');
        await setupToFillBankPage();
        await runRefill([
            { value: 50000,  count: 2 },
            { value: 10000,  count: 2 },
            { value: 5000,   count: 2 },
            { value: 2000,   count: 2 },
            { value: 100000, count: 2 },
        ]);
        log.done('happy case จบ');
    });

    // it('case — เติมแบงค์ denomination เดียว (500฿)', async () => {
    //     log.banner('case — เติมแบงค์ denomination เดียว');
    //     await setupToFillBankPage();
    //     await runRefill([
    //         { value: 50000, count: 5 },
    //     ]);
    //     log.done('case denomination เดียวจบ');
    // });

});
