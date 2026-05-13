import BasePage, { tag, tagStartsWith } from '../base.page.js';

class PackageListPage extends BasePage {
    get screen()    { return tag('screen_mobilePackages') }
    get backBtn()   { return tag('btn_ย้อนกลับ') }
    get cancelBtn() { return tag('btn_ยกเลิก') }

    async selectFirst() {
        await this.waitForPage(this.screen);
        await this.click(tagStartsWith('btn_packageCard_'));
    }
}

export default new PackageListPage();
