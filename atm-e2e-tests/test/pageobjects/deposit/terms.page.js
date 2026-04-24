import BasePage, { tag } from '../base.page.js';

class TermsPage extends BasePage {
    get screen()     { return tag('screen_termAndCondition') }
    get confirmBtn() { return tag('btn_ยืนยัน') }
    get backBtn()    { return tag('btn_ย้อนกลับ') }
    get homeBtn()    { return tag('btn_หน้าหลัก') }

    async confirm() {
        await this.waitForPage(this.screen);
        await this.click(this.confirmBtn);
    }
}

export default new TermsPage();