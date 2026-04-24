import BasePage, { tag } from '../base.page.js';

class OtpPage extends BasePage {
    get screen()     { return tag('screen_verifyOTP') }
    get inputField() { return tag('input_otp') }
    get confirmBtn() { return tag('btn_ยืนยัน') }
    get cancelBtn()  { return tag('btn_ยกเลิก') }

    async enterOtp(otp) {
        await this.waitForPage(this.screen);
        await this.pressNumpad(otp);
    }

    async confirm() {
        await this.click(this.confirmBtn);
    }
}

export default new OtpPage();