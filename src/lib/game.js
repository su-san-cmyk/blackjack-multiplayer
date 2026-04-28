const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export function makeDeck() {
  const deck = []
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

export function cardVal(r) {
  if (['J', 'Q', 'K'].includes(r)) return 10
  if (r === 'A') return 11
  return parseInt(r)
}

export function handValue(hand) {
  let total = 0, aces = 0
  for (const c of hand) { total += cardVal(c.r); if (c.r === 'A') aces++ }
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return total
}

export function isSoft(hand) {
  let total = 0, aces = 0
  for (const c of hand) { total += cardVal(c.r); if (c.r === 'A') aces++ }
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return aces > 0
}

export function isPair(hand) {
  return hand.length === 2 && cardVal(hand[0].r) === cardVal(hand[1].r)
}

export function isRed(s) { return s === '♥' || s === '♦' }

export function dealerPlay(dealerHand, deck) {
  const hand = [...dealerHand]
  const remaining = [...deck]
  while (handValue(hand) < 17) hand.push(remaining.pop())
  return { hand, deck: remaining }
}

export function calcResult(pv, dv, betAmt, isBJ, dealerHand) {
  const dBJ = dv === 21 && dealerHand.length === 2
  if (isBJ && !dBJ) {
    const g = Math.floor(betAmt * 1.5)
    return { delta: betAmt + g, badge: `BJ! +${g}`, cls: 'zr-bj', type: 'bj' }
  }
  if (pv > 21) return { delta: -betAmt, badge: 'BUST', cls: 'zr-bust', type: 'lose' }
  if (dv > 21) return { delta: betAmt, badge: 'WIN!', cls: 'zr-win', type: 'win' }
  if (pv > dv) return { delta: betAmt, badge: 'WIN!', cls: 'zr-win', type: 'win' }
  if (dv > pv) return { delta: -betAmt, badge: 'LOSE', cls: 'zr-lose', type: 'lose' }
  return { delta: 0, badge: 'PUSH', cls: 'zr-push', type: 'push' }
}

export function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export const CHIP_COLORS = { 5: '#c0392b', 10: '#2471a3', 25: '#1e8449', 50: '#7d3c98', 100: '#b7950b' }
