import BasePage, { tag } from '../base.page.js';

class PackageReceiptPage extends BasePage {
    get screen()         { return tag('screen_completeResult') }
    get printSlipBtn()   { return tag('btn_พิมพ์สลิป') }
    get noPrintSlipBtn() { return tag('btn_ไม่พิมพ์สลิป') }

    async skipPrint() {
        await this.waitForPage(this.screen);
        await this.click(this.noPrintSlipBtn);
    }

    async printSlip() {
        await this.waitForPage(this.screen);
        await this.click(this.printSlipBtn);
    }
}

export default new PackageReceiptPage();
