import MainPage        from '../pageobjects/main.page.js';
import AdminLoginPage  from '../pageobjects/admin/login.page.js';
import CurrentCashPage from '../pageobjects/admin/currentcash.page.js';
import { tag }         from '../pageobjects/base.page.js';
import { log }         from '../helpers/logger.js';

const ADMIN_USER = 'sitsupqa01';
const ADMIN_PASS = 'Kbao#654321';
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

describe('Admin — เงินในตู้', () => {

    it('flow เติมเงิน — จำลองใส่แบงค์ 500x3 + 100x2', async () => {
        log.banner('flow เติมเงิน');

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

        log.step(7, 'หน้ากรอกจำนวนแบงค์');
        await $('~btn_fillBankForPayout_cancel').waitForDisplayed({ timeout: 10000 });
        log.pass('เข้าถึงหน้ากรอกจำนวนแบงค์สำเร็จ');

        // กำหนดแบงค์ที่จะจำลอง
        log.step(8, 'ตั้งค่า proxy จำลองแบงค์');
        await fetchProxyJson('/test/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                notes: [
                    { value: 50000, count: 3 }, 
                    { value: 10000, count: 2 }, 
                ]
            })
        });
        log.pass('ตั้งค่า proxy สำเร็จ');

        // รอให้ proxy ส่ง STORED ครบทุกใบก่อน แล้วค่อยรอปุ่มยืนยัน enable
        log.step(9, 'รอใส่แบงค์ครบ');
        await browser.waitUntil(async () => {
            const status = await fetchProxyJson('/test/status', {}, {
                retries: 3,
                retryDelayMs: 300,
            });
            if (!status.done) return false;
            const el = await $('~btn_fillBankForPayout_confirm');
            return el.isEnabled();
        }, { timeout: 120000, timeoutMsg: 'รอแบงค์ครบ timeout 120s' });
        log.pass('ใส่แบงค์ครบแล้ว');

        log.step(10, 'กดยืนยัน');
        await $('~btn_fillBankForPayout_confirm').click();
        log.pass('กดยืนยันสำเร็จ');

        log.step(11, 'รอ dialog ยืนยันยอดรวมขึ้น');
        const confirmDialogBtn = $('//android.view.ViewGroup/android.view.View/android.view.View/android.view.View[2]/android.widget.Button');
        await confirmDialogBtn.waitForDisplayed({ timeout: 10000 });
        log.pass('dialog ยืนยันยอดรวมขึ้นแล้ว');

        log.step(12, 'รอ countdown 7 วิแล้วกดยืนยัน');
        await browser.pause(7000);
        await confirmDialogBtn.click();
        log.pass('กดยืนยันใน dialog สำเร็จ');

        log.step(13, 'รอหน้าสรุปรายการ');
        await $('~screen_fillBankSummary').waitForDisplayed({ timeout: 10000 });
        log.pass('เข้าหน้าสรุปรายการสำเร็จ');

        log.step(14, 'กดเสร็จสิ้น');
        await $('~btn_fillBankSummary_done').click();
        log.pass('กดเสร็จสิ้นสำเร็จ');

        log.done('จบ flow เติมเงิน');
    });
});
