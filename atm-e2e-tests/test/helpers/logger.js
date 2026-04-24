const c = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    dim:    '\x1b[2m',
    green:  '\x1b[32m',
    red:    '\x1b[31m',
    cyan:   '\x1b[36m',
    yellow: '\x1b[33m',
    gray:   '\x1b[90m',
};

const LINE = `${c.gray}${'─'.repeat(62)}${c.reset}`;

export const log = {
    banner(title) {
        console.log(`\n${LINE}`);
        console.log(`${c.bold}${c.cyan}  ▶  ${title}${c.reset}`);
        console.log(LINE);
    },

    step(n, msg) {
        console.log(`\n${c.cyan}${c.bold}  [${n}]${c.reset}  ${msg}`);
    },

    pass(msg) {
        console.log(`        ${c.green}✅  ${msg}${c.reset}`);
    },

    fail(msg) {
        console.log(`        ${c.red}❌  ${msg}${c.reset}`);
    },

    info(msg) {
        console.log(`        ${c.gray}ℹ   ${msg}${c.reset}`);
    },

    warn(msg) {
        console.log(`        ${c.yellow}⚠   ${msg}${c.reset}`);
    },

    amount(baht) {
        console.log(`        ${c.yellow}💰  ตรวจพบแบงค์ ${baht} บาท${c.reset}`);
    },

    done(msg = 'จบ flow สำเร็จ') {
        console.log(`\n${c.green}${c.bold}  🎉  ${msg}${c.reset}`);
        console.log(`${LINE}\n`);
    },
};
