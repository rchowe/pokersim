import { type Card, rankOf, suitOf } from './cards.ts';
import { CATEGORY, categoryOf, evaluate, straightHigh } from './evaluator.ts';
import { type GameState, type Seat, boardAt } from './game.ts';
import { ALL_COMBOS } from './handClasses.ts';
import { CLASS_PERCENTILE, PREFLOP_CHARTS, situationFor } from './preflop.ts';

export interface WeightedCombo {
  c1: Card;
  c2: Card;
  cls: number;
  w: number;
}

export interface EstimatedRange {
  combos: WeightedCombo[];
  /** Plain-English account of how each action narrowed the range. */
  notes: string[];
}

/** Every combo that doesn't use a dead card, at full weight. */
export function fullRange(dead: readonly Card[]): WeightedCombo[] {
  const deadSet = new Set(dead);
  return ALL_COMBOS.filter((c) => !deadSet.has(c.c1) && !deadSet.has(c.c2)).map((c) => ({ ...c, w: 1 }));
}

export type MadeStrength = 0 | 1 | 2 | 3;

export interface PostflopBucket {
  /** 0 = nothing, 1 = weak pair, 2 = top pair / overpair, 3 = two pair or better. */
  made: MadeStrength;
  flushDraw: boolean;
  /** Number of ranks that would complete a straight (2+ = open-ended or double gutter). */
  straightOuts: number;
}

export const BUCKET_NAMES = ['Air', 'Weak pair', 'Top pair / overpair', 'Two pair or better'];

export function postflopBucket(c1: Card, c2: Card, board: readonly Card[]): PostflopBucket {
  const cat = categoryOf(evaluate([c1, c2, ...board]));
  const boardCat = categoryOf(evaluate(board));
  const boardRanks = board.map(rankOf);
  const topBoard = Math.max(...boardRanks);

  let made: MadeStrength = 0;
  const pairStrength = (): MadeStrength => {
    // Highest pair made with a hole card.
    const holePairs = [c1, c2]
      .map(rankOf)
      .filter((r, i, arr) => boardRanks.includes(r) || arr.indexOf(r) !== i);
    if (holePairs.length === 0) return 0;
    return Math.max(...holePairs) >= topBoard ? 2 : 1;
  };
  if (cat > boardCat) {
    if (cat >= CATEGORY.TRIPS || (cat === CATEGORY.TWO_PAIR && boardCat === CATEGORY.HIGH_CARD)) made = 3;
    else made = Math.max(pairStrength(), 1) as MadeStrength;
  }

  let flushDraw = false;
  let straightOuts = 0;
  if (board.length < 5 && cat < CATEGORY.STRAIGHT) {
    for (let s = 0; s < 4; s++) {
      const n = [c1, c2, ...board].filter((c) => suitOf(c) === s).length;
      if (n === 4 && (suitOf(c1) === s || suitOf(c2) === s)) flushDraw = true;
    }
    let mask = 0;
    for (const c of [c1, c2, ...board]) mask |= 1 << rankOf(c);
    let boardMask = 0;
    for (const c of board) boardMask |= 1 << rankOf(c);
    for (let r = 0; r < 13; r++) {
      if (mask & (1 << r)) continue;
      if (straightHigh(mask | (1 << r)) >= 0 && straightHigh(boardMask | (1 << r)) < 0) straightOuts++;
    }
  }
  return { made, flushDraw, straightOuts };
}

const hasDraw = (b: PostflopBucket) => b.flushDraw || b.straightOuts >= 2;

// How likely each kind of hand is to take an action, relative to the others.
const POSTFLOP_WEIGHTS = {
  aggressive: { made: [0.25, 0.35, 0.75, 1], draw: 0.8 },
  call: { made: [0.1, 0.7, 1, 0.5], draw: 1 },
  check: { made: [1, 1, 0.8, 0.4], draw: 0.7 },
} as const;

function postflopMultiplier(kind: keyof typeof POSTFLOP_WEIGHTS, bucket: PostflopBucket): number {
  const table = POSTFLOP_WEIGHTS[kind];
  const madeWeight = table.made[bucket.made];
  return hasDraw(bucket) && bucket.made < 2 ? Math.max(madeWeight, table.draw) : madeWeight;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Estimates `seat`'s range from their actions this hand, as seen by someone who
 * holds the `dead` cards. Preflop actions filter by chart; postflop actions
 * reweight combos by how well they connect with the board.
 */
export function estimateRange(state: GameState, seat: Seat, dead: readonly Card[]): EstimatedRange {
  const combos = fullRange([...dead, ...state.board]);
  const notes: string[] = [];
  let preflopRaises = 0;

  const reweight = (fn: (c: WeightedCombo) => number) => {
    for (const c of combos) c.w *= fn(c);
  };

  for (const entry of state.log) {
    if (entry.type === 'post') continue;
    const isRaise = entry.type === 'raise' || entry.type === 'bet';
    if (entry.player === seat && entry.type !== 'fold') {
      if (entry.street === 'preflop') {
        const situation = situationFor(preflopRaises, state.button === seat);
        const chart = PREFLOP_CHARTS[situation];
        if (isRaise) {
          reweight((c) => (CLASS_PERCENTILE[c.cls] < chart.raise ? 1 : 0.03));
          notes.push(`${chart.title}: ${chart.raiseLabel.toLowerCase()} → mostly the top ${pct(chart.raise)} of hands.`);
        } else {
          // Calling/checking ranges keep some strong hands that trap.
          const top = situation === 'open' ? 0.2 : chart.raise;
          const bottom = situation === 'open' ? 0.95 : chart.call;
          reweight((c) => {
            const p = CLASS_PERCENTILE[c.cls];
            return p < top ? 0.3 : p < bottom ? 1 : 0.05;
          });
          notes.push(
            `${chart.title}: ${entry.type} → mostly hands between the top ${pct(top)} and ${pct(bottom)}, with a few traps.`,
          );
        }
      } else {
        const board = boardAt(state, entry.street);
        const kind = isRaise ? 'aggressive' : entry.type === 'call' ? 'call' : 'check';
        reweight((c) => postflopMultiplier(kind, postflopBucket(c.c1, c.c2, board)));
        const verb = isRaise ? `${entry.type === 'bet' ? 'bet' : 'raised'}` : entry.type === 'call' ? 'called' : 'checked';
        notes.push(
          {
            aggressive: `${cap(entry.street)}: ${verb} → weighted toward strong hands and draws, with some bluffs.`,
            call: `${cap(entry.street)}: called → weighted toward medium-strength hands and draws.`,
            check: `${cap(entry.street)}: checked → weighted away from the strongest hands.`,
          }[kind],
        );
      }
    }
    if (entry.street === 'preflop' && isRaise) preflopRaises++;
  }
  return { combos, notes };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Average weight of each of the 169 classes; NaN where no combos are live. */
export function rangeGrid(combos: readonly WeightedCombo[]): number[] {
  const sum = new Array<number>(169).fill(0);
  const count = new Array<number>(169).fill(0);
  for (const c of combos) {
    sum[c.cls] += c.w;
    count[c.cls]++;
  }
  return sum.map((s, i) => (count[i] ? s / count[i] : NaN));
}

/** Weighted share of all live combos in the range. */
export function rangeSize(combos: readonly WeightedCombo[]): number {
  if (combos.length === 0) return 0;
  return combos.reduce((t, c) => t + c.w, 0) / combos.length;
}
