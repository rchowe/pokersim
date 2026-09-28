import { useMemo } from 'react';
import type { Card } from '../poker/cards.ts';
import { calcOuts } from '../poker/outs.ts';
import { CardRow } from './PlayingCard.tsx';

interface Props {
  hero: Card[];
  board: Card[];
  opponentCards: Card[][] | null;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function OutsPanel({ hero, board, opponentCards }: Props) {
  const outs = useMemo(() => calcOuts(hero, board, opponentCards ?? undefined), [hero, board, opponentCards]);
  const plural = (opponentCards?.length ?? 0) > 1 ? 's' : '';

  return (
    <div className="card shadow-sm">
      <div className="card-header fw-semibold">Outs</div>
      <div className="card-body">
        {!outs ? (
          <p className="text-body-secondary small mb-0">
            Outs are counted on the flop and turn, when cards are still to come.
          </p>
        ) : (
          <>
            <p className="mb-2">
              <strong>{outs.outs.length}</strong> card{outs.outs.length === 1 ? '' : 's'} improve your{' '}
              {outs.currentHand.toLowerCase()}.
            </p>
            {outs.groups.map((g) => (
              <div key={g.category} className="mb-2">
                <div className="small">
                  {g.name} <span className="text-body-secondary">({g.cards.length})</span>
                </div>
                <CardRow cards={g.cards} />
              </div>
            ))}
            {outs.outs.length > 0 && (
              <table className="table table-sm small mt-2 mb-0">
                <tbody>
                  <tr>
                    <td>Hit on the next card</td>
                    <td className="text-end">
                      {outs.outs.length}/{outs.unseen} = {pct(outs.nextCardPct)}
                    </td>
                  </tr>
                  {outs.byRiverPct !== null && (
                    <tr>
                      <td>Hit by the river</td>
                      <td className="text-end">{pct(outs.byRiverPct)}</td>
                    </tr>
                  )}
                  <tr>
                    <td>
                      Rule of {board.length === 3 ? '4' : '2'}{' '}
                      <span className="text-body-secondary">
                        (outs × {board.length === 3 ? '4' : '2'})
                      </span>
                    </td>
                    <td className="text-end">≈ {pct(outs.ruleOfThumb)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            <p className="small text-body-secondary mt-2 mb-0">
              Not every out is clean. A card that improves you can improve your opponent more.
            </p>
            {outs.versusActual && (
              <div className={`alert ${outs.versusActual.behind ? 'alert-warning' : 'alert-success'} py-2 small mt-3 mb-0`}>
                {outs.versusActual.behind || outs.versusActual.tied ? (
                  <>
                    Against their actual hand{plural} you're {outs.versusActual.tied ? 'tied' : 'behind'}.{' '}
                    <strong>{outs.versusActual.cards.length}</strong> card
                    {outs.versusActual.cards.length === 1 ? '' : 's'} put you ahead on the next street:
                  </>
                ) : (
                  <>
                    Against their actual hand{plural} you're ahead. <strong>{outs.versusActual.cards.length}</strong> card
                    {outs.versusActual.cards.length === 1 ? '' : 's'} put {plural ? 'someone' : 'them'} ahead on the next
                    street:
                  </>
                )}
                <div className="mt-1">
                  <CardRow cards={outs.versusActual.cards} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
