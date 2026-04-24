import BasePage, { tag } from './base.page.js';

class MainPage extends BasePage {
    get screen()      { return tag('screen_serviceSelection') }
    get depositBtn()  { return tag('btn_grid_ฝากเงินสด') }
    get withdrawBtn() { return tag('btn_grid_ถอนเงินสด') }
    get topupBtn()    { return tag('btn_grid_เติมเงินมือถือ/ซื้อแพ็กเสริม') }
    get payBillBtn()  { return tag('btn_grid_จ่ายบิล') }

    async goToDeposit() {
        await this.waitForPage(this.screen);
        await this.click(this.depositBtn);
    }

    async goToWithdraw() {
        await this.waitForPage(this.screen);
        await this.click(this.withdrawBtn);
    }
}

export default new MainPage();