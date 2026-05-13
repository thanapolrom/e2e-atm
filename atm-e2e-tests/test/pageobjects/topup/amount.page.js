import BasePage, { tag } from '../base.page.js';

class TopupAmountPage extends BasePage {
    get screen()     { return tag('screen_moneySelection') }
    get cancelBtn()  { return tag('btn_ยกเลิก') }

    async selectAmount(baht) {
        await this.waitForPage(this.screen);
        await this.click(tag(`btn_grid_${baht} บาท`));
    }
}

export default new TopupAmountPage();
