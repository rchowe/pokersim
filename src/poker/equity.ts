import type { Card } from './cards.ts';
import { categoryOf, evaluate } from './evaluator.ts';
import type { WeightedCombo } from './range.ts';

export interface EquityResult {
  win: number;
  tie: number;
  lose: number;
  /** win + tie / 2 */
  equity: number;
  /** How often the hero finishes with each hand category by the river. */
  categories: number[];
  exact: boolean;
}

/**
 * Hero's equity against one weighted range per opponent. It enumerates exactly
 * heads-up on the turn and river, and against known hands from the flop on;
 * otherwise it samples (Monte Carlo). A tie for
 * best hand counts as an equal share of the pot.
 */
export function calcEquity(
  hero: readonly Card[],
  board: readonly Card[],
  ranges: readonly (readonly WeightedCombo[])[],
  iterations = 6000,
  rng: () => number = Math.random,
): EquityResult | null {
  const known = new Set([...hero, ...board]);
  const lives = ranges.map((range) => range.filter((c) => c.w > 0 && !known.has(c.c1) && !known.has(c.c2)));
  if (lives.length === 0 || lives.some((live) => live.length === 0)) return null;

  let win = 0;
  let tie = 0;
  let share = 0;
  let total = 0;
  const categories = new Array<number>(9).fill(0);
  /** `v` is the best opponent score and `ties` how many opponents hold it. */
  const tally = (h: number, v: number, ties: number, w: number) => {
    total += w;
    if (h > v) {
      win += w;
      share += w;
    } else if (h === v) {
      tie += w;
      share += w / (ties + 1);
    }
    categories[categoryOf(h)] += w;
  };

  const missing = 5 - board.length;
  const fixed = lives.every((live) => live.length === 1) && missing <= 2;
  const exact = fixed || (lives.length === 1 && missing <= 1);
  if (fixed) enumerateFixed(hero, board, lives.map((live) => live[0]), tally);
  else if (exact) enumerate(hero, board, lives[0], tally);
  else sample(hero, board, lives, iterations, rng, tally);
  // Every sample collided (the ranges overlap too tightly to deal out).
  if (total === 0) return null;
  return {
    win: win / total,
    tie: tie / total,
    lose: (total - win - tie) / total,
    equity: share / total,
    categories: categories.map((c) => c / total),
    exact,
  };
}

type Tally = (h: number, v: number, ties: number, w: number) => void;

/** Heads-up with at most one card to come: every villain combo and river. */
function enumerate(hero: readonly Card[], board: readonly Card[], live: readonly WeightedCombo[], tally: Tally) {
  if (board.length === 5) {
    const h = evaluate([...hero, ...board]);
    for (const c of live) tally(h, evaluate([c.c1, c.c2, ...board]), 1, c.w);
    return;
  }
  const known = new Set([...hero, ...board]);
  const rivers: Card[] = [];
  for (let card = 0; card < 52; card++) if (!known.has(card)) rivers.push(card);
  const heroScores = new Map(rivers.map((r) => [r, evaluate([...hero, ...board, r])]));
  for (const c of live) {
    const riverCount = rivers.length - 2;
    for (const r of rivers) {
      if (r === c.c1 || r === c.c2) continue;
      tally(heroScores.get(r)!, evaluate([c.c1, c.c2, ...board, r]), 1, c.w / riverCount);
    }
  }
}

/** Known opponent hands: every remaining runout. */
function enumerateFixed(hero: readonly Card[], board: readonly Card[], hands: readonly WeightedCombo[], tally: Tally) {
  const known = new Set([...hero, ...board, ...hands.flatMap((h) => [h.c1, h.c2])]);
  if (known.size !== hero.length + board.length + 2 * hands.length) return; // Hands share a card.
  const deck: Card[] = [];
  for (let card = 0; card < 52; card++) if (!known.has(card)) deck.push(card);
  const runouts: Card[][] = [];
  if (board.length === 5) runouts.push([]);
  else if (board.length === 4) for (const a of deck) runouts.push([a]);
  else for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) runouts.push([deck[i], deck[j]]);
  for (const extra of runouts) {
    let best = -1;
    let ties = 0;
    for (const h of hands) {
      const v = evaluate([h.c1, h.c2, ...board, ...extra]);
      if (v > best) {
        best = v;
        ties = 1;
      } else if (v === best) ties++;
    }
    tally(evaluate([...hero, ...board, ...extra]), best, ties, 1);
  }
}

function sample(
  hero: readonly Card[],
  board: readonly Card[],
  lives: readonly (readonly WeightedCombo[])[],
  iterations: number,
  rng: () => number,
  tally: Tally,
) {
  const known = new Set([...hero, ...board]);
  const cumulatives = lives.map((live) => {
    let acc = 0;
    return live.map((c) => (acc += c.w));
  });
  const deck: Card[] = [];
  for (let card = 0; card < 52; card++) if (!known.has(card)) deck.push(card);
  const missing = 5 - board.length;
  const heroCards = [...hero, ...board];
  const villainCards = [0, 0, ...board];
  const used = new Set<Card>();
  const hands: WeightedCombo[] = [];
  for (let i = 0; i < iterations; i++) {
    // Draw a combo for each opponent, redrawing ones that collide with earlier picks.
    used.clear();
    hands.length = 0;
    let ok = true;
    for (let o = 0; o < lives.length && ok; o++) {
      const cumulative = cumulatives[o];
      const total = cumulative[cumulative.length - 1];
      let combo: WeightedCombo | null = null;
      for (let attempt = 0; attempt < 50 && !combo; attempt++) {
        const c = lives[o][bisect(cumulative, rng() * total)];
        if (!used.has(c.c1) && !used.has(c.c2)) combo = c;
      }
      if (!combo) ok = false;
      else {
        used.add(combo.c1);
        used.add(combo.c2);
        hands.push(combo);
      }
    }
    if (!ok) continue;
    // Partial shuffle to draw the missing board cards, skipping the opponents' cards.
    let drawn = 0;
    for (let j = 0; drawn < missing; j++) {
      const k = j + Math.floor(rng() * (deck.length - j));
      [deck[j], deck[k]] = [deck[k], deck[j]];
      const card = deck[j];
      if (used.has(card)) continue;
      heroCards[hero.length + board.length + drawn] = card;
      villainCards[2 + board.length + drawn] = card;
      drawn++;
    }
    let best = -1;
    let ties = 0;
    for (const combo of hands) {
      villainCards[0] = combo.c1;
      villainCards[1] = combo.c2;
      const v = evaluate(villainCards);
      if (v > best) {
        best = v;
        ties = 1;
      } else if (v === best) ties++;
    }
    tally(evaluate(heroCards), best, ties, 1);
  }
}

function bisect(cumulative: number[], x: number): number {
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] > x) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
