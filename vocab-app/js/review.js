// ===== Review Mode =====

import { db } from './database.js';
import { speechService } from './speech.js';
import { showToast, showConfirm } from './utils.js';
import { settings } from './settings.js';

class ReviewMode {
  constructor() {
    this.words = [];
    this.filteredWords = [];
    this.maskMode = 'none';
    this.listEl = null;
    this.searchEl = null;
    this.currentBookId = null;
    this.books = [];
  }

  init() {
    this.listEl = document.getElementById('word-list');
    this.bookListEl = document.getElementById('book-list');
    this.searchEl = document.getElementById('review-search');

    // Search
    if (this.searchEl) {
      this.searchEl.addEventListener('input', (e) => {
        this.filterWords(e.target.value);
      });
    }

    // Mask toggles
    document.querySelectorAll('.mask-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.target.dataset.mask;
        this.setMaskMode(mode);
      });
    });
  }

  async onShow() {
    this.books = await db.getAllBooks();
    if (this.currentBookId === null) {
      this.renderBookList();
    } else {
      await this.loadBookWords(this.currentBookId);
    }
  }

  onHide() {
    speechService.stop();
  }

  // ===== Book List =====

  renderBookList() {
    if (!this.bookListEl) return;

    this.bookListEl.classList.remove('hidden');
    if (this.listEl) this.listEl.classList.add('hidden');

    // Set parent class for CSS-based visibility control
    const reviewView = document.getElementById('review-view');
    if (reviewView) {
      reviewView.classList.add('showing-books');
      reviewView.classList.remove('showing-words');
    }

    const title = document.getElementById('review-title');
    if (title) title.textContent = '单词书';

    if (this.books.length === 0) {
      this.bookListEl.innerHTML = `
        <div class="review-empty">
          <h3>一本单词书都还没有</h3>
          <p>别慌，导入单词时会自动帮你建一本</p>
          <button class="btn-glass" onclick="app.switchView('import')">去导入单词</button>
        </div>
      `;
      return;
    }

    this.bookListEl.innerHTML = `
      <div class="book-list-header">
        <h3>我的单词书</h3>
        <button class="btn-glass small" onclick="reviewMode.createBook()">+ 新建单词书</button>
      </div>
      ${this.books.map(book => {
        return `
          <div class="book-card" data-book-id="${book.id}">
            <div class="book-card-info">
              <div class="book-card-name">${escapeHtml(book.name)}</div>
              <div class="book-card-stats" id="book-stats-${book.id}">加载中...</div>
            </div>
            <div class="book-card-actions">
              <button onclick="event.stopPropagation(); reviewMode.renameBook(${book.id})" title="重命名">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button onclick="event.stopPropagation(); reviewMode.deleteBook(${book.id})" title="删除">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </div>
        `;
      }).join('')}
    `;

    // Load stats async
    this.books.forEach(async book => {
      const stats = await db.getBookStats(book.id);
      const el = document.getElementById(`book-stats-${book.id}`);
      if (el) el.textContent = `${stats.total} 词 · ${stats.mastered} 已掌握`;
    });

    // Click to enter book
    this.bookListEl.querySelectorAll('.book-card').forEach(card => {
      card.addEventListener('click', () => {
        const bookId = parseInt(card.dataset.bookId);
        this.enterBook(bookId);
      });
    });
  }

  async enterBook(bookId) {
    this.currentBookId = bookId;
    const book = this.books.find(b => b.id === bookId);
    const title = document.getElementById('review-title');
    if (title && book) title.textContent = book.name;

    // Set parent class for CSS-based visibility control
    const reviewView = document.getElementById('review-view');
    if (reviewView) {
      reviewView.classList.remove('showing-books');
      reviewView.classList.add('showing-words');
    }

    await this.loadBookWords(bookId);
  }

  backToBookList() {
    this.currentBookId = null;
    this.words = [];
    this.filteredWords = [];
    this.renderBookList();
  }

  async loadBookWords(bookId) {
    this.words = await db.getWordsByBook(bookId);
    this.filteredWords = [...this.words];
    this.renderList();
    this.updateStats();
  }

  // ===== Word List =====

  renderList() {
    if (!this.listEl) return;

    this.bookListEl.classList.add('hidden');
    this.listEl.classList.remove('hidden');

    // Set parent class for CSS-based visibility control
    const reviewView = document.getElementById('review-view');
    if (reviewView) {
      reviewView.classList.remove('showing-books');
      reviewView.classList.add('showing-words');
    }

    if (this.filteredWords.length === 0) {
      this.listEl.innerHTML = `
        <div style="margin-bottom:1rem;">
          <button class="book-back-btn" onclick="reviewMode.backToBookList()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            返回单词书列表
          </button>
        </div>
        <div class="empty-state">
          <p>这本书还是空的，等你来填满</p>
          <button class="btn-glass" onclick="app.switchView('import')">去导入单词</button>
        </div>
      `;
      return;
    }

    this.listEl.innerHTML = `
      <div style="margin-bottom:1rem;">
        <button class="book-back-btn" onclick="reviewMode.backToBookList()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          返回单词书列表
        </button>
      </div>
      ${this.filteredWords.map(w => {
        const phoneticHtml = this.renderPhonetic(w);
        return `
        <div class="word-row" data-id="${w.id}">
          ${this.renderRing(w)}
          <div class="word-cell">
            <span class="word-text">${escapeHtml(w.word)}</span>
          </div>
          <div class="phonetic-cell">
            ${phoneticHtml}
          </div>
          <div class="meaning-cell">${w.pos ? `<span class="pos-tag">${escapeHtml(w.pos)}</span> ` : ''}${escapeHtml(w.meaning)}</div>
          <div class="row-actions">
            <button onclick="reviewMode.speakWord(${w.id})" title="朗读">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            </button>
            <button onclick="reviewMode.deleteWord(${w.id})" title="删除">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;
      }).join('')}
    `;

    // Re-apply mask mode after rendering
    this.setMaskMode(this.maskMode);
  }

  renderRing(w) {
    const p = settings.progress(w);
    const done = settings.isMastered(w);
    const r = 9;
    const c = 2 * Math.PI * r;
    const off = c * (1 - p);
    return `
      <span class="progress-ring ${done ? 'done' : ''}" title="${done ? '已掌握' : '记忆进度'}">
        <svg width="24" height="24" viewBox="0 0 24 24">
          <circle class="ring-bg" cx="12" cy="12" r="${r}" fill="none" stroke-width="2.5"/>
          <circle class="ring-fg" cx="12" cy="12" r="${r}" fill="none" stroke-width="2.5"
            stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"
            stroke-linecap="round" transform="rotate(-90 12 12)"/>
        </svg>
        ${done ? '<svg class="ring-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M20 6L9 17l-5-5"/></svg>' : ''}
      </span>`;
  }

  renderPhonetic(w) {
    const uk = w.phoneticUk || '';
    const us = w.phoneticUs || '';
    const old = w.phonetic || '';

    if (!uk && !us && !old) return '';

    if (uk || us) {
      const parts = [];
      if (uk) parts.push(`<span class="phonetic-tag uk"><span class="phonetic-region">英</span> ${escapeHtml(uk)}</span>`);
      if (us) parts.push(`<span class="phonetic-tag us"><span class="phonetic-region">美</span> ${escapeHtml(us)}</span>`);
      return `<div class="phonetic-inline">${parts.join('')}</div>`;
    }

    return `<div class="phonetic-inline"><span class="phonetic-tag">${escapeHtml(old)}</span></div>`;
  }

  refreshProgress() {
    // Re-render word list so progress rings reflect new difficulty
    if (this.currentBookId !== null && this.listEl && !this.listEl.classList.contains('hidden')) {
      this.renderList();
    }
  }

  filterWords(query) {
    if (!query) {
      this.filteredWords = [...this.words];
    } else {
      const lowerQuery = query.toLowerCase();
      this.filteredWords = this.words.filter(w =>
        w.word.toLowerCase().includes(lowerQuery) ||
        w.meaning.includes(query)
      );
    }
    this.renderList();
  }

  setMaskMode(mode) {
    this.maskMode = mode;

    document.querySelectorAll('.mask-toggle').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mask === mode);
    });

    if (!this.listEl) return;
    this.listEl.classList.remove('mask-english', 'mask-chinese');
    if (mode !== 'none') {
      this.listEl.classList.add(`mask-${mode}`);
    }
  }

  async updateStats() {
    const stats = await db.getStats();
    const totalEl = document.getElementById('total-words');
    const masteredEl = document.getElementById('mastered-words');
    if (totalEl) totalEl.textContent = stats.total;
    if (masteredEl) masteredEl.textContent = stats.mastered;
  }

  speakWord(id) {
    const word = this.words.find(w => w.id === id);
    if (word) speechService.speak(word.word);
  }

  async deleteWord(id) {
    const confirmed = await showConfirm('确定要删除这个单词吗？');
    if (!confirmed) return;

    await db.deleteWord(id);
    this.words = this.words.filter(w => w.id !== id);
    this.filteredWords = this.filteredWords.filter(w => w.id !== id);
    this.renderList();
    this.updateStats();
    showToast('已删除');
  }

  // ===== Book CRUD =====

  async createBook() {
    const name = prompt('请输入单词书名称：');
    if (!name || !name.trim()) return;

    await db.addBook({ name: name.trim() });
    this.books = await db.getAllBooks();
    this.renderBookList();
    showToast('单词书已创建');
  }

  async renameBook(id) {
    const book = this.books.find(b => b.id === id);
    if (!book) return;

    const name = prompt('新名称：', book.name);
    if (!name || !name.trim()) return;

    await db.updateBook(id, { name: name.trim() });
    this.books = await db.getAllBooks();
    this.renderBookList();
    showToast('已重命名');
  }

  async deleteBook(id) {
    const book = this.books.find(b => b.id === id);
    if (!book) return;

    const confirmed = await showConfirm(`确定要删除"${book.name}"吗？其中的单词将被移到默认单词书。`);
    if (!confirmed) return;

    await db.deleteBook(id);
    this.books = await db.getAllBooks();
    this.renderBookList();
    showToast('单词书已删除');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export const reviewMode = new ReviewMode();
