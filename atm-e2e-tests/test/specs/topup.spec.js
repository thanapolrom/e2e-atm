import MainPage           from '../pageobjects/main.page.js';
import CitizenPage        from '../pageobjects/deposit/citizen.page.js';
import TopupServicePage   from '../pageobjects/topup/service.page.js';
import TopupNetworkPage   from '../pageobjects/topup/network.page.js';
import TopupPhonePage     from '../pageobjects/topup/phone.page.js';
import TopupAmountPage    from '../pageobjects/topup/amount.page.js';
import TopupConfirmPage   from '../pageobjects/topup/confirm.page.js';
import TopupCashInputPage from '../pageobjects/topup/cashinput.page.js';
import TopupReceiptPage   from '../pageobjects/topup/receipt.page.js';
import { log }            from '../helpers/logger.js';

const TEST_CITIZEN_ID = '8777777777776';
const TEST_PHONE      = '0000000000';
const TOPUP_AMOUNT    = 500;   // บาท

async function doTopupFlow(networkName, selectNetwork) {
    log.step(1, 'รอหน้าเมนูหลัก แล้วกดเติมเงินมือถือ/ซื้อแพ็กเสริม');
    await MainPage.waitForPage(MainPage.screen);
    await MainPage.click(MainPage.topupBtn);
    log.pass('กดเติมเงินมือถือสำเร็จ');

    log.step(2, 'เลือกบริการ — เติมเงินมือถือ');
    await TopupServicePage.selectTopup();
    log.pass('เลือกเติมเงินมือถือสำเร็จ');

    log.step(3, `เลือกเครือข่าย — ${networkName}`);
    await selectNetwork();
    log.pass(`เลือก ${networkName} สำเร็จ`);

    log.step(4, 'กรอกเลขบัตรประชาชน');
    await CitizenPage.enterCitizenId(TEST_CITIZEN_ID);
    await CitizenPage.confirm();
    log.pass('กรอกบัตรประชาชนสำเร็จ');

    log.step(5, 'กรอกเบอร์โทรศัพท์ที่ต้องการเติมเงิน');
    await TopupPhonePage.enterPhone(TEST_PHONE);
    await TopupPhonePage.confirm();
    log.pass('กรอกเบอร์สำเร็จ');

    log.step(6, `เลือกจำนวนเงิน — ${TOPUP_AMOUNT} บาท`);
    await TopupAmountPage.selectAmount(TOPUP_AMOUNT);
    log.pass(`เลือก ${TOPUP_AMOUNT} บาทสำเร็จ`);

    log.step(7, 'ตรวจสอบและยืนยันข้อมูล');
    await TopupConfirmPage.confirm();
    log.pass('ยืนยันข้อมูลสำเร็จ');

    log.step(8, 'รอหน้าใส่เงิน — proxy จำลองการรับแบงค์ แล้วกดยืนยัน');
    await fetch('http://127.0.0.1:5004/test/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: TOPUP_AMOUNT * 100 }),
    });
    await TopupCashInputPage.waitForPage();
    log.pass('อยู่หน้าใส่เงินแล้ว');
    await TopupCashInputPage.confirm();
    log.pass('กดยืนยันสำเร็จ');

    log.step(9, 'หน้าสรุป → ไม่พิมพ์สลิป');
    await TopupReceiptPage.skipPrint();
    log.pass('จบ flow สำเร็จ');

    log.done(`จบ flow เติมเงินมือถือ ${networkName} ${TOPUP_AMOUNT} บาท`);
}

describe('เติมเงินมือถือ ทรู — happy path', () => {
    it(`เติมเงิน True ${TOPUP_AMOUNT} บาท`, async () => {
        log.banner(`เติมเงิน True ${TOPUP_AMOUNT} บาท`);
        await doTopupFlow('ทรู แบบเติมเงิน', () => TopupNetworkPage.selectTrue());
    });
});

describe('เติมเงินมือถือ AIS — happy path', () => {
    it(`เติมเงิน AIS ${TOPUP_AMOUNT} บาท`, async () => {
        log.banner(`เติมเงิน AIS ${TOPUP_AMOUNT} บาท`);
        await doTopupFlow('เอไอเอส วัน-ทู-คอล!', () => TopupNetworkPage.selectAIS());
    });
});

describe('เติมเงินมือถือ DTAC — happy path', () => {
    it(`เติมเงิน DTAC ${TOPUP_AMOUNT} บาท`, async () => {
        log.banner(`เติมเงิน DTAC ${TOPUP_AMOUNT} บาท`);
        await doTopupFlow('ดีแทค แบบเติมเงิน', () => TopupNetworkPage.selectDTAC());
    });
});
