import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  handValue, isSoft, isPair, isRed, cardVal,
  calcResult, makeDeck, dealerPlay, CHIP_COLORS
} from '../lib/game'
import OtherPlayer from './OtherPlayer'

export default function GameScreen({ room, player, initialDeck, initialDealerHand }) {
  // 自分の手札・ゲーム状態
  const [playerHand, setPlayerHand] = useState([])
  const [dealerHand, setDealerHand] = useState(initialDealerHand || [])
  const [deck, setDeck] = useState(initialDeck || [])
  const [points, setPoints] = useState(player.points || 1000)
  const [bet, setBet] = useState(0)
  const [status, setStatus] = useState('betting') // betting/playing/end
  const [firstTurn, setFirstTurn] = useState(true)
  const [extraMode, setExtraMode] = useState(null)
  const [extraBet, setExtraBet] = useState(0)
  const [hintOn, setHintOn] = useState(true)
  const [hintText, setHintText] = useState('チップを選んでベットし、Deal を押してください。')
  const [resultSummary, setResultSummary] = useState(null)
  const [stats, setStats] = useState({ w: 0, l: 0, p: 0 })
  const [dramaText, setDramaText] = useState('')
  const [dramaColor, setDramaColor] = useState('#fff')
  const [dramaClass, setDramaClass] = useState('')
  const [dealerResult, setDealerResult] = useState(null)
  const [playerResult, setPlayerResult] = useState(null)
  const [showCards, setShowCards] = useState(false)

  // 他プレイヤー
  const [allPlayers, setAllPlayers] = useState([])
  const [currentRoom, setCurrentRoom] = useState(room)

  const deckRef = useRef(deck)
  deckRef.current = deck

  // Realtime購読
  useEffect(() => {
    fetchState()
    const ch = supabase.channel('game-' + room.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bj_players', filter: `room_id=eq.${room.id}` }, fetchState)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bj_rooms', filter: `id=eq.${room.id}` }, fetchRoom)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [room.id])

  async function fetchState() {
    const { data } = await supabase.from('bj_players').select().eq('room_id', room.id).order('created_at')
    if (data) setAllPlayers(data)
  }

  async function fetchRoom() {
    const { data } = await supabase.from('bj_rooms').select().eq('id', room.id).single()
    if (data) {
      setCurrentRoom(data)
      setDealerHand(data.dealer_hand || [])
    }
  }

  // 自分の最新データを取得してhandを同期
  useEffect(() => {
    const me = allPlayers.find(p => p.id === player.id)
    if (me && me.hand && me.hand.length > 0 && playerHand.length === 0) {
      setPlayerHand(me.hand)
    }
    if (me && me.points !== undefined && status === 'end') {
      setPoints(me.points)
    }
  }, [allPlayers])

  // 全員がdoneになったらカードを公開
  useEffect(() => {
    const others = allPlayers.filter(p => p.id !== player.id)
    if (others.length > 0 && others.every(p => ['stand','bust','bj','done'].includes(p.status))) {
      setShowCards(true)
    }
  }, [allPlayers])

  async function updateMyStatus(newStatus, newHand, newPoints, newBet) {
    const update = { status: newStatus }
    if (newHand !== undefined) update.hand = newHand
    if (newPoints !== undefined) update.points = newPoints
    if (newBet !== undefined) update.bet = newBet
    await supabase.from('bj_players').update(update).eq('id', player.id)
  }

  function showDrama(text, color, duration) {
    return new Promise(resolve => {
      setDramaText(text); setDramaColor(color); setDramaClass('show')
      setTimeout(() => {
        setDramaClass('hide')
        setTimeout(() => { setDramaClass(''); resolve() }, 320)
      }, duration)
    })
  }

  function setOff(id, off) {
    const el = document.getElementById(id)
    if (!el) return
    if (off) el.setAttribute('data-off', '1')
    else el.removeAttribute('data-off')
  }

  function setPhase(phase) {
    const playing = phase === 'playing'
    const betting = phase === 'betting'
    const end = phase === 'end'
    setOff('btn-deal-felt', !betting)
    const df = document.getElementById('btn-new-felt')
    if (df) df.style.display = end ? 'block' : 'none'
    setOff('btn-hit', !playing)
    setOff('btn-stay', !playing)
    const pv = handValue(playerHand)
    const canDbl = playing && firstTurn && playerHand.length === 2
    setOff('btn-double', !canDbl)
    const canSplit = playing && firstTurn && playerHand.length === 2 && cardVal(playerHand[0]?.r) === cardVal(playerHand[1]?.r) && points >= bet
    setOff('btn-split', !canSplit)
    const canSurrender = playing && firstTurn && playerHand.length === 2
    setOff('btn-surrender', !canSurrender)
    ;[5, 10, 25, 50, 100].forEach(v => setOff('chip-' + v, !betting && !extraMode))
  }

  function getHint(hand) {
    const pv = handValue(hand)
    const soft = isSoft(hand)
    const pair = isPair(hand)
    const canDouble = firstTurn && hand.length === 2
    const canSplit = firstTurn && hand.length === 2 && cardVal(hand[0]?.r) === cardVal(hand[1]?.r)
    if (pv === 21 && hand.length === 2) return '<span class="tag">Blackjack</span>最初の2枚で21！<strong>ブラックジャック</strong>です🎉'
    if (pv > 21) return '<span class="tag">Bust</span>合計が<strong>21を超えた</strong>のでバースト。'
    const msgs = []
    if (canSplit) msgs.push('<span class="tag">Split</span>同じ数字2枚！2つの手に分けて別々に戦えます。')
    if (canDouble) msgs.push('<span class="tag">Double</span>最初の2枚限定。追加チップを置いて1枚だけ引きます。')
    if (firstTurn && hand.length === 2) msgs.push('<span class="tag">Surrender</span>勝ち目が薄いと思ったら降参できます。半額返還。')
    if (soft) msgs.push('<span class="tag">Soft Hand</span>Aは<strong>1か11</strong>どちらにも使えます。')
    if (msgs.length > 0) return msgs[0]
    if (pv <= 11) return `合計<strong>${pv}</strong>。まだ余裕あり。<strong>Hit</strong>でカードを追加できます。`
    if (pv >= 17) return `合計<strong>${pv}</strong>。<strong>Stay</strong>でこのままディーラーと勝負できます。`
    return `合計<strong>${pv}</strong>。<strong>Hit</strong>でもう1枚、<strong>Stay</strong>で勝負。`
  }

  useEffect(() => {
    if (status === 'playing' && playerHand.length > 0) {
      setHintText(getHint(playerHand))
    }
    setPhase(status)
  }, [status, playerHand, firstTurn, extraMode])

  function renderBetChips() {
    const chips = []
    let rem = bet
    for (const d of [100, 50, 25, 10, 5]) while (rem >= d) { chips.push({ d, extra: false }); rem -= d }
    if (extraMode && extraBet > 0) {
      chips.push({ divider: true })
      let rem2 = extraBet
      for (const d of [100, 50, 25, 10, 5]) while (rem2 >= d) { chips.push({ d, extra: true }); rem2 -= d }
    }
    return chips
  }

  function chipClick(v) {
    if (extraMode) {
      if (extraBet + v > bet) return
      if (extraBet + v > points - bet) return
      const nb = extraBet + v
      setExtraBet(nb)
      if (nb > 0) {
        const cf = document.getElementById('btn-action-confirm')
        if (cf) cf.style.display = 'block'
      }
    } else {
      if (status !== 'betting') return
      if (bet + v > points) return
      setBet(b => b + v)
    }
  }

  function clearChip() {
    if (extraMode) {
      setExtraBet(0)
      const cf = document.getElementById('btn-action-confirm')
      if (cf) cf.style.display = 'none'
    } else {
      if (status !== 'betting') return
      setBet(0)
    }
  }

  async function doDeal() {
    if (bet === 0) { setHintText('まずチップを選んでベットしてください！'); return }
    const me = allPlayers.find(p => p.id === player.id)
    const hand = me?.hand || []
    if (hand.length === 0) return
    setPlayerHand(hand)
    setFirstTurn(true)
    setResultSummary(null)
    setDealerResult(null)
    setPlayerResult(null)
    setStatus('playing')
    setShowCards(false)
    await updateMyStatus('playing', hand, undefined, bet)
    if (handValue(hand) === 21) {
      setTimeout(() => triggerStand(hand, deckRef.current), 400)
    } else {
      setHintText(getHint(hand))
    }
  }

  async function doHit() {
    setFirstTurn(false)
    const newDeck = [...deckRef.current]
    const newCard = newDeck.pop()
    const newHand = [...playerHand, newCard]
    setDeck(newDeck)
    setPlayerHand(newHand)
    await updateMyStatus('playing', newHand)
    if (handValue(newHand) >= 21) {
      setTimeout(() => triggerStand(newHand, newDeck), 400)
    } else {
      setHintText(getHint(newHand))
    }
  }

  async function triggerStand(hand, currentDeck) {
    const h = hand || playerHand
    const d = currentDeck || deckRef.current
    setFirstTurn(false)
    setStatus('end')
    setHintText('ディーラーがカードを引いています...')
    await updateMyStatus('stand', h)
    await runDealerAndFinish(h, d)
  }

  async function doStay() {
    await triggerStand(playerHand, deckRef.current)
  }

  async function runDealerAndFinish(hand, currentDeck) {
    const { hand: newDealerHand, deck: newDeck } = dealerPlay(dealerHand, currentDeck)
    setDeck(newDeck)
    setDealerHand(newDealerHand)
    const dv = handValue(newDealerHand)
    if (dv > 21) setDealerResult({ text: 'BUST!', cls: 'zr-bust' })
    await supabase.from('bj_rooms').update({ dealer_hand: newDealerHand }).eq('id', room.id)
    await new Promise(r => setTimeout(r, 300))
    const pv = handValue(hand)
    const isBJ = pv === 21 && hand.length === 2
    const res = calcResult(pv, dv, bet, isBJ, newDealerHand)
    const newPoints = points + res.delta
    setPoints(newPoints)
    setPlayerResult({ text: res.badge, cls: res.cls })
    setResultSummary({ msg: res.badge + (res.delta > 0 ? ` +${res.delta}` : ` ${res.delta}`) + ' pt', cls: 'r-' + res.type })
    await showDrama(res.badge === 'WIN!' ? 'WIN !' : res.badge === 'BUST' ? 'BUST…' : res.badge === 'BJ! +' + Math.floor(bet * 1.5) ? 'Blackjack!!' : res.badge, res.badge.includes('WIN') ? '#7dffb3' : res.badge === 'BUST' || res.badge === 'LOSE' ? '#ff6060' : '#ffe77a', 900)
    await updateMyStatus('done', hand, newPoints)
    const newStats = { ...stats }
    if (res.delta > 0) newStats.w++
    else if (res.delta < 0) newStats.l++
    else newStats.p++
    setStats(newStats)
  }

  async function doDouble() {
    startExtra('double')
  }

  async function doSplit() {
    startExtra('split')
  }

  function startExtra(mode) {
    setExtraMode(mode)
    setExtraBet(0)
    setStatus('extra')
    const msg = mode === 'double'
      ? `<span class="tag">Double Down</span>追加ベットを置いてください（最大 <strong>${bet} pt</strong>）。`
      : `<span class="tag">Split</span>Hand 2用の追加ベットを置いてください（最大 <strong>${bet} pt</strong>）。`
    setHintText(msg)
    ;[5, 10, 25, 50, 100].forEach(v => {
      const el = document.getElementById('chip-' + v)
      if (el) { el.removeAttribute('data-off'); el.classList.add('extra-mode') }
    })
  }

  async function confirmAction() {
    if (extraBet === 0) return
    const mode = extraMode
    setExtraMode(null)
    setExtraBet(0)
    ;[5, 10, 25, 50, 100].forEach(v => {
      const el = document.getElementById('chip-' + v)
      if (el) el.classList.remove('extra-mode')
    })
    const cf = document.getElementById('btn-action-confirm')
    if (cf) cf.style.display = 'none'

    if (mode === 'double') {
      const newBet = bet + extraBet
      setBet(newBet)
      setFirstTurn(false)
      const newDeck = [...deckRef.current]
      const newCard = newDeck.pop()
      const newHand = [...playerHand, newCard]
      setDeck(newDeck)
      setPlayerHand(newHand)
      setHintText(`<span class="tag">Double</span>ベットを<strong>${newBet} pt</strong>にして1枚引きました！`)
      setStatus('end')
      await updateMyStatus('stand', newHand, undefined, newBet)
      setTimeout(() => runDealerAndFinish(newHand, newDeck), 600)
    } else if (mode === 'split') {
      // Split: 簡易実装（Hand1だけプレイ）
      setFirstTurn(false)
      const newDeck = [...deckRef.current]
      const card1 = newDeck.pop()
      const hand1 = [playerHand[0], card1]
      setDeck(newDeck)
      setPlayerHand(hand1)
      setStatus('playing')
      await updateMyStatus('playing', hand1)
      setHintText(`<span class="tag">Split</span>Hand 1をプレイします。`)
    }
  }

  async function doSurrender() {
    const ret = Math.floor(bet / 2)
    const newPoints = points + ret
    setPoints(newPoints)
    setPlayerResult({ text: 'FOLD', cls: 'zr-push' })
    setResultSummary({ msg: `Surrender — ${ret} pt 返還`, cls: 'r-push' })
    await showDrama('SURRENDER', '#e8c8e8', 900)
    await updateMyStatus('done', playerHand, newPoints)
    setStatus('end')
    const newStats = { ...stats, l: stats.l + 1 }
    setStats(newStats)
  }

  async function resetRound() {
    setBet(0)
    setPlayerHand([])
    setDealerHand([])
    setFirstTurn(true)
    setExtraMode(null)
    setExtraBet(0)
    setResultSummary(null)
    setDealerResult(null)
    setPlayerResult(null)
    setShowCards(false)
    setStatus('waiting')
    setHintText('ホストが次のラウンドを開始するまでお待ちください。')
    await updateMyStatus('waiting', [], points, 0)
    if (player.is_host) {
      const newDeck = makeDeck()
      const allP = allPlayers
      for (let i = 0; i < allP.length; i++) {
        const hand = [newDeck[i * 2], newDeck[i * 2 + 1]]
        await supabase.from('bj_players').update({ hand, status: 'betting', bet: 0 }).eq('id', allP[i].id)
      }
      const dealerH = [newDeck[allP.length * 2], newDeck[allP.length * 2 + 1]]
      const remaining = newDeck.slice(allP.length * 2 + 2)
      setDeck(remaining)
      setDealerHand(dealerH)
      await supabase.from('bj_rooms').update({ dealer_hand: dealerH, status: 'playing', round: (currentRoom.round || 0) + 1 }).eq('id', room.id)
      setBet(0)
      setStatus('betting')
      setHintText('チップを選んでベットし、Deal を押してください。')
    }
  }

  const betChips = renderBetChips()
  const otherPlayers = allPlayers.filter(p => p.id !== player.id)
  const maxPoints = Math.max(...allPlayers.map(p => p.points || 0), 1)
  const pv = handValue(playerHand)
  const dv = handValue(dealerHand)

  return (
    <div className="game-screen">
      {/* 左：自分のカジノ画面 */}
      <div className="my-panel">
        <div className="table-arc" />
        {/* ドラマ */}
        <div className={`drama-overlay ${dramaClass}`}>
          <div className="drama-text" style={{ color: dramaColor }}>{dramaText}</div>
        </div>

        <div className="felt-content">
          <div className="logo-text">Royal Blackjack — {room.room_code}</div>

          {/* ディーラーゾーン */}
          <div className="dealer-zone" style={{ flex: 1 }}>
            <div className="zone-tag">Dealer</div>
            <div className="cards-row">
              {dealerHand.map((c, i) => {
                const faceDown = status !== 'end' && i === 1
                return (
                  <div key={i} className={`card${faceDown ? ' face-down' : (isRed(c.s) ? ' red' : ' black')}`}>
                    {!faceDown && <><div className="card-rank">{c.r}</div><div className="card-suit">{c.s}</div></>}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 24 }}>
              {dealerResult ? (
                <div className={`zone-result show ${dealerResult.cls}`}>{dealerResult.text}</div>
              ) : (
                <div className={`score-pill${dv > 21 ? ' bust' : ''}`}>
                  {status !== 'end' && dealerHand.length > 0 ? `${cardVal(dealerHand[0]?.r)} + ?` : (dv || '—')}
                </div>
              )}
            </div>
          </div>

          <div className="table-divider" />

          {/* センターエリア */}
          <div className="center-area">
            <div className="bet-display">
              {betChips.map((c, i) =>
                c.divider ? <div key={i} className="bet-divider" /> :
                  <div key={i} className={`bet-chip-sm${c.extra ? ' extra' : ''}`} style={{ background: CHIP_COLORS[c.d] }}>{c.d}</div>
              )}
            </div>
            <button id="btn-deal-felt" className="center-btn" onClick={doDeal}>✦ Deal ✦</button>
            <button id="btn-new-felt" className="center-btn" onClick={resetRound} style={{ display: 'none', background: 'rgba(220,210,190,0.9)', color: '#2a2010' }}>↺ Next</button>
            <button id="btn-action-confirm" className="center-btn" onClick={confirmAction} style={{ display: 'none', background: 'linear-gradient(135deg,#e8c840,#f5e060,#c8a800)', color: '#2a1a00' }}>✦ OK ✦</button>
          </div>

          {/* プレイヤーゾーン */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 24 }}>
              {playerResult ? (
                <div className={`zone-result show ${playerResult.cls}`}>{playerResult.text}</div>
              ) : (
                <div className={`score-pill${pv > 21 ? ' bust' : pv === 21 && playerHand.length === 2 ? ' bj' : ''}`}>
                  {pv || '—'}
                </div>
              )}
            </div>
            <div className="cards-row">
              {playerHand.map((c, i) => (
                <div key={i} className={`card animate-in${isRed(c.s) ? ' red' : ' black'}`}>
                  <div className="card-rank">{c.r}</div>
                  <div className="card-suit">{c.s}</div>
                </div>
              ))}
            </div>
            <div className="zone-tag">{player.name} — {points.toLocaleString()} pt</div>

            {/* アクションボタン */}
            <div className="action-row">
              <button id="btn-hit" className="abtn abtn-hit" onClick={doHit} data-off="1">
                <div className="abtn-icon">＋</div><div className="abtn-label">Hit</div>
              </button>
              <button id="btn-stay" className="abtn abtn-stay" onClick={doStay} data-off="1">
                <div className="abtn-icon">■</div><div className="abtn-label">Stay</div>
              </button>
              <button id="btn-double" className="abtn abtn-double" onClick={doDouble} data-off="1">
                <div className="abtn-icon">×2</div><div className="abtn-label">Double</div>
              </button>
              <button id="btn-split" className="abtn abtn-split" onClick={doSplit} data-off="1">
                <div className="abtn-icon">⇌</div><div className="abtn-label">Split</div>
              </button>
              <button id="btn-surrender" className="abtn abtn-surrender" onClick={doSurrender} data-off="1">
                <div className="abtn-icon">⚑</div><div className="abtn-label">Surrender</div>
              </button>
            </div>
          </div>
        </div>

        {/* 下パネル */}
        <div className="bottom-panel">
          <div className="bottom-row">
            <div className="stat-group">
              <div className="stat-pill">勝 <span>{stats.w}</span></div>
              <div className="stat-pill">負 <span>{stats.l}</span></div>
              <div className="stat-pill">引 <span>{stats.p}</span></div>
            </div>
            <div className="hint-toggle" onClick={() => setHintOn(v => !v)}>
              <div className={`toggle-track${hintOn ? ' on' : ''}`}><div className="toggle-thumb" /></div>
              ヒント
            </div>
          </div>

          <div className={`hint-wrap${hintOn ? '' : ' hidden'}`}>
            <div className="hint-inner">
              <div className="hint-star">★</div>
              <div className="hint-text" dangerouslySetInnerHTML={{ __html: hintText }} />
            </div>
          </div>

          {resultSummary && (
            <div className={`result-summary ${resultSummary.cls}`} style={{ display: 'block' }}>
              {resultSummary.msg}
            </div>
          )}

          <div className="points-row">
            <div><div className="points-label">Points</div><div className="points-val">{points.toLocaleString()}</div></div>
            <div style={{ textAlign: 'right' }}><div className="points-label">Bet</div><div className="bet-val">{extraMode && extraBet > 0 ? `${bet}+${extraBet} pt` : `${bet} pt`}</div></div>
          </div>

          <div className="chip-row">
            {[5, 10, 25, 50, 100].map(v => (
              <div key={v} id={`chip-${v}`} className={`chip chip-${v}`} onClick={() => chipClick(v)}>{v}</div>
            ))}
            <div className="chip chip-clear" onClick={clearChip}>CLEAR</div>
          </div>
        </div>
      </div>

      {/* 右：他プレイヤー */}
      <div className="others-panel">
        <div className="ranking-header">Players</div>
        {Array(3).fill(null).map((_, i) => {
          const other = otherPlayers[i]
          if (other) return <OtherPlayer key={other.id} player={other} maxPoints={maxPoints} showCards={showCards} />
          return <div key={i} className="empty-slot"><div className="empty-text">空席</div></div>
        })}
      </div>
    </div>
  )
}
