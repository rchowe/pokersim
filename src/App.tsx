import { useEffect, useMemo, useReducer, useState } from 'react';
import { ActionBar } from './components/ActionBar.tsx';
import { HandLog } from './components/HandLog.tsx';
import { OddsPanel } from './components/OddsPanel.tsx';
import { OutsPanel } from './components/OutsPanel.tsx';
import { RangePanel } from './components/RangePanel.tsx';
import { SettingsPanel } from './components/SettingsPanel.tsx';
import { Table } from './components/Table.tsx';
import { botDecision } from './poker/bot.ts';
import { type Card, fullDeck, shuffle } from './poker/cards.ts';
import {
  type GameState,
  type PlayerAction,
  type Seat,
  STARTING_STACK,
  applyAction,
  initialState,
  legalActions,
  potTotal,
  startHand,
} from './poker/game.ts';
import { currentSituation } from './poker/preflop.ts';
import { estimateRange } from './poker/range.ts';
import { type Settings, loadSettings, saveSettings } from './settings.ts';

type Msg = { type: 'deal'; deck: Card[] } | { type: 'act'; action: PlayerAction } | { type: 'reset' };

function reducer(state: GameState, msg: Msg): GameState {
  switch (msg.type) {
    case 'deal':
      return startHand(state, msg.deck);
    case 'act':
      return applyAction(state, msg.action);
    case 'reset':
      return initialState();
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  const both = settings.mode === 'both';
  // Whose point of view the analysis panels take.
  const me: Seat = both && state.toAct !== null ? state.toAct : 0;
  const opp: Seat = me === 0 ? 1 : 0;
  const labels: [string, string] = both ? ['Seat A', 'Seat B'] : ['You', 'Villain'];
  const legal = legalActions(state);
  const controllable = both || state.toAct === 0;

  // Let the bot act after a short pause.
  useEffect(() => {
    if (both || state.status !== 'playing' || state.toAct !== 1) return;
    const timer = setTimeout(
      () => dispatch({ type: 'act', action: botDecision(state, 1) }),
      settings.botDelayMs,
    );
    return () => clearTimeout(timer);
  }, [state, both, settings.botDelayMs]);

  const hand = state.status === 'idle' ? null : state.players[me].cards;
  const board = state.board;
  const showdown = state.result?.reason === 'showdown';
  const oppRevealed = both || settings.revealOpponent || showdown;
  const oppCards = state.status !== 'idle' && oppRevealed ? state.players[opp].cards : null;
  // Cards used for "vs. actual" calculations: only in review/both modes, not just because of a showdown.
  const oppCardsForCalc = state.status !== 'idle' && (both || settings.revealOpponent) ? state.players[opp].cards : null;

  const opponentRange = useMemo(() => (hand ? estimateRange(state, opp, hand) : null), [state, opp, hand]);

  const potOdds =
    legal && legal.seat === me && legal.toCall > 0 ? { toCall: legal.toCall, pot: potTotal(state) } : null;
  const situation = currentSituation(state, me);
  const defaultSituation = state.button === me ? 'open' : 'vs_raise';

  const net = state.players[0].stack - STARTING_STACK * (1 + state.rebuys[0]);

  const deal = () => dispatch({ type: 'deal', deck: shuffle(fullDeck()) });

  return (
    <>
      <nav className="navbar navbar-dark bg-dark">
        <div className="container-fluid">
          <span className="navbar-brand">♠ Heads-Up Hold’em Trainer</span>
          <span className="navbar-text small">
            Hand {state.handNumber} · Blinds 5/10 ·{' '}
            <span className={net >= 0 ? 'text-success' : 'text-danger'}>
              {labels[0]} {net >= 0 ? '+' : ''}
              {net.toLocaleString()}
            </span>
          </span>
        </div>
      </nav>
      <main className="container-fluid py-3">
        <div className="row g-3">
          <div className="col-lg-7 d-flex flex-column gap-3">
            <Table state={state} visible={[true, oppRevealed]} labels={labels} />
            <ActionBar
              state={state}
              legal={legal}
              controllable={controllable}
              actorLabel={state.toAct !== null ? labels[state.toAct] : ''}
              onAction={(action) => dispatch({ type: 'act', action })}
              onDeal={deal}
            />
            <HandLog state={state} labels={labels} />
          </div>
          <div className="col-lg-5 d-flex flex-column gap-3">
            {hand && opponentRange && (
              <>
                {both && (
                  <div className="alert alert-secondary py-2 small mb-0">
                    Analysis shown from <strong>{labels[me]}</strong>’s point of view.
                  </div>
                )}
                {settings.showOdds && (
                  <OddsPanel
                    hero={hand}
                    board={board}
                    opponentRange={opponentRange.combos}
                    opponentCards={oppCardsForCalc}
                    vsRange={settings.oddsVsRange}
                    vsRandom={settings.oddsVsRandom}
                    potOdds={potOdds}
                  />
                )}
                {settings.showOuts && <OutsPanel hero={hand} board={board} opponentCards={oppCardsForCalc} />}
                {settings.showRange && (
                  <RangePanel
                    hero={hand}
                    board={board}
                    opponentRange={opponentRange}
                    opponentCards={oppCards}
                    situation={situation}
                    defaultSituation={defaultSituation}
                  />
                )}
              </>
            )}
            <SettingsPanel settings={settings} onChange={updateSettings} onResetSession={() => dispatch({ type: 'reset' })} />
          </div>
        </div>
      </main>
    </>
  );
}
