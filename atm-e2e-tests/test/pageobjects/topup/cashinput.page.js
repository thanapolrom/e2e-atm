import BasePage, { tag } from '../base.page.js';

class TopupCashInputPage extends BasePage {
    get screen()     { return tag('screen_topupCashInput') }
    get confirmBtn() { return tag('btn_ยืนยัน') }
    get cancelBtn()  { return tag('btn_ยกเลิก') }

    async waitForPage() {
        await super.waitForPage(this.screen);
    }

    async confirm() {
        await this.click(this.confirmBtn);
    }
}

export default new TopupCashInputPage();
