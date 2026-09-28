import { Fragment } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS } from '../poker/game.ts';
import type { Settings } from '../settings.ts';

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onResetSession: () => void;
}

export function SettingsPanel({ settings, onChange, onResetSession }: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });
  const toggle = (key: keyof Settings, label: string, indent = false, disabled = false) => (
    <div className={`form-check form-switch ${indent ? 'ms-4' : ''}`}>
      <input
        className="form-check-input"
        type="checkbox"
        role="switch"
        id={`setting-${key}`}
        checked={settings[key] as boolean}
        disabled={disabled}
        onChange={(e) => set(key, e.target.checked as never)}
      />
      <label className="form-check-label" htmlFor={`setting-${key}`}>
        {label}
      </label>
    </div>
  );

  return (
    <div className="card shadow-sm">
      <div className="card-header fw-semibold">Settings</div>
      <div className="card-body">
        <div className="d-flex align-items-center gap-2 mb-2 small">
          <span className="text-nowrap">Players</span>
          <div className="btn-group btn-group-sm w-100" role="group" aria-label="Number of players">
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map((n) => (
              <Fragment key={n}>
                <input
                  type="radio"
                  className="btn-check"
                  id={`players-${n}`}
                  checked={settings.numPlayers === n}
                  onChange={() => set('numPlayers', n)}
                />
                <label className="btn btn-outline-primary" htmlFor={`players-${n}`} title={n === 2 ? 'Heads-up' : undefined}>
                  {n === 2 ? 'HU' : n}
                </label>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="btn-group w-100 mb-3" role="group" aria-label="Opponent mode">
          <input
            type="radio"
            className="btn-check"
            id="mode-bot"
            checked={settings.mode === 'bot'}
            onChange={() => set('mode', 'bot')}
          />
          <label className="btn btn-outline-primary" htmlFor="mode-bot">
            Play vs. {settings.numPlayers === 2 ? 'bot' : 'bots'}
          </label>
          <input
            type="radio"
            className="btn-check"
            id="mode-both"
            checked={settings.mode === 'both'}
            onChange={() => set('mode', 'both')}
          />
          <label className="btn btn-outline-primary" htmlFor="mode-both">
            Control {settings.numPlayers === 2 ? 'both seats' : 'all seats'}
          </label>
        </div>
        {toggle('showOdds', 'Show odds')}
        {toggle('oddsVsRange', 'Equity vs. estimated range', true, !settings.showOdds)}
        {toggle('oddsVsRandom', 'Equity vs. random hand', true, !settings.showOdds)}
        {toggle('showOuts', 'Show outs')}
        {toggle('showRange', 'Show ranges')}
        {toggle('fourColorDeck', 'Four-color deck')}
        {toggle(
          'revealOpponent',
          settings.numPlayers === 2 ? 'Reveal opponent’s cards (review mode)' : 'Reveal opponents’ cards (review mode)',
          false,
          settings.mode === 'both',
        )}
        {settings.mode === 'bot' && (
          <div className="d-flex align-items-center gap-2 mt-2 small">
            <label htmlFor="bot-speed" className="text-nowrap">
              Bot speed
            </label>
            <input
              id="bot-speed"
              type="range"
              className="form-range"
              min={0}
              max={2000}
              step={100}
              value={2000 - settings.botDelayMs}
              onChange={(e) => set('botDelayMs', 2000 - Number(e.target.value))}
            />
          </div>
        )}
        <button className="btn btn-sm btn-outline-secondary mt-3" onClick={onResetSession}>
          Reset stacks
        </button>
        <div className="small text-body-secondary mt-2">Changing the number of players resets stacks.</div>
      </div>
    </div>
  );
}
