import { BIG_BLIND, type GameState, type Seat, potTotal } from '../poker/game.ts';
import { positionOf } from '../poker/preflop.ts';
import { PlayingCard } from './PlayingCard.tsx';
import { fmt, resultSummary } from './text.ts';

interface Props {
  state: GameState;
  /** Whether each seat's hole cards are face up. */
  visible: boolean[];
  labels: string[];
}

type Slot = 't' | 'tl' | 'tr' | 'l' | 'r' | 'b' | 'bl' | 'br';

// Grid areas for each seat, clockwise from seat 0 at the bottom.
const SLOTS: Record<number, Slot[]> = {
  2: ['b', 't'],
  3: ['b', 'tl', 'tr'],
  4: ['b', 'l', 't', 'r'],
  5: ['b', 'l', 'tl', 'tr', 'r'],
  6: ['b', 'bl', 'tl', 't', 'tr', 'br'],
};

/** Which side of the table each slot is on; its bet chip goes toward the middle. */
const SIDE: Record<Slot, 'top' | 'bottom' | 'left' | 'right'> = {
  t: 'top', tl: 'top', tr: 'top', l: 'left', r: 'right', b: 'bottom', bl: 'bottom', br: 'bottom',
};

export function Table({ state, visible, labels }: Props) {
  const { result } = state;
  const board = [0, 1, 2, 3, 4].map((i) => state.board[i]);
  const n = state.players.length;
  const slots = SLOTS[n];
  const winner = result?.winners.length === 1 ? result.winners[0] : null;
  return (
    <div className={`poker-table ${n > 2 ? 'multiway' : ''}`}>
      {state.players.map((_, seat) => (
        <SeatView
          key={seat}
          state={state}
          seat={seat}
          slot={slots[seat]}
          faceUp={visible[seat]}
          label={labels[seat]}
          compact={n > 2}
        />
      ))}
      <div className="table-center">
        <div className="pot-badge">
          Pot {fmt(potTotal(state))}
          {state.status === 'playing' && <span className="street-label">{state.street}</span>}
        </div>
        <div className="board">
          {board.map((c, i) => (
            <PlayingCard key={i} card={c} />
          ))}
        </div>
        {result && (
          <div className="result-banner">
            {resultSummary(result, labels)}
            {result.reason === 'fold'
              ? n === 2
                ? ' (opponent folded)'
                : ' (everyone else folded)'
              : winner !== null && result.hands?.[winner]
                ? ` with ${result.hands[winner]}`
                : ''}
          </div>
        )}
        {state.status === 'idle' && <div className="result-banner">Press “Deal” to start a hand</div>}
      </div>
    </div>
  );
}

interface SeatProps {
  state: GameState;
  seat: Seat;
  slot: Slot;
  faceUp: boolean;
  label: string;
  compact: boolean;
}

function SeatView({ state, seat, slot, faceUp, label, compact }: SeatProps) {
  const p = state.players[seat];
  const acting = state.status === 'playing' && state.toAct === seat;
  const showdownHand = state.result?.reason === 'showdown' ? state.result.hands?.[seat] : undefined;
  const won = state.result?.won[seat] ?? 0;
  const dealt = state.status !== 'idle';
  const position = dealt ? positionOf(state, seat) : null;
  return (
    <div
      className={`seat slot-${slot} seat-${SIDE[slot]} ${compact ? 'compact' : ''} ${acting ? 'acting' : ''} ${p.folded ? 'folded' : ''}`}
    >
      <div className="seat-cards">
        {!dealt ? (
          <>
            <PlayingCard />
            <PlayingCard />
          </>
        ) : (
          p.cards.map((c, i) => <PlayingCard key={i} card={c} hidden={!faceUp} dim={p.folded} />)
        )}
      </div>
      <div className="seat-info">
        <div className="d-flex flex-wrap align-items-center gap-1 column-gap-2">
          <strong>{label}</strong>
          {dealt && state.button === seat && <span className="dealer-button" title={compact ? 'Button' : 'Button / small blind'}>D</span>}
          {compact && position && position !== 'BTN' && <span className="position-badge">{position}</span>}
          {p.folded && <span className="badge text-bg-secondary">Folded</span>}
          {p.stack === 0 && !p.folded && state.status === 'playing' && <span className="badge text-bg-danger">All-in</span>}
          {won > 0 && <span className="badge text-bg-success">+{fmt(won)}</span>}
        </div>
        <div className="small" title={`${(p.stack / BIG_BLIND).toFixed(1)} big blinds`}>
          Stack {fmt(p.stack)} <span className="bb-count opacity-75">({(p.stack / BIG_BLIND).toFixed(1)} bb)</span>
        </div>
        {showdownHand && faceUp && <div className="small fst-italic">{showdownHand}</div>}
      </div>
      {p.bet > 0 && <div className="bet-chip">{fmt(p.bet)}</div>}
    </div>
  );
}
