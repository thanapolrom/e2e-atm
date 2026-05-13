import BasePage, { tag } from '../base.page.js';

// หน้าตรวจสอบช่องทางการถอนเงินบน K PLUS — กด "ถูกต้องแล้ว" เพื่อไปหน้า QR
class WithdrawKPlusCheckPage extends BasePage {
    get screen()       { return tag('screen_withdrawGuidelineStep') }
    get confirmBtn()   { return tag('btn_ถูกต้องแล้ว') }
    get backBtn()      { return tag('btn_กลับไปดูวิธีถอน') }

    async confirm() {
        await this.waitForPage(this.screen);
        await this.click(this.confirmBtn);
    }
}

export default new WithdrawKPlusCheckPage();
