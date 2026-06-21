// ===== App Entry Point =====

import { db } from './database.js';
import { speechService } from './speech.js';
import { studyMode } from './study.js';
import { reviewMode } from './review.js';
import { importMode } from './import.js';
import { phoneticsService } from './phonetics.js';
import { settings, THEMES, DIFFICULTY_LABELS } from './settings.js';
import { showToast } from './utils.js';

class App {
  constructor() {
    this.currentView = 'start';
    this.views = {
      start: { el: 'start-screen', mode: null },
      review: { el: 'review-view', mode: reviewMode },
      study: { el: 'study-view', mode: studyMode },
      import: { el: 'import-view', mode: importMode }
    };
    this.studyFilter = {
      type: null, // 'book', 'all', 'unlearned'
      bookId: null
    };
  }

  async init() {
    // Initialize database
    try {
      await db.init();
    } catch (err) {
      console.error('Database init failed:', err);
      showToast('数据库初始化失败', 'error');
    }

    // Initialize speech
    if (!speechService.isSupported()) {
      showToast('您的浏览器不支持语音合成', 'warning');
    }

    // Apply saved interface theme
    settings.applyTheme();

    // Initialize all modes
    reviewMode.init();
    studyMode.init();
    importMode.init();
    this.initStudyFilter();
    this.initSettingsDialog();

    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        const view = e.target.dataset.view;
        if (view === 'study') {
          this.showStudyFilter();
        } else if (view) {
          this.switchView(view);
        }
      });
    });

    // Nav icon buttons (home / settings)
    document.querySelectorAll('.nav-icon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'home') this.showStartScreen();
        else if (action === 'settings') this.showSettings();
      });
    });

    // Start screen buttons
    document.querySelectorAll('.start-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        this.handleStartAction(action);
      });
    });

    // Show start screen
    this.showStartScreen();

    // Demo data (only if empty)
    await this.loadDemoData();

    // Backfill part-of-speech (and missing phonetics) for older words in the background
    this.backfillPartOfSpeech();
  }

  // Fetch part-of-speech for any word that doesn't have it yet (one-time, background).
  // Words that get no result are marked with pos: '' so they aren't retried next launch.
  async backfillPartOfSpeech() {
    try {
      const words = await db.getAllWords();
      const missing = words.filter(w => w.pos === undefined || w.pos === null);
      if (missing.length === 0) return;

      const targets = missing.slice(0, 100); // be polite to the free API
      const results = await phoneticsService.batchFetchPhonetics(targets.map(w => w.word));

      for (const w of targets) {
        const data = results.get(w.word.toLowerCase());
        const updates = { pos: data?.pos || '' };
        // Also fill phonetics if this word never had any
        if (!w.phoneticUk && !w.phoneticUs && !w.phonetic && data) {
          updates.phoneticUk = data.uk || '';
          updates.phoneticUs = data.us || '';
          updates.phonetic = data.us || data.uk || '';
        }
        await db.updateWord(w.id, updates);
      }

      // Refresh the current view so the new tags show up immediately
      if (this.currentView === 'review') reviewMode.onShow();
    } catch (err) {
      console.warn('Part-of-speech backfill failed:', err);
    }
  }

  showStartScreen() {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(el => {
      el.classList.remove('active');
    });
    // Show start screen
    const startEl = document.getElementById('start-screen');
    if (startEl) startEl.classList.add('active');

    // Clear nav active states
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });

    this.currentView = 'start';
  }

  handleStartAction(action) {
    if (action === 'study') {
      this.showStudyFilter();
    } else if (action === 'review') {
      this.switchView('review');
    } else if (action === 'import') {
      this.switchView('import');
    } else if (action === 'settings') {
      this.showSettings();
    }
  }

  switchView(viewName) {
    if (!this.views[viewName]) return;

    // Hide current view
    const current = this.views[this.currentView];
    if (current) {
      const el = document.getElementById(current.el);
      if (el) el.classList.remove('active');
      if (current.mode && current.mode.onHide) current.mode.onHide();
    }

    // Update nav
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.view === viewName);
    });

    // Show new view
    this.currentView = viewName;
    const next = this.views[viewName];
    const el = document.getElementById(next.el);
    if (el) el.classList.add('active');
    if (next.mode && next.mode.onShow) next.mode.onShow();
  }

  // ===== Study Filter Dialog =====

  initStudyFilter() {
    const dialog = document.getElementById('study-filter-dialog');
    const cancelBtn = document.getElementById('filter-cancel');
    const startBtn = document.getElementById('filter-start');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.hideStudyFilter();
      });
    }

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.startStudyWithFilter();
      });
    }

    // Preset buttons
    document.querySelectorAll('.filter-preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-preset-btn').forEach(b => b.classList.remove('selected'));
        document.querySelectorAll('.book-select-item').forEach(b => b.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        this.studyFilter.type = e.currentTarget.dataset.filter;
        this.studyFilter.bookId = null;
      });
    });
  }

  async showStudyFilter() {
    const dialog = document.getElementById('study-filter-dialog');
    const bookList = document.getElementById('filter-book-list');
    if (!dialog || !bookList) return;

    // Reset selection
    this.studyFilter = { type: null, bookId: null };
    document.querySelectorAll('.filter-preset-btn').forEach(b => b.classList.remove('selected'));

    // Load books
    const books = await db.getAllBooks();
    const allWords = await db.getAllWords();

    bookList.innerHTML = books.map(book => {
      const count = allWords.filter(w => w.bookId === book.id).length;
      return `
        <div class="book-select-item" data-book-id="${book.id}">
          <input type="radio" name="filter-book" value="${book.id}">
          <span class="book-name">${escapeHtml(book.name)}</span>
          <span class="book-count">${count} 词</span>
        </div>
      `;
    }).join('');

    // Book selection
    bookList.querySelectorAll('.book-select-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.book-select-item').forEach(b => b.classList.remove('selected'));
        document.querySelectorAll('.filter-preset-btn').forEach(b => b.classList.remove('selected'));
        item.classList.add('selected');
        item.querySelector('input[type="radio"]').checked = true;
        this.studyFilter.type = 'book';
        this.studyFilter.bookId = parseInt(item.dataset.bookId);
      });
    });

    dialog.classList.remove('hidden');
  }

  hideStudyFilter() {
    const dialog = document.getElementById('study-filter-dialog');
    if (dialog) dialog.classList.add('hidden');
  }

  async startStudyWithFilter() {
    if (!this.studyFilter.type) {
      showToast('先选个学习范围嘛', 'warning');
      return;
    }

    this.hideStudyFilter();

    let words = [];
    if (this.studyFilter.type === 'book') {
      words = await db.getWordsByBook(this.studyFilter.bookId);
    } else if (this.studyFilter.type === 'all') {
      words = await db.getAllWords();
    } else if (this.studyFilter.type === 'unlearned') {
      words = await db.getUnlearnedWords();
    }

    if (words.length === 0) {
      showToast('这个范围里一个词都没有，先去搬点货？', 'warning');
      this.showStartScreen();
      return;
    }

    // Mastered words graduate out of the study rotation
    const studiable = words.filter(w => !settings.isMastered(w));
    if (studiable.length === 0) {
      showToast('这个范围的词都被你拿下啦，换一批吧', 'success');
      this.showStartScreen();
      return;
    }

    studyMode.setWords(studiable);
    this.switchView('study');
  }

  // ===== Settings Dialog =====

  initSettingsDialog() {
    const optionsEl = document.getElementById('theme-options');
    if (optionsEl) {
      optionsEl.innerHTML = THEMES.map(t =>
        `<button class="theme-option" data-theme-id="${t.id}">${t.name}</button>`
      ).join('');
      optionsEl.querySelectorAll('.theme-option').forEach(btn => {
        btn.addEventListener('click', () => {
          settings.setTheme(btn.dataset.themeId);
          this.syncSettingsUI();
        });
      });
    }

    const slider = document.getElementById('difficulty-slider');
    if (slider) {
      slider.max = String(settings.difficultyMax);
      slider.addEventListener('input', () => {
        settings.setDifficultyLevel(slider.value);
        this.syncSettingsUI();
        // Refresh rings if review is open
        if (this.currentView === 'review') reviewMode.refreshProgress();
      });
    }

    const closeBtn = document.getElementById('settings-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.hideSettings());

    const dialog = document.getElementById('settings-dialog');
    if (dialog) {
      dialog.addEventListener('click', (e) => { if (e.target === dialog) this.hideSettings(); });
    }
  }

  syncSettingsUI() {
    const theme = settings.getTheme();
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.themeId === theme);
    });
    const slider = document.getElementById('difficulty-slider');
    if (slider) slider.value = String(settings.getDifficultyLevel());
    const desc = document.getElementById('difficulty-desc');
    if (desc) {
      desc.textContent = `当前：${settings.getDifficultyLabel()} · 目标分数随难度自动调整`;
    }
  }

  showSettings() {
    this.syncSettingsUI();
    const dialog = document.getElementById('settings-dialog');
    if (dialog) dialog.classList.remove('hidden');
  }

  hideSettings() {
    const dialog = document.getElementById('settings-dialog');
    if (dialog) dialog.classList.add('hidden');
  }

  async loadDemoData() {
    const words = await db.getAllWords();
    if (words.length > 0) return;

    const books = await db.getAllBooks();
    const defaultBookId = books[0]?.id;

    // Rename the default book to reflect its content
    if (defaultBookId && books.length === 1) {
      try { await db.updateBook(defaultBookId, { name: '四级高频词' }); } catch (e) {}
    }

    // 50 high-frequency CET-4 words: [word, pos, meaning, UK IPA, US IPA, sentence]
    const raw = [
      ['available', 'adj.', '可获得的；有空的；可利用的', '/əˈveɪləbl/', '/əˈveɪləbl/', "Tickets are still available for tonight's concert."],
      ['resident', '', 'n. 居民；adj. 定居的', '/ˈrezɪdənt/', '/ˈrezɪdənt/', 'She has been a resident of this town for ten years.'],
      ['conversation', 'n.', '交谈，谈话', '/ˌkɒnvəˈseɪʃn/', '/ˌkɑːnvərˈseɪʃn/', 'We had a long conversation about our future plans.'],
      ['direction', 'n.', '方向；指导；说明书', '/dɪˈrekʃn/', '/dəˈrekʃn/', 'Could you give me directions to the station?'],
      ['sheet', 'n.', '床单；一张(纸)；薄片', '/ʃiːt/', '/ʃiːt/', 'Please write your name on the top sheet of paper.'],
      ['willing', 'adj.', '乐意的，愿意的', '/ˈwɪlɪŋ/', '/ˈwɪlɪŋ/', 'She is always willing to help her classmates.'],
      ['correspond', 'v.', '符合；相一致；通信', '/ˌkɒrəˈspɒnd/', '/ˌkɔːrəˈspɑːnd/', 'His actions do not correspond with his words.'],
      ['advance', '', 'v. 促进；提前；n. 进步', '/ədˈvɑːns/', '/ədˈvæns/', 'New technology continues to advance every year.'],
      ['total', '', 'adj. 全部的；v. 总数达；n. 合计', '/ˈtəʊtl/', '/ˈtoʊtl/', 'The total cost of the trip was over a thousand dollars.'],
      ['contribute', 'v.', '贡献；捐献；促成', '/kənˈtrɪbjuːt/', '/kənˈtrɪbjuːt/', 'Everyone is encouraged to contribute ideas to the project.'],
      ['single', 'adj.', '单一的；单身的', '/ˈsɪŋɡl/', '/ˈsɪŋɡl/', 'Not a single student failed the exam this year.'],
      ['information', 'n.', '信息；消息；资料', '/ˌɪnfəˈmeɪʃn/', '/ˌɪnfərˈmeɪʃn/', 'You can find more information on our website.'],
      ['achieve', 'v.', '实现；达成；取得', '/əˈtʃiːv/', '/əˈtʃiːv/', 'Hard work helped her achieve her goals.'],
      ['research', 'n./v.', '研究；调查', '/rɪˈsɜːtʃ/', '/ˈriːsɜːrtʃ/', 'Scientists are doing research on the new disease.'],
      ['experience', '', 'n. 经验；经历；v. 体验', '/ɪkˈspɪəriəns/', '/ɪkˈspɪriəns/', 'Travelling abroad was a wonderful experience for me.'],
      ['program', '', 'n. 程序；节目；v. 编程', '/ˈprəʊɡræm/', '/ˈproʊɡræm/', "The TV program starts at eight o'clock."],
      ['position', 'n.', '职位；位置；立场', '/pəˈzɪʃn/', '/pəˈzɪʃn/', 'He applied for a position at the bank.'],
      ['identify', 'v.', '鉴定；认出；发现', '/aɪˈdentɪfaɪ/', '/aɪˈdentɪfaɪ/', 'Can you identify the man in this photo?'],
      ['process', '', 'n. 过程；步骤；v. 处理', '/ˈprəʊses/', '/ˈprɑːses/', 'Learning a language is a slow process.'],
      ['digital', 'adj.', '数码的；数字的', '/ˈdɪdʒɪtl/', '/ˈdɪdʒɪtl/', 'Most people now read the news on digital devices.'],
      ['individual', '', 'adj. 个人的；n. 个人', '/ˌɪndɪˈvɪdʒuəl/', '/ˌɪndɪˈvɪdʒuəl/', 'Each individual has the right to their own opinion.'],
      ['average', '', 'adj. 平均的；n. 平均数', '/ˈævərɪdʒ/', '/ˈævərɪdʒ/', 'The average temperature in summer is around thirty degrees.'],
      ['professional', '', 'adj. 专业的；n. 专业人士', '/prəˈfeʃənl/', '/prəˈfeʃənl/', 'She received professional training before starting the job.'],
      ['rate', '', 'n. 速度；比率；v. 评价', '/reɪt/', '/reɪt/', 'The success rate of the treatment is very high.'],
      ['appeal', 'v./n.', '呼吁；吸引力；申诉', '/əˈpiːl/', '/əˈpiːl/', 'The charity made an appeal for donations.'],
      ['obesity', 'n.', '肥胖；肥大', '/əʊˈbiːsəti/', '/oʊˈbiːsəti/', 'Lack of exercise can lead to obesity.'],
      ['communicate', 'v.', '交流；传达；通讯', '/kəˈmjuːnɪkeɪt/', '/kəˈmjuːnɪkeɪt/', 'We use email to communicate with customers.'],
      ['significant', 'adj.', '重要的；显著的', '/sɪɡˈnɪfɪkənt/', '/sɪɡˈnɪfɪkənt/', 'There has been a significant rise in prices.'],
      ['academic', '', 'adj. 学术的；n. 学者', '/ˌækəˈdemɪk/', '/ˌækəˈdemɪk/', 'His academic performance has improved greatly.'],
      ['potential', '', 'adj. 潜在的；n. 潜力', '/pəˈtenʃl/', '/pəˈtenʃl/', 'The young player has great potential.'],
      ['factor', 'n.', '因素；要素', '/ˈfæktə(r)/', '/ˈfæktər/', 'Cost is an important factor in our decision.'],
      ['attitude', 'n.', '态度；看法', '/ˈætɪtjuːd/', '/ˈætɪtuːd/', 'A positive attitude helps you face difficulties.'],
      ['environment', 'n.', '环境；周围状况', '/ɪnˈvaɪrənmənt/', '/ɪnˈvaɪrənmənt/', 'We must protect the natural environment.'],
      ['resource', 'n.', '资源；财力', '/rɪˈsɔːs/', '/ˈriːsɔːrs/', 'Water is a precious natural resource.'],
      ['opportunity', 'n.', '机会；时机', '/ˌɒpəˈtjuːnəti/', '/ˌɑːpərˈtuːnəti/', 'This job offers a great opportunity to learn.'],
      ['impact', 'n./v.', '影响；冲击', '/ˈɪmpækt/', '/ˈɪmpækt/', 'The new law had a major impact on small businesses.'],
      ['maintain', 'v.', '维持；保养；坚持', '/meɪnˈteɪn/', '/meɪnˈteɪn/', 'It is important to maintain a healthy diet.'],
      ['promote', 'v.', '促进；提升；推销', '/prəˈməʊt/', '/prəˈmoʊt/', 'The company is trying to promote its new product.'],
      ['benefit', '', 'n. 益处；v. 有益于', '/ˈbenɪfɪt/', '/ˈbenɪfɪt/', 'Regular exercise has many health benefits.'],
      ['consequence', 'n.', '结果；后果', '/ˈkɒnsɪkwəns/', '/ˈkɑːnsəkwens/', 'He had to face the consequences of his actions.'],
      ['efficient', 'adj.', '高效的；有效率的', '/ɪˈfɪʃnt/', '/ɪˈfɪʃnt/', 'The new system is much more efficient.'],
      ['adapt', 'v.', '适应；改编', '/əˈdæpt/', '/əˈdæpt/', 'It took time to adapt to the new environment.'],
      ['challenge', 'n./v.', '挑战；质疑', '/ˈtʃælɪndʒ/', '/ˈtʃælɪndʒ/', 'Climbing the mountain was a real challenge.'],
      ['character', 'n.', '性格；角色；特征', '/ˈkærəktə(r)/', '/ˈkærəktər/', 'Honesty is an important part of her character.'],
      ['conclude', 'v.', '总结；得出结论', '/kənˈkluːd/', '/kənˈkluːd/', 'The report concludes that the plan will work.'],
      ['decade', 'n.', '十年', '/ˈdekeɪd/', '/ˈdekeɪd/', 'The city has changed a lot in the past decade.'],
      ['emphasis', 'n.', '强调；重点', '/ˈemfəsɪs/', '/ˈemfəsɪs/', 'Our school places great emphasis on reading.'],
      ['essential', 'adj.', '必不可少的；本质的', '/ɪˈsenʃl/', '/ɪˈsenʃl/', 'Water is essential for all living things.'],
      ['evaluate', 'v.', '评估；评价', '/ɪˈvæljueɪt/', '/ɪˈvæljueɪt/', "Teachers evaluate students' progress every term."],
      ['trend', 'n.', '趋势；动向', '/trend/', '/trend/', 'There is a growing trend toward online shopping.']
    ];

    const demoWords = raw.map(([word, pos, meaning, uk, us, sentence]) => ({
      word,
      meaning,
      sentence,
      phonetic: us || uk,
      phoneticUk: uk,
      phoneticUs: us,
      pos,
      bookId: defaultBookId
    }));

    await db.batchImport(demoWords);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});

// Expose modes for inline event handlers
window.studyMode = studyMode;
window.reviewMode = reviewMode;
window.importMode = importMode;
