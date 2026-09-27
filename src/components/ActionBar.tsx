import { useState } from 'react';
import { BIG_BLIND, type GameState, type LegalActions, type PlayerAction, potTotal } from '../poker/game.ts';

interface Props {
  state: GameState;
  legal: LegalActions | null;
  /** Whether the player to act is controlled by the user. */
  controllable: boolean;
  actorLabel: string;
  onAction: (action: PlayerAction) => void;
  onDeal: () => void;
}

export function ActionBar({ state, legal, controllable, actorLabel, onAction, onDeal }: Props) {
  if (state.status !== 'playing') {
    return (
      <div className="action-bar">
        <button className="btn btn-primary btn-lg" onClick={onDeal} autoFocus>
          {state.status === 'idle' ? 'Deal' : 'Deal next hand'}
        </button>
      </div>
    );
  }
  if (!legal || !controllable) {
    return (
      <div className="action-bar text-body-secondary">
        <span className="spinner-border spinner-border-sm me-2" role="status" />
        {actorLabel} is thinking…
      </div>
    );
  }
  // Remount the bet controls for each decision so the amount resets.
  return <DecisionControls key={state.log.length} state={state} legal={legal} actorLabel={actorLabel} onAction={onAction} />;
}

function DecisionControls({
  state,
  legal,
  actorLabel,
  onAction,
}: {
  state: GameState;
  legal: LegalActions;
  actorLabel: string;
  onAction: (action: PlayerAction) => void;
}) {
  const [amount, setAmount] = useState(legal.minTo);
  const pot = potTotal(state);
  const clamp = (n: number) => Math.round(Math.min(Math.max(n, legal.minTo), legal.maxTo));
  const potFraction = (f: number) => clamp(state.currentBet + f * (pot + legal.toCall));

  const presets: [string, number][] = [];
  if (state.street === 'preflop') {
    if (state.currentBet === BIG_BLIND) presets.push(['2.5 bb', clamp(2.5 * BIG_BLIND)], ['3 bb', clamp(3 * BIG_BLIND)]);
    else presets.push(['3x', clamp(3 * state.currentBet)]);
  } else {
    presets.push(['⅓ pot', potFraction(1 / 3)], ['½ pot', potFraction(0.5)], ['⅔ pot', potFraction(2 / 3)]);
  }
  presets.push(['Pot', potFraction(1)], ['All-in', legal.maxTo]);

  const raiseType = legal.raiseLabel === 'Bet' ? 'bet' : 'raise';
  const allIn = amount >= legal.maxTo;

  return (
    <div className="action-bar flex-column align-items-stretch">
      <div className="small text-body-secondary mb-2">
        {actorLabel} to act{legal.toCall > 0 ? ` · ${legal.toCall.toLocaleString()} to call` : ''}
      </div>
      <div className="d-flex flex-wrap gap-2">
        {legal.canFold && (
          <button className="btn btn-outline-danger flex-fill" onClick={() => onAction({ type: 'fold' })}>
            Fold
          </button>
        )}
        {legal.canCheck && (
          <button className="btn btn-outline-secondary flex-fill" onClick={() => onAction({ type: 'check' })}>
            Check
          </button>
        )}
        {legal.canCall && (
          <button className="btn btn-outline-success flex-fill" onClick={() => onAction({ type: 'call' })}>
            Call {legal.toCall.toLocaleString()}
          </button>
        )}
        {legal.canRaise && (
          <button className="btn btn-warning flex-fill" onClick={() => onAction({ type: raiseType, amount })}>
            {allIn ? 'All-in' : legal.raiseLabel} {legal.raiseLabel === 'Raise' ? 'to ' : ''}
            {amount.toLocaleString()}
          </button>
        )}
      </div>
      {legal.canRaise && legal.minTo < legal.maxTo && (
        <div className="mt-2">
          <div className="d-flex flex-wrap gap-1 mb-2">
            {presets.map(([label, value]) => (
              <button key={label} className="btn btn-sm btn-outline-secondary" onClick={() => setAmount(value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="d-flex align-items-center gap-2">
            <input
              type="range"
              className="form-range flex-fill"
              min={legal.minTo}
              max={legal.maxTo}
              step={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label="Bet amount"
            />
            <input
              type="number"
              className="form-control form-control-sm bet-input"
              min={legal.minTo}
              max={legal.maxTo}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              onBlur={() => setAmount(clamp(amount))}
              aria-label="Bet amount"
            />
          </div>
        </div>
      )}
    </div>
  );
}
