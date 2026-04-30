import MainPage           from '../pageobjects/main.page.js';
import CitizenPage        from '../pageobjects/deposit/citizen.page.js';
import TopupServicePage   from '../pageobjects/topup/service.page.js';
import TopupNetworkPage   from '../pageobjects/topup/network.page.js';
import TopupPhonePage     from '../pageobjects/topup/phone.page.js';
import TopupAmountPage    from '../pageobjects/topup/amount.page.js';
import TopupConfirmPage   from '../pageobjects/topup/confirm.page.js';
import TopupCashInputPage from '../pageobjects/topup/cashinput.page.js';
import TopupReceiptPage   from '../pageobjects/topup/receipt.page.js';
import { authenticateITL, openConnection, enableAcceptor, waitForEscrow, acceptFromEscrow } from '../helpers/itl.helper.js';
import { log }            from '../helpers/logger.js';

const TEST_CITIZEN_ID = '9111124111754'; // TODO: เปลี่ยนเป็นข้อมูลจริง
const TEST_PHONE      = '0830443596';    // TODO: เปลี่ยนเป็นข้อมูลจริง

describe('เติมเงินมือถือ', () => {

    it('happy case — เติมเงิน True 10 บาท', async () => {
        log.banner('happy case — เติมเงิน True 10 บาท');

        log.step(1, 'รอหน้าเมนูหลัก');
        await MainPage.waitForPage(MainPage.screen);
        log.pass('อยู่หน้าเมนูหลักแล้ว');

        log.step(2, 'กดเติมเงินมือถือ/ซื้อแพ็กเสริม');
        await MainPage.click(MainPage.topupBtn);
        log.pass('กดเติมเงินมือถือสำเร็จ');

        log.step(3, 'เลือกบริการ — เติมเงินมือถือ');
        await TopupServicePage.selectTopup();
        log.pass('เลือกเติมเงินมือถือสำเร็จ');

        log.step(4, 'เลือกเครือข่าย — True');
        await TopupNetworkPage.selectTrue();
        log.pass('เลือก True สำเร็จ');

        log.step(5, 'กรอกเลขบัตรประชาชน');
        await CitizenPage.enterCitizenId(TEST_CITIZEN_ID);
        await CitizenPage.confirm();
        log.pass('กรอกบัตรประชาชนสำเร็จ');

        log.step(6, 'กรอกเบอร์โทรศัพท์ที่ต้องการเติมเงิน');
        await TopupPhonePage.enterPhone(TEST_PHONE);
        await TopupPhonePage.confirm();
        log.pass('กรอกเบอร์สำเร็จ');

        log.step(7, 'เลือกจำนวนเงิน — 10 บาท');
        await TopupAmountPage.selectAmount(10);
        log.pass('เลือกจำนวน 10 บาท สำเร็จ');

        log.step(8, 'ตรวจสอบและยืนยันข้อมูล');
        await TopupConfirmPage.confirm();
        log.pass('ยืนยันข้อมูลสำเร็จ');

        log.step(9, 'รอหน้าใส่เงิน + จำลองใส่แบงค์ 20 บาท (10 + 2 ค่าธรรมเนียม + เครดิต)');
        await TopupCashInputPage.waitForPage();
        const token = await authenticateITL();
        await openConnection(token);
        await enableAcceptor(token);
        await waitForEscrow(token);
        await acceptFromEscrow(token);
        log.pass('ใส่เงินสำเร็จ');

        log.step(10, 'กดยืนยันหลังใส่เงินครบ');
        await TopupCashInputPage.confirm();
        log.pass('กดยืนยันสำเร็จ');

        log.step(11, 'รอหน้าสรุป → ไม่พิมพ์สลิป');
        await TopupReceiptPage.skipPrint();
        log.pass('จบ flow สำเร็จ');

        log.done('จบ flow เติมเงินมือถือ');
    });

    // เพิ่ม case ใหม่ได้ที่นี่ เช่น เลือก AIS, DTAC หรือจำนวนเงินอื่น
    // it('case — เติมเงิน AIS 50 บาท', async () => { ... });

});
