// Cards are integers 0..51: rank = card >> 2 (0 = deuce ... 12 = ace), suit = card & 3.
export type Card = number;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
export const RANK_NAMES = [
  'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace',
];
export const RANK_PLURALS = [
  'Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights',
  'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces',
];

export const rankOf = (card: Card): number => card >> 2;
export const suitOf = (card: Card): number => card & 3;
export const makeCard = (rank: number, suit: number): Card => rank * 4 + suit;

export function parseCard(text: string): Card {
  const rank = RANKS.indexOf(text[0].toUpperCase());
  const suit = SUITS.indexOf(text[1].toLowerCase());
  if (rank < 0 || suit < 0) throw new Error(`Invalid card: ${text}`);
  return makeCard(rank, suit);
}

export const parseCards = (text: string): Card[] =>
  text.trim() === '' ? [] : text.trim().split(/\s+/).map(parseCard);

export const cardToString = (card: Card): string => RANKS[rankOf(card)] + SUITS[suitOf(card)];

export const isRed = (card: Card): boolean => suitOf(card) === 1 || suitOf(card) === 2;

export function fullDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}

export function shuffle(cards: readonly Card[], rng: () => number = Math.random): Card[] {
  const out = cards.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
