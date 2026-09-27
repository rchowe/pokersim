import { HAND_CLASSES } from '../poker/handClasses.ts';

export interface GridCell {
  background: string;
  color?: string;
  title?: string;
}

interface Props {
  cells: GridCell[];
  /** Grid indices to outline (e.g. the hand you hold). */
  highlight?: number[];
}

export function RangeGrid({ cells, highlight = [] }: Props) {
  return (
    <div className="range-grid" role="grid" aria-label="Starting hand grid">
      {HAND_CLASSES.map((cls) => {
        const cell = cells[cls.index];
        return (
          <div
            key={cls.index}
            className={`range-cell ${highlight.includes(cls.index) ? 'highlight' : ''}`}
            style={{ background: cell.background, color: cell.color }}
            title={cell.title ?? cls.label}
            role="gridcell"
          >
            {cls.label}
          </div>
        );
      })}
    </div>
  );
}
