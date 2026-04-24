import BasePage, { tag } from '../base.page.js';

class CurrentCashPage extends BasePage {
    get screen()         { return tag('screen_currentCash') }
    get backBtn()        { return tag('btn_currentCash_back') }
    get refillCashBtn()  { return tag('btn_currentCash_refillCash') }
    get clearCashBox()   { return tag('btn_currentCash_clearCashBox') }
    get clearCash()      { return tag('btn_currentCash_clearCash') }

    async goToRefillCash() {
        await this.waitForPage(this.screen);
        await this.click(this.refillCashBtn);
        console.log('✅ กดเติมเงินแล้ว');
    }
}

export default new CurrentCashPage();