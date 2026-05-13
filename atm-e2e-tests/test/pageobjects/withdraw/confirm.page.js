import BasePage, { tag } from '../base.page.js';

class WithdrawConfirmPage extends BasePage {
    get screen()     { return tag('screen_completeWithdraw') }
    get confirmBtn() { return tag('btn_ยืนยัน') }
    get cancelBtn()  { return tag('btn_ยกเลิก') }

    async confirm() {
        await this.waitForPage(this.screen);
        await this.click(this.confirmBtn);
    }
}

export default new WithdrawConfirmPage();
