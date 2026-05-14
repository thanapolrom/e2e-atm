const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const pathModule = require('path');
const { Readable } = require('stream');

// App เรียก 127.0.0.1:5000 → ตัว proxy นี้รับแทน
// รัน proxy นี้บน port 5000, ย้าย real device ไป 5004 (ถ้ามี)
const PAYOUT_REAL = process.env.PAYOUT_REAL || 'http://127.0.0.1:5004';
const PAYOUT_PROXY_PORT = Number(process.env.PAYOUT_PROXY_PORT || 5000);
const PAYOUT_MOCK_ENABLED = process.env.PAYOUT_MOCK !== '0';
const API_LOG_ENABLED = process.env.API_LOG !== '0';
const API_LOG_DIR = process.env.API_LOG_DIR || pathModule.join(__dirname, 'logs');
const API_LOG_FILE = process.env.API_LOG_FILE || pathModule.join(
    API_LOG_DIR,
    `api-payout-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
);

const proxy = httpProxy.createProxyServer({ selfHandleResponse: true });

if (API_LOG_ENABLED) {
    fs.mkdirSync(API_LOG_DIR, { recursive: true });
    console.log(`Payout API traffic log: ${API_LOG_FILE}`);
}

const nowIso = () => new Date().toISOString();

const writeLog = (entry) => {
    if (!API_LOG_ENABLED) return;
    fs.appendFileSync(API_LOG_FILE, `${JSON.stringify(entry)}\n`);
};

const sendJson = (res, statusCode, body) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
});

// ─── Mock state ──────────────────────────────────────────────────────────────

// denominations ที่ตู้มี: [{ value: 10000, count: 10 }, ...]
// value เป็น satang (10000 = 100 บาท, 50000 = 500 บาท)
let denomState = [
    { value: 10000, count: 10 },   // 100 บาท
    { value: 50000, count: 10 },   // 500 บาท
];
let lastDispenseValue = 0;
let lastDispenseNotes = [];        // [50000, 10000] ← notes dispensed

const resetState = (denoms = null) => {
    denomState = denoms || [
        { value: 10000, count: 10 },
        { value: 50000, count: 10 },
    ];
    lastDispenseValue = 0;
    lastDispenseNotes = [];
};

// ─── Acceptor state ───────────────────────────────────────────────────────────

// 100฿ (10000) และ 500฿ (50000) → AcceptRoute=PAYOUT → STORED event
// 20฿ (2000), 50฿ (5000), 1000฿ (100000) → AcceptRoute=CASHBOX → STACKED event
const STORED_VALUES    = new Set([10000, 50000]);
const ACCEPTOR_DENOMS  = [100000, 50000, 10000, 5000, 2000]; // greedy order สำหรับ auto-calc

let acceptorEnabled  = false;
let acceptorNotes    = [];   // flat array of note values, e.g. [50000, 10000, 10000]
let acceptorNoteIdx  = 0;
let acceptorPhase    = 'IDLE'; // IDLE|P1|P2|P3a|P3b|ACCEPTING|ESCROW|STACKING|DONE

// เมื่อ passthroughScan=true: GetDeviceStatus จะส่งต่อไป real device และ log response
// ใช้เพื่อ capture format ของ scanner event ใน PollBuffer
let passthroughScan  = false;
const pendingReqs    = new Map(); // id → { path, method }

// คำนวณแบงค์จากยอดเงิน (satang) — greedy ใหญ่ก่อน
const calcAcceptorNotes = (amountSatang) => {
    let remaining = amountSatang;
    const notes = [];
    for (const v of ACCEPTOR_DENOMS) {
        while (remaining >= v) { notes.push(v); remaining -= v; }
    }
    if (remaining > 0) {
        // remainder doesn't fit any denom exactly — add smallest denom that covers it
        const fill = [...ACCEPTOR_DENOMS].reverse().find(v => v >= remaining);
        if (fill) notes.push(fill);
    }
    return notes;
};

// input รูปแบบที่รองรับ:
//   number                  → amount in satang, auto-calc notes
//   [{value, count?}, ...]  → ระบุแบงค์เองพร้อม count (default count=1)
//   [value, ...]            → flat array เดิม
const resetAcceptor = (input = []) => {
    if (typeof input === 'number') {
        acceptorNotes = calcAcceptorNotes(input);
    } else if (Array.isArray(input)) {
        acceptorNotes = input.flatMap(n => {
            const value = typeof n === 'object' ? n.value : n;
            const count = (typeof n === 'object' && n.count) ? n.count : 1;
            return Array(count).fill(value);
        });
    } else {
        acceptorNotes = [];
    }
    acceptorNoteIdx = 0;
    acceptorPhase   = 'IDLE';
    acceptorEnabled = false;
};

const buildAcceptorStatus = () => {
    switch (acceptorPhase) {
        case 'P1':
            acceptorPhase = 'P2';
            return { DeviceState: 'DISABLED', PollBuffer: [] };
        case 'P2':
            acceptorPhase = 'P3a';
            return { DeviceState: 'IDLE', PollBuffer: [{ Type: 'DeviceStatusResponse', StateAsString: 'IDLE' }] };
        case 'P3a':
            acceptorPhase = 'P3b';
            return { DeviceState: 'IDLE', PollBuffer: [] };
        case 'P3b':
            acceptorPhase = 'ACCEPTING';
            return { DeviceState: 'IDLE', PollBuffer: [] };
        case 'ACCEPTING': {
            if (acceptorNoteIdx >= acceptorNotes.length) {
                acceptorPhase = 'DONE';
                return { DeviceState: 'IDLE', PollBuffer: [] };
            }
            acceptorPhase = 'ESCROW';
            return { DeviceState: 'IDLE', PollBuffer: [{ Type: 'DeviceStatusResponse', StateAsString: 'ACCEPTING' }] };
        }
        case 'ESCROW': {
            const val = acceptorNotes[acceptorNoteIdx];
            acceptorPhase = 'STACKING';
            return {
                DeviceState: 'IDLE',
                PollBuffer: [
                    { Type: 'DeviceStatusResponse', StateAsString: 'ESCROW' },
                    { Type: 'CashEventResponse', EventTypeAsString: 'ESCROW', Value: val, CountryCode: 'THB' },
                ],
            };
        }
        case 'STACKING': {
            const val       = acceptorNotes[acceptorNoteIdx];
            const eventType = STORED_VALUES.has(val) ? 'STORED' : 'STACKED';
            acceptorNoteIdx++;
            acceptorPhase = 'ACCEPTING';
            return {
                DeviceState: 'IDLE',
                PollBuffer: [
                    { Type: 'DeviceStatusResponse', StateAsString: eventType },
                    { Type: 'CashEventResponse', EventTypeAsString: eventType, Value: val, CountryCode: 'THB' },
                    { Type: 'DeviceStatusResponse', StateAsString: 'IDLE' },
                ],
            };
        }
        case 'DONE':
            return { DeviceState: 'IDLE', PollBuffer: [] };
        default:
            return { DeviceState: 'DISABLED', PollBuffer: [] };
    }
};

// คืน response สำหรับ GetAllLevels — รูปแบบตรงกับ real API
const buildGetAllLevels = () => {
    const ALL = [2000, 5000, 10000, 50000, 100000];
    return ALL.map(v => {
        const d = denomState.find(x => x.value === v);
        return {
            Value: v,
            CountryCode: 'THB',
            IsInhibited: false,
            IsRecyclable: true,
            AcceptRoute: d ? 'PAYOUT' : 'CASHBOX',
            StoredInPayout: d ? d.count : 0,
            StoredInCashbox: 0,
        };
    });
};

// คำนวณว่าจะจ่ายธนบัตรใบไหนบ้าง (greedy: ใหญ่ก่อน)
const calcDispense = (totalSatang) => {
    const sorted = [...denomState].sort((a, b) => b.value - a.value);
    let remaining = totalSatang;
    const notes = [];

    for (const denom of sorted) {
        while (remaining >= denom.value && denom.count > 0) {
            notes.push(denom.value);
            denom.count--;
            remaining -= denom.value;
        }
    }

    if (remaining !== 0) return null; // ทอนไม่ได้
    return notes;
};

// สร้าง DispenseValue response
const buildDispenseResult = (notes, totalSatang) => {
    const groups = {};
    notes.forEach(v => { groups[v] = (groups[v] || 0) + 1; });
    const paidStr = Object.entries(groups)
        .map(([v, c]) => `${c}x ${v} THB`)
        .join(', ');
    const operationData =
        `PAYOUT \r\n\tCompleted - \n\r\tPaid Out: (${totalSatang} THB: ${paidStr}) \n\r\tCashbox: (0 THB: - ) \n\r\tReplenished: (0 THB: - ) \n`;

    return {
        DispenseResult: 'COMPLETED',
        PayoutOperationData: operationData,
    };
};

// สร้าง GetDeviceStatus/v2 response หลัง dispense
const buildDeviceStatus = () => {
    if (!lastDispenseValue || lastDispenseNotes.length === 0) {
        return { DeviceState: 'DISABLED', PollBuffer: [] };
    }

    const groups = {};
    lastDispenseNotes.forEach(v => { groups[v] = (groups[v] || 0) + 1; });
    const paidStr = Object.entries(groups)
        .map(([v, c]) => `${c}x ${v} THB`)
        .join(', ');
    const operationData =
        `PAYOUT \r\n\tCompleted - \n\r\tPaid Out: (${lastDispenseValue} THB: ${paidStr}) \n\r\tCashbox: (0 THB: - ) \n\r\tReplenished: (0 THB: - ) \n`;

    return {
        DeviceState: 'DISABLED',
        PollBuffer: [
            { Type: 'DeviceStatusResponse', StateAsString: 'DISPENSING' },
            { Type: 'CashEventResponse', EventTypeAsString: 'DISPENSING', Value: lastDispenseValue, CountryCode: 'THB' },
            { Type: 'DeviceStatusResponse', StateAsString: 'NOTE_HELD_IN_BEZEL' },
            { Type: 'CashEventResponse', EventTypeAsString: 'NOTE_IN_BEZEL_HOLD', Value: lastDispenseNotes[0], CountryCode: 'THB' },
            { Type: 'DeviceStatusResponse', StateAsString: 'DISABLED' },
            { Type: 'CashEventResponse', EventTypeAsString: 'DISPENSED', Value: lastDispenseValue, CountryCode: 'THB' },
            { Type: 'DeviceStatusResponse', StateAsString: 'DISABLED' },
            { Type: 'DispenserTransactionEventResponse', StateAsString: 'COMPLETED', OperationData: operationData },
        ],
    };
};

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    // ── test helpers ──────────────────────────────────────────────────────────

    if (req.method === 'POST' && path === '/test/passthrough-scan') {
        passthroughScan = !passthroughScan;
        console.log(`[passthrough-scan] mode = ${passthroughScan ? 'ON (GetDeviceStatus → real device + log)' : 'OFF (mock)'}`);
        sendJson(res, 200, { ok: true, passthroughScan });
        return;
    }

    if (req.method === 'GET' && path === '/test/status') {
        sendJson(res, 200, {
            denomState, lastDispenseValue, lastDispenseNotes,
            acceptorEnabled, acceptorPhase, acceptorNotes, acceptorNoteIdx,
        });
        return;
    }

    if (req.method === 'POST' && path === '/test/reset') {
        let body = '';
        req.on('data', d => (body += d));
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                if (data.denoms !== undefined) resetState(data.denoms);
                if (data.amount !== undefined) resetAcceptor(data.amount);       // auto-calc จากยอด satang
                else if (data.notes !== undefined) resetAcceptor(data.notes);    // ระบุแบงค์เอง
                if (data.denoms === undefined && data.amount === undefined && data.notes === undefined) resetState(null);
                console.log('[reset] denoms:', JSON.stringify(denomState), '| acceptorNotes:', JSON.stringify(acceptorNotes));
                sendJson(res, 200, { ok: true });
            } catch (err) {
                sendJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    // ── mock CashDevice endpoints ─────────────────────────────────────────────

    if (PAYOUT_MOCK_ENABLED) {

        // GET /api/CashDevice/GetAllLevels
        if (req.method === 'GET' && path.includes('GetAllLevels')) {
            const body = buildGetAllLevels();
            console.log(`[GetAllLevels] storages: ${denomState.map(d => `${d.value/100}฿×${d.count}`).join(', ')}`);
            writeLog({ id, timestamp: nowIso(), path, mock: 'GetAllLevels', body });
            sendJson(res, 200, body);
            return;
        }

        // POST /api/CashDevice/EnablePayout
        if (req.method === 'POST' && path.includes('EnablePayout')) {
            console.log(`[EnablePayout] mock OK`);
            writeLog({ id, timestamp: nowIso(), path, mock: 'EnablePayout' });
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Payout enabled successfully.');
            return;
        }

        // POST /api/CashDevice/EnableAcceptor
        if (req.method === 'POST' && path.includes('EnableAcceptor')) {
            acceptorEnabled = true;
            acceptorPhase   = 'P1';
            acceptorNoteIdx = 0;
            console.log(`[EnableAcceptor] mock OK — notes: ${JSON.stringify(acceptorNotes)}`);
            writeLog({ id, timestamp: nowIso(), path, mock: 'EnableAcceptor', acceptorNotes });
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('SPECTRAL_PAYOUT-0: Acceptor enabled successfully.');
            return;
        }

        // POST /api/CashDevice/DisableAcceptor
        if (req.method === 'POST' && path.includes('DisableAcceptor')) {
            acceptorEnabled = false;
            acceptorPhase   = 'IDLE';
            console.log(`[DisableAcceptor] mock OK`);
            writeLog({ id, timestamp: nowIso(), path, mock: 'DisableAcceptor' });
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('SPECTRAL_PAYOUT-0: Acceptor disabled successfully.');
            return;
        }

        // POST /api/CashDevice/DispenseValue
        if (req.method === 'POST' && path.includes('DispenseValue')) {
            readBody(req).then(buf => {
                let totalSatang = 0;
                try {
                    const data = JSON.parse(buf.toString('utf8'));
                    totalSatang = data.Value || 0;
                } catch { /* ignore */ }

                const notes = calcDispense(totalSatang);

                if (!notes) {
                    console.warn(`[DispenseValue] ❌ ทอนไม่ได้ ${totalSatang} satang`);
                    sendJson(res, 200, { DispenseResult: 'FAILED', PayoutOperationData: 'Insufficient notes' });
                    return;
                }

                lastDispenseValue = totalSatang;
                lastDispenseNotes = notes;

                const result = buildDispenseResult(notes, totalSatang);
                console.log(`[DispenseValue] 💵 จ่าย ${totalSatang/100} บาท: ${notes.map(v => `${v/100}฿`).join('+')}`);
                writeLog({ id, timestamp: nowIso(), path, mock: 'DispenseValue', totalSatang, notes, result });
                sendJson(res, 200, result);
            });
            return;
        }

        // GET /api/CashDevice/GetDeviceStatus/v2
        if (req.method === 'GET' && path.includes('GetDeviceStatus')) {
            // passthrough-scan mode: ส่งต่อ real device เพื่อ capture scanner event format
            if (passthroughScan && !acceptorEnabled) {
                pendingReqs.set(id, { path, method: req.method, ts: nowIso() });
                req._proxyId = id;
                // fall through to pass-through below
            } else {
                const body = acceptorEnabled ? buildAcceptorStatus() : buildDeviceStatus();
                const mode = acceptorEnabled ? `acceptor phase=${acceptorPhase}` : `payout lastDispense=${lastDispenseValue}`;
                console.log(`[GetDeviceStatus/v2] ${mode}`);
                writeLog({ id, timestamp: nowIso(), path, mock: 'GetDeviceStatus', mode, body });
                sendJson(res, 200, body);
                return;
            }
        }
    }

    // ── pass-through to real device ───────────────────────────────────────────
    readBody(req).then(bodyBuffer => {
        if (passthroughScan && path.includes('GetDeviceStatus')) {
            console.log(`[capture] → ${req.method} ${path}`);
        }
        proxy.web(req, res, {
            target: PAYOUT_REAL,
            buffer: Readable.from([bodyBuffer]),
        });
    });
});

proxy.on('proxyRes', (proxyRes, req, res) => {
    const chunks = [];
    proxyRes.on('data', c => chunks.push(Buffer.from(c)));
    proxyRes.on('end', () => {
        const body = Buffer.concat(chunks);
        // log GetDeviceStatus responses ขณะอยู่ใน capture mode
        if (passthroughScan && req.url && req.url.includes('GetDeviceStatus')) {
            const bodyStr = body.toString('utf8');
            try {
                const parsed = JSON.parse(bodyStr);
                const hasPollBuffer = parsed.PollBuffer && parsed.PollBuffer.length > 0;
                if (hasPollBuffer) {
                    console.log(`[CAPTURE] GetDeviceStatus response WITH events:\n${JSON.stringify(parsed, null, 2)}`);
                    writeLog({ timestamp: nowIso(), capture: 'GetDeviceStatus', response: parsed });
                }
            } catch { /* ignore parse error */ }
        }
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        res.end(body);
    });
});

proxy.on('error', (err, req, res) => {
    console.error('Payout proxy error:', err.message);
    if (!res.headersSent) res.writeHead(502);
    res.end('Proxy error');
});

server.listen(PAYOUT_PROXY_PORT, '0.0.0.0', () => {
    console.log(`💸 Payout proxy รันที่ PC:${PAYOUT_PROXY_PORT}`);
    console.log(`   Mock mode: ${PAYOUT_MOCK_ENABLED ? 'ON' : 'OFF (pass-through)'}`);
    console.log(`   Real device: ${PAYOUT_REAL}`);
    console.log(`   Denominations: ${denomState.map(d => `${d.value/100}฿×${d.count}`).join(', ')}`);
});

server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
