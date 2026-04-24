import BasePage from '../base.page.js';

class DepositPage extends BasePage {

    // TODO: เปลี่ยน locator เมื่อดูใน Appium Inspector
    get amountInput()   { return 'id=com.yourbank.atm:id/deposit_amount_input' }
    get confirmBtn()    { return 'id=com.yourbank.atm:id/btn_confirm_deposit' }
    get successMsg()    { return 'id=com.yourbank.atm:id/deposit_success_message' }
    get balanceLabel()  { return 'id=com.yourbank.atm:id/current_balance' }
    get errorMsg()      { return 'id=com.yourbank.atm:id/error_message' }

    async deposit(amount) {
        await this.setValue(this.amountInput, amount);
        await this.click(this.confirmBtn);
    }

    async isSuccess() {
        return this.isDisplayed(this.successMsg);
    }

    async getSuccessText() {
        return this.getText(this.successMsg);
    }

    async getBalance() {
        const raw = await this.getText(this.balanceLabel);
        // ดึงแค่ตัวเลข เช่น "ยอดเงิน 5,000 บาท" → 5000
        return parseInt(raw.replace(/[^0-9]/g, ''));
    }

    async getError() {
        return this.getText(this.errorMsg);
    }
}

export default new DepositPage();