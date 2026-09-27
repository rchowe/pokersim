import { type GameState, type Seat } from './game.ts';
import { HAND_CLASSES, classByLabel } from './handClasses.ts';
import { PREFLOP_RANKING } from './preflopRanking.ts';

export type PreflopSituation = 'open' | 'vs_limp' | 'vs_raise' | 'vs_3bet' | 'vs_4bet';

export interface PreflopChart {
  title: string;
  /** Hands in the top `raise` fraction of combos raise. */
  raise: number;
  /** Hands between `raise` and `call` call (or check). The rest fold. */
  call: number;
  raiseLabel: string;
  callLabel: string;
}

// Simplified heads-up 100bb charts, expressed as a fraction of all 1326 combos.
export const PREFLOP_CHARTS: Record<PreflopSituation, PreflopChart> = {
  open: { title: 'Button (SB), first to act', raise: 0.8, call: 0.8, raiseLabel: 'Raise', callLabel: 'Limp' },
  vs_limp: { title: 'Big blind vs. a limp', raise: 0.3, call: 1, raiseLabel: 'Raise', callLabel: 'Check' },
  vs_raise: { title: 'Facing a raise', raise: 0.12, call: 0.62, raiseLabel: '3-bet', callLabel: 'Call' },
  vs_3bet: { title: 'Facing a 3-bet', raise: 0.06, call: 0.3, raiseLabel: '4-bet', callLabel: 'Call' },
  vs_4bet: { title: 'Facing a 4-bet or more', raise: 0.025, call: 0.05, raiseLabel: 'All-in', callLabel: 'Call' },
};

/**
 * For each of the 169 classes (by grid index): the fraction of combos ranked
 * above the midpoint of this class. Lower means stronger.
 */
export const CLASS_PERCENTILE: number[] = (() => {
  const out = new Array<number>(169).fill(1);
  let cumulative = 0;
  for (const [label] of PREFLOP_RANKING) {
    const cls = classByLabel.get(label)!;
    out[cls.index] = (cumulative + cls.combos / 2) / 1326;
    cumulative += cls.combos;
  }
  return out;
})();

export type ChartAction = 'raise' | 'call' | 'fold';

export function chartAction(situation: PreflopSituation, classIdx: number): ChartAction {
  const chart = PREFLOP_CHARTS[situation];
  const pct = CLASS_PERCENTILE[classIdx];
  if (pct < chart.raise) return 'raise';
  if (pct < chart.call) return 'call';
  return 'fold';
}

/** Situation for a player given how many preflop raises came before their action. */
export function situationFor(raisesBefore: number, isButton: boolean): PreflopSituation {
  if (raisesBefore === 0) return isButton ? 'open' : 'vs_limp';
  if (raisesBefore === 1) return 'vs_raise';
  if (raisesBefore === 2) return 'vs_3bet';
  return 'vs_4bet';
}

/** The preflop situation `seat` currently faces, or null outside a preflop decision. */
export function currentSituation(state: GameState, seat: Seat): PreflopSituation | null {
  if (state.status !== 'playing' || state.street !== 'preflop' || state.toAct !== seat) return null;
  const raises = state.log.filter((e) => e.street === 'preflop' && e.type === 'raise').length;
  return situationFor(raises, state.button === seat);
}

/** Top-N% label for a class, for explanations. */
export const classLabel = (idx: number): string => HAND_CLASSES[idx].label;
