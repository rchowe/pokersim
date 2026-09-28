import { Fragment } from 'react';
import { type GameState, type LogEntry, type Street, blindSeats, boardAt } from '../poker/game.ts';
import { CardRow } from './PlayingCard.tsx';
import { fmt, resultSummary, verb as conjugate } from './text.ts';

interface Props {
  state: GameState;
  labels: string[];
}

function describe(e: LogEntry, name: string, isSmallBlind: boolean): string {
  const allIn = e.allIn ? ' (all-in)' : '';
  const verb = (base: string) => conjugate(name, base);
  switch (e.type) {
    case 'post':
      return `${verb('post')} the ${isSmallBlind ? 'small' : 'big'} blind, ${e.added}${allIn}`;
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
  const { sb } = blindSeats(state);
  const { result } = state;
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
                <div key={i}>{describe(e, labels[e.player], e.player === sb)}</div>
              ))}
            </Fragment>
          );
        })}
        {result && (
          <div className="mt-2 fw-semibold">
            {resultSummary(result, labels)}
            {result.reason === 'showdown' &&
              result.hands &&
              ` (${result.hands.flatMap((h, i) => (h ? [`${labels[i]}: ${h}`] : [])).join('; ')})`}
            {result.pots && result.pots.length > 1 && (
              <ul className="fw-normal ps-3 mb-0">
                {result.pots.map((pot, i, pots) => (
                  <li key={i}>
                    {i === 0 ? 'Main pot' : pots.length > 2 ? `Side pot ${i}` : 'Side pot'} {fmt(pot.amount)}:{' '}
                    {pot.winners.map((w) => labels[w]).join(' & ')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
