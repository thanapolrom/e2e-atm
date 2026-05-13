import BasePage, { tag } from '../base.page.js';

// หน้า QR Code สำหรับสแกนถอนเงินผ่าน K PLUS
class WithdrawQRCodePage extends BasePage {
    get screen()     { return tag('screen_qrCodeWithdraw') }
    get confirmBtn() { return tag('btn_ยืนยัน') }
    get cancelBtn()  { return tag('btn_ยกเลิก') }

    async confirm() {
        await this.waitForPage(this.screen);
        await this.click(this.confirmBtn);
    }
}

export default new WithdrawQRCodePage();
