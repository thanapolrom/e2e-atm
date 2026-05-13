const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const pathModule = require('path');
const { Readable } = require('stream');
const zlib = require('zlib');

const ITL_REAL = process.env.ITL_REAL || 'http://127.0.0.1:5001';

const proxy = httpProxy.createProxyServer({ selfHandleResponse: true });
const API_LOG_ENABLED = process.env.API_LOG !== '0';
const ITL_MOCK_ENABLED = process.env.ITL_MOCK !== '0';
const API_LOG_DIR = process.env.API_LOG_DIR || pathModule.join(__dirname, 'logs');
const API_LOG_FILE = process.env.API_LOG_FILE || pathModule.join(
    API_LOG_DIR,
    `api-traffic-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
);
const SENSITIVE_KEYS = /pass(word)?|pin|otp|token|secret|authorization|cookie|session|credential/i;
const MAX_LOG_BODY_CHARS = Number(process.env.API_LOG_MAX_BODY_CHARS || 20000);

if (API_LOG_ENABLED) {
    fs.mkdirSync(API_LOG_DIR, { recursive: true });
    console.log(`API traffic log: ${API_LOG_FILE}`);
}

const nowIso = () => new Date().toISOString();

const truncateString = (value) => {
    if (typeof value !== 'string' || value.length <= MAX_LOG_BODY_CHARS) {
        return value;
    }

    return `${value.slice(0, MAX_LOG_BODY_CHARS)}...<truncated ${value.length - MAX_LOG_BODY_CHARS} chars>`;
};

const redactValue = (value) => {
    if (Array.isArray(value)) {
        return value.map(redactValue);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => {
            if (SENSITIVE_KEYS.test(key)) {
                return [key, '<redacted>'];
            }

            return [key, redactValue(nestedValue)];
        }));
    }

    return truncateString(value);
};

const normalizeHeaders = (headers = {}) => {
    return Object.fromEntries(Object.entries(headers).map(([key, value]) => {
        if (SENSITIVE_KEYS.test(key)) {
            return [key, '<redacted>'];
        }

        return [key, value];
    }));
};

const parseBodyForLog = (bodyBuffer, contentType = '') => {
    if (!bodyBuffer || bodyBuffer.length === 0) {
        return null;
    }

    if (!/json|text|xml|x-www-form-urlencoded/i.test(contentType)) {
        return `<${bodyBuffer.length} bytes binary/body omitted>`;
    }

    const bodyText = bodyBuffer.toString('utf8');

    if (/json/i.test(contentType)) {
        try {
            return redactValue(JSON.parse(bodyText));
        } catch {
            return truncateString(bodyText);
        }
    }

    return truncateString(bodyText);
};

const decodeBodyForLog = (bodyBuffer, headers = {}) => {
    if (!bodyBuffer || bodyBuffer.length === 0) {
        return bodyBuffer;
    }

    const contentEncoding = String(headers['content-encoding'] || '').toLowerCase();

    try {
        if (contentEncoding.includes('gzip')) {
            return zlib.gunzipSync(bodyBuffer);
        }

        if (contentEncoding.includes('deflate')) {
            return zlib.inflateSync(bodyBuffer);
        }

        if (contentEncoding.includes('br')) {
            return zlib.brotliDecompressSync(bodyBuffer);
        }
    } catch (err) {
        console.warn(`Failed to decode response body for log (${contentEncoding}): ${err.message}`);
    }

    return bodyBuffer;
};

const writeApiLog = (entry) => {
    if (!API_LOG_ENABLED) {
        return;
    }

    fs.appendFileSync(API_LOG_FILE, `${JSON.stringify(entry)}\n`);
};

const readRequestBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
});

const sendJson = (req, res, statusCode, body, meta = {}) => {
    const responseBody = Buffer.from(JSON.stringify(body));
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(responseBody);

    writeApiLog({
        id: meta.id,
        timestamp: nowIso(),
        direction: 'response',
        source: meta.source || 'proxy',
        method: req.method,
        path: meta.path || req.url.split('?')[0],
        statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: redactValue(body),
    });
};

const forwardWithLogging = (req, res, bodyBuffer, meta) => {
    console.log(`[FORWARD] ${req.method} ${meta.path}`);

    req._apiLogMeta = {
        ...meta,
        requestStartedAt: Date.now(),
    };

    proxy.web(req, res, {
        target: ITL_REAL,
        buffer: Readable.from([bodyBuffer]),
    });
};

// เริ่มต้นแบบ idle ก่อน แล้วค่อย arm ผ่าน /test/reset
let noteQueue = [];

let pollCount = 0;
let currentNoteIndex = 0;
let currentNoteCount = 0;
let phase = 'IDLE'; // IDLE → ACCEPTING → ESCROW → ACCEPTING2 → STORED → next note or DONE
let done = true;

const resetQueue = (notes = []) => {
    noteQueue = Array.isArray(notes) ? notes : [];
    pollCount = 0;
    currentNoteIndex = 0;
    currentNoteCount = 0;
    phase = 'IDLE';
    done = noteQueue.length === 0;
};

const getNextState = () => {
    pollCount++;

    if (done || noteQueue.length === 0) {
        return { DeviceState: 'IDLE', PollBuffer: [] };
    }

    // รอ 5 polls ก่อนเริ่ม
    if (pollCount < 2 && phase === 'IDLE') {
        return { DeviceState: 'IDLE', PollBuffer: [] };
    }

    if (phase === 'IDLE') {
        phase = 'ACCEPTING';
        pollCount = 0;
        return { DeviceState: 'ACCEPTING', PollBuffer: [{ Type: 'DeviceStatusResponse', StateAsString: 'ACCEPTING' }] };
    }

    if (phase === 'ACCEPTING' && pollCount === 1) {
        const note = noteQueue[currentNoteIndex];

        if (!note) {
            console.warn('⚠️ No note available for current index, returning to IDLE');
            done = true;
            phase = 'DONE';
            return { DeviceState: 'IDLE', PollBuffer: [] };
        }

        console.log(`💰 Fake ESCROW! แบงค์ ${note.value/100} บาท (ใบที่ ${currentNoteCount + 1}/${note.count})`);
        phase = 'ESCROW';
        return {
            DeviceState: 'ACCEPTING',
            PollBuffer: [{
                Type: 'CashEventResponse',
                EventTypeAsString: 'ESCROW',
                Value: note.value,
                CountryCode: 'THB'
            }]
        };
    }

    if (phase === 'ESCROW') {
        phase = 'ACCEPTING2';
        return { DeviceState: 'ACCEPTING', PollBuffer: [] };
    }

    if (phase === 'ACCEPTING2') {
        const note = noteQueue[currentNoteIndex];
        currentNoteCount++;

        console.log(`✅ Fake STORED! แบงค์ ${note.value/100} บาท`);

        // เช็คว่าครบจำนวนใบของ denomination นี้ไหม
        if (currentNoteCount >= note.count) {
            currentNoteIndex++;
            currentNoteCount = 0;

            // เช็คว่าหมด queue ไหม
            if (currentNoteIndex >= noteQueue.length) {
                done = true;
                console.log('🎉 ใส่แบงค์ครบแล้ว!');
            }
        }

        phase = done ? 'DONE' : 'ACCEPTING';
        pollCount = 0;

        return {
            DeviceState: 'IDLE',
            PollBuffer: [
                { Type: 'CashEventResponse', EventTypeAsString: 'STORED', Value: note.value, CountryCode: 'THB' },
                { Type: 'DeviceStatusResponse', StateAsString: 'IDLE' }
            ]
        };
    }

    return { DeviceState: 'IDLE', PollBuffer: [] };
};

const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    if (ITL_MOCK_ENABLED && req.method === 'GET' && path.includes('GetDeviceStatus')) {
        const fakeRes = getNextState();
        writeApiLog({
            id: requestId,
            timestamp: nowIso(),
            direction: 'request',
            source: 'app',
            method: req.method,
            path,
            url: req.url,
            headers: normalizeHeaders(req.headers),
            body: null,
        });
        sendJson(req, res, 200, fakeRes, { id: requestId, path, source: 'proxy-fake' });
        return;
    }

    // status endpoint — ให้ test เช็คว่า proxy ส่งแบงค์ครบหรือยัง
    if (req.method === 'GET' && path === '/test/status') {
        sendJson(req, res, 200, { done }, { id: requestId, path, source: 'proxy-test' });
        return;
    }

    // reset queue endpoint สำหรับ test ถัดไป
    if (req.method === 'POST' && path === '/test/reset') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                resetQueue(data.notes); // [{ value: 50000, count: 3 }, ...]
                console.log('🔄 Reset queue:', JSON.stringify(noteQueue));
                sendJson(req, res, 200, { ok: true }, { id: requestId, path, source: 'proxy-test' });
            } catch (err) {
                console.error('Reset queue error:', err.message);
                sendJson(req, res, 400, { ok: false, error: err.message }, { id: requestId, path, source: 'proxy-test' });
            }
        });
        return;
    }

    readRequestBody(req)
        .then(bodyBuffer => {
            writeApiLog({
                id: requestId,
                timestamp: nowIso(),
                direction: 'request',
                source: 'app',
                method: req.method,
                path,
                url: req.url,
                headers: normalizeHeaders(req.headers),
                body: parseBodyForLog(bodyBuffer, req.headers['content-type']),
            });

            forwardWithLogging(req, res, bodyBuffer, { id: requestId, path });
        })
        .catch(err => {
            console.error('Read request body error:', err.message);
            sendJson(req, res, 500, { ok: false, error: err.message }, { id: requestId, path, source: 'proxy' });
        });
});

proxy.on('proxyRes', (proxyRes, req, res) => {
    const chunks = [];
    const meta = req._apiLogMeta || {};

    proxyRes.on('data', chunk => chunks.push(Buffer.from(chunk)));
    proxyRes.on('end', () => {
        const responseBody = Buffer.concat(chunks);
        const headers = normalizeHeaders(proxyRes.headers);
        const decodedResponseBody = decodeBodyForLog(responseBody, proxyRes.headers);

        writeApiLog({
            id: meta.id,
            timestamp: nowIso(),
            direction: 'response',
            source: 'itl-real',
            method: req.method,
            path: meta.path || req.url.split('?')[0],
            statusCode: proxyRes.statusCode,
            durationMs: meta.requestStartedAt ? Date.now() - meta.requestStartedAt : undefined,
            headers,
            body: parseBodyForLog(decodedResponseBody, proxyRes.headers['content-type']),
        });

        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        res.end(responseBody);
    });
});

proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err.message);

    writeApiLog({
        id: req?._apiLogMeta?.id,
        timestamp: nowIso(),
        direction: 'response',
        source: 'proxy-error',
        method: req?.method,
        path: req?._apiLogMeta?.path || req?.url?.split('?')[0],
        statusCode: 502,
        error: err.message,
    });

    if (!res.headersSent) {
        res.writeHead(502);
    }

    res.end('Proxy error');
});

server.listen(5002, '0.0.0.0', () => {
    console.log('🔀 Proxy รันที่ PC:5002');
    console.log(`   ITL mock mode: ${ITL_MOCK_ENABLED ? 'ON' : 'OFF (pass-through real device status)'}`);
    console.log('   Queue:', JSON.stringify(noteQueue));
});

server.on('clientError', (err, socket) => {
    console.error('Client error:', err.message);
    if (socket.writable) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
});
