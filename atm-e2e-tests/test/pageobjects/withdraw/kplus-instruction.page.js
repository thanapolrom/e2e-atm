import BasePage, { tag } from '../base.page.js';

// หน้าแนะนำ K PLUS — step 1: กดถัดไป, step 2: กดถูกต้องแล้ว
// ทั้งสอง step ใช้ screen เดียวกัน (screen_withdrawGuidelineStep)
class WithdrawKPlusGuidePage extends BasePage {
    get screen()      { return tag('screen_withdrawGuidelineStep') }
    get nextBtn()     { return tag('btn_ถัดไป') }
    get confirmBtn()  { return tag('btn_withdrawGuideline_confirm') }
    get backBtn()     { return tag('btn_กลับไปดูวิธีถอน') }

    async next() {
        await this.waitForPage(this.screen);
        await this.click(this.nextBtn);
    }

    async confirm() {
        await this.waitForPage(this.screen);
        await this.click(this.confirmBtn);
    }
}

export default new WithdrawKPlusGuidePage();
