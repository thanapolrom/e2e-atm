import BasePage, { tag } from '../base.page.js';

class PhonePage extends BasePage {
    get screen()     { return tag('screen_getVerifyOtp') }
    get inputField() { return tag('input_phoneNumber') }
    get confirmBtn() { return tag('btn_ยืนยัน') }
    get cancelBtn()  { return tag('btn_ยกเลิก') }

    async enterPhone(phone) {
        await this.waitForPage(this.screen);
        await this.pressNumpad(phone);
    }

    async confirm() {
        await this.click(this.confirmBtn);
    }
}

export default new PhonePage();