import BasePage from './base.page.js';

class WithdrawPage extends BasePage {

    // TODO: เปลี่ยน locator เมื่อดูใน Appium Inspector
    get amountInput()   { return 'id=com.yourbank.atm:id/withdraw_amount_input' }
    get confirmBtn()    { return 'id=com.yourbank.atm:id/btn_confirm_withdraw' }
    get successMsg()    { return 'id=com.yourbank.atm:id/withdraw_success_message' }
    get balanceLabel()  { return 'id=com.yourbank.atm:id/current_balance' }
    get errorMsg()      { return 'id=com.yourbank.atm:id/error_message' }

    async withdraw(amount) {
        await this.setValue(this.amountInput, amount);
        await this.click(this.confirmBtn);
    }

    async isSuccess() {
        return this.isDisplayed(this.successMsg);
    }

    async getBalance() {
        const raw = await this.getText(this.balanceLabel);
        return parseInt(raw.replace(/[^0-9]/g, ''));
    }

    async getError() {
        return this.getText(this.errorMsg);
    }
}

export default new WithdrawPage();