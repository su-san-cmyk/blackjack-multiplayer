import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Lobby from './components/Lobby'
import WaitingRoom from './components/WaitingRoom'
import GameScreen from './components/GameScreen'

export default function App() {
  const [phase, setPhase] = useState('lobby') // lobby / waiting / game
  const [room, setRoom] = useState(null)
  const [player, setPlayer] = useState(null)
  const [gameDeck, setGameDeck] = useState([])
  const [gameDealerHand, setGameDealerHand] = useState([])

  // ルーム状態の変化を監視（waitingからgameへ自動遷移）
  useEffect(() => {
    if (!room || phase !== 'waiting') return
    const ch = supabase.channel('room-status-' + room.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'bj_rooms', filter: `id=eq.${room.id}`
      }, (payload) => {
        if (payload.new.status === 'playing') {
          setGameDealerHand(payload.new.dealer_hand || [])
          setPhase('game')
        }
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [room, phase])

  function handleJoin({ room: r, player: p }) {
    setRoom(r)
    setPlayer(p)
    setPhase('waiting')
  }

  function handleStart({ deck, dealerHand }) {
    setGameDeck(deck)
    setGameDealerHand(dealerHand)
    setPhase('game')
  }

  if (phase === 'lobby') return <Lobby onJoin={handleJoin} />
  if (phase === 'waiting') return <WaitingRoom room={room} player={player} onStart={handleStart} />
  if (phase === 'game') return (
    <GameScreen
      room={room}
      player={player}
      initialDeck={gameDeck}
      initialDealerHand={gameDealerHand}
    />
  )
  return null
}
