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
 * Hero's equity against a weighted range. Enumerates exactly on the turn and
 * river; uses Monte Carlo sampling preflop and on the flop.
 */
export function calcEquity(
  hero: readonly Card[],
  board: readonly Card[],
  range: readonly WeightedCombo[],
  iterations = 6000,
  rng: () => number = Math.random,
): EquityResult | null {
  const known = new Set([...hero, ...board]);
  const live = range.filter((c) => c.w > 0 && !known.has(c.c1) && !known.has(c.c2));
  if (live.length === 0) return null;

  let win = 0;
  let tie = 0;
  let total = 0;
  const categories = new Array<number>(9).fill(0);
  const tally = (h: number, v: number, w: number) => {
    total += w;
    if (h > v) win += w;
    else if (h === v) tie += w;
    categories[categoryOf(h)] += w;
  };

  const missing = 5 - board.length;
  const exact = missing <= 1;
  if (missing === 0) {
    const h = evaluate([...hero, ...board]);
    for (const c of live) tally(h, evaluate([c.c1, c.c2, ...board]), c.w);
  } else if (missing === 1) {
    const rivers: Card[] = [];
    for (let card = 0; card < 52; card++) if (!known.has(card)) rivers.push(card);
    const heroScores = new Map(rivers.map((r) => [r, evaluate([...hero, ...board, r])]));
    for (const c of live) {
      const riverCount = rivers.length - 2;
      for (const r of rivers) {
        if (r === c.c1 || r === c.c2) continue;
        tally(heroScores.get(r)!, evaluate([c.c1, c.c2, ...board, r]), c.w / riverCount);
      }
    }
  } else {
    const cumulative: number[] = [];
    let acc = 0;
    for (const c of live) cumulative.push((acc += c.w));
    const deck: Card[] = [];
    for (let card = 0; card < 52; card++) if (!known.has(card)) deck.push(card);
    const heroCards = [...hero, ...board];
    const villainCards = [0, 0, ...board];
    for (let i = 0; i < iterations; i++) {
      const combo = live[bisect(cumulative, rng() * acc)];
      // Partial shuffle to draw the missing board cards, skipping the villain's cards.
      let drawn = 0;
      for (let j = 0; drawn < missing; j++) {
        const k = j + Math.floor(rng() * (deck.length - j));
        [deck[j], deck[k]] = [deck[k], deck[j]];
        const card = deck[j];
        if (card === combo.c1 || card === combo.c2) continue;
        heroCards[hero.length + board.length + drawn] = card;
        villainCards[2 + board.length + drawn] = card;
        drawn++;
      }
      villainCards[0] = combo.c1;
      villainCards[1] = combo.c2;
      tally(evaluate(heroCards), evaluate(villainCards), 1);
    }
  }
  return {
    win: win / total,
    tie: tie / total,
    lose: (total - win - tie) / total,
    equity: (win + tie / 2) / total,
    categories: categories.map((c) => c / total),
    exact,
  };
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
