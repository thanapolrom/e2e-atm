import LoginPage    from '../pageobjects/login.page.js';
import WithdrawPage from '../pageobjects/withdraw.page.js';

describe('ถอนเงิน', () => {

    beforeEach(async () => {
        // TODO: navigate ไปหน้า withdraw หลัง login
        await LoginPage.login('1234');
        await $('~menu_withdraw').click();
    });

    it('ถอน 500 บาท ต้องแสดง success', async () => {
        await WithdrawPage.withdraw(500);
        expect(await WithdrawPage.isSuccess()).toBe(true);
    });

    it('ยอดเงินต้องลดลงหลังถอน', async () => {
        const before = await WithdrawPage.getBalance();
        await WithdrawPage.withdraw(500);
        const after = await WithdrawPage.getBalance();
        expect(before - after).toBe(500);
    });

    it('ถอนเกินยอด ต้องแสดง error', async () => {
        await WithdrawPage.withdraw(9999999);
        const error = await WithdrawPage.getError();
        expect(error).toContain('ยอดเงินไม่เพียงพอ');
    });

    it('ถอน 0 บาท ต้องแสดง error', async () => {
        await WithdrawPage.withdraw(0);
        const error = await WithdrawPage.getError();
        expect(error).not.toBe('');
    });

    const amounts = [100, 200, 500];
    amounts.forEach(amount => {
        it(`ถอน ${amount} บาท ต้องสำเร็จ`, async () => {
            await WithdrawPage.withdraw(amount);
            expect(await WithdrawPage.isSuccess()).toBe(true);
        });
    });
});