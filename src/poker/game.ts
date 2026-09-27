import type { Card } from './cards.ts';
import { describeHand, evaluate } from './evaluator.ts';

export const SMALL_BLIND = 5;
export const BIG_BLIND = 10;
export const STARTING_STACK = 1000;

export type Seat = 0 | 1;
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
  cards: Card[];
  folded: boolean;
  /** Has acted since the last bet or raise on this street. */
  acted: boolean;
}

export interface HandResult {
  reason: 'fold' | 'showdown';
  winners: Seat[];
  pot: number;
  /** Chips each seat collects from the pot. */
  won: [number, number];
  /** Hand descriptions at showdown. */
  hands?: [string, string];
}

export interface GameState {
  status: 'idle' | 'playing' | 'complete';
  handNumber: number;
  /** Button posts the small blind, acts first preflop and last postflop. */
  button: Seat;
  players: [PlayerState, PlayerState];
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
  rebuys: [number, number];
}

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

export function initialState(): GameState {
  const player = (name: string): PlayerState => ({
    name, stack: STARTING_STACK, bet: 0, cards: [], folded: false, acted: false,
  });
  return {
    status: 'idle',
    handNumber: 0,
    button: 1,
    players: [player('You'), player('Villain')],
    deck: [],
    board: [],
    street: 'preflop',
    pot: 0,
    toAct: null,
    currentBet: 0,
    minRaise: BIG_BLIND,
    log: [],
    result: null,
    rebuys: [0, 0],
  };
}

const clone = (state: GameState): GameState => structuredClone(state);

export const isAllIn = (p: PlayerState): boolean => p.stack === 0 && !p.folded;

export const potTotal = (state: GameState): number =>
  state.pot + state.players[0].bet + state.players[1].bet;

/** Starts the next hand using a pre-shuffled deck (kept outside so this stays pure). */
export function startHand(prev: GameState, deck: Card[]): GameState {
  const state = clone(prev);
  state.handNumber++;
  state.button = other(prev.button);
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
    p.folded = false;
    p.acted = false;
    p.cards = [];
  });
  // Deal alternately, starting with the big blind.
  const bb = other(state.button);
  for (let i = 0; i < 2; i++) {
    state.players[bb].cards.push(state.deck.shift()!);
    state.players[state.button].cards.push(state.deck.shift()!);
  }
  post(state, state.button, SMALL_BLIND);
  post(state, bb, BIG_BLIND);
  state.currentBet = BIG_BLIND;
  state.minRaise = BIG_BLIND;
  state.toAct = state.button;
  // Treat the big blind as having acted last so the button acts first.
  return advance(state, bb);
}

function post(state: GameState, seat: Seat, amount: number) {
  const p = state.players[seat];
  const added = Math.min(amount, p.stack);
  p.stack -= added;
  p.bet += added;
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
  const opp = state.players[other(seat)];
  const toCall = Math.min(state.currentBet - p.bet, p.stack);
  const maxTo = p.bet + p.stack;
  const canRaise = p.stack > toCall && opp.stack > 0;
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
      return awardFold(state, other(seat));
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
      p.acted = true;
      state.players[other(seat)].acted = false;
      log(legal.raiseLabel === 'Bet' ? 'bet' : 'raise', added);
      break;
    }
  }
  return advance(state, seat);
}

/** Moves play forward after `lastSeat` acted: next player, next street, or showdown. */
function advance(state: GameState, lastSeat: Seat): GameState {
  const needsAction = (p: PlayerState) => !p.folded && p.stack > 0 && !(p.acted && p.bet === state.currentBet);
  const next = other(lastSeat);
  if (needsAction(state.players[next])) {
    state.toAct = next;
    return state;
  }
  if (needsAction(state.players[lastSeat])) {
    state.toAct = lastSeat;
    return state;
  }
  collectBets(state);

  const canBet = state.players.filter((p) => p.stack > 0).length === 2;
  if (state.street === 'river' || !canBet) {
    while (state.board.length < 5) state.board.push(state.deck.shift()!);
    return showdown(state);
  }
  state.street = state.street === 'preflop' ? 'flop' : state.street === 'flop' ? 'turn' : 'river';
  const count = state.street === 'flop' ? 3 : 1;
  for (let i = 0; i < count; i++) state.board.push(state.deck.shift()!);
  state.toAct = other(state.button);
  return state;
}

function collectBets(state: GameState) {
  const [a, b] = state.players;
  // Return any uncalled portion of a bet.
  const matched = Math.min(a.bet, b.bet);
  for (const p of state.players) {
    p.stack += p.bet - matched;
    p.bet = matched;
  }
  state.pot += a.bet + b.bet;
  for (const p of state.players) {
    p.bet = 0;
    p.acted = false;
  }
  state.currentBet = 0;
  state.minRaise = BIG_BLIND;
}

function awardFold(state: GameState, winner: Seat): GameState {
  collectBets(state);
  const won: [number, number] = [0, 0];
  won[winner] = state.pot;
  state.players[winner].stack += state.pot;
  state.result = { reason: 'fold', winners: [winner], pot: state.pot, won };
  state.status = 'complete';
  state.toAct = null;
  return state;
}

function showdown(state: GameState): GameState {
  const scores = state.players.map((p) => evaluate([...p.cards, ...state.board]));
  const won: [number, number] = [0, 0];
  let winners: Seat[];
  if (scores[0] === scores[1]) {
    winners = [0, 1];
    const half = Math.floor(state.pot / 2);
    won[state.button] = half;
    won[other(state.button)] = state.pot - half; // Odd chip goes out of position.
  } else {
    winners = [scores[0] > scores[1] ? 0 : 1];
    won[winners[0]] = state.pot;
  }
  state.players[0].stack += won[0];
  state.players[1].stack += won[1];
  state.result = {
    reason: 'showdown',
    winners,
    pot: state.pot,
    won,
    hands: [describeHand(scores[0]), describeHand(scores[1])],
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
