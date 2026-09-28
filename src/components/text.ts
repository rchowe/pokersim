import type { HandResult } from '../poker/game.ts';

export const fmt = (n: number) => n.toLocaleString();

/** "You call" but "Villain calls". */
export const verb = (name: string, base: string) => `${name} ${name === 'You' ? base : base + 's'}`;

/** Who won what, e.g. "You win 300", "Split pot, 150 each" or "Bot 1 wins 400 · You win 300". */
export function resultSummary(result: HandResult, labels: readonly string[]): string {
  const { winners, won } = result;
  if (winners.length === 1) return `${verb(labels[winners[0]], 'win')} ${fmt(won[winners[0]])}`;
  const singlePot = (result.pots?.length ?? 1) === 1;
  if (singlePot && winners.length === 2 && Math.abs(won[winners[0]] - won[winners[1]]) <= 1) {
    return `Split pot, ${fmt(result.pot / 2)} each`;
  }
  return winners.map((w) => `${verb(labels[w], 'win')} ${fmt(won[w])}`).join(' · ');
}

/** "Seat A", "Seat B", … */
export const seatLetter = (seat: number) => `Seat ${String.fromCharCode(65 + seat)}`;
