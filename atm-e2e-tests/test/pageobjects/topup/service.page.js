import BasePage, { tag } from '../base.page.js';

class TopupServicePage extends BasePage {
    get screen()        { return tag('screen_productSelection') }
    get topupBtn()      { return tag('btn_grid_เติมเงินมือถือ') }
    get buyPackageBtn() { return tag('btn_grid_ซื้อแพ็กเสริม') }
    get backBtn()       { return tag('btn_ย้อนกลับ') }
    get homeBtn()       { return tag('btn_หน้าหลัก') }

    async selectTopup() {
        await this.waitForPage(this.screen);
        await this.click(this.topupBtn);
    }

    async selectBuyPackage() {
        await this.waitForPage(this.screen);
        await this.click(this.buyPackageBtn);
    }
}

export default new TopupServicePage();
