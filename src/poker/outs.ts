import { type Card, rankOf } from './cards.ts';
import { CATEGORY, HAND_CATEGORIES, categoryOf, describeHand, evaluate } from './evaluator.ts';

export interface OutGroup {
  category: number;
  name: string;
  cards: Card[];
}

export interface OutsResult {
  currentHand: string;
  /** Cards that improve the hero's hand using a hole card, grouped by the hand they make. */
  groups: OutGroup[];
  outs: Card[];
  /** Cards the hero hasn't seen (the opponent's hole cards are unknown). */
  unseen: number;
  nextCardPct: number;
  /** Chance of hitting at least one out by the river (flop only). */
  byRiverPct: number | null;
  /** Rule of 4 (flop) or rule of 2 (turn) estimate. */
  ruleOfThumb: number;
  /** When the opponents' cards are known: cards that change whether the hero is winning. */
  versusActual?: { behind: boolean; tied: boolean; cards: Card[] };
}

export function calcOuts(
  hero: readonly Card[],
  board: readonly Card[],
  opponents?: readonly (readonly Card[])[],
): OutsResult | null {
  if (board.length !== 3 && board.length !== 4) return null;
  const known = new Set([...hero, ...board]);
  const current = evaluate([...hero, ...board]);
  const currentCat = categoryOf(current);
  const heroRanks = hero.map(rankOf);
  const boardRanks = board.map(rankOf);

  const outs: Card[] = [];
  const byCategory = new Map<number, Card[]>();
  for (let card = 0; card < 52; card++) {
    if (known.has(card)) continue;
    const next = evaluate([...hero, ...board, card]);
    const nextCat = categoryOf(next);
    const boardCat = categoryOf(evaluate([...board, card]));
    if (nextCat <= currentCat || nextCat <= boardCat) continue;
    // Pairing the board only gives everyone two pair; don't count it.
    const pairsBoard = boardRanks.includes(rankOf(card)) && !heroRanks.includes(rankOf(card));
    if (pairsBoard && nextCat === CATEGORY.TWO_PAIR) continue;
    outs.push(card);
    byCategory.set(nextCat, [...(byCategory.get(nextCat) ?? []), card]);
  }

  const unseen = 52 - hero.length - board.length;
  const n = outs.length;
  const onFlop = board.length === 3;
  const result: OutsResult = {
    currentHand: describeHand(current),
    groups: [...byCategory.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([category, cards]) => ({ category, name: HAND_CATEGORIES[category], cards })),
    outs,
    unseen,
    nextCardPct: n / unseen,
    byRiverPct: onFlop ? 1 - ((unseen - n) * (unseen - n - 1)) / (unseen * (unseen - 1)) : null,
    ruleOfThumb: Math.min(n * (onFlop ? 4 : 2), 100) / 100,
  };

  if (opponents && opponents.length > 0) {
    const seen = new Set([...known, ...opponents.flat()]);
    const bestOpponent = (extra: Card[]) => Math.max(...opponents.map((o) => evaluate([...o, ...board, ...extra])));
    const oppNow = bestOpponent([]);
    const behind = current < oppNow;
    const tied = current === oppNow;
    const cards: Card[] = [];
    for (let card = 0; card < 52; card++) {
      if (seen.has(card)) continue;
      const h = evaluate([...hero, ...board, card]);
      const v = bestOpponent([card]);
      // Behind or tied: cards that put us ahead of everyone. Ahead: cards that put someone ahead.
      if (behind || tied ? h > v : h < v) cards.push(card);
    }
    result.versusActual = { behind, tied, cards };
  }
  return result;
}
