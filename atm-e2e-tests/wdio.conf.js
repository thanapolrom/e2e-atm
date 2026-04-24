exports.config = {
    runner: 'local',
    port: 4723,
    specs: ['./test/specs/**/*.spec.js'],
    exclude: [],

    capabilities: [{
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',

        'appium:deviceName': '10.55.10.11:5555',
        'appium:platformVersion': '14',
        'appium:appPackage': 'com.kbao.atm.sit',
        'appium:appActivity': 'com.kbao.atm.MainActivity',

        'appium:noReset': true,
        'appium:fullReset': false,
        'appium:newCommandTimeout': 120,
        'appium:settings[allowInvisibleElements]': true,
        'appium:enforceAppInstall': false,
        'appium:disableSuppressAccessibilityService': true,
        'appium:chromedriverExecutable': 'C:/chromedriver/chromedriver.exe',
    }],

    logLevel: 'info',
    bail: 0,
    waitforTimeout: 30000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,

    services: [['appium', {
        command: 'appium',
        args: { port: 4723 }
    }]],

    framework: 'mocha',
    reporters: [
        'spec',
        ['allure', {
            outputDir: 'allure-results',
            disableWebdriverStepsReporting: false,
        }]
    ],

    mochaOpts: {
        ui: 'bdd',
        timeout: 180000
    },

    // Screenshot อัตโนมัติเมื่อ test fail
    afterTest: async function(test, context, { passed, duration }) {
        const ms   = (duration / 1000).toFixed(1);
        const rst  = '\x1b[0m';
        const bold = '\x1b[1m';
        const green = '\x1b[32m';
        const red   = '\x1b[31m';
        const gray  = '\x1b[90m';
        const line  = `${gray}${'─'.repeat(62)}${rst}`;

        if (passed) {
            console.log(`\n${green}${bold}  ✅  PASSED${rst}  ${gray}(${ms}s)${rst}`);
        } else {
            console.log(`\n${red}${bold}  ❌  FAILED${rst}  ${gray}(${ms}s)${rst}`);
            await browser.takeScreenshot();
        }
        console.log(`${line}\n`);
    }
};
