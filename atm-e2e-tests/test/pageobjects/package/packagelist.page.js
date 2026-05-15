import BasePage, { tag, tagStartsWith } from '../base.page.js';

class PackageListPage extends BasePage {
    get screen()    { return tag('screen_mobilePackages') }
    get backBtn()   { return tag('btn_ย้อนกลับ') }
    get cancelBtn() { return tag('btn_ยกเลิก') }

    // AIS tabs
    get tabแนะนำ()        { return tag('btn_tab_แนะนำ') }
    get tabเน็ตไม่อั้น()   { return tag('btn_tab_เน็ตไม่อั้น') }
    get tabแพ็กเสริมเน็ต() { return tag('btn_tab_แพ็กเสริมเน็ต') }
    get tabเน็ต3G4G()      { return tag('btn_tab_เน็ต 3G/4G') }
    get tabเน็ต5G()        { return tag('btn_tab_เน็ต 5G') }
    get tabบันเทิง()       { return tag('btn_tab_บันเทิง') }

    // True / DTAC shared tabs
    get tabเน็ตเต็มสปีด()  { return tag('btn_tab_เน็ตเต็มสปีด') }

    // True-only tabs
    get tabเน็ตโทรฟรี()    { return tag('btn_tab_เน็ต + โทรฟรี') }

    // DTAC-only tabs
    get tabเน็ตโทร()        { return tag('btn_tab_เน็ต + โทร') }
    get tabโทรทุกค่าย()     { return tag('btn_tab_โทรทุกค่าย') }

    async selectByIndex(index = 0, tabSelector = null) {
        await this.waitForPage(this.screen);
        if (tabSelector) await this.click(tabSelector);
        const sel = `android=new UiSelector().descriptionStartsWith("btn_packageCard_").instance(${index})`;
        const el = await $(sel);
        await el.waitForDisplayed({ timeout: 10000 });
        await el.click();
    }

    async selectFirst(tabSelector = null) {
        return this.selectByIndex(0, tabSelector);
    }
}

export default new PackageListPage();
