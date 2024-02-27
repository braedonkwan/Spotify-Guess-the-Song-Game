// Imports
import React, { useEffect, useState } from 'react'
import './App.css'

// UI components
const GameState1 = ({ ws }) => {
  const [username, setUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  useEffect(() => {
    setUsername('')
    setIsSubmitting(false)
  }, [])
  const handleSubmit = (e) => {
    e.preventDefault()
    if (username.trim()) {
      setIsSubmitting(true)
      ws.send(username)
    }
  }
  return (
    <div className="component-container">
      <form onSubmit={handleSubmit} className="form">
        <input
          type="text"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={isSubmitting}
          className="input"
        />
        <button type="submit" disabled={isSubmitting} className="button">
          Submit
        </button>
      </form>
    </div>
  )
}
const GameState2 = () => {
  return (
    <div className="text-container">
      Waiting for game leader to start the game
    </div>
  )
}
const GameState3 = ({ ws }) => {
  const [rounds, setRounds] = useState(null)
  const [playlistId, setPlaylistId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  useEffect(() => {
    setRounds(null)
    setPlaylistId('')
    setIsSubmitting(false)
  }, [])
  const handleSubmit = (e) => {
    e.preventDefault()
    const maxRounds = parseInt(rounds, 10)
    if (!isNaN(maxRounds) && playlistId.trim()) {
      setIsSubmitting(true)
      const data = { "max rounds": maxRounds, "playlist ID": playlistId }
      ws.send(JSON.stringify(data))
    }
  }
  return (
    <div className="component-container">
      <form onSubmit={handleSubmit} className="form">
        <div className="input-group">
          <label htmlFor="rounds" className="label">Number of Rounds:</label>
          <input
            id="rounds"
            type="number"
            value={rounds}
            onChange={(e) => setRounds(e.target.value)}
            min="1"
            disabled={isSubmitting}
            className="input"
          />
        </div>
        <div className="input-group">
          <label htmlFor="playlistId" className="label">Spotify Playlist ID:</label>
          <input
            id="playlistId"
            type="text"
            value={playlistId}
            onChange={(e) => setPlaylistId(e.target.value)}
            disabled={isSubmitting}
            className="input"
          />
        </div>
        <button type="submit" disabled={isSubmitting} className="button">Start Game</button>
      </form>
    </div>
  )
}
const GameState4 = ({ setGameState, ws, selections }) => {
  const [shuffledSelections, setShuffledSelections] = useState([])
  useEffect(() => {
    const selectionsArray = Object.values(selections)
    const shuffled = selectionsArray.sort(() => 0.5 - Math.random())
    setShuffledSelections(shuffled)
  }, [selections])
  const handleClick = (selection) => {
    ws.send(JSON.stringify(selection))
    setGameState(5)
  }
  return (
    <div className="component-container">
      <div className="selections-container">
        {shuffledSelections.map((selection, index) => (
          <div
            key={index}
            className="selection"
            onClick={() => handleClick(selection)}
          >
            <div><strong>{selection.name}</strong></div>
            <div>{selection.artists}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
const GameState5 = () => {
  return (
    <div className="text-container">
      Waiting for other players to guess
    </div>
  )
}
const GameState6 = ({ scoreboard }) => {
  const sortedScores = Object.values(scoreboard).sort((a, b) => b.score - a.score)
  return (
    <table className="scoreboard-table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {sortedScores.map((entry, index) => (
          <tr key={index}>
            <td>{entry.username}</td>
            <td>{entry.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
const GameState7 = ({ scoreboard }) => {
  const winnerEntry = Object.entries(scoreboard).reduce((acc, curr) => {
    return acc[1].score > curr[1].score ? acc : curr
  }, [null, { score: -1 }])
  const { username, score } = winnerEntry[1]
  return (
    <div className="text-container">
      The winner is {username} with a score of {score}
    </div>
  )
}
const GameState8 = ({ ws }) => {
  const [isButtonDisabled, setIsButtonDisabled] = useState(false)
  useEffect(() => {
    setIsButtonDisabled(false)
  }, [])
  const handlePlayAgain = () => {
    ws.send("play again")
    setIsButtonDisabled(true)
  }
  const handleNewGame = () => {
    ws.send("new game")
    setIsButtonDisabled(true)
  }
  return (
    <div className="component-container">
      <div className="form">
        <button
          onClick={handlePlayAgain}
          disabled={isButtonDisabled}
          className="button">
          Play Again
        </button>
        <button
          onClick={handleNewGame}
          disabled={isButtonDisabled}
          className="button">
          New Game
        </button>
      </div>
    </div>
  )
}


const App = () => {
  const [gameState, setGameState] = useState(1)
  const [gameData, setGameData] = useState(null)
  const [ws, setWebSocket] = useState(null)

  // Web socket logic
  useEffect(() => {
    const socket = new WebSocket(process.env.REACT_APP_WEBSOCKET_URL)
    socket.onopen = () => {
      console.log('WebSocket connection established')
      setWebSocket(socket)
    }
    socket.onmessage = (event) => {
      const message = event.data
      try {
        let parsedData = JSON.parse(message)
        setGameData(parsedData)
        if (Object.keys(parsedData)[0] === "current track") {
          setGameState(4)
        } else {
          setGameState(6)
        }
      } catch (error) {
        setGameState(parseInt(message.match(/^state (\d)$/)[1], 10))
      }
    }
    socket.onclose = () => {
      console.log('WebSocket connection closed')
    }
    return () => {
      socket.close()
    }
  }, [])

  // UI logic
  return (
    <div>
      {gameState === 1 && <GameState1 ws={ws} />}
      {gameState === 2 && <GameState2 />}
      {gameState === 3 && <GameState3 ws={ws} />}
      {gameState === 4 && <GameState4 setGameState={setGameState} ws={ws} selections={gameData} />}
      {gameState === 5 && <GameState5 />}
      {gameState === 6 && <GameState6 scoreboard={gameData} />}
      {gameState === 7 && <GameState7 scoreboard={gameData} />}
      {gameState === 8 && <GameState8 ws={ws} />}
    </div>
  )
}

export default App