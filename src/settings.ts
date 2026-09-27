export interface Settings {
  /** 'bot': you play seat 0 against the bot. 'both': you make every decision. */
  mode: 'bot' | 'both';
  showOdds: boolean;
  oddsVsRange: boolean;
  oddsVsRandom: boolean;
  showOuts: boolean;
  showRange: boolean;
  /** Color each suit differently (clubs green, diamonds blue) instead of red/black. */
  fourColorDeck: boolean;
  /** Review mode: show the opponent's hole cards and compute against them. */
  revealOpponent: boolean;
  botDelayMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'bot',
  showOdds: true,
  oddsVsRange: true,
  oddsVsRandom: true,
  showOuts: true,
  showRange: true,
  fourColorDeck: false,
  revealOpponent: false,
  botDelayMs: 800,
};

const KEY = 'pokersim.settings';

export function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode etc.); settings just won't persist.
  }
}
