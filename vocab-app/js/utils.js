// ===== Utility Functions =====

/**
 * Shuffle array using Fisher-Yates algorithm
 */
export function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Highlight a word in a sentence
 */
export function highlightWord(sentence, word) {
  if (!sentence || !word) return sentence || '<em>暂无例句</em>';
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedWord})`, 'gi');
  return sentence.replace(regex, '<span class="highlight">$1</span>');
}

/**
 * Parse manual import text
 * Format: word meaning (optional sentence on next line)
 */
export function parseImportText(text) {
  // Normalize line endings
  const lines = text.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l);
  const words = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // A valid word-meaning line must:
    // 1. Start with a single word (or hyphenated word) - no spaces in the English word part
    // 2. Followed by whitespace and Chinese meaning
    // 3. The meaning part must contain Chinese characters
    const match = line.match(/^([a-zA-Z]+(?:[-'][a-zA-Z]+)*)\s+(.+)$/);

    if (match && /[\u4e00-\u9fa5]/.test(match[2])) {
      const word = match[1].trim();
      const meaning = match[2].trim();
      let sentence = '';

      // Check if next line is a sentence (doesn't contain Chinese and doesn't match word-meaning)
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextMatch = nextLine.match(/^([a-zA-Z]+(?:[-'][a-zA-Z]+)*)\s+(.+)$/);
        // Next line is a sentence if it doesn't match word-meaning pattern OR doesn't have Chinese
        if (!nextMatch || !/[\u4e00-\u9fa5]/.test(nextMatch[2])) {
          sentence = nextLine;
          i++;
        }
      }
      words.push({ word, meaning, sentence });
    }
    i++;
  }

  return words;
}

/**
 * Clean OCR text and extract word-meaning pairs
 */
export function cleanOCRText(text) {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const words = [];
  for (const line of lines) {
    // Try to match: EnglishWord 中文释义
    const match = line.match(/^([a-zA-Z][a-zA-Z\s'-]*)[\s\-—:]+(.+)$/);
    if (match) {
      words.push({
        word: match[1].trim(),
        meaning: match[2].trim(),
        sentence: ''
      });
    }
  }
  return words;
}

/**
 * Generate a phonetic placeholder (simple approximation)
 */
export function generatePhonetic(word) {
  // This is a very simple placeholder - real phonetics would need a dictionary
  return '';
}

/**
 * Debounce function
 */
export function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Show toast notification
 */
export function showToast(message, type = 'success', duration = 3000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconSvg = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };

  toast.innerHTML = `${iconSvg[type] || iconSvg.success}<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeIn 0.3s ease reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Confirm modal.
 * Returns a Promise that resolves to true (confirmed) or false (cancelled),
 * so callers can `const ok = await showConfirm('...')`.
 */
export function showConfirm(message, title = '确认操作') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn-glass secondary" id="modal-cancel">取消</button>
          <button class="btn-glass" id="modal-confirm">确认</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };
    document.addEventListener('keydown', onKey);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.querySelector('#modal-cancel').addEventListener('click', () => close(false));
    overlay.querySelector('#modal-confirm').addEventListener('click', () => close(true));
  });
}

/**
 * Download text as file
 */
export function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
