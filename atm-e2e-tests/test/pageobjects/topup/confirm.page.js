import BasePage, { tag } from '../base.page.js';

class TopupConfirmPage extends BasePage {
    get screen()     { return tag('screen_topupConfirm') }
    get confirmBtn() { return tag('btn_ยืนยัน') }//TODO fix tag
    get cancelBtn()  { return tag('btn_ยกเลิก') }

    async confirm() {
        await this.waitForPage(this.screen);
        await this.click(this.confirmBtn);
    }
}

export default new TopupConfirmPage();
