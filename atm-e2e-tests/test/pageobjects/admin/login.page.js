import BasePage, { tag } from '../base.page.js';

class AdminLoginPage extends BasePage {

    // Native context
    get adminIcon()   { return tag('nav_admin_icon') }
    get loginScreen() { return tag('screen_keycloakWebView') }

    // WebView context
    get usernameInput() { return '#username' }
    get passwordInput() { return '#password' }
    get loginBtn()      { return '#kc-login' }

    async openAdminPanel() {
        // กด logo เงินดี 5 ครั้ง
        for (let i = 0; i < 5; i++) {
            await this.click(this.adminIcon);
            await browser.pause(200);
        }
        await this.waitForPage(this.loginScreen);
        console.log('✅ เข้าหน้า login แล้ว');
    }

    async switchToWebView() {
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            await browser.pause(1000);
            const contexts = await driver.getContexts();
            console.log('Contexts:', contexts);
            const webContexts = contexts.filter(c => c.includes('WEBVIEW')).reverse();
            for (const ctx of webContexts) {
                try {
                    await driver.switchContext(ctx);
                    await $(this.usernameInput).waitForExist({ timeout: 2000 });
                    console.log('✅ สลับไป WebView แล้ว:', ctx);
                    return;
                } catch {
                    // stale context หรือยังโหลดไม่เสร็จ — ลอง context ถัดไป
                }
            }
        }
        throw new Error('ไม่พบ WebView ที่ใช้งานได้ภายใน 15 วินาที');
    }

    async switchToNative() {
        await driver.switchContext('NATIVE_APP');
        console.log('✅ สลับกลับ Native แล้ว');
    }

   async login(username, password) {
    await this.switchToWebView();
    
    // กรอก username
    await $(this.usernameInput).setValue(username);
    
    // กรอก password
    await $(this.passwordInput).setValue(password);
    
    // รอปุ่มหาย disabled ก่อนคลิก
    await browser.waitUntil(async () => {
        const btn = await $(this.loginBtn);
        const disabled = await btn.getAttribute('disabled');
        return disabled === null;
    }, { timeout: 10000, timeoutMsg: 'ปุ่ม login ยัง disabled อยู่' });

    // ใช้ JavaScript click แทน เพราะ element อาจถูกบัง
    await browser.execute((selector) => {
        document.querySelector(selector).click();
    }, this.loginBtn);

    await this.switchToNative();
    console.log(`✅ Login ด้วย ${username} สำเร็จ`);
}
}

export default new AdminLoginPage();