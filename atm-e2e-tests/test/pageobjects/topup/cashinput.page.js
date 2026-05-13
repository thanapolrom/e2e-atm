import BasePage, { tag } from '../base.page.js';

class TopupCashInputPage extends BasePage {
    get screen()     { return tag('screen_confirmTopUpMoney') }
    get confirmBtn() { return tag('btn_ยืนยัน') }
    get cancelBtn()  { return tag('btn_ยกเลิก') }

    async waitForPage() {
        await super.waitForPage(this.screen);
    }

    async waitForAcceptorDone(timeout = 30000) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const res = await fetch('http://127.0.0.1:5004/test/status');
            const { acceptorPhase } = await res.json();
            if (acceptorPhase === 'DONE') return;
            await browser.pause(500);
        }
        throw new Error(`Acceptor ไม่เสร็จภายใน ${timeout}ms`);
    }

    async confirm() {
        await this.waitForAcceptorDone();
        await this.click(this.confirmBtn);
    }
}

export default new TopupCashInputPage();
