import BasePage, { tag } from '../base.page.js';

// หน้าแจ้งว่าตู้มีธนบัตรประเภทใดบ้าง (100/500 บาท เท่านั้น)
class WithdrawDenominationPage extends BasePage {
    get screen()     { return tag('screen_warningMoneyType') }
    get confirmBtn() { return tag('btn_ยืนยัน') }
    get backBtn()    { return tag('btn_ย้อนกลับ') }
    get homeBtn()    { return tag('btn_หน้าหลัก') }

    async confirm() {
        await this.waitForPage(this.screen);
        await this.click(this.confirmBtn);
    }
}

export default new WithdrawDenominationPage();
