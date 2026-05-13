export const tag = (testTag) => `~${testTag}`;

// ใช้เมื่อ content-desc มี suffix ที่เปลี่ยนแปลงได้ เช่น "btn_ยืนยันยอดเงิน\n2,000.00 บาท"
export const tagStartsWith = (prefix) =>
    `android=new UiSelector().descriptionStartsWith("${prefix}")`;

export default class BasePage {

    async findElement(selector) {
        const el = await $(selector);
        await el.waitForDisplayed({ timeout: 15000 });
        return el;
    }

    async click(selector) {
        const el = await this.findElement(selector);
        await el.click();
    }

    async getValue(selector) {
        const el = await this.findElement(selector);
        return el.getText();
    }

    async isDisplayed(selector) {
        try {
            const el = await $(selector);
            return el.isDisplayed();
        } catch {
            return false;
        }
    }

    async waitForPage(selector, timeout = 15000) {
        const el = await $(selector);
        await el.waitForDisplayed({ timeout });
        return el;
    }

    async pressNumpad(digits) {
        for (const d of digits.toString().split('')) {
            const key = d === '.' ? 'numpad_.' : `numpad_${d}`;
            await this.click(tag(key));
        }
    }

    async clearNumpad(times) {
        for (let i = 0; i < times; i++) {
            await this.click(tag('numpad_ลบ'));
        }
    }
}