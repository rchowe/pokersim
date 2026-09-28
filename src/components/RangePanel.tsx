import { useMemo, useState } from 'react';
import type { Card } from '../poker/cards.ts';
import { HAND_CLASSES, classOfCombo } from '../poker/handClasses.ts';
import {
  POSITION_NAMES,
  type PreflopSituation,
  type PreflopSpot,
  chartAction,
  preflopChart,
  situationsFor,
} from '../poker/preflop.ts';
import { BUCKET_NAMES, type EstimatedRange, postflopBucket, rangeGrid, rangeSize } from '../poker/range.ts';
import { RangeGrid, type GridCell } from './RangeGrid.tsx';

export interface OpponentView {
  seat: number;
  label: string;
  range: EstimatedRange;
  /** Hole cards, when they're face up. */
  cards: Card[] | null;
}

interface Props {
  hero: Card[];
  board: Card[];
  opponents: OpponentView[];
  /** Preflop spot the hero is facing right now, if any. */
  spot: PreflopSpot | null;
  /** Default chart to show when no decision is pending. */
  defaultSpot: PreflopSpot;
}

const ACTION_COLORS = { raise: '#d9534f', call: '#3fa65a', fold: 'var(--range-empty)' };
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function RangePanel(props: Props) {
  const [tab, setTab] = useState<'opponent' | 'chart'>('opponent');
  return (
    <div className="card shadow-sm">
      <div className="card-header">
        <ul className="nav nav-tabs card-header-tabs">
          <li className="nav-item">
            <button className={`nav-link ${tab === 'opponent' ? 'active' : ''}`} onClick={() => setTab('opponent')}>
              {props.opponents.length > 1 ? 'Opponents’ ranges' : 'Opponent’s range'}
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${tab === 'chart' ? 'active' : ''}`} onClick={() => setTab('chart')}>
              Your preflop chart
            </button>
          </li>
        </ul>
      </div>
      <div className="card-body">{tab === 'opponent' ? <OpponentRange {...props} /> : <PreflopChart key={chartKey(props)} {...props} />}</div>
    </div>
  );
}

const chartKey = ({ spot, defaultSpot }: Props) =>
  spot ? `${spot.position}-${spot.situation}` : `${defaultSpot.position}-none`;

function OpponentRange({ board, opponents }: Props) {
  const [chosen, setChosen] = useState<number | null>(null);
  const opponent = opponents.find((o) => o.seat === chosen) ?? opponents[0];
  return (
    <>
      {opponents.length > 1 && (
        <select
          className="form-select form-select-sm mb-2"
          value={opponent.seat}
          onChange={(e) => setChosen(Number(e.target.value))}
          aria-label="Opponent"
        >
          {opponents.map((o) => (
            <option key={o.seat} value={o.seat}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <SingleRange board={board} opponent={opponent} />
    </>
  );
}

function SingleRange({ board, opponent }: { board: Card[]; opponent: OpponentView }) {
  const { combos, notes } = opponent.range;
  const opponentCards = opponent.cards;
  const grid = useMemo(() => rangeGrid(combos), [combos]);
  const size = rangeSize(combos);

  // What the weighted range holds on this board.
  const composition = useMemo(() => {
    if (board.length < 3) return null;
    const made = [0, 0, 0, 0];
    let draws = 0;
    let total = 0;
    for (const c of combos) {
      if (c.w === 0) continue;
      const b = postflopBucket(c.c1, c.c2, board);
      made[b.made] += c.w;
      if (board.length < 5 && b.made < 2 && (b.flushDraw || b.straightOuts >= 2)) draws += c.w;
      total += c.w;
    }
    return { made: made.map((m) => m / total), draws: draws / total };
  }, [combos, board]);

  const cells: GridCell[] = grid.map((w, i) => ({
    background: Number.isNaN(w) ? 'var(--range-dead)' : `rgba(13, 110, 253, ${0.08 + 0.92 * w})`,
    color: w > 0.5 ? '#fff' : undefined,
    title: `${HAND_CLASSES[i].label}: ${Number.isNaN(w) ? 'blocked' : pct(w)}`,
  }));
  const highlight = opponentCards ? [classOfCombo(opponentCards[0], opponentCards[1])] : [];

  return (
    <>
      <p className="small mb-2">
        About <strong>{pct(size)}</strong> of possible hands, weighted by how likely each is given their actions. Darker
        means more likely.
      </p>
      <RangeGrid cells={cells} highlight={highlight} />
      {composition && (
        <table className="table table-sm small mt-3 mb-0">
          <tbody>
            {[3, 2, 1, 0].map((m) => (
              <tr key={m}>
                <td>{BUCKET_NAMES[m]}</td>
                <td className="text-end">{pct(composition.made[m])}</td>
              </tr>
            ))}
            {board.length < 5 && (
              <tr>
                <td>Draws (without a strong pair)</td>
                <td className="text-end">{pct(composition.draws)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      <div className="small mt-3">
        <div className="fw-semibold">How we got here</div>
        {notes.length === 0 ? (
          <div className="text-body-secondary">No voluntary actions yet, so they could have anything.</div>
        ) : (
          <ol className="ps-3 mb-0">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ol>
        )}
        <div className="text-body-secondary mt-2">
          This is a heuristic model of a typical player, not a solver. The bot uses the same model.
        </div>
      </div>
    </>
  );
}

function PreflopChart({ hero, spot, defaultSpot }: Props) {
  const [choice, setChoice] = useState<PreflopSituation | null>(null);
  const base = spot ?? defaultSpot;
  const situation = spot?.situation ?? null;
  const shown = choice ?? base.situation;
  const chart = preflopChart({ ...base, situation: shown });
  const heroClass = classOfCombo(hero[0], hero[1]);
  const heroAction = chartAction(chart, heroClass);
  const actionLabel = { raise: chart.raiseLabel, call: chart.callLabel, fold: 'Fold' };

  const cells: GridCell[] = HAND_CLASSES.map((cls) => {
    const a = chartAction(chart, cls.index);
    return {
      background: ACTION_COLORS[a],
      color: a === 'fold' ? undefined : '#fff',
      title: `${cls.label}: ${actionLabel[a]}`,
    };
  });

  return (
    <>
      <select
        className="form-select form-select-sm mb-2"
        value={shown}
        onChange={(e) => setChoice(e.target.value as PreflopSituation)}
        aria-label="Preflop situation"
      >
        {situationsFor(base.position, base.players).map((s) => (
          <option key={s} value={s}>
            {preflopChart({ ...base, situation: s }).title}
            {s === situation ? ' (now)' : ''}
          </option>
        ))}
      </select>
      <RangeGrid cells={cells} highlight={[heroClass]} />
      <div className="d-flex flex-wrap gap-3 small mt-2">
        <Legend color={ACTION_COLORS.raise} label={`${chart.raiseLabel} (top ${pct(chart.raise)})`} />
        {chart.call > chart.raise && <Legend color={ACTION_COLORS.call} label={chart.callLabel} />}
        {chart.call < 1 && <Legend color={ACTION_COLORS.fold} label="Fold" />}
      </div>
      <p className="small mt-2 mb-0">
        With <strong>{HAND_CLASSES[heroClass].label}</strong> the chart says: <strong>{actionLabel[heroAction]}</strong>.
        {shown === situation ? '' : ' (You are not in this spot right now.)'}
      </p>
      <p className="small text-body-secondary mt-2 mb-0">
        {base.players === 2 ? (
          <>
            Simplified 100bb heads-up charts. The button opens wide because it has position after the flop and only the
            big blind is left to act.
          </>
        ) : (
          <>
            Simplified 100bb {base.players}-handed charts. Your position: {POSITION_NAMES[base.position]}. Later positions
            open wider because fewer players are left to act behind them.
          </>
        )}
      </p>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="d-inline-flex align-items-center gap-1">
      <span className="legend-swatch" style={{ background: color }} />
      {label}
    </span>
  );
}
