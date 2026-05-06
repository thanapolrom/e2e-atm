import MainPage    from '../pageobjects/main.page.js';
import BankPage    from '../pageobjects/deposit/bank.page.js';
import TermsPage   from '../pageobjects/deposit/terms.page.js';
import CitizenPage from '../pageobjects/deposit/citizen.page.js';
import PhonePage   from '../pageobjects/deposit/phone.page.js';
import OtpPage     from '../pageobjects/deposit/otp.page.js';
import { log }     from '../helpers/logger.js';

const TEST_CITIZEN_ID = '8777777777776';
const TEST_PHONE      = '0890000000';
const MOCK_OTP        = '111111';

describe('ฝากเงินสด — happy path', () => {

    it('ทำรายการฝากเงินครบทั้ง flow', async () => {
        log.banner('ทำรายการฝากเงินครบทั้ง flow');

        log.step(1, 'เลือกฝากเงินสด');
        await MainPage.goToDeposit();
        await browser.pause(2000);
        log.pass('เข้าหน้าเลือกธนาคาร');

        log.step(2, 'เลือกธนาคารกสิกรไทย');
        await BankPage.selectKasikorn();
        await browser.pause(2000);
        log.pass('เลือกกสิกรไทยสำเร็จ');

        log.step(3, 'ยืนยันข้อกำหนด');
        await TermsPage.confirm();
        await browser.pause(2000);
        log.pass('ยืนยันข้อกำหนดสำเร็จ');

        log.step(4, 'กรอกเลขบัตรประชาชน');
        await CitizenPage.enterCitizenId(TEST_CITIZEN_ID);
        await browser.pause(1000);
        await CitizenPage.confirm();
        await browser.pause(2000);
        log.pass('กรอกเลขบัตรประชาชนสำเร็จ');

        log.step(5, 'กรอกเบอร์โทร');
        await PhonePage.enterPhone(TEST_PHONE);
        await browser.pause(1000);
        await PhonePage.confirm();
        await browser.pause(2000);
        log.pass('กรอกเบอร์โทรสำเร็จ');

        log.step(6, 'กรอก OTP');
        await OtpPage.enterOtp(MOCK_OTP);
        await browser.pause(1000);
        await OtpPage.confirm();
        await browser.pause(2000);
        log.pass('กรอก OTP สำเร็จ');

        log.done('จบ flow ฝากเงินสำเร็จ');
    });
});
