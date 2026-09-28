# Hold'em Trainer

A React + Bootstrap app for learning no-limit Texas hold'em, heads-up or at a table of 3–6.

- Play full hands (100bb, blinds 5/10) against rule-based bots, or control every seat. Pick 2 (heads-up) to 6 players in Settings.
- Optional study panels: equity vs. an estimated range / random hand / actual cards (review mode),
  pot odds, outs with rule-of-2/4, each opponent's estimated range, and position-aware preflop charts.

```bash
npm install
npm run dev     # start the app
npm test        # engine tests
```

## Layout

- `src/poker/` – pure TypeScript engine: cards, hand evaluator, game state machine, preflop charts,
  range estimation, equity (exact on turn/river, Monte Carlo earlier), outs, bot.
- `src/components/` – React UI.
- `scripts/rankPreflop.ts` – regenerates `src/poker/preflopRanking.ts` (`npm run rank-preflop`).

Ranges and the bot use simple heuristics, not a solver. Preflop hand order is equity vs. a random
hand, which slightly overrates small pairs and underrates suited connectors.
