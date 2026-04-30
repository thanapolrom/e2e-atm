const http = require('http');
const httpProxy = require('http-proxy');

const ITL_REAL = 'http://127.0.0.1:5001';

const proxy = httpProxy.createProxyServer({});

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

    if (req.method === 'GET' && path.includes('GetDeviceStatus')) {
        const fakeRes = getNextState();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fakeRes));
        return;
    }

    // status endpoint — ให้ test เช็คว่า proxy ส่งแบงค์ครบหรือยัง
    if (req.method === 'GET' && path === '/test/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ done }));
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
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (err) {
                console.error('Reset queue error:', err.message);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: err.message }));
            }
        });
        return;
    }

    console.log(`[FORWARD] ${req.method} ${path}`);
    proxy.web(req, res, { target: ITL_REAL });
});

proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502);
    res.end('Proxy error');
});

server.listen(5002, '0.0.0.0', () => {
    console.log('🔀 Proxy รันที่ PC:5002');
    console.log('   Queue:', JSON.stringify(noteQueue));
});

server.on('clientError', (err, socket) => {
    console.error('Client error:', err.message);
    if (socket.writable) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
});
