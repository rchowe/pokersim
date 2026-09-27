# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Heads-up no-limit hold'em trainer (100bb, blinds 5/10): React 19 + Bootstrap 5 + Vite, TypeScript, no backend.

## Commands

```bash
npm run dev                          # Vite dev server
npm run build                        # tsc -b && vite build (type errors fail the build)
npm run lint                         # oxlint (config in .oxlintrc.json)
npm test                             # vitest run — all tests live in src/poker/poker.test.ts
npx vitest run -t "<test name>"      # run a single test by name
npm run rank-preflop                 # regenerate src/poker/preflopRanking.ts
```

`scripts/rankPreflop.ts` runs under plain `node` (native TS type stripping), so it and anything it imports must use only erasable TS syntax — no enums, namespaces, or parameter properties. `tsconfig.app.json` enforces this with `erasableSyntaxOnly`. Imports use explicit `.ts`/`.tsx` extensions throughout.

Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml` runs `npm test` then `npm run build`). `vite.config.ts` sets `base: './'` so the build works under a Pages subpath.

## Architecture

**`src/poker/` is a pure engine with no React dependency.** The UI in `src/components/` only renders and dispatches.

- **Cards are integers 0–51** (`rank = card >> 2`, 0 = deuce … 12 = ace; `suit = card & 3`, order `cdhs`). Use `parseCards("As Kd")` / `cardToString` for readable forms, especially in tests.
- **Hand evaluation** (`evaluator.ts`): `evaluate(cards)` returns a packed number where a higher value is a better hand (category in bits 20+, kickers below). Compare scores directly and use `categoryOf` to get the `CATEGORY` constant.
- **Game state machine** (`game.ts`): `startHand(state, deck)` and `applyAction(state, action)` are pure. They `structuredClone` the state and return a new one, and the shuffled deck is passed in so randomness stays outside. `App.tsx` wraps them in a `useReducer`. Bet/raise `amount` means "raise *to*" (the street total), not the increment. `legalActions(state)` is the source of truth for what the seat to act may do. The button posts the SB, acts first preflop and last postflop, and alternates each hand. A player who busts is topped back up to 1000 at the next deal, and the count is tracked in `rebuys`.
- **Hand classes** (`handClasses.ts`): the 169 starting-hand classes are indexed on a 13×13 grid (`row * 13 + col`, Ace first). Suited hands sit above the diagonal and offsuit hands below it. `ALL_COMBOS` holds the 1326 concrete combos.
- **Preflop** (`preflop.ts`): the charts are fractions of all 1326 combos, ordered by `CLASS_PERCENTILE`, which is derived from the generated `preflopRanking.ts` (equity vs. a random hand). `currentSituation(state, seat)` maps the betting so far to a chart (`open`, `vs_limp`, `vs_raise`, …), or returns `null` postflop.
- **Range estimation** (`range.ts`): `estimateRange(state, seat, heroCards)` replays the hand log. It weights combos by the preflop charts, then narrows them postflop using `postflopBucket` (made-hand strength plus draws). It returns `WeightedCombo[]` together with plain-English `notes`.
- **Equity** (`equity.ts`): `calcEquity(hero, board, weightedRange, iterations, rng)` enumerates exactly on the turn and river and uses Monte Carlo preflop and on the flop. It runs synchronously on the main thread inside `useMemo` in `OddsPanel`, so keep it fast.
- **Bot** (`bot.ts`): `botDecision(state, seat, rng)` plays preflop from the charts plus noise. Postflop it compares its equity against the *hero's* estimated range with pot odds, and bluffs occasionally. `App.tsx` triggers it on a `setTimeout` (`botDelayMs`) when seat 1 is to act.

Engine functions that use randomness take an optional `rng` parameter (default `Math.random`). Tests pass a seeded `mulberry32` and build `riggedDeck(...)` decks to control deals. Deal order is BB card 1, button card 1, BB card 2, button card 2, then the board.

**UI modes** (`settings.ts`, persisted to `localStorage` under `pokersim.settings`): in `mode: 'bot'` you are seat 0. In `mode: 'both'` the user acts for both seats, and the analysis panels follow whichever seat is to act. `revealOpponent` ("review mode") shows the opponent's cards and switches equity and outs to compute against those actual cards. A showdown reveals the cards but does *not* switch the calculations.

Ranges and the bot are heuristics, not a solver. The preflop order overrates small pairs and underrates suited connectors (see README).
