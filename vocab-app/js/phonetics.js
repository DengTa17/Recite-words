// ===== Phonetics Service =====
// Uses Free Dictionary API (dictionaryapi.dev) to fetch IPA phonetics

const API_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

// Map dictionaryapi.dev partOfSpeech -> short Chinese-textbook style abbreviation
const POS_ABBR = {
  noun: 'n.',
  verb: 'v.',
  adjective: 'adj.',
  adverb: 'adv.',
  pronoun: 'pron.',
  preposition: 'prep.',
  conjunction: 'conj.',
  interjection: 'int.',
  exclamation: 'int.',
  determiner: 'det.',
  article: 'art.',
  numeral: 'num.',
  number: 'num.',
  abbreviation: 'abbr.',
  prefix: 'pref.',
  suffix: 'suf.'
};

class PhoneticsService {
  constructor() {
    this.cache = new Map(); // word -> { uk, us }
    this.pendingRequests = new Map(); // word -> Promise (dedup)
  }

  /**
   * Fetch phonetics for a single word
   * Returns { uk: "/həˈləʊ/", us: "/həˈloʊ/" } or null
   */
  async fetchPhonetics(word) {
    if (!word || !/^[a-zA-Z]/.test(word)) return null;

    const key = word.toLowerCase();

    // Return cached result
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // Dedup concurrent requests for same word
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key);
    }

    const promise = this._doFetch(key);
    this.pendingRequests.set(key, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  async _doFetch(word) {
    try {
      const res = await fetch(`${API_URL}${encodeURIComponent(word)}`, {
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        // Word not found or API error
        this.cache.set(word, null);
        return null;
      }

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        this.cache.set(word, null);
        return null;
      }

      const entry = data[0];
      const phonetics = entry.phonetics || [];

      // Extract part(s) of speech across all entries, abbreviated and de-duped
      const posList = [];
      for (const d of data) {
        for (const m of (d.meanings || [])) {
          const abbr = POS_ABBR[(m.partOfSpeech || '').toLowerCase()];
          if (abbr && !posList.includes(abbr)) posList.push(abbr);
        }
      }
      const pos = posList.join(' ');

      // Pick an example sentence from the definitions; prefer one that actually
      // contains the word.
      let example = '';
      const lower = word.toLowerCase();
      outer:
      for (const d of data) {
        for (const m of (d.meanings || [])) {
          for (const def of (m.definitions || [])) {
            const ex = (def.example || '').trim();
            if (!ex) continue;
            if (!example) example = ex;
            if (ex.toLowerCase().includes(lower)) { example = ex; break outer; }
          }
        }
      }

      // Extract UK and US phonetics from the phonetics array
      let uk = '';
      let us = '';

      for (const p of phonetics) {
        if (!p.text) continue;
        const text = p.text.trim();

        // Skip empty or non-IPA entries
        if (!text || text === '' || !text.startsWith('/')) continue;

        // Try to determine UK vs US from audio URL or text
        const audio = p.audio || '';

        if (audio.includes('-uk') || audio.includes('_uk') || audio.includes('uk.')) {
          if (!uk) uk = text;
        } else if (audio.includes('-us') || audio.includes('_us') || audio.includes('us.')) {
          if (!us) us = text;
        } else if (audio.includes('-au') || audio.includes('_au') || audio.includes('au.')) {
          // Skip Australian
          continue;
        } else {
          // No audio clue - try to assign by position
          // dictionaryapi.dev typically returns UK first, US second
          if (!uk) {
            uk = text;
          } else if (!us && text !== uk) {
            us = text;
          }
        }
      }

      // If we only got one phonetic, try to get the other from sourceUrl or alternate entries
      if (uk && !us) {
        // Check if there's a second entry with different phonetic
        for (let i = 1; i < data.length; i++) {
          const altPhonetics = data[i].phonetics || [];
          for (const p of altPhonetics) {
            if (p.text && p.text.trim().startsWith('/') && p.text.trim() !== uk) {
              us = p.text.trim();
              break;
            }
          }
          if (us) break;
        }
      }

      const result = (uk || us || pos || example)
        ? { uk: uk || '', us: us || '', pos, example }
        : null;
      this.cache.set(word, result);
      return result;
    } catch (err) {
      console.warn(`Failed to fetch phonetics for "${word}":`, err);
      this.cache.set(word, null);
      return null;
    }
  }

  /**
   * Batch fetch phonetics for multiple words
   * Returns Map<word, { uk, us } | null>
   * Uses concurrency limit of 3 to avoid overwhelming the API
   */
  async batchFetchPhonetics(words, onProgress) {
    const results = new Map();
    const queue = [];

    // Filter out words that already have phonetics cached
    for (const w of words) {
      const key = w.toLowerCase();
      if (this.cache.has(key)) {
        results.set(key, this.cache.get(key));
      } else {
        queue.push(key);
      }
    }

    // Process in batches of 3
    const batchSize = 3;
    let completed = results.size;
    const total = words.length;

    for (let i = 0; i < queue.length; i += batchSize) {
      const batch = queue.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(word => this.fetchPhonetics(word))
      );

      batch.forEach((word, idx) => {
        results.set(word, batchResults[idx]);
        completed++;
        if (onProgress) {
          onProgress(completed, total);
        }
      });

      // Small delay between batches to be polite to the API
      if (i + batchSize < queue.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return results;
  }

  /**
   * Format phonetics for display
   * e.g. "UK: /həˈləʊ/  US: /həˈloʊ/"
   */
  static format(phoneticData) {
    if (!phoneticData) return '';
    const parts = [];
    if (phoneticData.uk) parts.push(`UK ${phoneticData.uk}`);
    if (phoneticData.us) parts.push(`US ${phoneticData.us}`);
    return parts.join('  ');
  }

  /**
   * Get a single phonetic string (prefers US, falls back to UK)
   */
  static getPrimary(phoneticData) {
    if (!phoneticData) return '';
    return phoneticData.us || phoneticData.uk || '';
  }
}

export const phoneticsService = new PhoneticsService();
