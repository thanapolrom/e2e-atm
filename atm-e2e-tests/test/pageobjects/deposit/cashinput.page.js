import BasePage, { tag, tagStartsWith } from '../base.page.js';

// หน้าฝากเงินสด — รอ proxy-itl จำลองการรับแบงค์ แล้วกดยืนยัน
class DepositCashInputPage extends BasePage {
    get screen()     { return tag('screen_confirmTopUpMoney') }
    get confirmBtn() { return tagStartsWith('btn_ยืนยันยอดเงิน') }  // suffix เปลี่ยนตามยอด
    get cancelBtn()  { return tag('btn_ยกเลิก') }

    // popup 1: "กรุณายืนยันการเปลี่ยนแปลงยอดเงิน" — ปรากฏเมื่อใส่เงินน้อยกว่ายอดรายการ
    get modalScreen()            { return tag('modal_action') }
    get underDepositConfirmBtn() { return tag('modal_btn_confirm') }   // disabled ~5 วิแรก
    get underDepositAddMoreBtn() { return tag('modal_btn_cancel') }

    // popup 2: "ข้อมูลทำรายการที่เปลี่ยนแปลง"
    get amountChangeConfirmBtn() { return tag('btn_depositSummary_confirm') }

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

    // happy path: ใส่เงินครบ → กดยืนยันยอดเงิน
    async confirm() {
        await this.waitForAcceptorDone();
        await this.click(this.confirmBtn);
    }

    // under-deposit path: ใส่เงินน้อยกว่ายอด → กดยืนยันยอดเงิน → popup1 ยืนยัน → popup2 ยืนยันยอดเงิน
    async confirmUnderDeposit() {
        await this.waitForAcceptorDone();
        await this.click(this.confirmBtn);

        // popup 1 — รอ modal ขึ้น แล้วรอ 6 วิ (ปุ่มถูก disable ~5 วิแรก)
        await super.waitForPage(this.modalScreen);
        await browser.pause(6000);
        await this.click(this.underDepositConfirmBtn);

        // popup 2 — กดยืนยันยอดเงิน
        await this.click(this.amountChangeConfirmBtn);
    }
}

export default new DepositCashInputPage();
