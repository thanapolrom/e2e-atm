const http = require('http');
const httpProxy = require('http-proxy');
const { Readable } = require('stream');

// proxy นี้ mock เฉพาะ EnableAcceptor / DisableAcceptor / GetDeviceStatus (acceptor mode)
// ทุกอย่างอื่นส่งต่อไปหาอุปกรณ์จริง
const REAL_DEVICE   = process.env.ACCEPTOR_REAL || 'http://127.0.0.1:5001';
const PROXY_PORT    = Number(process.env.ACCEPTOR_PORT || 5002);
const MOCK_ENABLED  = process.env.ACCEPTOR_MOCK !== '0';

// ─── Acceptor state ───────────────────────────────────────────────────────────

const STORED_VALUES   = new Set([10000, 50000]);
const ACCEPTOR_DENOMS = [100000, 50000, 10000, 5000, 2000];

let acceptorEnabled = false;
let acceptorNotes   = [];
let acceptorNoteIdx = 0;
let acceptorPhase   = 'IDLE';

const calcNotes = (amountSatang) => {
    let rem = amountSatang;
    const out = [];
    for (const v of ACCEPTOR_DENOMS) {
        while (rem >= v) { out.push(v); rem -= v; }
    }
    if (rem > 0) {
        // remainder doesn't fit any denom exactly — add smallest denom that covers it
        const fill = [...ACCEPTOR_DENOMS].reverse().find(v => v >= rem);
        if (fill) out.push(fill);
    }
    return out;
};

const parseNotes = (input) => {
    if (typeof input === 'number') return calcNotes(input);
    if (Array.isArray(input)) return input.flatMap(n => {
        const value = typeof n === 'object' ? n.value : n;
        const count = (typeof n === 'object' && n.count) ? n.count : 1;
        return Array(count).fill(value);
    });
    return [];
};

const resetAcceptor = (input = []) => {
    const notes = parseNotes(input);
    if (acceptorEnabled) {
        // inject notes into running acceptor — reset index so ACCEPTING picks them up
        acceptorNotes   = notes;
        acceptorNoteIdx = 0;
    } else {
        acceptorNotes   = notes;
        acceptorNoteIdx = 0;
        acceptorPhase   = 'IDLE';
    }
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
                // no notes yet — stay ACCEPTING and wait for /test/reset to inject notes
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

// ─── HTTP ─────────────────────────────────────────────────────────────────────

const proxy = httpProxy.createProxyServer({ selfHandleResponse: true });
proxy.on('proxyRes', (proxyRes, req, res) => {
    const chunks = [];
    proxyRes.on('data', c => chunks.push(Buffer.from(c)));
    proxyRes.on('end', () => { res.writeHead(proxyRes.statusCode, proxyRes.headers); res.end(Buffer.concat(chunks)); });
});
proxy.on('error', (err, req, res) => {
    console.error('proxy error:', err.message);
    if (!res.headersSent) res.writeHead(502);
    res.end('Proxy error');
});

const sendJson = (res, code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
});
const passThrough = (req, res, bodyBuffer) => {
    proxy.web(req, res, { target: REAL_DEVICE, buffer: Readable.from([bodyBuffer]) });
};

const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];

    // ── test helpers ──────────────────────────────────────────────────────────

    if (req.method === 'GET' && path === '/test/status') {
        sendJson(res, 200, { acceptorEnabled, acceptorPhase, acceptorNotes, acceptorNoteIdx });
        return;
    }

    if (req.method === 'POST' && path === '/test/reset') {
        readBody(req).then(buf => {
            try {
                const data = JSON.parse(buf.toString('utf8') || '{}');
                if (data.amount !== undefined) resetAcceptor(data.amount);
                else if (data.notes !== undefined) resetAcceptor(data.notes);
                else resetAcceptor([]);
                const notes = acceptorNotes.map(v => `${v/100}฿`).join('+') || '(ว่าง)';
                console.log(`[reset] notes: ${notes}`);
                sendJson(res, 200, { ok: true, acceptorNotes });
            } catch (err) {
                sendJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    // ── mock acceptor endpoints ───────────────────────────────────────────────

    readBody(req).then(bodyBuffer => {
        if (MOCK_ENABLED && path.includes('/api/CashDevice/')) {

            if (req.method === 'POST' && path.includes('EnableAcceptor')) {
                acceptorEnabled = true;
                acceptorPhase   = 'P1';
                acceptorNoteIdx = 0;
                const notes = acceptorNotes.map(v => `${v/100}฿`).join('+') || '(ว่าง)';
                console.log(`[EnableAcceptor] notes: ${notes}`);
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('SPECTRAL_PAYOUT-0: Acceptor enabled successfully.');
                return;
            }

            if (req.method === 'POST' && path.includes('DisableAcceptor')) {
                acceptorEnabled = false;
                acceptorPhase   = 'IDLE';
                console.log('[DisableAcceptor]');
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('SPECTRAL_PAYOUT-0: Acceptor disabled successfully.');
                return;
            }

            if (req.method === 'GET' && path.includes('GetDeviceStatus') && acceptorEnabled) {
                const body = buildAcceptorStatus();
                console.log(`[GetDeviceStatus] phase=${acceptorPhase}`);
                sendJson(res, 200, body);
                return;
            }
        }

        // ── pass-through ──────────────────────────────────────────────────────
        passThrough(req, res, bodyBuffer);
    });
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
    console.log(`Acceptor proxy listening on PC:${PROXY_PORT}`);
    console.log(`   Mock: ${MOCK_ENABLED ? 'ON' : 'OFF'} | Real device: ${REAL_DEVICE}`);
    console.log(`   Set notes: POST http://localhost:${PROXY_PORT}/test/reset  body: {"amount": 10000}`);
});

server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
