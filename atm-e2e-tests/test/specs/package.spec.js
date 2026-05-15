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
const PACKAGE_AMOUNT   = 500;  // บาท — ใส่เผื่อครอบทุกแพ็กเกจ (เงินส่วนเกินเก็บเป็นเครดิต)

// AIS — 6 tabs, 26 packages
const AIS_TABS = [
    { name: 'แนะนำ',         tab: null,                                count: 6 },
    { name: 'เน็ตไม่อั้น',   tab: PackageListPage.tabเน็ตไม่อั้น,    count: 6 },
    { name: 'แพ็กเสริมเน็ต', tab: PackageListPage.tabแพ็กเสริมเน็ต,  count: 3 },
    { name: 'เน็ต 3G/4G',    tab: PackageListPage.tabเน็ต3G4G,        count: 4 },
    { name: 'เน็ต 5G',       tab: PackageListPage.tabเน็ต5G,          count: 3 },
    { name: 'บันเทิง',       tab: PackageListPage.tabบันเทิง,         count: 4 },
];

// True — 4 tabs, 21 packages
const TRUE_TABS = [
    { name: 'แนะนำ',          tab: null,                               count: 6 },
    { name: 'เน็ตไม่อั้น',    tab: PackageListPage.tabเน็ตไม่อั้น,    count: 6 },
    { name: 'เน็ตเต็มสปีด',   tab: PackageListPage.tabเน็ตเต็มสปีด,   count: 6 },
    { name: 'เน็ต + โทรฟรี',  tab: PackageListPage.tabเน็ตโทรฟรี,     count: 3 },
];

// DTAC — 6 tabs, 27 packages
const DTAC_TABS = [
    { name: 'แนะนำ',          tab: null,                               count: 6 },
    { name: 'เน็ตไม่อั้น',    tab: PackageListPage.tabเน็ตไม่อั้น,    count: 6 },
    { name: 'เน็ตเต็มสปีด',   tab: PackageListPage.tabเน็ตเต็มสปีด,   count: 6 },
    { name: 'เน็ต + โทร',     tab: PackageListPage.tabเน็ตโทร,         count: 4 },
    { name: 'บันเทิง',        tab: PackageListPage.tabบันเทิง,         count: 4 },
    { name: 'โทรทุกค่าย',     tab: PackageListPage.tabโทรทุกค่าย,      count: 1 },
];

async function doBuyPackageFlow(networkName, selectNetwork, tabSelector = null, packageIndex = 0) {
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

    log.step(6, `เลือกแพ็กเกจที่ ${packageIndex + 1}`);
    await PackageListPage.selectByIndex(packageIndex, tabSelector);
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

function buildSuite(networkLabel, selectNetwork, tabs) {
    tabs.forEach(({ name, tab, count }) => {
        describe(`ซื้อแพ็กเสริม ${networkLabel} — ${name}`, () => {
            for (let i = 0; i < count; i++) {
                // [smoke] tag ใช้ grep ASCII ได้โดยไม่มีปัญหา encoding
                const smoke = !tab && i === 0;
                const title = smoke ? `[smoke] แพ็กเกจที่ 1` : `แพ็กเกจที่ ${i + 1}`;
                it(title, async () => {
                    log.banner(`ซื้อแพ็กเสริม ${networkLabel} ${name} แพ็กเกจที่ ${i + 1}`);
                    await doBuyPackageFlow(
                        `${networkLabel} แพ็กเกจเสริม`,
                        selectNetwork, tab, i,
                    );
                });
            }
        });
    });
}

buildSuite('เอไอเอส', () => PackageNetworkPage.selectAIS(),  AIS_TABS);
buildSuite('ทรู',      () => PackageNetworkPage.selectTrue(), TRUE_TABS);
buildSuite('ดีแทค',    () => PackageNetworkPage.selectDTAC(), DTAC_TABS);
