import { Fragment } from 'react';
import { type GameState, type LogEntry, type Street, boardAt } from '../poker/game.ts';
import { CardRow } from './PlayingCard.tsx';

interface Props {
  state: GameState;
  labels: [string, string];
}

function describe(e: LogEntry, name: string, isButton: boolean): string {
  const allIn = e.allIn ? ' (all-in)' : '';
  // "You call" but "Villain calls".
  const verb = (base: string) => `${name} ${name === 'You' ? base : base + 's'}`;
  switch (e.type) {
    case 'post':
      return `${verb('post')} the ${isButton ? 'small' : 'big'} blind, ${e.added}${allIn}`;
    case 'fold':
      return verb('fold');
    case 'check':
      return verb('check');
    case 'call':
      return `${verb('call')} ${e.added}${allIn}`;
    case 'bet':
      return `${verb('bet')} ${e.to}${allIn}`;
    case 'raise':
      return `${verb('raise')} to ${e.to}${allIn}`;
  }
}

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

export function HandLog({ state, labels }: Props) {
  if (state.status === 'idle') return null;
  return (
    <div className="card shadow-sm">
      <div className="card-header fw-semibold">Hand #{state.handNumber}</div>
      <div className="card-body small hand-log">
        {STREETS.map((street) => {
          const entries = state.log.filter((e) => e.street === street);
          const board = boardAt(state, street);
          if (street !== 'preflop' && board.length < { flop: 3, turn: 4, river: 5 }[street]) return null;
          return (
            <Fragment key={street}>
              <div className="log-street">
                <span className="text-uppercase fw-semibold">{street}</span>
                {street !== 'preflop' && <CardRow cards={board} />}
              </div>
              {entries.map((e, i) => (
                <div key={i}>{describe(e, labels[e.player], e.player === state.button)}</div>
              ))}
            </Fragment>
          );
        })}
        {state.result && (
          <div className="mt-2 fw-semibold">
            {state.result.winners.length === 2
              ? `Split pot of ${state.result.pot}`
              : `${labels[state.result.winners[0]]} ${labels[state.result.winners[0]] === 'You' ? 'win' : 'wins'} ${state.result.pot}`}
            {state.result.reason === 'showdown' &&
              state.result.hands &&
              ` (${labels[0]}: ${state.result.hands[0]}; ${labels[1]}: ${state.result.hands[1]})`}
          </div>
        )}
      </div>
    </div>
  );
}
