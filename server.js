const express = require('express');
const multer = require('multer');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = 3000;

let sock;
let pairingCode = null;

// Set up auth directory and file storage
const authDir = './auth_info';
const { state, saveState } = useMultiFileAuthState(authDir);

// Multer for audio upload
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Serve static files
app.use(express.static('public'));

// Generate a pairing code (unique)
function generatePairingCode() {
    return crypto.randomBytes(4).toString('hex'); // Generates 8-character pair code
}

// Endpoint to generate pair code
app.get('/pair-code', (req, res) => {
    pairingCode = generatePairingCode();
    res.send(`Your pairing code: ${pairingCode}`);
});

// Endpoint to pair the device using the pair code
app.post('/pair', (req, res) => {
    const { code } = req.body;
    
    if (code === pairingCode) {
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false
        });

        sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
            if (connection === 'open') {
                saveState();
                res.send("✅ Pairing successful! Device is now paired.");
            } else if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    makeWASocket({ auth: state });
                }
            }
        });

        sock.ev.on('creds.update', saveState);
    } else {
        res.status(400).send('❌ Invalid pairing code');
    }
});

// Upload audio & send to WhatsApp
app.post('/upload', upload.single('audio'), async (req, res) => {
    if (!sock || !sock.user) {
        return res.send('⚠️ WhatsApp not connected!');
    }

    const filePath = req.file.path;
    const userNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';

    try {
        await sock.sendMessage(userNumber, {
            audio: fs.readFileSync(filePath),
            mimetype: 'audio/mpeg',
            ptt: false
        });

        res.send(`✅ Audio sent to your WhatsApp number: ${userNumber}`);
    } catch (err) {
        console.error('Failed to send audio:', err);
        res.status(500).send('❌ Failed to send audio.');
    }
});

app.listen(port, () => {
    console.log(`🌐 Server running at http://localhost:${port}`);
});
