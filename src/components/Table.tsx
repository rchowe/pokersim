import { BIG_BLIND, type GameState, type Seat, potTotal } from '../poker/game.ts';
import { PlayingCard } from './PlayingCard.tsx';

interface Props {
  state: GameState;
  /** Whether each seat's hole cards are face up. */
  visible: [boolean, boolean];
  labels: [string, string];
}

const fmt = (n: number) => n.toLocaleString();

export function Table({ state, visible, labels }: Props) {
  const { result } = state;
  const board = [0, 1, 2, 3, 4].map((i) => state.board[i]);
  return (
    <div className="poker-table">
      <SeatView state={state} seat={1} faceUp={visible[1]} label={labels[1]} />
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
            {result.winners.length === 2
              ? `Split pot, ${fmt(result.pot / 2)} each`
              : `${labels[result.winners[0]]} ${result.winners[0] === 0 && labels[0] === 'You' ? 'win' : 'wins'} ${fmt(result.pot)}`}
            {result.reason === 'fold' ? ' (opponent folded)' : result.winners.length === 1 && result.hands ? ` with ${result.hands[result.winners[0]]}` : ''}
          </div>
        )}
        {state.status === 'idle' && <div className="result-banner">Press “Deal” to start a hand</div>}
      </div>
      <SeatView state={state} seat={0} faceUp={visible[0]} label={labels[0]} />
    </div>
  );
}

function SeatView({ state, seat, faceUp, label }: { state: GameState; seat: Seat; faceUp: boolean; label: string }) {
  const p = state.players[seat];
  const acting = state.status === 'playing' && state.toAct === seat;
  const showdownHand = state.result?.reason === 'showdown' ? state.result.hands?.[seat] : undefined;
  const won = state.result?.won[seat] ?? 0;
  return (
    <div className={`seat seat-${seat === 1 ? 'top' : 'bottom'} ${acting ? 'acting' : ''} ${p.folded ? 'folded' : ''}`}>
      <div className="seat-cards">
        {state.status === 'idle' ? (
          <>
            <PlayingCard />
            <PlayingCard />
          </>
        ) : (
          p.cards.map((c, i) => <PlayingCard key={i} card={c} hidden={!faceUp} dim={p.folded} />)
        )}
      </div>
      <div className="seat-info">
        <div className="d-flex align-items-center gap-2">
          <strong>{label}</strong>
          {state.status !== 'idle' && state.button === seat && <span className="dealer-button" title="Button / small blind">D</span>}
          {p.folded && <span className="badge text-bg-secondary">Folded</span>}
          {p.stack === 0 && !p.folded && state.status === 'playing' && <span className="badge text-bg-danger">All-in</span>}
          {won > 0 && <span className="badge text-bg-success">+{fmt(won)}</span>}
        </div>
        <div className="small">
          Stack {fmt(p.stack)} <span className="opacity-75">({(p.stack / BIG_BLIND).toFixed(1)} bb)</span>
        </div>
        {showdownHand && faceUp && <div className="small fst-italic">{showdownHand}</div>}
      </div>
      {p.bet > 0 && <div className="bet-chip">{fmt(p.bet)}</div>}
    </div>
  );
}
