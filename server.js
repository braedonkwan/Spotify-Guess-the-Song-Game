// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');


// client states
const SET_USERNAME = 1
const READY = 2
const SETUP = 3
const SELECT_ANSWER = 4
const WAITING = 5
const SCOREBOARD = 6
const GAME_OVER = 7
const PLAY_AGAIN = 8



// load .env variables
const {
    PORT,
    IP_ADDRESS,
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
    REFRESH_TOKEN
} = process.env;


// global variables
const REFRESH_FREQUENCY = 55
const MAX_ATTEMPTS = 100
let accessToken;


async function refreshAccessToken(delayMs) {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {

        // fetch access token
        try {
            const resp = await axios.post('https://accounts.spotify.com/api/token', null, {
                params: {
                    grant_type: 'refresh_token',
                    refresh_token: REFRESH_TOKEN,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                }
            });
            accessToken = resp.data.access_token;
            console.log(`\nAccess token has been refreshed\n`);
            return accessToken;
        } catch {
            console.warn(`\n[Warning]: Attempt ${i + 1} to refresh access token failed\n`);
            if (i < MAX_ATTEMPTS - 1) { // avoids delay on last attempt
                await new Promise(res => setTimeout(res, delayMs));
            }
        }

    }
    console.error('\n[ERROR]: All attempts to refresh the token failed. Server closing...');
    process.exit();
}


// Spotify API functions
async function getUserPlaylists() {
    const result = [];
    let url = 'https://api.spotify.com/v1/me/playlists';
    try {
        while (url) {
            const resp = await axios.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const playlists = resp.data.items.map(p => ({
                name: p.name,
                playlistID: p.id
            }));
            result.push(...playlists);
            url = resp.data.next;
        }
        return result;
    } catch {
        console.error('\n[ERROR]: Failed to fetch user\'s playlists');
        process.exit();
    }
}

async function loadPlaylist(playlistId) {
    const allTracks = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
    try {
        while (url) {
            const resp = await axios.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            allTracks.push(...resp.data.items);
            url = resp.data.next;
        }
        return allTracks;
    } catch (err) {
        console.error('\n[ERROR]: Failed to load playlist:', playlistId, err.response?.data || err.message);
        process.exit();
    }
}

async function playPlaylist(playlistId) {
    try {
        await axios.put(
            'https://api.spotify.com/v1/me/player/play',
            { context_uri: `spotify:playlist:${playlistId}` },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        console.log(`\nStarted playing playlist: ${playlistId}\n`);
    } catch {
        console.error('\n[WARNING]: Failed to play playlist:', playlistId);
        process.exit();
    }
}

async function playTrack() {
    try {
        await axios.put('https://api.spotify.com/v1/me/player/play', null, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    } catch {
        console.warn('\n[WARNING]: Failed to play track\n');
    }
}

async function pauseTrack() {
    try {
        await axios.put('https://api.spotify.com/v1/me/player/pause', null, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    } catch {
        console.warn('\n[WARNING]: Failed to pause track\n');
    }
}

async function getCurrentTrack() {
    try {
        const resp = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return resp.data?.item || null;
    } catch {
        console.error('\n[ERROR]: Failed to get current track');
        process.exit();
    }
}

async function nextTrack() {
    try {
        await axios.post('https://api.spotify.com/v1/me/player/next', null, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
    } catch {
        console.error('\n[ERROR]: Failed to skip to next track');
        process.exit();
    }
}


// helper functions
function getRandomTrack(playlist) {
    if (!playlist?.length) {
        console.error('\n[ERROR]: Selected playlist is empty');
        process.exit();
    }
    const i = Math.floor(Math.random() * playlist.length);
    return playlist[i].track;
}

async function songSelection(playlist) {
    const clean = s => s.replace(/\s(?:\(feat\..*|\(with.*)/i, '');
    const current = await getCurrentTrack().catch(() => {
        console.error('\n[ERROR]: No track currently playing');
        process.exit();
    });
    if (playlist.length < 4) {
        console.error('\n[ERROR]: Playlist must have at least 4 tracks');
        process.exit();
    }
    const out = {
        'current track': {
            name: clean(current.name),
            artists: current.artists.map(a => a.name).join(', ')
        }
    };
    const seen = new Set([current.id]);
    for (let i = 1; i <= 3; i++) {
        let rnd;
        do {
            rnd = getRandomTrack(playlist);
        } while (seen.has(rnd.id));
        seen.add(rnd.id);
        out[`random track ${i}`] = {
            name: clean(rnd.name),
            artists: rnd.artists.map(a => a.name).join(', ')
        };
    }
    return out;
}


// start refresh loop for access token
(async () => {
    accessToken = await refreshAccessToken(5000);
    setInterval(() => {
        refreshAccessToken(5000);
    }, REFRESH_FREQUENCY * 60 * 1000);
})();


// express + websocket setup
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.use('/game', express.static(path.join(__dirname, 'client', 'build')));
app.get('/game/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'build', 'index.html'));
});


const clients = new Map();
let clientIDCounter = 0;
let playlist, selections, scoreboard, rounds, maxRounds, startTime;


// helper function to sleep
const sleep = ms => new Promise(r => setTimeout(r, ms));


// on client connection
wss.on('connection', ws => {
    const clientID = clientIDCounter++;
    clients.set(clientID, { ws, state: SET_USERNAME, username: '', answer: null, answerTime: 0, gameleader: clientID === 0 });
    console.log(`\nClient ${clientID} connected\n`);

    // on client message
    ws.on('message', async msg => {
        const client = clients.get(clientID);
        const text = msg.toString();

        // SET_USERNAME
        if (client.state === SET_USERNAME) {
            client.username = text;
            if (client.gameleader) {
                const playlists = await getUserPlaylists()
                client.state = SETUP
                return ws.send(JSON.stringify(playlists));
            }
            client.state = READY
            return ws.send(`state ${client.state}`);
        }

        // SETUP
        if (client.state === SETUP) {
            const cfg = JSON.parse(text);
            rounds = 1;
            maxRounds = cfg['max rounds'];
            playlist = await loadPlaylist(cfg['playlist ID']);
            await playPlaylist(cfg['playlist ID']);
            selections = await songSelection(playlist);
            scoreboard = {};
            clients.forEach((c, id) => {
                if (c.state === READY || c.state === SETUP) {
                    c.state = SELECT_ANSWER;
                    scoreboard[id] = { username: c.username, score: 0 };
                    c.ws.send(JSON.stringify(selections));
                }
            });
            startTime = Date.now();
            return;
        }

        // SELECT_ANSWER
        if (client.state === SELECT_ANSWER) {
            client.answerTime = Date.now() - startTime;
            client.answer = JSON.parse(text);
            client.state = WAITING;
            if ([...clients.values()].every(c => c.state !== SELECT_ANSWER)) {
                clients.forEach((c, id) => {
                    if (c.state === WAITING && JSON.stringify(c.answer) === JSON.stringify(selections['current track'])) {
                        scoreboard[id].score += (1000 - Math.round(Math.sqrt(c.answerTime)));
                    }
                });
                clients.forEach(c => {
                    if (c.state === WAITING) {
                        c.state = SCOREBOARD;
                        c.ws.send(JSON.stringify(scoreboard));
                    }
                });
                await sleep(10000);
                if (rounds === maxRounds) {
                    clients.forEach(c => { if (c.state === SCOREBOARD) { c.state = GAME_OVER; c.ws.send('state 7'); } });
                    await sleep(5000);
                    clients.forEach((c, id) => {
                        if (c.state === GAME_OVER && c.gameleader) { c.state = PLAY_AGAIN; c.ws.send('state 8'); }
                    });
                } else {
                    rounds++;
                    await nextTrack();
                    await sleep(500);
                    selections = await songSelection(playlist);
                    clients.forEach(c => {
                        if (c.state === SCOREBOARD) {
                            c.state = SELECT_ANSWER;
                            c.ws.send(JSON.stringify(selections));
                        }
                    });
                    startTime = Date.now();
                }
            }
            return;
        }

        // PLAY_AGAIN
        if (client.state === PLAY_AGAIN) {
            if (text === 'play again') {
                rounds = 1;
                scoreboard = {};
                await nextTrack();
                await sleep(500);
                selections = await songSelection(playlist);
                clients.forEach((c, id) => {
                    if (c.state === GAME_OVER || c.state === PLAY_AGAIN) {
                        c.state = SELECT_ANSWER;
                        scoreboard[id] = { username: c.username, score: 0 };
                        c.ws.send(JSON.stringify(selections));
                    }
                });
                startTime = Date.now();
            } else {
                clients.forEach(c => {
                    if (c.state === GAME_OVER || c.state === PLAY_AGAIN) {
                        c.state = SET_USERNAME;
                        c.ws.send('state 1');
                    }
                });
            }
        }
    });

    // on client close
    ws.on('close', async () => {
        console.log(`Client ${clientID} disconnected`);
        const wasLeader = clients.get(clientID)?.gameleader;
        clients.delete(clientID);
        if (wasLeader && clients.size > 0) {
            const nextID = Math.min(...clients.keys());
            const nextLeader = clients.get(nextID);
            nextLeader.gameleader = true;
            if (nextLeader.state === READY) {
                const playlists = await getUserPlaylists()
                nextLeader.state = SETUP;
                nextLeader.send(JSON.stringify(playlists));
            }
        }
        if (clients.size === 0) clientIDCounter = 0;
    });

});


// run server
server.listen(PORT, IP_ADDRESS, () => {
    console.log(`Server running on ${IP_ADDRESS}:${PORT}`);
});
