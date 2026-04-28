import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { makeDeck } from '../lib/game'

export default function WaitingRoom({ room, player, onStart }) {
  const [players, setPlayers] = useState([])

  useEffect(() => {
    fetchPlayers()
    const ch = supabase.channel('waiting-' + room.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bj_players', filter: `room_id=eq.${room.id}` }, fetchPlayers)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [room.id])

  async function fetchPlayers() {
    const { data } = await supabase.from('bj_players').select().eq('room_id', room.id).order('created_at')
    if (data) setPlayers(data)
  }

  async function startGame() {
    const deck = makeDeck()
    // 全プレイヤーに2枚ずつ配る
    const updatedPlayers = players.map((p, i) => ({
      ...p,
      hand: [deck[i * 2], deck[i * 2 + 1]],
      status: 'betting'
    }))
    const dealerHand = [deck[players.length * 2], deck[players.length * 2 + 1]]
    const remainingDeck = deck.slice(players.length * 2 + 2)

    // DBを更新
    await supabase.from('bj_rooms').update({
      status: 'playing',
      dealer_hand: dealerHand,
      round: room.round + 1
    }).eq('id', room.id)

    for (const p of updatedPlayers) {
      await supabase.from('bj_players').update({
        hand: p.hand,
        status: 'betting',
        bet: 0
      }).eq('id', p.id)
    }

    onStart({ deck: remainingDeck, dealerHand })
  }

  const slots = Array(4).fill(null).map((_, i) => players[i] || null)

  return (
    <div className="waiting-room">
      <div className="room-code-display">
        <div className="room-code-label">ルームコード</div>
        <div className="room-code-value">{room.room_code}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'sans-serif', marginTop: 4 }}>
          友達にこのコードを共有してください
        </div>
      </div>

      <div className="players-list">
        <div className="players-list-title">参加プレイヤー（{players.length}/4）</div>
        {slots.map((p, i) => (
          p ? (
            <div key={p.id} className="player-row">
              <div className="player-dot" />
              <div className="player-name">{p.name} {p.id === player.id ? '（あなた）' : ''}</div>
              {p.is_host && <div className="player-host">HOST</div>}
            </div>
          ) : (
            <div key={i} className="player-row player-slot">
              <div className="player-dot" style={{ background: 'rgba(255,255,255,0.15)' }} />
              <div className="player-name">待機中...</div>
            </div>
          )
        ))}
      </div>

      {player.is_host ? (
        <button
          className="lobby-btn btn-create"
          style={{ width: 280 }}
          onClick={startGame}
          disabled={players.length < 1}
        >
          {players.length < 2 ? `あと${2 - players.length}人待機中...` : `✦ ゲームスタート（${players.length}人）`}
        </button>
      ) : (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'sans-serif' }}>
          ホストがゲームを開始するまでお待ちください...
        </div>
      )}
    </div>
  )
}
