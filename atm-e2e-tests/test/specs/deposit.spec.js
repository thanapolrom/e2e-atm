import MainPage              from '../pageobjects/main.page.js';
import BankPage              from '../pageobjects/deposit/bank.page.js';
import TermsPage             from '../pageobjects/deposit/terms.page.js';
import CitizenPage           from '../pageobjects/deposit/citizen.page.js';
import PhonePage             from '../pageobjects/deposit/phone.page.js';
import OtpPage               from '../pageobjects/deposit/otp.page.js';
import DepositAccountPage    from '../pageobjects/deposit/account.page.js';
import DepositAmountPage     from '../pageobjects/deposit/amount.page.js';
import DepositConfirmPage    from '../pageobjects/deposit/confirm.page.js';
import DepositCashInputPage  from '../pageobjects/deposit/cashinput.page.js';
import DepositReceiptPage    from '../pageobjects/deposit/receipt.page.js';
import { log }               from '../helpers/logger.js';

const TEST_CITIZEN_ID = '8777777777776';
const TEST_PHONE      = '0890000000';
const MOCK_OTP        = '111111';
const TEST_ACCOUNT    = '0000000000';
const DEPOSIT_AMOUNT  = 1670;

describe('ฝากเงินสด — happy path', () => {

    it('ทำรายการฝากเงินครบทั้ง flow', async () => {
        log.banner('ทำรายการฝากเงินครบทั้ง flow');

        log.step(1, 'รอหน้าเมนูหลัก แล้วกดฝากเงินสด');
        await MainPage.waitForPage(MainPage.screen);
        await MainPage.goToDeposit();
        log.pass('กดฝากเงินสดสำเร็จ');

        log.step(2, 'เลือกธนาคาร — กสิกรไทย');
        await BankPage.selectKasikorn();
        log.pass('เลือกกสิกรไทยสำเร็จ');

        log.step(3, 'ยืนยันข้อกำหนดและเงื่อนไข');
        await TermsPage.confirm();
        log.pass('ยืนยันข้อกำหนดสำเร็จ');

        log.step(4, 'กรอกเลขบัตรประชาชน');
        await CitizenPage.enterCitizenId(TEST_CITIZEN_ID);
        await CitizenPage.confirm();
        log.pass('กรอกบัตรประชาชนสำเร็จ');

        log.step(5, 'กรอกเบอร์โทรศัพท์');
        await PhonePage.enterPhone(TEST_PHONE);
        await PhonePage.confirm();
        log.pass('กรอกเบอร์โทรสำเร็จ');

        log.step(6, 'กรอก OTP');
        await OtpPage.enterOtp(MOCK_OTP);
        await OtpPage.confirm();
        log.pass('กรอก OTP สำเร็จ');

        log.step(7, 'กรอกเลขที่บัญชีธนาคารปลายทาง');
        await DepositAccountPage.enterAccount(TEST_ACCOUNT);
        await DepositAccountPage.confirm();
        log.pass('กรอกเลขบัญชีสำเร็จ');

        // เปลี่ยน step 8 จาก selectPreset → enterCustomAmount
        //await DepositAmountPage.enterCustomAmount(DEPOSIT_AMOUNT);
        log.step(8, `เลือกจำนวนเงิน — ${DEPOSIT_AMOUNT} บาท`);
        //await DepositAmountPage.selectPreset(DEPOSIT_AMOUNT);
        await DepositAmountPage.enterCustomAmount(DEPOSIT_AMOUNT);
        log.pass(`เลือก ${DEPOSIT_AMOUNT} บาทสำเร็จ`);

        log.step(9, 'ตรวจสอบและยืนยันข้อมูลการฝากเงิน');
        await DepositConfirmPage.confirm();
        log.pass('ยืนยันสำเร็จ');

        log.step(10, 'รอหน้าฝากเงิน — proxy-itl จำลองการรับแบงค์ แล้วกดยืนยัน');
        // แจ้ง proxy-payout ว่าจะมีแบงค์ DEPOSIT_AMOUNT บาทถูกใส่เข้ามา
        await fetch('http://127.0.0.1:5004/test/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: DEPOSIT_AMOUNT * 100 }),
        });
        await DepositCashInputPage.waitForPage();
        log.pass('อยู่หน้าฝากเงินแล้ว');
        await DepositCashInputPage.confirm();
        log.pass('กดยืนยันสำเร็จ');

        log.step(11, 'หน้าสรุป → ไม่พิมพ์สลิป');
        await DepositReceiptPage.skipPrint();
        log.pass('จบ flow สำเร็จ');

        log.done('จบ flow ฝากเงินสด กสิกรไทย');
    });

});
