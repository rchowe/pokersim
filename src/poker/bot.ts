import { calcEquity } from './equity.ts';
import { BIG_BLIND, type GameState, type PlayerAction, type Seat, legalActions, liveSeats, potTotal } from './game.ts';
import { classOfCombo } from './handClasses.ts';
import { CLASS_PERCENTILE, currentSpot, preflopActionBefore, preflopChart } from './preflop.ts';
import { estimateRange, postflopBucket } from './range.ts';

/**
 * A simple exploitable opponent: plays preflop from the charts (with a little
 * noise) and postflop by comparing its equity against each opponent's estimated
 * range with the pot odds it's getting, plus occasional bluffs.
 */
export function botDecision(state: GameState, seat: Seat, rng: () => number = Math.random): PlayerAction {
  const legal = legalActions(state);
  if (!legal || legal.seat !== seat) throw new Error('Not the bot’s turn');
  const me = state.players[seat];
  const pot = potTotal(state);

  const passive = (): PlayerAction => (legal.canCheck ? { type: 'check' } : { type: 'fold' });
  const call = (): PlayerAction => (legal.canCheck ? { type: 'check' } : { type: 'call' });
  const raiseTo = (to: number): PlayerAction => {
    if (!legal.canRaise) return call();
    // Commit fully rather than leave a sliver behind.
    const amount = to >= legal.maxTo * 0.85 ? legal.maxTo : to;
    return { type: legal.raiseLabel === 'Bet' ? 'bet' : 'raise', amount: Math.min(Math.max(amount, legal.minTo), legal.maxTo) };
  };

  const spot = currentSpot(state, seat);
  if (spot) {
    const chart = preflopChart(spot);
    // Shift the chart thresholds a bit each hand so the bot is less predictable.
    const noise = (rng() - 0.5) * 0.1;
    const p = CLASS_PERCENTILE[classOfCombo(me.cards[0], me.cards[1])] + noise;
    if (p < chart.raise) {
      const { limps } = preflopActionBefore(state);
      const headsUp = spot.players === 2;
      const sizes = {
        open: (headsUp ? 2.5 : 3) * BIG_BLIND,
        vs_limp: (3 + limps) * BIG_BLIND,
        vs_raise: 3 * state.currentBet,
        vs_3bet: 2.3 * state.currentBet,
        vs_4bet: legal.maxTo,
      };
      return raiseTo(Math.round(sizes[spot.situation]));
    }
    if (p < chart.call) return call();
    return passive();
  }

  const opponents = liveSeats(state).filter((s) => s !== seat);
  const ranges = opponents.map((s) => estimateRange(state, s, me.cards).combos);
  const equity = calcEquity(me.cards, state.board, ranges, 800, rng)?.equity ?? 1 / (opponents.length + 1);
  // Equity against several hands is naturally lower; judge hand strength per opponent.
  const strength = equity ** (1 / opponents.length);
  const bucket = postflopBucket(me.cards[0], me.cards[1], state.board);
  const drawing = state.board.length < 5 && (bucket.flushDraw || bucket.straightOuts >= 2);
  const betFraction = (f: number) => Math.round(state.currentBet + f * (pot + legal.toCall));
  const bluffRate = 1 / opponents.length;

  if (legal.canCheck) {
    if (strength > 0.75 && rng() < 0.85) return raiseTo(betFraction(rng() < 0.5 ? 0.66 : 1));
    if (strength > 0.55 && rng() < 0.6) return raiseTo(betFraction(0.5));
    if (drawing && rng() < 0.35 * bluffRate) return raiseTo(betFraction(0.6));
    if (rng() < 0.12 * bluffRate) return raiseTo(betFraction(0.5));
    return { type: 'check' };
  }

  const potOdds = legal.toCall / (pot + legal.toCall);
  if (strength > 0.8 && rng() < 0.6) return raiseTo(betFraction(1));
  if (equity >= potOdds + 0.03) return call();
  if (drawing && equity >= potOdds - 0.06) return call();
  if (rng() < 0.04 * bluffRate) return raiseTo(betFraction(1));
  return passive();
}
