import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function WaitingRoom({ room, player, onStart }) {
  const [players, setPlayers] = useState([])

  useEffect(() => {
    fetchPlayers()
    const ch = supabase.channel('waiting-' + room.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bj_players', filter: `room_id=eq.${room.id}` }, fetchPlayers)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bj_rooms', filter: `id=eq.${room.id}` }, (payload) => {
        if (payload.new.status === 'betting') onStart()
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [room.id])

  async function fetchPlayers() {
    const { data } = await supabase.from('bj_players').select().eq('room_id', room.id).order('created_at')
    if (data) setPlayers(data)
  }

  async function startGame() {
    // 1人以上いればスタート可能
    const shuffled = [...players].sort(() => Math.random() - 0.5)
    for (let i = 0; i < shuffled.length; i++) {
      await supabase.from('bj_players').update({
        play_order: i, status: 'betting', hand: [], bet: 0
      }).eq('id', shuffled[i].id)
    }
    await supabase.from('bj_rooms').update({
      status: 'betting', dealer_hand: [],
      round: (room.round || 0) + 1, current_player_order: -1
    }).eq('id', room.id)
  }

  const slots = Array(4).fill(null).map((_, i) => players[i] || null)

  return (
    <div className="waiting-room">
      <div className="room-code-display">
        <div className="room-code-label">ルームコード</div>
        <div className="room-code-value">{room.room_code}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'sans-serif', marginTop: 4 }}>
          友達にこのコードを共有してください（途中参加もOK！）
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
              <div className="player-name">空席</div>
            </div>
          )
        ))}
      </div>
      {player.is_host ? (
        <button className="lobby-btn btn-create" style={{ width: 280 }} onClick={startGame}>
          ✦ ゲームスタート（{players.length}人）
        </button>
      ) : (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'sans-serif' }}>
          ホストがゲームを開始するまでお待ちください...
        </div>
      )}
    </div>
  )
}
