import MainPage                  from '../pageobjects/main.page.js';
import WithdrawBankPage           from '../pageobjects/withdraw.page.js';
import WithdrawTermsPage          from '../pageobjects/withdraw/terms.page.js';
import WithdrawDenominationPage   from '../pageobjects/withdraw/denomination.page.js';
import CitizenPage                from '../pageobjects/deposit/citizen.page.js';
import WithdrawKPlusGuidePage      from '../pageobjects/withdraw/kplus-instruction.page.js';
import WithdrawQRCodePage         from '../pageobjects/withdraw/qrcode.page.js';
import WithdrawReceiptPage        from '../pageobjects/withdraw/receipt.page.js';
import { log }                    from '../helpers/logger.js';

const TEST_CITIZEN_ID = '8777777777776';

describe('ถอนเงินสด', () => {

    it('happy case — ถอนเงิน กสิกรไทย ผ่าน K PLUS', async () => {
        log.banner('happy case — ถอนเงิน กสิกรไทย ผ่าน K PLUS');

        log.step(1, 'รอหน้าเมนูหลัก แล้วกดถอนเงินสด');
        await MainPage.waitForPage(MainPage.screen);
        await MainPage.goToWithdraw();
        log.pass('กดถอนเงินสดสำเร็จ');

        log.step(2, 'เลือกธนาคาร — กสิกรไทย');
        await WithdrawBankPage.selectKasikorn();
        log.pass('เลือกกสิกรไทยสำเร็จ');

        log.step(3, 'ยืนยันข้อกำหนดและเงื่อนไขการถอนเงิน');
        await WithdrawTermsPage.confirm();
        log.pass('ยืนยันข้อกำหนดสำเร็จ');

        log.step(4, 'ยืนยันประเภทธนบัตรที่ตู้มี');
        await WithdrawDenominationPage.confirm();
        log.pass('ยืนยันประเภทธนบัตรสำเร็จ');

        log.step(5, 'กรอกเลขบัตรประชาชน');
        await CitizenPage.enterCitizenId(TEST_CITIZEN_ID);
        await CitizenPage.confirm();
        log.pass('กรอกบัตรประชาชนสำเร็จ');

        log.step(6, 'กดถัดไป — ดูวิธีถอนผ่าน K PLUS');
        await WithdrawKPlusGuidePage.next();
        log.pass('กดถัดไปสำเร็จ');

        log.step(7, 'ยืนยันช่องทาง — กดถูกต้องแล้ว');
        await WithdrawKPlusGuidePage.confirm();
        log.pass('ยืนยันช่องทางสำเร็จ');

        log.step(8, 'สแกน QR Code บน K PLUS แล้วกดยืนยัน');
        await WithdrawQRCodePage.confirm();
        log.pass('กดยืนยัน QR สำเร็จ');

        log.step(9, 'รอเงินออกครบ (proxy จำลองการจ่ายธนบัตร)');
        await WithdrawReceiptPage.waitForReceipt();
        log.pass('เงินออกครบแล้ว อยู่หน้าสรุปรายการ');

        log.step(10, 'ไม่พิมพ์สลิป');
        await WithdrawReceiptPage.skipPrint();
        log.pass('จบ flow สำเร็จ');

        log.done('จบ flow ถอนเงินสด กสิกรไทย ผ่าน K PLUS');
    });

});
