import BasePage, { tag } from '../base.page.js';

class TopupNetworkPage extends BasePage {
    get screen()   { return tag('screen_productSelection') }
    get trueBtn()  { return tag('btn_grid_ทรู แบบเติมเงิน') }
    get aisBtn()   { return tag('btn_grid_เอไอเอส วัน-ทู-คอล!') }
    get dtacBtn()  { return tag('btn_grid_ดีแทค แบบเติมเงิน') }
    get backBtn()  { return tag('btn_ย้อนกลับ') } 
    get homeBtn()  { return tag('btn_หน้าหลัก') }

    async selectTrue() {
        await this.waitForPage(this.screen);
        await this.click(this.trueBtn);
    }

    async selectAIS() {
        await this.waitForPage(this.screen);
        await this.click(this.aisBtn);
    }

    async selectDTAC() {
        await this.waitForPage(this.screen);
        await this.click(this.dtacBtn);
    }
}

export default new TopupNetworkPage();
