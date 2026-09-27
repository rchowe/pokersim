import { type Card, RANK_NAMES, RANK_PLURALS } from './cards.ts';

export const HAND_CATEGORIES = [
  'High card',
  'Pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
] as const;

export const CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const;

const WHEEL = (1 << 12) | 0b1111;

/** Highest card of a straight contained in a rank bitmask, or -1. */
export function straightHigh(mask: number): number {
  for (let high = 12; high >= 4; high--) {
    const run = 0b11111 << (high - 4);
    if ((mask & run) === run) return high;
  }
  return (mask & WHEEL) === WHEEL ? 3 : -1;
}

function pack(category: number, ranks: number[]): number {
  let score = category << 20;
  for (let i = 0; i < ranks.length; i++) score |= ranks[i] << (16 - 4 * i);
  return score;
}

function topBits(mask: number, count: number, exclude = -1): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0 && out.length < count; r--) {
    if (r !== exclude && mask & (1 << r)) out.push(r);
  }
  return out;
}

const counts = new Int8Array(13);

/**
 * Scores the best five-card hand from any number of cards (up to 7).
 * Higher is better; scores from different hands are directly comparable.
 */
export function evaluate(cards: readonly Card[]): number {
  counts.fill(0);
  const suitMasks = [0, 0, 0, 0];
  const suitCounts = [0, 0, 0, 0];
  let rankMask = 0;
  for (const c of cards) {
    const r = c >> 2;
    const s = c & 3;
    counts[r]++;
    suitMasks[s] |= 1 << r;
    suitCounts[s]++;
    rankMask |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCounts[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sf = straightHigh(suitMasks[flushSuit]);
    if (sf >= 0) return pack(CATEGORY.STRAIGHT_FLUSH, [sf]);
  }

  let quad = -1;
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quad = r;
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }

  if (quad >= 0) return pack(CATEGORY.QUADS, [quad, ...topBits(rankMask, 1, quad)]);
  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    return pack(CATEGORY.FULL_HOUSE, [trips[0], Math.max(trips[1] ?? -1, pairs[0] ?? -1)]);
  }
  if (flushSuit >= 0) return pack(CATEGORY.FLUSH, topBits(suitMasks[flushSuit], 5));
  const st = straightHigh(rankMask);
  if (st >= 0) return pack(CATEGORY.STRAIGHT, [st]);
  if (trips.length > 0) {
    return pack(CATEGORY.TRIPS, [trips[0], ...topBits(rankMask & ~(1 << trips[0]), 2)]);
  }
  if (pairs.length >= 2) {
    const kickerMask = rankMask & ~(1 << pairs[0]) & ~(1 << pairs[1]);
    return pack(CATEGORY.TWO_PAIR, [pairs[0], pairs[1], ...topBits(kickerMask, 1)]);
  }
  if (pairs.length === 1) {
    return pack(CATEGORY.PAIR, [pairs[0], ...topBits(rankMask, 3, pairs[0])]);
  }
  return pack(CATEGORY.HIGH_CARD, topBits(rankMask, 5));
}

export const categoryOf = (score: number): number => score >> 20;

const rankAt = (score: number, i: number): number => (score >> (16 - 4 * i)) & 15;

export function describeHand(score: number): string {
  const r1 = rankAt(score, 0);
  const r2 = rankAt(score, 1);
  switch (categoryOf(score)) {
    case CATEGORY.STRAIGHT_FLUSH:
      return r1 === 12 ? 'Royal flush' : `Straight flush, ${RANK_NAMES[r1]} high`;
    case CATEGORY.QUADS:
      return `Four of a kind, ${RANK_PLURALS[r1]}`;
    case CATEGORY.FULL_HOUSE:
      return `Full house, ${RANK_PLURALS[r1]} full of ${RANK_PLURALS[r2]}`;
    case CATEGORY.FLUSH:
      return `Flush, ${RANK_NAMES[r1]} high`;
    case CATEGORY.STRAIGHT:
      return `Straight, ${RANK_NAMES[r1]} high`;
    case CATEGORY.TRIPS:
      return `Three of a kind, ${RANK_PLURALS[r1]}`;
    case CATEGORY.TWO_PAIR:
      return `Two pair, ${RANK_PLURALS[r1]} and ${RANK_PLURALS[r2]}`;
    case CATEGORY.PAIR:
      return `Pair of ${RANK_PLURALS[r1]}`;
    default:
      return `${RANK_NAMES[r1]} high`;
  }
}
