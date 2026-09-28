import { type GameState, type Seat, blindSeats, nextSeat } from './game.ts';
import { HAND_CLASSES, classByLabel } from './handClasses.ts';
import { PREFLOP_RANKING } from './preflopRanking.ts';

export type PreflopSituation = 'open' | 'vs_limp' | 'vs_raise' | 'vs_3bet' | 'vs_4bet';
export const SITUATIONS: PreflopSituation[] = ['open', 'vs_limp', 'vs_raise', 'vs_3bet', 'vs_4bet'];

/** Heads-up there are only two positions: BTN (who posts the small blind) and BB. */
export type Position = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

export const POSITION_NAMES: Record<Position, string> = {
  UTG: 'Under the gun',
  HJ: 'Hijack',
  CO: 'Cutoff',
  BTN: 'Button',
  SB: 'Small blind',
  BB: 'Big blind',
};

export interface PreflopSpot {
  situation: PreflopSituation;
  position: Position;
  players: number;
}

export interface PreflopChart {
  title: string;
  /** Hands in the top `raise` fraction of combos raise. */
  raise: number;
  /** Hands between `raise` and `call` call (or check). The rest fold. */
  call: number;
  raiseLabel: string;
  callLabel: string;
}

const LABELS: Record<PreflopSituation, { raiseLabel: string; callLabel: string }> = {
  open: { raiseLabel: 'Raise', callLabel: 'Limp' },
  vs_limp: { raiseLabel: 'Raise', callLabel: 'Call' },
  vs_raise: { raiseLabel: '3-bet', callLabel: 'Call' },
  vs_3bet: { raiseLabel: '4-bet', callLabel: 'Call' },
  vs_4bet: { raiseLabel: 'All-in', callLabel: 'Call' },
};

// Simplified 100bb charts, expressed as a fraction of all 1326 combos.
const HEADS_UP: Record<PreflopSituation, [raise: number, call: number]> = {
  open: [0.8, 0.8],
  vs_limp: [0.3, 1],
  vs_raise: [0.12, 0.62],
  vs_3bet: [0.06, 0.3],
  vs_4bet: [0.025, 0.05],
};

// With more players behind, opens get tighter; the blinds defend at a discount.
const RING_OPEN: Record<Position, number> = { UTG: 0.15, HJ: 0.19, CO: 0.27, BTN: 0.43, SB: 0.4, BB: 0.3 };

function ringChart(situation: PreflopSituation, position: Position): [number, number] {
  switch (situation) {
    case 'open':
      return [RING_OPEN[position], RING_OPEN[position]];
    case 'vs_limp':
      return position === 'BB' ? [0.2, 1] : position === 'SB' ? [0.12, 0.45] : [0.12, 0.22];
    case 'vs_raise':
      return position === 'BB' ? [0.08, 0.38] : position === 'SB' ? [0.07, 0.12] : [0.06, 0.14];
    case 'vs_3bet':
      return [0.04, 0.12];
    case 'vs_4bet':
      return [0.025, 0.05];
  }
}

function chartTitle({ situation, position, players }: PreflopSpot): string {
  const who = players === 2 && position === 'BTN' ? 'Button (SB)' : POSITION_NAMES[position];
  switch (situation) {
    case 'open':
      return players === 2 ? `${who}, first to act` : `${who}, first in`;
    case 'vs_limp':
      return `${who} vs. a limp`;
    case 'vs_raise':
      return `${who} facing a raise`;
    case 'vs_3bet':
      return 'Facing a 3-bet';
    case 'vs_4bet':
      return 'Facing a 4-bet or more';
  }
}

export function preflopChart(spot: PreflopSpot): PreflopChart {
  const [raise, call] = spot.players === 2 ? HEADS_UP[spot.situation] : ringChart(spot.situation, spot.position);
  const labels = { ...LABELS[spot.situation] };
  if (spot.situation === 'vs_limp' && spot.position === 'BB') labels.callLabel = 'Check';
  return { title: chartTitle(spot), raise, call, ...labels };
}

/** Situations a player in `position` can actually face, for the chart picker. */
export function situationsFor(position: Position, players: number): PreflopSituation[] {
  return SITUATIONS.filter(
    (s) => !(s === 'open' && position === 'BB') && !(s === 'vs_limp' && players === 2 && position === 'BTN'),
  );
}

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

export function chartAction(chart: PreflopChart, classIdx: number): ChartAction {
  const pct = CLASS_PERCENTILE[classIdx];
  if (pct < chart.raise) return 'raise';
  if (pct < chart.call) return 'call';
  return 'fold';
}

/** Table position of `seat` for the current button. */
export function positionOf(state: GameState, seat: Seat): Position {
  const { sb, bb } = blindSeats(state);
  if (seat === bb) return 'BB';
  if (seat === state.button) return 'BTN';
  if (seat === sb) return 'SB';
  // Count seats between this one and the button: the seat just before it is the cutoff.
  let before = 0;
  for (let s = seat; s !== state.button; s = nextSeat(state, s)) before++;
  return before === 1 ? 'CO' : before === 2 ? 'HJ' : 'UTG';
}

/** Situation for a player given the voluntary preflop action before theirs. */
export function situationFor(raisesBefore: number, limpsBefore: number): PreflopSituation {
  if (raisesBefore === 0) return limpsBefore > 0 ? 'vs_limp' : 'open';
  if (raisesBefore === 1) return 'vs_raise';
  if (raisesBefore === 2) return 'vs_3bet';
  return 'vs_4bet';
}

/** Raises and limps in the preflop log before entry index `upTo`. */
export function preflopActionBefore(state: GameState, upTo = state.log.length): { raises: number; limps: number } {
  let raises = 0;
  let limps = 0;
  for (const e of state.log.slice(0, upTo)) {
    if (e.street !== 'preflop') continue;
    if (e.type === 'raise') raises++;
    else if (e.type === 'call' && raises === 0) limps++;
  }
  return { raises, limps };
}

/** The preflop spot `seat` currently faces, or null outside a preflop decision. */
export function currentSpot(state: GameState, seat: Seat): PreflopSpot | null {
  if (state.status !== 'playing' || state.street !== 'preflop' || state.toAct !== seat) return null;
  const { raises, limps } = preflopActionBefore(state);
  return { situation: situationFor(raises, limps), position: positionOf(state, seat), players: state.players.length };
}

/** Top-N% label for a class, for explanations. */
export const classLabel = (idx: number): string => HAND_CLASSES[idx].label;
