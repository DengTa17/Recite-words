// ===== Settings: interface theme + difficulty =====

const THEME_KEY = 'vocab_theme';
const DIFFICULTY_KEY = 'vocab_difficulty';

export const THEMES = [
  { id: 'default', name: '默认暖色' },
  { id: 'scifi', name: '科幻科技感' },
  { id: 'fresh', name: '小清新' }
];

// Difficulty levels -> target-score multiplier
const DIFFICULTY_FACTORS = [0.6, 0.8, 1.0, 1.3, 1.6];
export const DIFFICULTY_LABELS = ['轻松', '简单', '普通', '较难', '硬核'];
const DEFAULT_LEVEL = 2;

class SettingsService {
  // ===== Theme =====
  getTheme() {
    const t = localStorage.getItem(THEME_KEY);
    return THEMES.some(x => x.id === t) ? t : 'default';
  }

  setTheme(id) {
    if (!THEMES.some(x => x.id === id)) id = 'default';
    localStorage.setItem(THEME_KEY, id);
    this.applyTheme();
  }

  applyTheme() {
    document.documentElement.dataset.theme = this.getTheme();
  }

  // ===== Difficulty =====
  getDifficultyLevel() {
    const v = parseInt(localStorage.getItem(DIFFICULTY_KEY), 10);
    return Number.isInteger(v) && v >= 0 && v < DIFFICULTY_FACTORS.length ? v : DEFAULT_LEVEL;
  }

  setDifficultyLevel(level) {
    level = Math.max(0, Math.min(DIFFICULTY_FACTORS.length - 1, parseInt(level, 10) || 0));
    localStorage.setItem(DIFFICULTY_KEY, String(level));
  }

  getDifficultyFactor() {
    return DIFFICULTY_FACTORS[this.getDifficultyLevel()];
  }

  getDifficultyLabel() {
    return DIFFICULTY_LABELS[this.getDifficultyLevel()];
  }

  get difficultyMax() {
    return DIFFICULTY_FACTORS.length - 1;
  }

  // ===== Scoring helpers (used by study + review) =====

  // Backend-only target score, derived from word length and scaled by difficulty.
  computeTargetScore(word) {
    const len = (word || '').replace(/[^a-zA-Z]/g, '').length;
    let base;
    if (len <= 5) base = 3;
    else if (len <= 8) base = 5;
    else base = 8;
    return Math.max(1, Math.round(base * this.getDifficultyFactor()));
  }

  isMastered(w) {
    if (!w) return false;
    if (w.mastered) return true;
    return (w.currentScore || 0) >= this.computeTargetScore(w.word);
  }

  // Memory progress 0..1 for the review ring
  progress(w) {
    if (!w) return 0;
    if (w.mastered) return 1;
    const target = this.computeTargetScore(w.word);
    return Math.max(0, Math.min(1, (w.currentScore || 0) / target));
  }
}

export const settings = new SettingsService();
