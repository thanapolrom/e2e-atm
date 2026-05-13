import BasePage, { tag, tagStartsWith } from '../base.page.js';

// หน้าฝากเงินสด — รอ proxy-itl จำลองการรับแบงค์ แล้วกดยืนยัน
class DepositCashInputPage extends BasePage {
    get screen()     { return tag('screen_confirmTopUpMoney') }
    get confirmBtn() { return tagStartsWith('btn_ยืนยันยอดเงิน') }  // suffix เปลี่ยนตามยอด
    get cancelBtn()  { return tag('btn_ยกเลิก') }

    async waitForPage() {
        await super.waitForPage(this.screen);
    }

    // รอจนกว่า proxy-payout จะรับแบงค์ครบทั้งหมด (acceptorPhase = DONE)
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

export default new DepositCashInputPage();
