import { type Card, RANKS, makeCard, rankOf, suitOf } from './cards.ts';

export type HandKind = 'pair' | 'suited' | 'offsuit';

export interface HandClass {
  /** Index into the 13x13 grid: row * 13 + col. */
  index: number;
  label: string;
  high: number;
  low: number;
  kind: HandKind;
  combos: number;
}

// Grid rows/cols run from Ace (0) down to Deuce (12). Suited hands sit above the
// diagonal, offsuit hands below, pairs on it.
const rankAtPosition = (pos: number): number => 12 - pos;

export const HAND_CLASSES: HandClass[] = Array.from({ length: 169 }, (_, index) => {
  const row = Math.floor(index / 13);
  const col = index % 13;
  const a = rankAtPosition(row);
  const b = rankAtPosition(col);
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  const kind: HandKind = row === col ? 'pair' : row < col ? 'suited' : 'offsuit';
  const label = RANKS[high] + RANKS[low] + (kind === 'suited' ? 's' : kind === 'offsuit' ? 'o' : '');
  const combos = kind === 'pair' ? 6 : kind === 'suited' ? 4 : 12;
  return { index, label, high, low, kind, combos };
});

export function classIndex(high: number, low: number, suited: boolean): number {
  if (high < low) [high, low] = [low, high];
  const hi = 12 - high;
  const lo = 12 - low;
  if (high === low) return hi * 13 + hi;
  return suited ? hi * 13 + lo : lo * 13 + hi;
}

export const classOfCombo = (c1: Card, c2: Card): number =>
  classIndex(rankOf(c1), rankOf(c2), suitOf(c1) === suitOf(c2));

export const classByLabel = new Map(HAND_CLASSES.map((c) => [c.label, c]));

export function combosOfClass(cls: HandClass): [Card, Card][] {
  const out: [Card, Card][] = [];
  for (let s1 = 0; s1 < 4; s1++) {
    for (let s2 = 0; s2 < 4; s2++) {
      if (cls.kind === 'pair' && s2 <= s1) continue;
      if (cls.kind === 'suited' && s1 !== s2) continue;
      if (cls.kind === 'offsuit' && s1 === s2) continue;
      out.push([makeCard(cls.high, s1), makeCard(cls.low, s2)]);
    }
  }
  return out;
}

export interface Combo {
  c1: Card;
  c2: Card;
  cls: number;
}

export const ALL_COMBOS: Combo[] = HAND_CLASSES.flatMap((cls) =>
  combosOfClass(cls).map(([c1, c2]) => ({ c1, c2, cls: cls.index })),
);
