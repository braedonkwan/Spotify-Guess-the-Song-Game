# 🎵 Spotify Guess The Song Game

A multiplayer song-guessing game built with Node.js, Express, and React, using the Spotify Web API.

## 📦 Prerequisites

- **Node.js** v18+  
- **Spotify Developer** account  
- A **Spotify App** configured with:  
  - `CLIENT_ID`  
  - `CLIENT_SECRET`  
  - `REDIRECT_URI` set to `http://localhost:8888/callback`

## 🔧 Setup Instructions

1. **Clone the repository**  
```bash
git clone https://github.com/yourusername/spotify-guess-game.git
cd spotify-guess-game
```

2. **Install server dependencies**  
```bash
npm install
```

3. **Configure environment variables**  

In the project root, create a file named .env with:
```bash
CLIENT_ID=your_spotify_client_id
CLIENT_SECRET=your_spotify_client_secret
PORT=8888
REDIRECT_URI=http://localhost:8888/callback
REFRESH_TOKEN=your_refresh_token
IP_ADDRESS=your_lan_ip
```
In the client folder, create a file named .env with:
```bash
REACT_APP_WEBSOCKET_URL=ws://your_lan_ip:8888
```

4. **Install client dependencies and build**
```bash
cd client
npm install
npm run build
```

# 🚀 Running the App

1. **Start the backend server**
From the project root:
```bash
node server.js
```

2. **Start the frontend client**
In a web browser go to:
```bash
your_lan_ip:8888/game
```

# 📝 Notes
- Ensure all players are on the same LAN as server for local multiplayer.
- WebSocket URL in .env must match your local IP and port.