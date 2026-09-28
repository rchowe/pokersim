import { useEffect, useMemo, useReducer, useState } from 'react';
import { ActionBar } from './components/ActionBar.tsx';
import { HandLog } from './components/HandLog.tsx';
import { OddsPanel } from './components/OddsPanel.tsx';
import { OutsPanel } from './components/OutsPanel.tsx';
import { type OpponentView, RangePanel } from './components/RangePanel.tsx';
import { SettingsPanel } from './components/SettingsPanel.tsx';
import { Table } from './components/Table.tsx';
import { seatLetter } from './components/text.ts';
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
import { type PreflopSpot, currentSpot, positionOf } from './poker/preflop.ts';
import { estimateRange } from './poker/range.ts';
import { type Settings, loadSettings, saveSettings } from './settings.ts';

type Msg = { type: 'deal'; deck: Card[] } | { type: 'act'; action: PlayerAction } | { type: 'reset'; players: number };

function reducer(state: GameState, msg: Msg): GameState {
  switch (msg.type) {
    case 'deal':
      return startHand(state, msg.deck);
    case 'act':
      return applyAction(state, msg.action);
    case 'reset':
      return initialState(msg.players);
  }
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [state, dispatch] = useReducer(reducer, settings.numPlayers, initialState);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
    if (s.numPlayers !== settings.numPlayers) dispatch({ type: 'reset', players: s.numPlayers });
  };

  const n = state.players.length;
  const both = settings.mode === 'both';
  // Whose point of view the analysis panels take.
  const me: Seat = both && state.toAct !== null ? state.toAct : 0;
  const labels = state.players.map((p, i) => (both ? seatLetter(i) : p.name));
  const legal = legalActions(state);
  const controllable = both || state.toAct === 0;

  // Let the bots act after a short pause.
  useEffect(() => {
    if (both || state.status !== 'playing' || state.toAct === null || state.toAct === 0) return;
    const seat = state.toAct;
    const timer = setTimeout(() => dispatch({ type: 'act', action: botDecision(state, seat) }), settings.botDelayMs);
    return () => clearTimeout(timer);
  }, [state, both, settings.botDelayMs]);

  const hand = state.status === 'idle' ? null : state.players[me].cards;
  const board = state.board;
  const showdown = state.result?.reason === 'showdown';
  const reviewing = both || settings.revealOpponent;
  const visible = state.players.map((p, i) => i === me || reviewing || (showdown && !p.folded));

  // Opponents still in the hand; once everyone else has folded, keep showing all of them.
  const opponents = useMemo(() => {
    const others = state.players.flatMap((_, i) => (i === me ? [] : [i]));
    const live = others.filter((i) => !state.players[i].folded);
    return live.length > 0 ? live : others;
  }, [state, me]);

  const opponentViews = useMemo<OpponentView[] | null>(
    () =>
      hand
        ? opponents.map((seat) => ({
            seat,
            label: both ? seatLetter(seat) : state.players[seat].name,
            range: estimateRange(state, seat, hand),
            cards: reviewing || (showdown && !state.players[seat].folded) ? state.players[seat].cards : null,
          }))
        : null,
    [state, opponents, hand, both, reviewing, showdown],
  );
  const opponentRanges = useMemo(() => opponentViews?.map((o) => o.range.combos) ?? [], [opponentViews]);
  // Cards used for "vs. actual" calculations: only in review/both modes, not just because of a showdown.
  const oppCardsForCalc = useMemo(
    () => (state.status !== 'idle' && reviewing ? opponents.map((s) => state.players[s].cards) : null),
    [state, reviewing, opponents],
  );

  const potOdds =
    legal && legal.seat === me && legal.toCall > 0 ? { toCall: legal.toCall, pot: potTotal(state) } : null;
  const spot = currentSpot(state, me);
  const position = positionOf(state, me);
  const defaultSpot: PreflopSpot = { situation: position === 'BB' ? 'vs_raise' : 'open', position, players: n };

  const net = state.players[0].stack - STARTING_STACK * (1 + state.rebuys[0]);

  const deal = () => dispatch({ type: 'deal', deck: shuffle(fullDeck()) });

  return (
    <>
      <nav className="navbar navbar-dark bg-dark">
        <div className="container-fluid">
          <span className="navbar-brand">♠ {n === 2 ? 'Heads-Up' : `${n}-Handed`} Hold’em Trainer</span>
          <span className="navbar-text small">
            Hand {state.handNumber} · Blinds 5/10 ·{' '}
            <span className={net >= 0 ? 'text-success' : 'text-danger'}>
              {labels[0]} {net >= 0 ? '+' : ''}
              {net.toLocaleString()}
            </span>
          </span>
        </div>
      </nav>
      <main className={`container-fluid py-3 ${settings.fourColorDeck ? 'four-color' : ''}`}>
        <div className="row g-3">
          <div className="col-lg-7 d-flex flex-column gap-3">
            <Table state={state} visible={visible} labels={labels} />
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
            {hand && opponentViews && (
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
                    opponentRanges={opponentRanges}
                    opponentCards={oppCardsForCalc}
                    vsRange={settings.oddsVsRange}
                    vsRandom={settings.oddsVsRandom}
                    potOdds={potOdds}
                  />
                )}
                {settings.showOuts && <OutsPanel hero={hand} board={board} opponentCards={oppCardsForCalc} />}
                {settings.showRange && (
                  <RangePanel hero={hand} board={board} opponents={opponentViews} spot={spot} defaultSpot={defaultSpot} />
                )}
              </>
            )}
            <SettingsPanel
              settings={settings}
              onChange={updateSettings}
              onResetSession={() => dispatch({ type: 'reset', players: settings.numPlayers })}
            />
          </div>
        </div>
      </main>
    </>
  );
}
