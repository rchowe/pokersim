import { type Card, RANKS, SUITS, SUIT_SYMBOLS, isRed, rankOf, suitOf } from '../poker/cards.ts';

interface Props {
  card?: Card;
  /** Show the back of the card. */
  hidden?: boolean;
  size?: 'sm' | 'md';
  dim?: boolean;
}

export function PlayingCard({ card, hidden, size = 'md', dim }: Props) {
  if (card === undefined) return <div className={`playing-card ${size} empty`} />;
  if (hidden) return <div className={`playing-card ${size} back`} aria-label="Face-down card" />;
  const rank = RANKS[rankOf(card)].replace('T', '10');
  const suit = SUIT_SYMBOLS[suitOf(card)];
  return (
    <div className={`playing-card ${size} suit-${SUITS[suitOf(card)]} ${isRed(card) ? 'red' : ''} ${dim ? 'dim' : ''}`} aria-label={rank + suit}>
      <span className="rank">{rank}</span>
      <span className="suit">{suit}</span>
    </div>
  );
}

export function CardRow({ cards, size = 'sm' }: { cards: readonly Card[]; size?: 'sm' | 'md' }) {
  return (
    <span className="card-row">
      {cards.map((c) => (
        <PlayingCard key={c} card={c} size={size} />
      ))}
    </span>
  );
}
