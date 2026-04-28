import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { generateRoomCode } from '../lib/game'

export default function Lobby({ onJoin }) {
  const [name, setName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function createRoom() {
    if (!name.trim()) { setError('名前を入力してください'); return }
    setLoading(true); setError('')
    try {
      const code = generateRoomCode()
      const { data: room, error: re } = await supabase
        .from('bj_rooms').insert({ room_code: code }).select().single()
      if (re) throw re
      const { data: player, error: pe } = await supabase
        .from('bj_players').insert({ room_id: room.id, name: name.trim(), is_host: true }).select().single()
      if (pe) throw pe
      onJoin({ room, player })
    } catch (e) {
      setError('作成に失敗しました: ' + e.message)
    }
    setLoading(false)
  }

  async function joinRoom() {
    if (!name.trim()) { setError('名前を入力してください'); return }
    if (!roomCode.trim()) { setError('ルームコードを入力してください'); return }
    setLoading(true); setError('')
    try {
      const { data: room, error: re } = await supabase
        .from('bj_rooms').select().eq('room_code', roomCode.trim().toUpperCase()).single()
      if (re || !room) throw new Error('ルームが見つかりません')
      if (room.status !== 'waiting') throw new Error('ゲームはすでに開始されています')
      const { data: players } = await supabase.from('bj_players').select().eq('room_id', room.id)
      if (players && players.length >= 4) throw new Error('ルームが満員です（最大4人）')
      const { data: player, error: pe } = await supabase
        .from('bj_players').insert({ room_id: room.id, name: name.trim(), is_host: false }).select().single()
      if (pe) throw pe
      onJoin({ room, player })
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  return (
    <div className="lobby">
      <div className="lobby-box">
        <div className="lobby-title">Royal Blackjack</div>
        <div className="lobby-subtitle">最大4人でオンライン対戦</div>
        <div className="lobby-divider" />
        <input
          className="lobby-input"
          placeholder="あなたの名前"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={12}
        />
        <button className="lobby-btn btn-create" onClick={createRoom} disabled={loading}>
          {loading ? '作成中...' : '✦ ルームを作成'}
        </button>
        <div className="lobby-divider" />
        <input
          className="lobby-input"
          placeholder="ルームコード（例: XK4821）"
          value={roomCode}
          onChange={e => setRoomCode(e.target.value)}
          maxLength={6}
          style={{ letterSpacing: '0.2em', textTransform: 'uppercase' }}
        />
        <button className="lobby-btn btn-join" onClick={joinRoom} disabled={loading}>
          {loading ? '参加中...' : 'ルームに参加'}
        </button>
        {error && <div className="lobby-error">{error}</div>}
      </div>
    </div>
  )
}
