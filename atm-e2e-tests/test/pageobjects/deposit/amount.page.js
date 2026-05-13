import BasePage, { tag } from '../base.page.js';

class DepositAmountPage extends BasePage {
    get screen()          { return tag('screen_moneySelection') }
    get customAmountBtn() { return tag('btn_grid_กรอกจำนวนเงิน') }
    get cancelBtn()       { return tag('btn_ยกเลิก') }

    // เลือกจากปุ่ม grid (100, 200, 300, 500, 600, 800, 1000)
    async selectPreset(baht) {
        await this.waitForPage(this.screen);
        await this.click(tag(`btn_grid_${baht} บาท`));
    }

    // กดปุ่ม "กรอกจำนวนเงิน" แล้วพิมพ์ผ่าน numpad
    async enterCustomAmount(baht) {
        await this.waitForPage(this.screen);
        await this.click(this.customAmountBtn);
        await this.waitForPage(tag('screen_moneyCustomSelection'));
        await this.pressNumpad(baht);
        await this.click(tag('btn_ยืนยัน'));
    }
}

export default new DepositAmountPage();
