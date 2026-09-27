import { useMemo } from 'react';
import type { Card } from '../poker/cards.ts';
import { calcEquity, type EquityResult } from '../poker/equity.ts';
import { HAND_CATEGORIES, describeHand, evaluate } from '../poker/evaluator.ts';
import { HAND_CLASSES, classOfCombo } from '../poker/handClasses.ts';
import { CLASS_PERCENTILE } from '../poker/preflop.ts';
import { type WeightedCombo, fullRange } from '../poker/range.ts';

interface Props {
  hero: Card[];
  board: Card[];
  opponentRange: WeightedCombo[];
  opponentCards: Card[] | null;
  vsRange: boolean;
  vsRandom: boolean;
  /** Set when the hero faces a bet. */
  potOdds: { toCall: number; pot: number } | null;
}

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export function OddsPanel({ hero, board, opponentRange, opponentCards, vsRange, vsRandom, potOdds }: Props) {
  const rows = useMemo(() => {
    const out: { label: string; hint: string; result: EquityResult | null }[] = [];
    if (vsRange) {
      out.push({
        label: 'vs. estimated range',
        hint: 'Weighted by what their actions suggest they hold.',
        result: calcEquity(hero, board, opponentRange),
      });
    }
    if (vsRandom) {
      out.push({
        label: 'vs. random hand',
        hint: 'Any two cards, equally likely.',
        result: calcEquity(hero, board, fullRange([...hero, ...board])),
      });
    }
    if (opponentCards) {
      const [c1, c2] = opponentCards;
      out.push({
        label: 'vs. their actual cards',
        hint: 'Review mode: uses the real hole cards.',
        result: calcEquity(hero, board, [{ c1, c2, cls: classOfCombo(c1, c2), w: 1 }]),
      });
    }
    return out;
  }, [hero, board, opponentRange, opponentCards, vsRange, vsRandom]);

  const needed = potOdds ? potOdds.toCall / (potOdds.pot + potOdds.toCall) : null;
  const distribution = board.length < 5 ? rows.find((r) => r.result)?.result?.categories : undefined;
  const cls = classOfCombo(hero[0], hero[1]);

  return (
    <div className="card shadow-sm">
      <div className="card-header fw-semibold">Odds</div>
      <div className="card-body">
        <p className="mb-3">
          {board.length >= 3 ? (
            <>
              You have <strong>{describeHand(evaluate([...hero, ...board]))}</strong>.
            </>
          ) : (
            <>
              <strong>{HAND_CLASSES[cls].label}</strong> is in the top {pct(CLASS_PERCENTILE[cls], 0)} of starting hands.
            </>
          )}
        </p>

        {rows.length === 0 && <p className="text-body-secondary small">Turn on an equity mode in Settings.</p>}
        {rows.map(({ label, hint, result }) => (
          <div key={label} className="mb-3">
            <div className="d-flex justify-content-between align-items-baseline">
              <span title={hint}>
                Equity {label}
                {result && !result.exact && <span className="text-body-secondary small"> (simulated)</span>}
              </span>
              <strong className="fs-5">{result ? pct(result.equity) : '—'}</strong>
            </div>
            {result && (
              <>
                <div className="progress-stacked" style={{ height: 10 }}>
                  <div className="progress" style={{ width: pct(result.win) }}>
                    <div className="progress-bar bg-success" />
                  </div>
                  <div className="progress" style={{ width: pct(result.tie) }}>
                    <div className="progress-bar bg-secondary" />
                  </div>
                  <div className="progress" style={{ width: pct(result.lose) }}>
                    <div className="progress-bar bg-danger" />
                  </div>
                </div>
                <div className="small text-body-secondary">
                  Win {pct(result.win)} · Tie {pct(result.tie)} · Lose {pct(result.lose)}
                  {needed !== null && (
                    <span className={result.equity >= needed ? 'text-success' : 'text-danger'}>
                      {' '}
                      · {result.equity >= needed ? 'enough to call' : 'not enough to call'}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        ))}

        {potOdds && needed !== null && (
          <div className="alert alert-info py-2 small">
            <strong>Pot odds:</strong> call {potOdds.toCall.toLocaleString()} to win{' '}
            {potOdds.pot.toLocaleString()} → you need at least <strong>{pct(needed)}</strong> equity to break even on a
            call (ignoring future betting).
          </div>
        )}

        {distribution && (
          <>
            <div className="small fw-semibold mb-1">Your final hand by the river</div>
            <table className="table table-sm small mb-0">
              <tbody>
                {distribution
                  .map((p, cat) => [cat, p] as const)
                  .filter(([, p]) => p >= 0.005)
                  .reverse()
                  .map(([cat, p]) => (
                    <tr key={cat}>
                      <td>{HAND_CATEGORIES[cat]}</td>
                      <td className="text-end" style={{ width: '40%' }}>
                        <div className="d-flex align-items-center gap-2 justify-content-end">
                          <div className="dist-bar" style={{ width: `${p * 100}%` }} />
                          <span className="dist-value">{pct(p)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
