import { describe, expect, it } from 'vitest';
import { botDecision } from './bot.ts';
import { fullDeck, parseCards, shuffle } from './cards.ts';
import { calcEquity } from './equity.ts';
import { CATEGORY, categoryOf, describeHand, evaluate } from './evaluator.ts';
import { type GameState, STARTING_STACK, applyAction, initialState, legalActions, startHand } from './game.ts';
import { HAND_CLASSES, classOfCombo } from './handClasses.ts';
import { calcOuts } from './outs.ts';
import { CLASS_PERCENTILE } from './preflop.ts';
import { estimateRange, fullRange, postflopBucket } from './range.ts';

const score = (text: string) => evaluate(parseCards(text));

// Seeded RNG so tests are repeatable.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deck that deals the given cards: BB hole 1, button hole 1, BB hole 2, button hole 2, then board. */
function riggedDeck(order: string): number[] {
  const top = parseCards(order);
  return [...top, ...fullDeck().filter((c) => !top.includes(c))];
}

describe('evaluate', () => {
  it('ranks categories correctly', () => {
    const hands = [
      'As Kd 9c 7h 3s 2d 4c', // high card
      'As Ad 9c 7h 3s', // pair
      'As Ad 9c 9h 3s', // two pair
      'As Ad Ac 9h 3s', // trips
      'Ah 2d 3c 4h 5s', // wheel straight
      '2h 7h 9h Jh Kh', // flush
      'As Ad Ac 9h 9s', // full house
      '9s 9d 9c 9h 3s', // quads
      'Ah Kh Qh Jh Th', // royal
    ];
    hands.forEach((h, i) => expect(categoryOf(score(h))).toBe(i));
  });

  it('uses kickers and best five of seven', () => {
    expect(score('As Ad Kc 7h 3s')).toBeGreaterThan(score('Ah Ac Qc 7d 3h'));
    expect(score('6h 5d 4c 3h 2s As')).toBeGreaterThan(score('Ah 2d 3c 4h 5s'));
    expect(score('As Ad 9c 9h 3s 3d Kc')).toBe(score('Ah Ac 9s 9d Kd 2c 2h'));
    expect(describeHand(score('Ks Kd Kc 4h 4s'))).toBe('Full house, Kings full of Fours');
    expect(describeHand(score('Ah Kh Qh Jh Th'))).toBe('Royal flush');
  });
});

describe('hand classes and preflop ranking', () => {
  it('maps combos to grid cells', () => {
    const [ak, akoff, aa] = [parseCards('As Ks'), parseCards('Kd Ah'), parseCards('Ah Ad')];
    expect(HAND_CLASSES[classOfCombo(ak[0], ak[1])].label).toBe('AKs');
    expect(HAND_CLASSES[classOfCombo(akoff[0], akoff[1])].label).toBe('AKo');
    expect(HAND_CLASSES[classOfCombo(aa[0], aa[1])].label).toBe('AA');
    expect(fullRange([]).length).toBe(1326);
  });

  it('ranks AA best and 32o worst', () => {
    const aa = HAND_CLASSES.find((c) => c.label === 'AA')!;
    const trash = HAND_CLASSES.find((c) => c.label === '32o')!;
    expect(Math.min(...CLASS_PERCENTILE)).toBe(CLASS_PERCENTILE[aa.index]);
    expect(Math.max(...CLASS_PERCENTILE)).toBe(CLASS_PERCENTILE[trash.index]);
  });
});

describe('game engine', () => {
  const deal = (order = '') => startHand(initialState(), riggedDeck(order));

  it('posts blinds and lets the button act first preflop', () => {
    const s = deal();
    expect(s.button).toBe(0);
    expect(s.players[0].bet).toBe(5);
    expect(s.players[1].bet).toBe(10);
    expect(s.toAct).toBe(0);
    expect(legalActions(s)).toMatchObject({ toCall: 5, minTo: 20, canCheck: false });
  });

  it('plays limp/check to the flop and BB acts first postflop', () => {
    let s = deal();
    s = applyAction(s, { type: 'call' });
    expect(s.toAct).toBe(1);
    s = applyAction(s, { type: 'check' });
    expect(s.street).toBe('flop');
    expect(s.board).toHaveLength(3);
    expect(s.pot).toBe(20);
    expect(s.toAct).toBe(1);
  });

  it('awards the pot on a fold', () => {
    let s = deal();
    s = applyAction(s, { type: 'raise', amount: 25 });
    s = applyAction(s, { type: 'fold' });
    expect(s.status).toBe('complete');
    expect(s.result?.winners).toEqual([0]);
    expect(s.players[0].stack).toBe(STARTING_STACK + 10);
    expect(s.players[1].stack).toBe(STARTING_STACK - 10);
  });

  it('enforces minimum raises and re-opens action', () => {
    let s = deal();
    s = applyAction(s, { type: 'raise', amount: 30 }); // raise of 20
    expect(legalActions(s)).toMatchObject({ seat: 1, minTo: 50 });
    s = applyAction(s, { type: 'raise', amount: 12 }); // clamped to min
    expect(s.currentBet).toBe(50);
    expect(s.toAct).toBe(0);
  });

  it('runs out the board on an all-in and settles at showdown', () => {
    // BB (seat 1) gets Kd Kc, button (seat 0) gets As Ah.
    let s = deal('Kd As Kc Ah 2c 7d 9h Js 3s');
    s = applyAction(s, { type: 'raise', amount: 5000 });
    expect(s.players[0].stack).toBe(0);
    s = applyAction(s, { type: 'call' });
    expect(s.status).toBe('complete');
    expect(s.board).toHaveLength(5);
    expect(s.result?.winners).toEqual([0]);
    expect(s.players[0].stack).toBe(2 * STARTING_STACK);
    expect(s.players[1].stack).toBe(0);
  });

  it('refunds the uncalled part of a bet with unequal stacks', () => {
    let s: GameState = initialState();
    s.players[1].stack = 300;
    s = startHand(s, riggedDeck('Kd As Kc Ah 2c 7d 9h Js 3s'));
    s = applyAction(s, { type: 'raise', amount: 1000 });
    s = applyAction(s, { type: 'call' });
    expect(s.result?.pot).toBe(600);
    expect(s.players[0].stack).toBe(1300);
    expect(s.players[1].stack).toBe(0);
  });

  it('splits tied pots', () => {
    let s = deal('Kd Kc 2d 2h As Ks Qs Js Ts');
    s = applyAction(s, { type: 'call' });
    s = applyAction(s, { type: 'check' });
    for (let i = 0; i < 6; i++) s = applyAction(s, { type: 'check' });
    expect(s.result?.winners).toEqual([0, 1]);
    expect(s.players[0].stack).toBe(STARTING_STACK);
  });

  it('bot vs bot hands always finish with chips conserved', () => {
    const rng = mulberry32(42);
    let s = initialState();
    for (let hand = 0; hand < 60; hand++) {
      s = startHand(s, shuffle(fullDeck(), rng));
      let steps = 0;
      while (s.status === 'playing') {
        s = applyAction(s, botDecision(s, s.toAct!, rng));
        if (++steps > 50) throw new Error('Hand did not terminate');
      }
      const total = s.players[0].stack + s.players[1].stack;
      expect(total).toBe(STARTING_STACK * (2 + s.rebuys[0] + s.rebuys[1]));
    }
  });
});

describe('equity, outs and ranges', () => {
  it('computes AA vs KK around 82%', () => {
    const r = calcEquity(parseCards('As Ah'), [], [{ c1: parseCards('Kd')[0], c2: parseCards('Kc')[0], cls: 0, w: 1 }], 20000, mulberry32(1))!;
    expect(r.equity).toBeGreaterThan(0.79);
    expect(r.equity).toBeLessThan(0.85);
  });

  it('is exact on the river and turn', () => {
    const board = parseCards('2c 7d 9h Js');
    const r = calcEquity(parseCards('As Ah'), board, fullRange([]))!;
    expect(r.exact).toBe(true);
    const river = calcEquity(parseCards('As Ah'), [...board, parseCards('3s')[0]], fullRange([]))!;
    expect(river.win + river.tie + river.lose).toBeCloseTo(1);
  });

  it('counts a flush draw as 9 outs', () => {
    const o = calcOuts(parseCards('Ah Kh'), parseCards('2h 7h 9c'))!;
    const flush = o.groups.find((g) => g.category === CATEGORY.FLUSH)!;
    expect(flush.cards).toHaveLength(9);
    expect(o.unseen).toBe(47);
    expect(o.outs).toHaveLength(15); // 9 flush + 6 overcard pair outs
    expect(o.byRiverPct).toBeCloseTo(1 - (32 * 31) / (47 * 46));
  });

  it('finds true outs against known cards', () => {
    const o = calcOuts(parseCards('Ah Kh'), parseCards('2h 7h 9c Qd'), parseCards('9d 9s'))!;
    expect(o.versusActual?.behind).toBe(true);
    // 9 hearts remain, but the Qh gives the set a full house and the 9h makes quads.
    expect(o.versusActual?.cards.length).toBe(7);
  });

  it('buckets made hands and draws', () => {
    const board = parseCards('Kh 7h 2c');
    expect(postflopBucket(...(parseCards('Ks Qd') as [number, number]), board).made).toBe(2);
    expect(postflopBucket(...(parseCards('7s 7d') as [number, number]), board).made).toBe(3);
    expect(postflopBucket(...(parseCards('Ah 4h') as [number, number]), board)).toMatchObject({ made: 0, flushDraw: true });
  });

  it('narrows a 3-bettor’s range to strong hands', () => {
    let s = startHand(initialState(), riggedDeck(''));
    s = applyAction(s, { type: 'raise', amount: 25 });
    s = applyAction(s, { type: 'raise', amount: 75 });
    const { combos, notes } = estimateRange(s, 1, s.players[0].cards);
    const aa = combos.filter((c) => HAND_CLASSES[c.cls].label === 'AA');
    const trash = combos.filter((c) => HAND_CLASSES[c.cls].label === '72o');
    expect(aa.every((c) => c.w === 1)).toBe(true);
    expect(trash.every((c) => c.w < 0.1)).toBe(true);
    expect(notes).toHaveLength(1);
  });
});
