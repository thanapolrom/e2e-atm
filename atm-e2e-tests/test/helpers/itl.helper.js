import { log } from './logger.js';

const ITL_URL = 'http://127.0.0.1:5001';
const DEVICE_ID = 'SPECTRAL_PAYOUT-0';

export async function authenticateITL() {
    const res = await fetch(`${ITL_URL}/api/Users/Authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Username: 'admin', Password: 'password' })
    });
    const data = await res.json();
    return data.token;
}

export async function openConnection(token) {
    const res = await fetch(`${ITL_URL}/api/CashDevice/OpenConnection`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            Port: 0,
            SspAddress: 0,
            EnableAcceptor: true,
            EnableAutoAcceptEscrow: false
        })
    });
    const data = await res.json();
    return data.DeviceID;
}

export async function enableAcceptor(token) {
    await fetch(`${ITL_URL}/api/CashDevice/EnableAcceptor?deviceID=${DEVICE_ID}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
    });
    log.pass('เปิดรับแบงค์แล้ว');
}

export async function disableAcceptor(token) {
    await fetch(`${ITL_URL}/api/CashDevice/DisableAcceptor?deviceID=${DEVICE_ID}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
    });
    log.info('🔒 ปิดรับแบงค์แล้ว');
}

export async function waitForEscrow(token, timeoutMs = 120000) {
    log.info('⏳ รอใส่แบงค์...');
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const res = await fetch(
            `${ITL_URL}/api/CashDevice/GetDeviceStatus?deviceID=${DEVICE_ID}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (data.stateAsString === 'ESCROW') {
            log.amount(data.amount);
            return data;
        }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('Timeout 120s รอใส่แบงค์');
}

export async function acceptFromEscrow(token) {
    await fetch(`${ITL_URL}/api/CashDevice/AcceptFromEscrow?deviceID=${DEVICE_ID}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
    });
    log.pass('รับแบงค์เข้า cashbox แล้ว');
}

export async function returnFromEscrow(token) {
    try {
        await fetch(`${ITL_URL}/api/CashDevice/ReturnFromEscrow?deviceID=${DEVICE_ID}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });
        log.warn('↩️ คืนแบงค์แล้ว');
    } catch {
        // ไม่มีแบงค์ค้างก็ไม่เป็นไร
    }
}
