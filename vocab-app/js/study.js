// ===== Study Mode (queue-driven spaced repetition, single card) =====

import { speechService } from './speech.js';
import { shuffleArray, highlightWord, showToast } from './utils.js';
import { db } from './database.js';
import { settings } from './settings.js';

const COMPLETE_MESSAGES = [
  { title: '又是充实的一轮', sub: '你的脑容量刚刚偷偷扩了一点' },
  { title: '大脑已升级', sub: '内存 +1，建议重启…啊不，是建议休息' },
  { title: '太强了', sub: '这些单词被你拿下，原地插旗' },
  { title: '今日收工', sub: '让大脑喘口气，它也是要恰饭的' },
  { title: '满载而归', sub: '新单词已搬进长期记忆，包邮到家' },
];

class StudyMode {
  constructor() {
    this.container = null;
    this.indicator = null;
    this.viewEl = null;

    this.queue = [];          // remaining words; index 0 = current card
    this.total = 0;           // unique words this round
    this.masteredCount = 0;   // how many graduated this round
    this.current = null;      // { word, mode, revealed, locked, scored, startTime }

    this.isComplete = false;
    this.isSpeaking = false;
    this.wheelLock = false;
  }

  init() {
    this.viewEl = document.getElementById('study-view');
    this.container = document.getElementById('card-stack');
    this.indicator = document.getElementById('mode-indicator');

    // Speech indicator state
    window.addEventListener('speech-start', () => {
      this.isSpeaking = true;
      const btn = this.container?.querySelector('.word-card.active .speak-btn');
      if (btn) btn.classList.add('speaking');
    });
    window.addEventListener('speech-end', () => {
      this.isSpeaking = false;
      const btn = this.container?.querySelector('.word-card.active .speak-btn');
      if (btn) btn.classList.remove('speaking');
    });

    // Wheel = advance (skip) to the next card
    if (this.container) {
      this.container.addEventListener('wheel', (e) => {
        if (!this.viewEl?.classList.contains('active') || this.isComplete) return;
        if (Math.abs(e.deltaY) < 20) return;
        e.preventDefault();
        if (this.wheelLock) return;
        this.wheelLock = true;
        setTimeout(() => { this.wheelLock = false; }, 550);
        if (e.deltaY > 0) this.skip();
      }, { passive: false });

      // Basic touch swipe (up = next)
      let touchStartY = null;
      this.container.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
      this.container.addEventListener('touchend', (e) => {
        if (touchStartY === null || this.isComplete) return;
        const dy = touchStartY - e.changedTouches[0].clientY;
        touchStartY = null;
        if (dy > 50) this.skip();
      }, { passive: true });
    }

    document.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  setWords(words) {
    this.queue = shuffleArray(words.filter(w => !settings.isMastered(w)));
    this.total = this.queue.length;
    this.masteredCount = 0;
    this.isComplete = false;
  }

  onShow() { this.loadWords(); }
  onHide() { speechService.stop(); }

  loadWords() {
    if (this.total === 0) { this.renderEmpty(); return; }
    this.renderCurrent();
  }

  getCardMode() {
    return Math.random() > 0.5 ? 'en-to-cn' : 'cn-to-en';
  }

  // ===== Rendering =====

  renderEmpty() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="study-empty">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.4;margin-bottom:1rem;">
          <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
        <h2>这里空空如也</h2>
        <p>先搬点单词进来，灯塔才好为你点灯</p>
        <button class="btn-glass" onclick="app.switchView('import')">去导入单词</button>
      </div>
    `;
    if (this.indicator) this.indicator.classList.add('hidden');
  }

  renderCurrent() {
    if (!this.container) return;
    if (this.queue.length === 0) { this.renderComplete(); return; }

    const word = this.queue[0];
    const mode = this.getCardMode();
    this.current = { word, mode, revealed: false, locked: false, scored: false, startTime: Date.now() };
    this.isComplete = false;

    this.container.innerHTML = this.cardHtml(word, mode);
    this.updateIndicator(mode);
    if (this.indicator) this.indicator.classList.remove('hidden');

    if (mode === 'en-to-cn') {
      setTimeout(() => speechService.autoSpeakWord(word.word), 400);
    }
  }

  cardHtml(word, mode) {
    const isEnToCn = mode === 'en-to-cn';
    const displayText = isEnToCn ? word.word : word.meaning;
    const hiddenText = isEnToCn ? word.meaning : word.word;
    const sentenceHtml = highlightWord(word.sentence, word.word);
    const phoneticHtml = this.renderPhonetic(word, isEnToCn);

    return `
      <div class="word-card active card-enter" data-mode="${mode}" data-id="${word.id}">
        <div class="card-content">
          <button class="speak-btn" onclick="studyMode.speakCurrent()" title="朗读">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          </button>

          <div class="word-display">${(!isEnToCn && word.pos) ? `<span class="pos-tag">${escapeHtml(word.pos)}</span> ` : ''}${escapeHtml(displayText)}</div>
          ${phoneticHtml}

          <div class="sentence-box">
            ${sentenceHtml}
          </div>

          <div class="meaning-text hidden ${!isEnToCn ? 'answer-en' : ''}" id="meaning-0" onclick="studyMode.toggleMeaning()">
            ${!isEnToCn
              ? `<span class="answer-word">${escapeHtml(hiddenText)}</span>`
              : `${word.pos ? `<span class="pos-tag">${escapeHtml(word.pos)}</span> ` : ''}${escapeHtml(hiddenText)}`}
            ${!isEnToCn ? this.renderPhonetic(word, true) : ''}
          </div>
          <div class="reveal-hint" onclick="studyMode.toggleMeaning()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.5;">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span style="opacity:0.5;font-size:0.85rem;">点一下，揭晓答案</span>
          </div>

          <div class="card-actions">
            <button class="known-btn" onclick="studyMode.markKnown()" title="认识（空格）">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <span class="known-label">认识</span>
            </button>
          </div>
        </div>

        <div class="scroll-hint">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
          <span>滚轮 / 空格 切换</span>
        </div>
      </div>
    `;
  }

  renderComplete() {
    this.isComplete = true;
    if (this.indicator) this.indicator.classList.add('hidden');
    const msg = COMPLETE_MESSAGES[Math.floor(Math.random() * COMPLETE_MESSAGES.length)];
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="word-card study-complete-card">
        <div class="card-content complete-content">
          <div class="complete-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <h2 class="complete-title">${escapeHtml(msg.title)}</h2>
          <p class="complete-sub">${escapeHtml(msg.sub)}</p>
          <p class="complete-count">本轮掌握了 <strong>${this.masteredCount}</strong> 个单词</p>
          <div class="complete-actions">
            <button class="btn-glass complete-btn" onclick="studyMode.reviewWords()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <span>去复习</span>
            </button>
            <button class="btn-glass secondary complete-btn" onclick="studyMode.studyMore()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              <span>再选一组</span>
            </button>
            <button class="btn-glass secondary complete-btn" onclick="studyMode.goHome()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              <span>累了，歇会儿</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  updateIndicator(mode) {
    if (!this.indicator) return;
    const modeLabel = mode === 'en-to-cn' ? '英译汉' : '汉译英';
    this.indicator.innerHTML = `
      <span class="mode-label">${modeLabel}</span>
      <span class="card-counter">已掌握 ${this.masteredCount} / ${this.total}</span>
    `;
  }

  // ===== Interactions =====

  speakCurrent() {
    if (this.current?.word) speechService.speak(this.current.word.word);
  }

  toggleMeaning() {
    const el = document.getElementById('meaning-0');
    if (!el) return;
    el.classList.toggle('hidden');
    // Viewing the answer closes the "认识" scoring channel for this appearance
    if (!el.classList.contains('hidden')) this.lockKnown();
  }

  lockKnown() {
    if (this.current) { this.current.revealed = true; this.current.locked = true; }
    const btn = this.container?.querySelector('.known-btn');
    if (btn) {
      btn.disabled = true;
      btn.classList.add('locked');
      const label = btn.querySelector('.known-label');
      if (label) label.textContent = '看过答案啦';
    }
  }

  // Operation C: "认识" / Space — score by reaction time
  async markKnown() {
    const c = this.current;
    if (!c) return;
    if (c.locked) {
      showToast('看过答案就不计分啦，划走再背一次', 'warning');
      return;
    }
    if (c.scored) return;
    c.scored = true;

    const T = Date.now() - (c.startTime || Date.now());
    let delta;
    if (T <= 1500) delta = 2;        // 秒答
    else if (T <= 3000) delta = 1;   // 较快
    else delta = -1;                 // 超时，往回退

    const word = c.word;
    let cur = (word.currentScore || 0) + delta;
    if (cur < 0) cur = 0;
    word.currentScore = cur;

    const target = settings.computeTargetScore(word.word);
    const mastered = cur >= target;
    if (mastered) word.mastered = true;

    try {
      await db.updateWord(word.id, { currentScore: cur, mastered: !!word.mastered });
    } catch (err) {
      console.warn('Failed to save score:', err);
    }

    if (mastered) {
      this.masteredCount++;
      this.graduateThenNext();   // remove from queue, celebrate, next
    } else {
      this.requeueCurrent();     // not there yet -> comes back in 2~3 cards
      this.advance();
    }
  }

  // Wheel / Arrow / button = skip: not learned this pass -> requeue
  skip() {
    if (!this.current || this.isComplete) return;
    this.requeueCurrent();
    this.advance();
  }

  requeueCurrent() {
    // Move the current word (queue[0]) back 2~3 slots so it returns later
    if (this.queue.length <= 1) return; // last one left: keep drilling it
    const w = this.queue.shift();
    const gap = 2 + Math.floor(Math.random() * 2); // 2 or 3
    const pos = Math.min(this.queue.length, gap);
    this.queue.splice(pos, 0, w);
  }

  advance() {
    speechService.stop();
    this.renderCurrent();
  }

  graduateThenNext() {
    const card = this.container?.querySelector('.word-card');
    if (card) {
      card.classList.add('mastered');
      const content = card.querySelector('.card-content');
      if (content && !content.querySelector('.mastered-badge')) {
        const badge = document.createElement('div');
        badge.className = 'mastered-badge';
        badge.textContent = '已掌握 ✓';
        content.appendChild(badge);
      }
    }
    this.queue.shift();              // remove mastered word from the front
    this.updateIndicator(this.current?.mode);
    speechService.stop();
    setTimeout(() => this.renderCurrent(), 850);
  }

  handleKeydown(e) {
    if (!this.viewEl?.classList.contains('active')) return;
    if (this.isComplete) return;

    if (e.key === ' ') {
      e.preventDefault();
      this.markKnown();                 // 空格 = 认识
    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      this.skip();                      // 跳过，不计分
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      this.speakCurrent();
    } else if (e.key === 'Enter' || e.key === 'h') {
      e.preventDefault();
      this.toggleMeaning();
    }
  }

  // ===== Complete-screen actions =====

  reviewWords() { app.switchView('review'); }
  studyMore() { app.showStudyFilter(); }
  goHome() { app.showStartScreen(); }

  renderPhonetic(word, isEnToCn) {
    if (!isEnToCn) return '';

    const uk = word.phoneticUk || '';
    const us = word.phoneticUs || '';
    const old = word.phonetic || '';

    if (!uk && !us && !old) return '';

    if (uk || us) {
      const parts = [];
      if (uk) parts.push(`<span class="phonetic-label uk">英</span> <span class="phonetic-value">${escapeHtml(uk)}</span>`);
      if (us) parts.push(`<span class="phonetic-label us">美</span> <span class="phonetic-value">${escapeHtml(us)}</span>`);
      return `<div class="phonetic">${parts.join('&nbsp;&nbsp;')}</div>`;
    }

    return `<div class="phonetic">${escapeHtml(old)}</div>`;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export const studyMode = new StudyMode();
