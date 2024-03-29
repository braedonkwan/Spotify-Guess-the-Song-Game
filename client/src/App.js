// Imports
import React, { useEffect, useState } from 'react'
import './App.css'

// UI components
const GameState1 = ({ ws }) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const handleSubmit = () => {
    const username = document.getElementById('username').value.trim()
    if (username) {
      setIsSubmitting(true)
      ws.send(username)
    }
  }
  return (
    <div className='game-container'>
      <div className='vertical'>
        Username
        <input
          id='username'
          type='text'
          className='long-input'
        />
        <input
          type='button'
          value='Submit'
          onClick={handleSubmit}
          disabled={isSubmitting}
          className='button'
        />
      </div>
    </div>
  )
}
const GameState2 = () => {
  return (
    <div className='game-container'>
      <div className='vertical'>
        <div className='text-container'>Waiting for game leader to start the game...</div>
      </div>
    </div>
  )
}
const GameState3 = ({ ws }) => {
  const [rounds, setRounds] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const handleRoundsChange = (e) => {
    const rounds = e.target.value
    if (/^([1-9][0-9]{0,2})?$/.test(rounds)) {
      setRounds(rounds)
    }
  }
  const handleSubmit = () => {
    const maxRounds = parseInt(rounds, 10)
    const playlistID = document.getElementById('playlist').value.trim()
    if (!isNaN(maxRounds) && playlistID) {
      setIsSubmitting(true)
      const data = { 'max rounds': maxRounds, 'playlist ID': playlistID }
      ws.send(JSON.stringify(data))
    }
  }
  return (
    <div className='game-container'>
      <div className='vertical'>
        Number of Rounds
        <input
          type='text'
          value={rounds}
          onChange={handleRoundsChange}
          className='short-input'
        />
        Spotify Playlist ID
        <input
          id='playlist'
          type='text'
          className='long-input'
        />
        <input
          type='button'
          value='Start Game'
          onClick={handleSubmit}
          disabled={isSubmitting}
          className='button'
        />
      </div>
    </div>
  )
}
const GameState4 = ({ setGameState, ws, selections }) => {
  const [shuffledSelections, setShuffledSelections] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  useEffect(() => {
    const selectionsArray = Object.values(selections)
    const shuffled = selectionsArray.sort(() => 0.5 - Math.random())
    setShuffledSelections(shuffled)
  }, [])
  const handleClick = (selection) => {
    if (!isSubmitting) {
      setIsSubmitting(true)
      ws.send(JSON.stringify(selection))
      setGameState(5)
    }
  }
  return (
    <div className='game-container'>
      <div className='grid'>
        {shuffledSelections.map((selection, index) => (
          <div
            key={index}
            className='selection-box'
            onClick={() => handleClick(selection)}
          >
            <div className='selection'><strong>{selection.name}</strong></div>
            <div className='selection'>{selection.artists}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
const GameState5 = () => {
  return (
    <div className='game-container'>
      <div className='vertical'>
        <div className='text-container'>Waiting for other players to guess...</div>
      </div>
    </div>
  )
}
const GameState6 = ({ scoreboard }) => {
  const sortedScores = Object.values(scoreboard).sort((a, b) => b.score - a.score)
  return (
    <div className='game-container'>
      <div className='scoreboard'>
        <table className='scoreboard-table'>
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
      </div>
    </div>
  )
}
const GameState7 = ({ scoreboard }) => {
  const winnerEntry = Object.entries(scoreboard).reduce((acc, curr) => {
    return acc[1].score > curr[1].score ? acc : curr
  }, [null, { score: -1 }])
  const { username, score } = winnerEntry[1]
  return (
    <div className='game-container'>
      <div className='vertical'>
        <div className='text-container'>The winner is {username} with a score of {score}</div>
      </div>
    </div>
  )
}
const GameState8 = ({ ws }) => {
  const [isButtonDisabled, setIsButtonDisabled] = useState(false)
  const handlePlayAgain = () => {
    ws.send('play again')
    setIsButtonDisabled(true)
  }
  const handleNewGame = () => {
    ws.send('new game')
    setIsButtonDisabled(true)
  }
  return (
    <div className='game-container'>
      <div className='vertical'>
        <input
          type='button'
          value='Play Again'
          onClick={handlePlayAgain}
          disabled={isButtonDisabled}
          className='button'
        />
        <input
          type='button'
          value='New Game'
          onClick={handleNewGame}
          disabled={isButtonDisabled}
          className='button'
        />
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
        if (Object.keys(parsedData)[0] === 'current track') {
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