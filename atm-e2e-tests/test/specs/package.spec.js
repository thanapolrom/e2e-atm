import MainPage           from '../pageobjects/main.page.js';
import CitizenPage        from '../pageobjects/deposit/citizen.page.js';
import TopupServicePage   from '../pageobjects/topup/service.page.js';
import PackageNetworkPage from '../pageobjects/package/network.page.js';
import TopupPhonePage     from '../pageobjects/topup/phone.page.js';
import PackageListPage    from '../pageobjects/package/packagelist.page.js';
import PackageConfirmPage from '../pageobjects/package/confirm.page.js';
import TopupCashInputPage from '../pageobjects/topup/cashinput.page.js';
import PackageReceiptPage from '../pageobjects/package/receipt.page.js';
import { log }            from '../helpers/logger.js';

const TEST_CITIZEN_ID  = '8777777777776';
const TEST_PHONE       = '0000000000';
const PACKAGE_AMOUNT   = 100;  // บาท — ใส่เผื่อให้ครอบทุกแพ็กเกจ (เงินส่วนเกินเก็บเป็นเครดิต)

async function doBuyPackageFlow(networkName, selectNetwork) {
    log.step(1, 'รอหน้าเมนูหลัก แล้วกดเติมเงินมือถือ/ซื้อแพ็กเสริม');
    await MainPage.waitForPage(MainPage.screen);
    await MainPage.click(MainPage.topupBtn);
    log.pass('กดเติมเงินมือถือสำเร็จ');

    log.step(2, 'เลือกบริการ — ซื้อแพ็กเสริม');
    await TopupServicePage.selectBuyPackage();
    log.pass('เลือกซื้อแพ็กเสริมสำเร็จ');

    log.step(3, `เลือกเครือข่าย — ${networkName}`);
    await selectNetwork();
    log.pass(`เลือก ${networkName} สำเร็จ`);

    log.step(4, 'กรอกเลขบัตรประชาชน');
    await CitizenPage.enterCitizenId(TEST_CITIZEN_ID);
    await CitizenPage.confirm();
    log.pass('กรอกบัตรประชาชนสำเร็จ');

    log.step(5, 'กรอกเบอร์โทรศัพท์');
    await TopupPhonePage.enterPhone(TEST_PHONE);
    await TopupPhonePage.confirm();
    log.pass('กรอกเบอร์สำเร็จ');

    log.step(6, 'เลือกแพ็กเกจ — รายการแรกที่แสดง');
    await PackageListPage.selectFirst();
    log.pass('เลือกแพ็กเกจสำเร็จ');

    log.step(7, 'ตรวจสอบและยืนยันข้อมูล');
    await PackageConfirmPage.confirm();
    log.pass('ยืนยันข้อมูลสำเร็จ');

    log.step(8, 'รอหน้าใส่เงิน — proxy จำลองการรับแบงค์ แล้วกดยืนยัน');
    await fetch('http://127.0.0.1:5004/test/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: PACKAGE_AMOUNT * 100 }),
    });
    await TopupCashInputPage.waitForPage();
    log.pass('อยู่หน้าใส่เงินแล้ว');
    await TopupCashInputPage.confirm();
    log.pass('กดยืนยันสำเร็จ');

    log.step(9, 'หน้าสรุป → ไม่พิมพ์สลิป');
    await PackageReceiptPage.skipPrint();
    log.pass('จบ flow สำเร็จ');

    log.done(`จบ flow ซื้อแพ็กเสริม ${networkName}`);
}

describe('ซื้อแพ็กเสริม AIS — happy path', () => {
    it('ซื้อแพ็กเสริม AIS (แพ็กเกจแรก)', async () => {
        log.banner('ซื้อแพ็กเสริม AIS (แพ็กเกจแรก)');
        await doBuyPackageFlow('เอไอเอส แพ็กเกจเสริม', () => PackageNetworkPage.selectAIS());
    });
});

describe('ซื้อแพ็กเสริม True — happy path', () => {
    it('ซื้อแพ็กเสริม True (แพ็กเกจแรก)', async () => {
        log.banner('ซื้อแพ็กเสริม True (แพ็กเกจแรก)');
        await doBuyPackageFlow('ทรู แพ็กเกจเสริม', () => PackageNetworkPage.selectTrue());
    });
});

describe('ซื้อแพ็กเสริม DTAC — happy path', () => {
    it('ซื้อแพ็กเสริม DTAC (แพ็กเกจแรก)', async () => {
        log.banner('ซื้อแพ็กเสริม DTAC (แพ็กเกจแรก)');
        await doBuyPackageFlow('ดีแทค แพ็กเกจเสริม', () => PackageNetworkPage.selectDTAC());
    });
});
