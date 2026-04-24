const express = require('express');
const app = express();
app.use(express.json());

let pollCount = 0;
let mockAmount = 500;

app.post('/api/Users/Authenticate', (req, res) => {
    console.log('🔐 Authenticate');
    res.json({ token: 'mock-token' });
});

app.post('/api/CashDevice/OpenConnection', (req, res) => {
    console.log('🔌 OpenConnection');
    res.json({ DeviceID: 'SPECTRAL_PAYOUT-0', IsOpen: true });
});

app.post('/api/CashDevice/EnableAcceptor', (req, res) => {
    console.log('✅ EnableAcceptor');
    pollCount = 0;
    res.json({ message: 'OK' });
});

app.post('/api/CashDevice/DisableAcceptor', (req, res) => {
    console.log('🔒 DisableAcceptor');
    res.json({ message: 'OK' });
});

app.get('/api/CashDevice/GetDeviceStatus', (req, res) => {
    pollCount++;
    if (pollCount < 5) {
        res.json({ stateAsString: 'IDLE', amount: 0 });
    } else {
        console.log(`💰 ESCROW ${mockAmount} บาท`);
        res.json({ stateAsString: 'ESCROW', amount: mockAmount });
        pollCount = 0;
    }
});

app.post('/api/CashDevice/AcceptFromEscrow', (req, res) => {
    console.log('✅ AcceptFromEscrow');
    res.json({ message: 'OK' });
});

app.post('/api/CashDevice/ReturnFromEscrow', (req, res) => {
    console.log('↩️ ReturnFromEscrow');
    res.json({ message: 'OK' });
});

app.post('/test/setAmount', (req, res) => {
    mockAmount = req.body.amount;
    console.log(`🎛️ setAmount = ${mockAmount}`);
    res.json({ ok: true });
});

app.listen(5001, () => console.log('🚀 Mock ITL Server รันที่ http://localhost:5001'));