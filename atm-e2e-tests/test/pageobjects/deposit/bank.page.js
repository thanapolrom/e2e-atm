import BasePage, { tag } from '../base.page.js';

class BankPage extends BasePage {
    get screen()      { return tag('screen_productSelection') }
    get kasikornBtn() { return tag('btn_grid_กสิกรไทย') }
    get scbBtn()      { return tag('btn_grid_ไทยพาณิชย์') }
    get backBtn()     { return tag('btn_ย้อนกลับ') }
    get homeBtn()     { return tag('btn_หน้าหลัก') }

    async selectKasikorn() {
        await this.waitForPage(this.screen);
        await this.click(this.kasikornBtn);
    }

    async selectSCB() {
        await this.waitForPage(this.screen);
        await this.click(this.scbBtn);
    }
}

export default new BankPage();