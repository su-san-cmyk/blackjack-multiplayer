import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { handValue, isSoft, isPair, isRed, cardVal, calcResult, makeDeck, CHIP_COLORS } from '../lib/game'
import OtherPlayer from './OtherPlayer'

export default function GameScreen({ room, player }) {
  const [playerHand, setPlayerHand] = useState([])
  const [dealerHand, setDealerHand] = useState([])
  const [points, setPoints] = useState(player.points || 1000)
  const [bet, setBet] = useState(0)
  const [myStatus, setMyStatus] = useState('betting')
  const [firstTurn, setFirstTurn] = useState(true)
  const [extraMode, setExtraMode] = useState(null)
  const [extraBet, setExtraBet] = useState(0)
  const [hintOn, setHintOn] = useState(true)
  const [hintText, setHintText] = useState('チップを選んでベットしてください。')
  const [resultSummary, setResultSummary] = useState(null)
  const [stats, setStats] = useState({ w: 0, l: 0, p: 0 })
  const [dramaText, setDramaText] = useState('')
  const [dramaColor, setDramaColor] = useState('#fff')
  const [dramaClass, setDramaClass] = useState('')
  const [dealerResult, setDealerResult] = useState(null)
  const [playerResult, setPlayerResult] = useState(null)
  const [allPlayers, setAllPlayers] = useState([])
  const [currentRoom, setCurrentRoom] = useState(room)
  const [phase, setPhase] = useState('betting')
  const [myPlayOrder, setMyPlayOrder] = useState(0)
  const [showDealerSecond, setShowDealerSecond] = useState(false)
  const [isSpectating, setIsSpectating] = useState(false) // 途中参加で観戦中

  const deckRef = useRef([])
  const allPlayersRef = useRef([])
  allPlayersRef.current = allPlayers

  useEffect(() => {
    fetchAll()
    const ch = supabase.channel('game-' + room.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bj_players', filter: `room_id=eq.${room.id}` }, fetchAll)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bj_rooms', filter: `id=eq.${room.id}` }, handleRoomUpdate)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [room.id])

  async function fetchAll() {
    const { data } = await supabase.from('bj_players').select().eq('room_id', room.id).order('play_order')
    if (data) {
      setAllPlayers(data)
      const me = data.find(p => p.id === player.id)
      if (me) {
        if (me.hand && me.hand.length > 0) setPlayerHand(me.hand)
        if (me.points !== undefined) setPoints(me.points)
        if (me.play_order !== undefined) setMyPlayOrder(me.play_order)
        if (me.status) setMyStatus(me.status)
        // 途中参加チェック：ゲーム中にstatusがwaitingやbettingでないなら観戦
        if (['playing', 'dealer', 'end'].includes(currentRoom.status) && me.status === 'spectating') {
          setIsSpectating(true)
        }
      }
    }
    const { data: r } = await supabase.from('bj_rooms').select().eq('id', room.id).single()
    if (r) {
      setCurrentRoom(r)
      if (r.dealer_hand) setDealerHand(r.dealer_hand)
      if (r.deck_remaining) deckRef.current = r.deck_remaining
    }
  }

  async function handleRoomUpdate(payload) {
    const r = payload.new
    setCurrentRoom(r)
    if (r.dealer_hand) setDealerHand(r.dealer_hand)
    if (r.deck_remaining) deckRef.current = r.deck_remaining

    if (r.status === 'betting') {
      setPhase('betting')
      setIsSpectating(false)
      setBet(0)
      setPlayerHand([])
      setDealerHand([])
      setPlayerResult(null)
      setDealerResult(null)
      setResultSummary(null)
      setShowDealerSecond(false)
      setFirstTurn(true)
      setHintText('チップを選んでベットしてください。')
      await supabase.from('bj_players').update({ hand: [], bet: 0, status: 'betting', result: null }).eq('id', player.id)
    }

    if (r.status === 'playing') {
      const { data: me } = await supabase.from('bj_players').select().eq('id', player.id).single()
      if (me) {
        if (me.hand && me.hand.length > 0) setPlayerHand(me.hand)
        setMyPlayOrder(me.play_order)
        if (me.status === 'spectating') {
          setIsSpectating(true)
          setPhase('waiting')
          setHintText('観戦中...次のラウンドから参加できます。')
          return
        }
      }
      if (r.current_player_order === (me?.play_order ?? myPlayOrder)) {
        setPhase('myturn')
        setFirstTurn(true)
        setHintText(getHint(me?.hand || playerHand))
      } else {
        setPhase('waiting')
        const current = allPlayersRef.current.find(p => p.play_order === r.current_player_order)
        setHintText(current ? `${current.name} さんのターンです...` : '順番待ちです...')
      }
    }

    if (r.status === 'dealer') {
      setPhase('dealer')
      setShowDealerSecond(true)
      setHintText('ディーラーがカードを引いています...')
    }

    if (r.status === 'end') {
      setPhase('end')
      setShowDealerSecond(true)
      await fetchAll()
      // 結果を表示
      const { data: me } = await supabase.from('bj_players').select().eq('id', player.id).single()
      if (me && !isSpectating) {
        const dv = handValue(r.dealer_hand || [])
        const pv = handValue(me.hand || [])
        const isBJ = pv === 21 && (me.hand || []).length === 2
        const res = calcResult(pv, dv, me.bet || 0, isBJ, r.dealer_hand || [])
        setPlayerResult({ text: res.badge, cls: res.cls })
        setResultSummary({ msg: res.badge + (res.delta > 0 ? ` +${res.delta}` : ` ${res.delta}`) + ' pt', cls: 'r-' + res.type })
        setPoints(me.points || points)
        showDrama(res.badge.includes('WIN') || res.badge.includes('BJ') ? 'WIN !' : res.badge === 'BUST' || res.badge === 'LOSE' ? 'LOSE…' : 'PUSH',
          res.badge.includes('WIN') || res.badge.includes('BJ') ? '#7dffb3' : res.badge === 'BUST' || res.badge === 'LOSE' ? '#ff6060' : '#ffe77a', 1000)
        const newStats = { ...stats }
        if (res.delta > 0) newStats.w++; else if (res.delta < 0) newStats.l++; else newStats.p++
        setStats(newStats)
      }
    }
  }

  // 途中参加者の登録
  useEffect(() => {
    if (!currentRoom) return
    if (['playing', 'dealer'].includes(currentRoom.status)) {
      // 自分がまだstatusを持っていない場合は観戦者として登録
      const me = allPlayers.find(p => p.id === player.id)
      if (me && me.status === 'waiting' && !me.hand?.length) {
        supabase.from('bj_players').update({ status: 'spectating', play_order: 99 }).eq('id', player.id)
        setIsSpectating(true)
        setPhase('waiting')
        setHintText('ゲーム進行中です。次のラウンドから参加できます。')
      }
    }
  }, [currentRoom, allPlayers])

  // ホストがbettingフェーズで全員betted→配牌
  useEffect(() => {
    if (!player.is_host) return
    if (phase !== 'betting') return
    if (allPlayers.length === 0) return
    const activePlayers = allPlayers.filter(p => p.status !== 'spectating')
    if (activePlayers.length > 0 && activePlayers.every(p => p.status === 'betted' && p.bet > 0)) {
      startDealing()
    }
  }, [allPlayers, phase])

  async function startDealing() {
    if (!player.is_host) return
    const newDeck = makeDeck()
    const sorted = allPlayers.filter(p => p.status !== 'spectating').sort((a, b) => a.play_order - b.play_order)
    await supabase.from('bj_rooms').update({ status: 'dealing' }).eq('id', room.id)
    await new Promise(r => setTimeout(r, 300))

    const hands = sorted.map((_, i) => [newDeck[i]])
    const dealerCard1 = newDeck[sorted.length]
    for (let i = 0; i < sorted.length; i++) hands[i].push(newDeck[sorted.length + 1 + i])
    const dealerCard2 = newDeck[sorted.length * 2 + 1]
    const dealerH = [dealerCard1, dealerCard2]
    const remaining = newDeck.slice(sorted.length * 2 + 2)

    for (let i = 0; i < sorted.length; i++) {
      await supabase.from('bj_players').update({ hand: hands[i], status: 'waiting' }).eq('id', sorted[i].id)
      await new Promise(r => setTimeout(r, 350))
    }
    await supabase.from('bj_rooms').update({
      dealer_hand: dealerH, status: 'playing',
      current_player_order: 0, deck_remaining: remaining
    }).eq('id', room.id)
  }

  async function advanceTurn() {
    const sorted = allPlayers.filter(p => p.status !== 'spectating').sort((a, b) => a.play_order - b.play_order)
    const nextOrder = myPlayOrder + 1
    const nextPlayer = sorted.find(p => p.play_order === nextOrder)
    if (nextPlayer) {
      await supabase.from('bj_rooms').update({ current_player_order: nextOrder }).eq('id', room.id)
    } else {
      await supabase.from('bj_rooms').update({ status: 'dealer', current_player_order: -1 }).eq('id', room.id)
      if (player.is_host) await runDealer()
    }
  }

  async function runDealer() {
    const { data: r } = await supabase.from('bj_rooms').select().eq('id', room.id).single()
    let dHand = [...(r.dealer_hand || [])]
    let remaining = [...(r.deck_remaining || deckRef.current)]
    setShowDealerSecond(true)

    while (handValue(dHand) < 17) {
      await new Promise(r => setTimeout(r, 700))
      const card = remaining.pop()
      dHand = [...dHand, card]
      setDealerHand([...dHand])
      await supabase.from('bj_rooms').update({ dealer_hand: dHand }).eq('id', room.id)
      if (handValue(dHand) > 21) { setDealerResult({ text: 'BUST!', cls: 'zr-bust' }); break }
    }

    const dv = handValue(dHand)
    const { data: players } = await supabase.from('bj_players').select().eq('room_id', room.id)
    for (const p of players) {
      if (p.status === 'spectating') continue
      const pv = handValue(p.hand || [])
      const isBJ = pv === 21 && (p.hand || []).length === 2
      const res = calcResult(pv, dv, p.bet || 0, isBJ, dHand)
      const newPts = (p.points || 1000) + res.delta
      await supabase.from('bj_players').update({ points: newPts, status: 'done', result: res.type }).eq('id', p.id)
    }
    await supabase.from('bj_rooms').update({ status: 'end', dealer_hand: dHand }).eq('id', room.id)
  }

  function showDrama(text, color, duration) {
    return new Promise(resolve => {
      setDramaText(text); setDramaColor(color); setDramaClass('show')
      setTimeout(() => { setDramaClass('hide'); setTimeout(() => { setDramaClass(''); resolve() }, 320) }, duration)
    })
  }

  function getHint(hand) {
    const h = hand || playerHand
    const pv = handValue(h)
    if (pv === 21 && h.length === 2) return '<span class="tag">Blackjack</span>最初の2枚で21！<strong>ブラックジャック</strong>です🎉'
    if (pv > 21) return '<span class="tag">Bust</span>合計が<strong>21を超えた</strong>のでバースト。'
    const canDouble = firstTurn && h.length === 2
    const canSplit = firstTurn && h.length === 2 && h[0] && h[1] && cardVal(h[0].r) === cardVal(h[1].r)
    const msgs = []
    if (canSplit) msgs.push('<span class="tag">Split</span>同じ数字2枚！2つの手に分けて戦えます。')
    if (canDouble) msgs.push('<span class="tag">Double</span>最初の2枚限定。追加チップを置いて1枚引きます。')
    if (firstTurn && h.length === 2) msgs.push('<span class="tag">Surrender</span>勝ち目が薄いと思ったら降参できます。半額返還。')
    if (msgs.length > 0) return msgs[0]
    if (pv <= 11) return `合計<strong>${pv}</strong>。<strong>Hit</strong>でカードを追加できます。`
    if (pv >= 17) return `合計<strong>${pv}</strong>。<strong>Stay</strong>でこのままディーラーと勝負。`
    return `合計<strong>${pv}</strong>。<strong>Hit</strong>でもう1枚、<strong>Stay</strong>で勝負。`
  }

  async function confirmBet() {
    if (bet === 0) { setHintText('チップを選んでベットしてください！'); return }
    await supabase.from('bj_players').update({ bet, status: 'betted' }).eq('id', player.id)
    setMyStatus('betted')
    setHintText('ベット完了！他のプレイヤーを待っています...')
  }

  async function doHit() {
    if (phase !== 'myturn') return
    setFirstTurn(false)
    const { data: r } = await supabase.from('bj_rooms').select('deck_remaining').eq('id', room.id).single()
    const d = r?.deck_remaining || deckRef.current
    const newDeck = [...d]; const card = newDeck.pop()
    const newHand = [...playerHand, card]
    setPlayerHand(newHand); deckRef.current = newDeck
    await supabase.from('bj_rooms').update({ deck_remaining: newDeck }).eq('id', room.id)
    await supabase.from('bj_players').update({ hand: newHand, status: 'playing' }).eq('id', player.id)
    if (handValue(newHand) >= 21) { await finishMyTurn(newHand) }
    else { setHintText(getHint(newHand)) }
  }

  async function doStay() {
    if (phase !== 'myturn') return
    setFirstTurn(false)
    await supabase.from('bj_players').update({ status: 'stand' }).eq('id', player.id)
    setMyStatus('stand'); setPhase('waiting')
    await advanceTurn()
  }

  async function finishMyTurn(hand) {
    const h = hand || playerHand
    const pv = handValue(h)
    const newStatus = pv > 21 ? 'bust' : pv === 21 && h.length === 2 ? 'bj' : 'stand'
    await supabase.from('bj_players').update({ hand: h, status: newStatus }).eq('id', player.id)
    setMyStatus(newStatus); setPhase('waiting')
    await advanceTurn()
  }

  function startExtra(mode) {
    setExtraMode(mode); setExtraBet(0)
    setHintText(mode === 'double'
      ? `<span class="tag">Double</span>追加ベットを置いてください（最大 <strong>${bet} pt</strong>）。`
      : `<span class="tag">Split</span>追加ベットを置いてください（最大 <strong>${bet} pt</strong>）。`)
  }

  async function confirmAction() {
    if (extraBet === 0) return
    const mode = extraMode; setExtraMode(null); setExtraBet(0)
    const cf = document.getElementById('btn-action-confirm'); if (cf) cf.style.display = 'none'
    if (mode === 'double') {
      const newBet = bet + extraBet; setBet(newBet); setFirstTurn(false)
      const { data: r } = await supabase.from('bj_rooms').select('deck_remaining').eq('id', room.id).single()
      const d = r?.deck_remaining || deckRef.current
      const newDeck = [...d]; const card = newDeck.pop()
      const newHand = [...playerHand, card]
      setPlayerHand(newHand); deckRef.current = newDeck
      await supabase.from('bj_rooms').update({ deck_remaining: newDeck }).eq('id', room.id)
      await supabase.from('bj_players').update({ hand: newHand, bet: newBet, status: 'stand' }).eq('id', player.id)
      setPhase('waiting'); await advanceTurn()
    } else if (mode === 'split') {
      setFirstTurn(false)
      const { data: r } = await supabase.from('bj_rooms').select('deck_remaining').eq('id', room.id).single()
      const d = r?.deck_remaining || deckRef.current
      const newDeck = [...d]; const card = newDeck.pop()
      const hand1 = [playerHand[0], card]
      setPlayerHand(hand1); deckRef.current = newDeck
      await supabase.from('bj_rooms').update({ deck_remaining: newDeck }).eq('id', room.id)
      await supabase.from('bj_players').update({ hand: hand1 }).eq('id', player.id)
      setHintText(`<span class="tag">Split</span>Hand 1をプレイします。`)
    }
  }

  async function doSurrender() {
    if (phase !== 'myturn') return
    const ret = Math.floor(bet / 2); const newPoints = points + ret
    setPoints(newPoints); setPlayerResult({ text: 'FOLD', cls: 'zr-push' })
    await supabase.from('bj_players').update({ status: 'stand', points: newPoints }).eq('id', player.id)
    setPhase('waiting'); await advanceTurn()
  }

  async function resetRound() {
    setBet(0); setPlayerHand([]); setDealerHand([])
    setFirstTurn(true); setExtraMode(null); setExtraBet(0)
    setResultSummary(null); setDealerResult(null); setPlayerResult(null)
    setShowDealerSecond(false); setMyStatus('betting'); setPhase('betting')
    setIsSpectating(false)
    setHintText('チップを選んでベットしてください。')
    if (player.is_host) {
      const sorted = [...allPlayersRef.current].sort(() => Math.random() - 0.5)
      for (let i = 0; i < sorted.length; i++) {
        await supabase.from('bj_players').update({ play_order: i, hand: [], bet: 0, status: 'betting', result: null }).eq('id', sorted[i].id)
      }
      await supabase.from('bj_rooms').update({
        status: 'betting', dealer_hand: [], current_player_order: -1,
        round: (currentRoom.round || 0) + 1, deck_remaining: []
      }).eq('id', room.id)
    }
  }

  function chipClick(v) {
    if (extraMode) {
      if (extraBet + v > bet || extraBet + v > points - bet) return
      const nb = extraBet + v; setExtraBet(nb)
      if (nb > 0) { const cf = document.getElementById('btn-action-confirm'); if (cf) cf.style.display = 'block' }
    } else {
      if (phase !== 'betting' || myStatus === 'betted') return
      if (bet + v > points) return
      setBet(b => b + v)
    }
  }

  function clearChip() {
    if (extraMode) { setExtraBet(0); const cf = document.getElementById('btn-action-confirm'); if (cf) cf.style.display = 'none' }
    else { if (myStatus === 'betted') return; setBet(0) }
  }

  const isMyTurn = phase === 'myturn'
  const isBetting = phase === 'betting' && myStatus !== 'betted'
  const isEnd = phase === 'end'
  const pv = handValue(playerHand)
  const dv = handValue(dealerHand)
  const otherPlayers = allPlayers.filter(p => p.id !== player.id)
  const maxPoints = Math.max(...allPlayers.map(p => p.points || 0), 1)
  const currentPlayerOrder = currentRoom.current_player_order
  const canDouble = isMyTurn && firstTurn && playerHand.length === 2 && !extraMode
  const canSplit = isMyTurn && firstTurn && playerHand.length === 2 && playerHand[0] && playerHand[1] && cardVal(playerHand[0].r) === cardVal(playerHand[1].r) && !extraMode
  const canSurrender = isMyTurn && firstTurn && playerHand.length === 2 && !extraMode

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
  const betChips = renderBetChips()

  return (
    <div className="game-screen">
      <div className="my-panel">
        <div className="table-arc" />
        <div className={`drama-overlay ${dramaClass}`}>
          <div className="drama-text" style={{ color: dramaColor }}>{dramaText}</div>
        </div>
        <div className="felt-content">
          <div className="logo-text">Royal Blackjack — {room.room_code}</div>

          <div className="dealer-zone" style={{ flex: 1 }}>
            <div className="zone-tag">Dealer</div>
            <div className="cards-row">
              {dealerHand.map((c, i) => {
                const faceDown = i === 1 && !showDealerSecond
                return (
                  <div key={i} className={`card animate-in${faceDown ? ' face-down' : (isRed(c.s) ? ' red' : ' black')}`}>
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
                  {dealerHand.length === 0 ? '—' : !showDealerSecond ? `${cardVal(dealerHand[0]?.r)} + ?` : dv}
                </div>
              )}
            </div>
          </div>

          <div className="table-divider" />

          <div className="center-area">
            <div className="bet-display">
              {betChips.map((c, i) =>
                c.divider ? <div key={i} className="bet-divider" /> :
                  <div key={i} className={`bet-chip-sm${c.extra ? ' extra' : ''}`} style={{ background: CHIP_COLORS[c.d] }}>{c.d}</div>
              )}
            </div>
            {isBetting && (
              <button className="center-btn" style={{ background: 'linear-gradient(135deg,#d4af37,#f5d76e,#b8860b)', color: '#1a0a00' }} onClick={confirmBet}>
                ✦ Bet ✦
              </button>
            )}
            {myStatus === 'betted' && phase === 'betting' && (
              <div style={{ fontSize: 11, color: 'rgba(212,175,55,0.7)', fontFamily: 'sans-serif' }}>ベット完了 — 配牌待ち...</div>
            )}
            {isSpectating && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'sans-serif', textAlign: 'center' }}>
                👁 観戦中<br/>次のラウンドから参加できます
              </div>
            )}
            {isEnd && (
              <button className="center-btn" onClick={resetRound} style={{ background: 'rgba(220,210,190,0.9)', color: '#2a2010' }}>↺ Next Round</button>
            )}
            <button id="btn-action-confirm" className="center-btn" onClick={confirmAction} style={{ display: 'none', background: 'linear-gradient(135deg,#e8c840,#f5e060,#c8a800)', color: '#2a1a00' }}>✦ OK ✦</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 24 }}>
              {playerResult ? (
                <div className={`zone-result show ${playerResult.cls}`}>{playerResult.text}</div>
              ) : (
                <div className={`score-pill${pv > 21 ? ' bust' : pv === 21 && playerHand.length === 2 ? ' bj' : ''}`}>
                  {playerHand.length === 0 ? '—' : pv}
                </div>
              )}
              {isMyTurn && <div style={{ fontSize: 10, background: 'rgba(46,204,113,0.3)', color: '#7dffb3', padding: '2px 8px', borderRadius: 10, fontFamily: 'sans-serif' }}>あなたのターン</div>}
            </div>
            <div className="cards-row">
              {playerHand.map((c, i) => (
                <div key={i} className={`card animate-in${isRed(c.s) ? ' red' : ' black'}`}>
                  <div className="card-rank">{c.r}</div><div className="card-suit">{c.s}</div>
                </div>
              ))}
            </div>
            <div className="zone-tag">{player.name} — {points.toLocaleString()} pt</div>
            {!isSpectating && (
              <div className="action-row">
                <button className="abtn abtn-hit" onClick={doHit} {...(!isMyTurn ? { 'data-off': '1' } : {})}>
                  <div className="abtn-icon">＋</div><div className="abtn-label">Hit</div>
                </button>
                <button className="abtn abtn-stay" onClick={doStay} {...(!isMyTurn ? { 'data-off': '1' } : {})}>
                  <div className="abtn-icon">■</div><div className="abtn-label">Stay</div>
                </button>
                <button className="abtn abtn-double" onClick={() => startExtra('double')} {...(!canDouble ? { 'data-off': '1' } : {})}>
                  <div className="abtn-icon">×2</div><div className="abtn-label">Double</div>
                </button>
                <button className="abtn abtn-split" onClick={() => startExtra('split')} {...(!canSplit ? { 'data-off': '1' } : {})}>
                  <div className="abtn-icon">⇌</div><div className="abtn-label">Split</div>
                </button>
                <button className="abtn abtn-surrender" onClick={doSurrender} {...(!canSurrender ? { 'data-off': '1' } : {})}>
                  <div className="abtn-icon">⚑</div><div className="abtn-label">Surrender</div>
                </button>
              </div>
            )}
          </div>
        </div>

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
            <div className={`result-summary ${resultSummary.cls}`} style={{ display: 'block' }}>{resultSummary.msg}</div>
          )}
          <div className="points-row">
            <div><div className="points-label">Points</div><div className="points-val">{points.toLocaleString()}</div></div>
            <div style={{ textAlign: 'right' }}><div className="points-label">Bet</div><div className="bet-val">{extraMode && extraBet > 0 ? `${bet}+${extraBet} pt` : `${bet} pt`}</div></div>
          </div>
          <div className="chip-row">
            {[5, 10, 25, 50, 100].map(v => (
              <div key={v} className={`chip chip-${v}`}
                style={(!isBetting && !extraMode) ? { opacity: 0.28, pointerEvents: 'none' } : {}}
                onClick={() => chipClick(v)}>{v}</div>
            ))}
            <div className="chip chip-clear" onClick={clearChip}>CLEAR</div>
          </div>
        </div>
      </div>

      <div className="others-panel">
        <div className="ranking-header">Players</div>
        {Array(3).fill(null).map((_, i) => {
          const other = otherPlayers[i]
          if (other) {
            const isCurrentTurn = other.play_order === currentPlayerOrder
            return (
              <div key={other.id} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
                {isCurrentTurn && (
                  <div style={{ position: 'absolute', top: 4, left: 4, zIndex: 10, fontSize: 9, background: 'rgba(46,204,113,0.4)', color: '#7dffb3', padding: '1px 6px', borderRadius: 8, fontFamily: 'sans-serif' }}>
                    ターン中
                  </div>
                )}
                <OtherPlayer player={other} maxPoints={maxPoints} showCards={isEnd || other.status === 'done'} />
              </div>
            )
          }
          return <div key={i} className="empty-slot"><div className="empty-text">空席</div></div>
        })}
      </div>
    </div>
  )
}
