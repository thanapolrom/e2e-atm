import BasePage, { tag } from '../base.page.js';

class TopupPhonePage extends BasePage {
    get screen()     { return tag('screen_topupPhoneInput') }
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

export default new TopupPhonePage();
