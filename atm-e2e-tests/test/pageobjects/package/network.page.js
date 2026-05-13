import BasePage, { tag } from '../base.page.js';

class PackageNetworkPage extends BasePage {
    get screen()   { return tag('screen_productSelection') }
    get aisBtn()   { return tag('btn_grid_เอไอเอส แพ็กเกจเสริม') }
    get trueBtn()  { return tag('btn_grid_ทรู แพ็กเกจเสริม') }
    get dtacBtn()  { return tag('btn_grid_ดีแทค แพ็กเกจเสริม') }
    get backBtn()  { return tag('btn_ย้อนกลับ') }
    get homeBtn()  { return tag('btn_หน้าหลัก') }

    async selectAIS() {
        await this.waitForPage(this.screen);
        await this.click(this.aisBtn);
    }

    async selectTrue() {
        await this.waitForPage(this.screen);
        await this.click(this.trueBtn);
    }

    async selectDTAC() {
        await this.waitForPage(this.screen);
        await this.click(this.dtacBtn);
    }
}

export default new PackageNetworkPage();
