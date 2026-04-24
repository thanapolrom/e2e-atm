import BasePage, { tag } from '../base.page.js';

class CitizenPage extends BasePage {
    get screen()      { return tag('screen_verifyIdCard') }
    get inputField()  { return tag('input_citizenId') }
    get confirmBtn()  { return tag('btn_ยืนยัน') }
    get backBtn()     { return tag('btn_ย้อนกลับ') }
    get homeBtn()     { return tag('btn_หน้าหลัก') }

    async enterCitizenId(id) {
        await this.waitForPage(this.screen);
        await this.pressNumpad(id);
    }

    async confirm() {
        await this.click(this.confirmBtn);
    }
}

export default new CitizenPage();