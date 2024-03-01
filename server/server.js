// Imports
require('dotenv').config()
const express = require('express')
const passport = require('passport')
const SpotifyStrategy = require('passport-spotify').Strategy
const session = require('express-session')
const axios = require('axios')
const path = require('path')
const WebSocket = require('ws')
const http = require('http')


// Global variables
const app = express()
let accessToken
let refreshToken
let expiresIn


// Setup for Spotify OAuth 2.0
passport.serializeUser((user, done) => done(null, user))
passport.deserializeUser((obj, done) => done(null, obj))

passport.use(
    new SpotifyStrategy(
        {
            clientID: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
            callbackURL: process.env.CALLBACK_URL,
        },
        function (access_token, refresh_token, expires_in, profile, done) {
            accessToken = access_token
            refreshToken = refresh_token
            expiresIn = expires_in
            handleTokenRefresh()
            console.log('Retrieved access and refresh tokens')
            return done(null, profile)
        }
    )
)

app.use(session({ secret: 'secret', resave: true, saveUninitialized: true }))
app.use(passport.initialize())
app.use(passport.session())


// Request to Spotify server
async function handleTokenRefresh() {
    await sleep((expiresIn - 60) * 1000)
    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', null, {
            params: {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: process.env.SPOTIFY_CLIENT_ID,
                client_secret: process.env.SPOTIFY_CLIENT_SECRET
            }
        })
        accessToken = response.data.access_token
        if (response.data.refresh_token != null) {
            refreshToken = response.data.refresh_token
        }
        console.log('Refreshed access token')
        handleTokenRefresh()
    } catch (error) {
        console.error('Error refreshing token:', error.message)
        setTimeout(handleTokenRefresh, 5000)
    }
}

async function nextTrack(accessToken) {
    try {
        await axios.post('https://api.spotify.com/v1/me/player/next', null, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })
    } catch (error) {
        console.error('Error skipping to next track:', error)
    }
}

async function pauseTrack(accessToken) {
    try {
        await axios.put('https://api.spotify.com/v1/me/player/pause', null, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })
    } catch (error) {
        console.error('Error pausing playback:', error)
    }
}

async function getCurrentTrack(accessToken) {
    try {
        const response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })
        return response.data.item
    } catch (error) {
        console.error('Error getting current track:', error)
    }
}

async function loadPlaylist(accessToken, playlistId) {
    try {
        const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })
        return response.data.items
    } catch (error) {
        console.error('Error loading playlist:', error)
    }
}


// Game functions
function getRandomTrack(playlist) {
    const randomIndex = Math.floor(Math.random() * playlist.length)
    const randomTrack = playlist[randomIndex].track
    return randomTrack
}

async function songSelection(accessToken, playlist) {
    let selections = {
        'current track': {},
        'random track 1': {},
        'random track 2': {},
        'random track 3': {}
    }
    const currentTrack = await getCurrentTrack(accessToken)
    const pattern = /\s(?:\(feat\..*|\(with.*)/
    selections['current track'] = {
        'name': currentTrack.name.replace(pattern, ''),
        'artists': currentTrack.artists.map(artist => artist.name).join(', ')
    }
    const trackIds = new Set([currentTrack.id])
    while (trackIds.size < 4) {
        const randomTrack = getRandomTrack(playlist)
        if (!trackIds.has(randomTrack.id)) {
            trackIds.add(randomTrack.id)
            selections[`random track ${trackIds.size - 1}`] = {
                'name': randomTrack.name.replace(pattern, ''),
                'artists': randomTrack.artists.map(artist => artist.name).join(', ')
            }
        }
    }
    return selections
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}


// Websocket logic
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })
const clients = new Map()
let scoreboard
let selections
let playlist
let rounds
let maxRounds
let clientIDCounter = 0
let startTime

wss.on('connection', function connection(ws) {
    console.log('A client connected via WebSocket')
    const clientID = clientIDCounter++
    clients.set(clientID, {
        ws: ws,
        username: '',
        state: 1,
        gameleader: clientID === 0,
        answer: '',
        answerTime: 0
    })
    ws.on('message', async function incoming(message) {
        const client = clients.get(clientID)
        if (client.state === 1) {
            client.username = message.toString()
            if (client.gameleader) {
                client.state = 3
                ws.send('state 3')
            } else {
                client.state = 2
                ws.send('state 2')
            }
        }
        else if (client.state === 3) {
            const dataRecv = JSON.parse(message)
            rounds = 1
            maxRounds = dataRecv['max rounds']
            playlist = await loadPlaylist(accessToken, dataRecv['playlist ID'])
            await nextTrack(accessToken)
            await sleep(500)
            selections = await songSelection(accessToken, playlist)
            scoreboard = {}
            clients.forEach((properties, id) => {
                if (properties.state === 2 || properties.state === 3) {
                    properties.state = 4
                    scoreboard[id.toString()] = {
                        'username': properties.username,
                        'score': 0
                    }
                    properties.ws.send(JSON.stringify(selections))
                }
            })
            startTime = Date.now()
        }
        else if (client.state === 4) {
            client.answerTime = Date.now() - startTime
            client.state = 5
            client.answer = JSON.parse(message)
            scoringTime = true
            clients.forEach((properties) => {
                if (properties.state === 4) {
                    scoringTime = false
                }
            })
            if (scoringTime) {
                // await pauseTrack(accessToken)
                clients.forEach((properties, id) => {
                    if (properties.state === 5) {
                        if (JSON.stringify(properties.answer) === JSON.stringify(selections['current track'])) {
                            scoreboard[id.toString()]['score'] += (1000 - Math.round(Math.sqrt(properties.answerTime)))
                        }
                    }
                })
                clients.forEach((properties) => {
                    if (properties.state === 5) {
                        properties.state = 6
                        properties.ws.send(JSON.stringify(scoreboard))
                    }
                })
                await sleep(10000)
                if (rounds === maxRounds) {
                    clients.forEach((properties) => {
                        if (properties.state === 6) {
                            properties.state = 7
                            properties.ws.send('state 7')
                        }
                    })
                    await sleep(5000)
                    clients.forEach((properties) => {
                        if (properties.gameleader) {
                            properties.state = 8
                            properties.ws.send('state 8')
                        }
                    })
                } else {
                    rounds++
                    await nextTrack(accessToken)
                    await sleep(500)
                    selections = await songSelection(accessToken, playlist)
                    clients.forEach((properties) => {
                        if (properties.state === 6) {
                            properties.state = 4
                            properties.ws.send(JSON.stringify(selections))
                        }
                    })
                    startTime = Date.now()
                }
            }
        }
        else if (client.state === 8) {
            if (message.toString() === 'play again') {
                rounds = 1
                await nextTrack(accessToken)
                await sleep(500)
                selections = await songSelection(accessToken, playlist)
                clients.forEach((properties, id) => {
                    if (properties.state === 7 || properties.state === 8) {
                        properties.state = 4
                        scoreboard[id.toString()]['score'] = 0
                        properties.ws.send(JSON.stringify(selections))
                    }
                })
                startTime = Date.now()
            } else {
                scoreboard = {}
                clients.forEach((properties, id) => {
                    if (properties.state === 7 || properties.state === 8) {
                        properties.state = 1
                        properties.ws.send('state 1')
                    }
                })
            }
        }
    })
    ws.on('close', function () {
        console.log(`Client ${clientID} disconnected`)
        if (clients.size === 1) {
            clientIDCounter = 0
        }
        else if (clients.get(clientID).gameleader) {
            let minID = Infinity
            clients.forEach((properties, id) => {
                if (id !== clientID && id < minID) {
                    minID = id
                }
            })
            clients.get(minID).gameleader = true
        }
        clients.delete(clientID)
    })
})


// Routes
app.get('/login',
    passport.authenticate('spotify', { scope: ['user-read-playback-state', 'user-modify-playback-state', 'playlist-read-private'], showDialog: true }),
    function (req, res) {
    })

app.get('/authorized',
    passport.authenticate('spotify', { failureRedirect: '/' }),
    function (req, res) {
        res.send('<p>Authorization Successful</p>')
    })

app.use('/game', express.static(path.join(__dirname, '..', 'client', 'build')))

app.get('/game/*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'build', 'index.html'))
})


// Start server
server.listen(process.env.PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${process.env.PORT}`)
})