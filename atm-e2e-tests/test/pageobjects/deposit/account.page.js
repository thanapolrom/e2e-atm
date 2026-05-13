import BasePage, { tag } from '../base.page.js';

class DepositAccountPage extends BasePage {
    get screen()     { return tag('screen_bankIdVerify') }
    get confirmBtn() { return tag('btn_ยืนยัน') }
    get cancelBtn()  { return tag('btn_ยกเลิก') }

    async enterAccount(accountNumber) {
        await this.waitForPage(this.screen);
        await this.pressNumpad(accountNumber);
    }

    async confirm() {
        await this.click(this.confirmBtn);
    }
}

export default new DepositAccountPage();
