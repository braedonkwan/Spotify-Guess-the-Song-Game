require('dotenv').config();
const open = require('open').default;
const express = require('express');
const axios = require('axios');

const app = express();

const {
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
    PORT
} = process.env;

const scope = 'user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative';

app.get('/', (req, res) => {
    const authURL = `https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${encodeURIComponent(
        scope
    )}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    res.redirect(authURL);
});

app.get('/callback', async (req, res) => {
    const code = req.query.code;

    try {
        const resp = await axios.post(
            'https://accounts.spotify.com/api/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        const { refresh_token } = resp.data;
        console.log(`\nYour refresh token is: ${refresh_token}\n`);
    } catch {
        console.error('\n[ERROR]: Failed to retreive refresh token');
    }
});

// Start server and open browser
app.listen(PORT, () => {
    console.log(`\nServer running on http://localhost:${PORT}\n`);
    open(`http://localhost:${PORT}`);
});
