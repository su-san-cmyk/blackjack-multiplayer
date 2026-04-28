import { handValue, isRed } from '../lib/game'

const STATUS_MAP = {
  waiting: { label: '待機中', cls: 'st-waiting' },
  betting: { label: 'ベット中', cls: 'st-betting' },
  playing: { label: 'Playing', cls: 'st-playing' },
  stand: { label: 'Stay', cls: 'st-stand' },
  bust: { label: 'Bust!', cls: 'st-bust' },
  bj: { label: 'Blackjack!', cls: 'st-bj' },
  done: { label: '完了', cls: 'st-stand' },
}

export default function OtherPlayer({ player, maxPoints, showCards }) {
  const hand = player.hand || []
  const score = handValue(hand)
  const status = STATUS_MAP[player.status] || STATUS_MAP.waiting
  const barWidth = maxPoints > 0 ? Math.round((player.points / maxPoints) * 100) : 0

  return (
    <div className="other-player-card">
      <div className="op-header">
        <div className="op-name">{player.name}</div>
        <div className="op-pts">{player.points?.toLocaleString()} pt</div>
      </div>
      <div className="op-body">
        <div className="op-cards">
          {hand.length === 0 ? (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'sans-serif' }}>—</div>
          ) : hand.map((c, i) => {
            const revealed = showCards || player.status === 'stand' || player.status === 'bust' || player.status === 'bj' || player.status === 'done'
            return (
              <div key={i} className={`op-card${revealed ? (isRed(c.s) ? ' red' : '') : ' back'}`}>
                {revealed ? c.r : ''}
              </div>
            )
          })}
        </div>
        <div className="op-info">
          <div className="op-score">
            {showCards || ['stand','bust','bj','done'].includes(player.status) ? (hand.length > 0 ? score : '—') : '?'}
          </div>
          <div className={`op-status ${status.cls}`}>{status.label}</div>
        </div>
      </div>
      <div className="op-rank-bar">
        <div className="op-rank-outer">
          <div className="op-rank-inner" style={{ width: barWidth + '%' }} />
        </div>
      </div>
    </div>
  )
}
