import type { Card } from './cards.ts';
import { describeHand, evaluate } from './evaluator.ts';

export const SMALL_BLIND = 5;
export const BIG_BLIND = 10;
export const STARTING_STACK = 1000;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** Seat index, 0 … players.length - 1, clockwise. Seat 0 is the user in bot mode. */
export type Seat = number;
export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface PlayerAction {
  type: ActionType;
  /** For bet/raise: the total the player's bet becomes this street ("raise to"). */
  amount?: number;
}

export interface LogEntry {
  street: Street;
  player: Seat;
  type: ActionType | 'post';
  /** Chips added to the pot by this action. */
  added: number;
  /** Player's total bet on this street after the action. */
  to: number;
  allIn: boolean;
}

export interface PlayerState {
  name: string;
  stack: number;
  /** Chips committed on the current street. */
  bet: number;
  /** Chips committed over the whole hand (used to build side pots). */
  committed: number;
  cards: Card[];
  folded: boolean;
  /** Has acted since the last bet or raise on this street. */
  acted: boolean;
}

export interface Pot {
  amount: number;
  /** Seats that could win this pot. */
  eligible: Seat[];
  winners: Seat[];
}

export interface HandResult {
  reason: 'fold' | 'showdown';
  /** Every seat that collected chips. */
  winners: Seat[];
  pot: number;
  /** Chips each seat collects from the pot. */
  won: number[];
  /** Main pot first, then side pots. Only set at showdown. */
  pots?: Pot[];
  /** Hand descriptions at showdown; null for seats that folded. */
  hands?: (string | null)[];
}

export interface GameState {
  status: 'idle' | 'playing' | 'complete';
  handNumber: number;
  /**
   * Heads-up the button posts the small blind, acts first preflop and last
   * postflop. With 3+ players the blinds are the two seats to its left.
   */
  button: Seat;
  players: PlayerState[];
  deck: Card[];
  board: Card[];
  street: Street;
  /** Chips collected from completed streets. */
  pot: number;
  toAct: Seat | null;
  currentBet: number;
  /** Size of the last full bet or raise; the minimum raise increment. */
  minRaise: number;
  log: LogEntry[];
  result: HandResult | null;
  /** Times each seat has been topped back up after busting. */
  rebuys: number[];
}

/** The next seat clockwise from `seat`. */
export const nextSeat = (state: GameState, seat: Seat): Seat => (seat + 1) % state.players.length;

export function initialState(numPlayers = 2): GameState {
  const n = Math.min(Math.max(numPlayers, MIN_PLAYERS), MAX_PLAYERS);
  const player = (name: string): PlayerState => ({
    name, stack: STARTING_STACK, bet: 0, committed: 0, cards: [], folded: false, acted: false,
  });
  return {
    status: 'idle',
    handNumber: 0,
    // Moves to seat 0 on the first deal.
    button: n - 1,
    players: Array.from({ length: n }, (_, i) => player(i === 0 ? 'You' : n === 2 ? 'Villain' : `Bot ${i}`)),
    deck: [],
    board: [],
    street: 'preflop',
    pot: 0,
    toAct: null,
    currentBet: 0,
    minRaise: BIG_BLIND,
    log: [],
    result: null,
    rebuys: new Array<number>(n).fill(0),
  };
}

const clone = (state: GameState): GameState => structuredClone(state);

export const isAllIn = (p: PlayerState): boolean => p.stack === 0 && !p.folded;

export const potTotal = (state: GameState): number => state.players.reduce((t, p) => t + p.bet, state.pot);

/** Seats still in the hand. */
export const liveSeats = (state: GameState): Seat[] =>
  state.players.flatMap((p, i) => (p.folded ? [] : [i]));

/** Small and big blind seats for the current button. */
export function blindSeats(state: GameState): { sb: Seat; bb: Seat } {
  if (state.players.length === 2) return { sb: state.button, bb: nextSeat(state, state.button) };
  const sb = nextSeat(state, state.button);
  return { sb, bb: nextSeat(state, sb) };
}

/** Starts the next hand using a pre-shuffled deck (kept outside so this stays pure). */
export function startHand(prev: GameState, deck: Card[]): GameState {
  const state = clone(prev);
  state.handNumber++;
  state.button = nextSeat(state, prev.button);
  state.status = 'playing';
  state.deck = deck.slice();
  state.board = [];
  state.street = 'preflop';
  state.pot = 0;
  state.log = [];
  state.result = null;
  state.players.forEach((p, i) => {
    if (p.stack < BIG_BLIND) {
      p.stack = STARTING_STACK;
      state.rebuys[i]++;
    }
    p.bet = 0;
    p.committed = 0;
    p.folded = false;
    p.acted = false;
    p.cards = [];
  });
  // Deal one card at a time, starting left of the button (the big blind heads-up).
  for (let round = 0; round < 2; round++) {
    let seat = state.button;
    do {
      seat = nextSeat(state, seat);
      state.players[seat].cards.push(state.deck.shift()!);
    } while (seat !== state.button);
  }
  const { sb, bb } = blindSeats(state);
  post(state, sb, SMALL_BLIND);
  post(state, bb, BIG_BLIND);
  state.currentBet = BIG_BLIND;
  state.minRaise = BIG_BLIND;
  // Treat the big blind as having acted last so the seat after it acts first.
  return advance(state, bb);
}

function post(state: GameState, seat: Seat, amount: number) {
  const p = state.players[seat];
  const added = Math.min(amount, p.stack);
  p.stack -= added;
  p.bet += added;
  p.committed += added;
  state.log.push({ street: 'preflop', player: seat, type: 'post', added, to: p.bet, allIn: p.stack === 0 });
}

export interface LegalActions {
  seat: Seat;
  toCall: number;
  canCheck: boolean;
  canCall: boolean;
  canFold: boolean;
  /** Whether a bet/raise is possible, and whether it's called a "bet" or a "raise". */
  canRaise: boolean;
  raiseLabel: 'Bet' | 'Raise';
  minTo: number;
  maxTo: number;
}

export function legalActions(state: GameState): LegalActions | null {
  if (state.status !== 'playing' || state.toAct === null) return null;
  const seat = state.toAct;
  const p = state.players[seat];
  const toCall = Math.min(state.currentBet - p.bet, p.stack);
  const maxTo = p.bet + p.stack;
  // Raising only makes sense if someone else still has chips to respond with.
  const opponentCanAct = state.players.some((o, i) => i !== seat && !o.folded && o.stack > 0);
  const canRaise = p.stack > toCall && opponentCanAct;
  const minTo = Math.min(
    state.currentBet === 0 ? BIG_BLIND : state.currentBet + state.minRaise,
    maxTo,
  );
  return {
    seat,
    toCall,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    canFold: toCall > 0,
    canRaise,
    raiseLabel: state.currentBet === 0 ? 'Bet' : 'Raise',
    minTo,
    maxTo,
  };
}

export function applyAction(prev: GameState, action: PlayerAction): GameState {
  const legal = legalActions(prev);
  if (!legal) throw new Error('No action expected');
  const state = clone(prev);
  const seat = legal.seat;
  const p = state.players[seat];
  const log = (type: ActionType, added: number) =>
    state.log.push({ street: state.street, player: seat, type, added, to: p.bet, allIn: p.stack === 0 });

  switch (action.type) {
    case 'fold': {
      p.folded = true;
      log('fold', 0);
      const live = liveSeats(state);
      if (live.length === 1) return awardFold(state, live[0]);
      break;
    }
    case 'check': {
      if (!legal.canCheck) throw new Error('Cannot check facing a bet');
      p.acted = true;
      log('check', 0);
      break;
    }
    case 'call': {
      if (!legal.canCall) throw new Error('Nothing to call');
      p.stack -= legal.toCall;
      p.bet += legal.toCall;
      p.committed += legal.toCall;
      p.acted = true;
      log('call', legal.toCall);
      break;
    }
    case 'bet':
    case 'raise': {
      if (!legal.canRaise) throw new Error('Cannot raise');
      const to = Math.round(Math.min(Math.max(action.amount ?? legal.minTo, legal.minTo), legal.maxTo));
      const added = to - p.bet;
      const raiseSize = to - state.currentBet;
      if (raiseSize >= state.minRaise) state.minRaise = raiseSize;
      state.currentBet = to;
      p.stack -= added;
      p.bet = to;
      p.committed += added;
      p.acted = true;
      state.players.forEach((o, i) => {
        if (i !== seat) o.acted = false;
      });
      log(legal.raiseLabel === 'Bet' ? 'bet' : 'raise', added);
      break;
    }
  }
  return advance(state, seat);
}

const needsAction = (state: GameState, p: PlayerState) =>
  !p.folded && p.stack > 0 && !(p.acted && p.bet === state.currentBet);

/** First seat clockwise after `from` that still has to act, or null. */
function nextToAct(state: GameState, from: Seat): Seat | null {
  let seat = from;
  for (let i = 0; i < state.players.length; i++) {
    seat = nextSeat(state, seat);
    if (needsAction(state, state.players[seat])) return seat;
  }
  return null;
}

/** Moves play forward after `lastSeat` acted: next player, next street, or showdown. */
function advance(state: GameState, lastSeat: Seat): GameState {
  const next = nextToAct(state, lastSeat);
  if (next !== null) {
    state.toAct = next;
    return state;
  }
  collectBets(state);

  const canBet = state.players.filter((p) => !p.folded && p.stack > 0).length >= 2;
  if (state.street === 'river' || !canBet) {
    while (state.board.length < 5) state.board.push(state.deck.shift()!);
    return showdown(state);
  }
  state.street = state.street === 'preflop' ? 'flop' : state.street === 'flop' ? 'turn' : 'river';
  const count = state.street === 'flop' ? 3 : 1;
  for (let i = 0; i < count; i++) state.board.push(state.deck.shift()!);
  // Postflop, the first live seat left of the button acts first.
  state.toAct = nextToAct(state, state.button);
  return state;
}

function collectBets(state: GameState) {
  // Return any uncalled portion of the largest bet.
  const bets = state.players.map((p) => p.bet).sort((a, b) => b - a);
  const top = state.players.find((p) => p.bet === bets[0])!;
  if (bets[0] > bets[1]) {
    const refund = bets[0] - bets[1];
    top.stack += refund;
    top.bet -= refund;
    top.committed -= refund;
  }
  for (const p of state.players) {
    state.pot += p.bet;
    p.bet = 0;
    p.acted = false;
  }
  state.currentBet = 0;
  state.minRaise = BIG_BLIND;
}

function awardFold(state: GameState, winner: Seat): GameState {
  collectBets(state);
  const won = new Array<number>(state.players.length).fill(0);
  won[winner] = state.pot;
  state.players[winner].stack += state.pot;
  state.result = { reason: 'fold', winners: [winner], pot: state.pot, won };
  state.status = 'complete';
  state.toAct = null;
  return state;
}

/** Splits the collected chips into a main pot and side pots by how much each live player committed. */
export function buildPots(players: readonly PlayerState[]): Omit<Pot, 'winners'>[] {
  const live = players.flatMap((p, i) => (p.folded ? [] : [i]));
  const levels = [...new Set(live.map((i) => players[i].committed))].sort((a, b) => a - b);
  const pots: Omit<Pot, 'winners'>[] = [];
  let prev = 0;
  for (const level of levels) {
    const amount = players.reduce((t, p) => t + Math.max(0, Math.min(p.committed, level) - prev), 0);
    const eligible = live.filter((i) => players[i].committed >= level);
    if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  // Chips folded players put in above the top live level (rare) go to the last pot.
  const total = players.reduce((t, p) => t + p.committed, 0);
  const allocated = pots.reduce((t, p) => t + p.amount, 0);
  if (pots.length > 0) pots[pots.length - 1].amount += total - allocated;
  return pots;
}

function showdown(state: GameState): GameState {
  const n = state.players.length;
  const scores = state.players.map((p) => (p.folded ? -1 : evaluate([...p.cards, ...state.board])));
  const won = new Array<number>(n).fill(0);
  // Odd chips go to the first winners clockwise from the button.
  const order = Array.from({ length: n }, (_, i) => (state.button + 1 + i) % n);
  const pots: Pot[] = buildPots(state.players).map((pot) => {
    const best = Math.max(...pot.eligible.map((i) => scores[i]));
    const winners = order.filter((i) => pot.eligible.includes(i) && scores[i] === best);
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    for (const w of winners) {
      won[w] += share + (odd > 0 ? 1 : 0);
      odd--;
    }
    return { ...pot, winners };
  });
  state.players.forEach((p, i) => (p.stack += won[i]));
  state.result = {
    reason: 'showdown',
    winners: won.flatMap((w, i) => (w > 0 ? [i] : [])),
    pot: state.pot,
    won,
    pots,
    hands: scores.map((s) => (s < 0 ? null : describeHand(s))),
  };
  state.status = 'complete';
  state.toAct = null;
  return state;
}

/** The board as it stood on a given street. */
export function boardAt(state: GameState, street: Street): Card[] {
  const n = { preflop: 0, flop: 3, turn: 4, river: 5 }[street];
  return state.board.slice(0, n);
}
