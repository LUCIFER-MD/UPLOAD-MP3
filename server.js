const express = require('express');
const multer = require('multer');
const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { Boom } = require('@hapi/boom');

const { state, saveState } = useSingleFileAuthState('./auth_info.json');
const app = express();
const port = 3000;

let sock;

// Multer for audio upload
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Serve static files
app.use(express.static('public'));

// Start WhatsApp connection and show QR
app.get('/qr', async (req, res) => {
    sock = makeWASocket({ auth: state });

    sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
        if (qr) {
            qrcode.toDataURL(qr, (err, url) => {
                res.send(`<img src="${url}"><p>Scan this QR code with WhatsApp</p>`);
            });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                makeWASocket({ auth: state });
            }
        } else if (connection === 'open') {
            saveState();
            console.log("✅ WhatsApp connected");
        }
    });

    sock.ev.on('creds.update', saveState);
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
