// ===== Import Mode =====

import { db } from './database.js';
import { ocrEngine } from './ocr.js';
import { parseImportText, showToast, showConfirm, escapeHtml } from './utils.js';
import { phoneticsService } from './phonetics.js';
import { llmService } from './llm.js';

const EXAMPLE_SOURCE_KEY = 'vocab_example_source';

class ImportMode {
  constructor() {
    this.parsedWords = [];
    this.currentTab = 'manual';
    this.importBookId = null;
    this.exampleSource = 'none'; // 'none' | 'dict' | 'llm'
  }

  init() {
    // Tab switching
    document.querySelectorAll('.import-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Manual import
    const manualBtn = document.getElementById('manual-import-btn');
    if (manualBtn) {
      manualBtn.addEventListener('click', () => this.parseManualInput());
    }

    // OCR upload
    const uploadArea = document.getElementById('ocr-upload-area');
    const fileInput = document.getElementById('ocr-file-input');

    if (uploadArea && fileInput) {
      uploadArea.addEventListener('click', () => fileInput.click());
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
      });
      uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
      });
      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) this.handleOCRUpload(file);
      });
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleOCRUpload(file);
      });
    }

    // Import actions
    const confirmBtn = document.getElementById('import-confirm-btn');
    const clearBtn = document.getElementById('import-clear-btn');

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirmImport());
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearPreview());
    }

    // Data management
    const exportBtn = document.getElementById('data-export-btn');
    const importFileBtn = document.getElementById('data-import-file-btn');
    const importFileInput = document.getElementById('data-import-file');
    const clearAllBtn = document.getElementById('data-clear-all-btn');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportData());
    }
    if (importFileBtn && importFileInput) {
      importFileBtn.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.importDataFile(file);
      });
    }
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => this.clearAllData());
    }

    this.initExampleSource();
    this.loadBookSelects();
  }

  // ===== Example sentence source =====

  initExampleSource() {
    const sel = document.getElementById('example-source');
    const panel = document.getElementById('llm-settings');

    // Restore last choice
    const saved = localStorage.getItem(EXAMPLE_SOURCE_KEY);
    if (saved) this.exampleSource = saved;
    if (sel) sel.value = this.exampleSource;
    if (panel) panel.classList.toggle('hidden', this.exampleSource !== 'llm');

    if (sel) {
      sel.addEventListener('change', () => {
        this.exampleSource = sel.value;
        localStorage.setItem(EXAMPLE_SOURCE_KEY, sel.value);
        if (panel) panel.classList.toggle('hidden', sel.value !== 'llm');
      });
    }

    // Load saved model config into the fields
    const cfg = llmService.getConfig();
    const fill = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    fill('llm-url', cfg.url);
    fill('llm-key', cfg.key);
    fill('llm-model', cfg.model);
    fill('llm-prompt', cfg.prompt);

    const saveBtn = document.getElementById('llm-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        llmService.saveConfig({
          url: document.getElementById('llm-url')?.value.trim() || '',
          key: document.getElementById('llm-key')?.value.trim() || '',
          model: document.getElementById('llm-model')?.value.trim() || '',
          prompt: document.getElementById('llm-prompt')?.value.trim() || ''
        });
        showToast('模型设置已保存');
      });
    }
  }

  // Fill empty example sentences for parsedWords based on the chosen source.
  async generateExamples(onProgress) {
    if (this.exampleSource === 'none') return;

    const targets = this.parsedWords.filter(w => !w.sentence || !w.sentence.trim());
    if (targets.length === 0) return;

    try {
      if (this.exampleSource === 'dict') {
        const map = await phoneticsService.batchFetchPhonetics(
          targets.map(w => w.word), onProgress
        );
        targets.forEach(w => {
          const data = map.get(w.word.toLowerCase());
          if (data?.example) w.sentence = data.example;
        });
      } else if (this.exampleSource === 'llm') {
        if (!llmService.isConfigured()) {
          showToast('请先填写并保存模型设置', 'warning');
          return;
        }
        const map = await llmService.batchGenerate(
          targets.map(w => ({ word: w.word, meaning: w.meaning })), onProgress
        );
        targets.forEach(w => {
          const s = map.get(w.word);
          if (s) w.sentence = s;
        });
      }
    } catch (err) {
      console.error('Example generation failed:', err);
      showToast('例句生成失败，可手动填写', 'error');
    }
  }

  async loadBookSelects() {
    const books = await db.getAllBooks();
    const selects = [
      document.getElementById('import-book-select'),
      document.getElementById('preview-book-select')
    ];

    selects.forEach(select => {
      if (!select) return;
      select.innerHTML = books.map(b =>
        `<option value="${b.id}">${b.name}</option>`
      ).join('') + '<option value="__new__">+ 新建单词书</option>';
    });

    // Attach change listener for "new book" option
    selects.forEach(select => {
      if (!select) return;
      // Remove old listener to avoid duplicates
      const newSelect = select.cloneNode(true);
      select.parentNode.replaceChild(newSelect, select);
      newSelect.addEventListener('change', (e) => {
        if (e.target.value === '__new__') {
          this.createBookFromSelect(e.target);
        }
      });
    });
  }

  async createBookFromSelect(selectEl) {
    const name = prompt('请输入新单词书名称：');
    if (!name || !name.trim()) {
      // Reset to first option
      selectEl.value = selectEl.options[0].value;
      return;
    }

    try {
      const newId = await db.addBook({ name: name.trim(), createdAt: Date.now() });
      await this.loadBookSelects();
      // Select the newly created book
      selectEl.value = newId;
      showToast('单词书已创建');
    } catch (err) {
      showToast('创建失败', 'error');
      selectEl.value = selectEl.options[0].value;
    }
  }

  switchTab(tabName) {
    this.currentTab = tabName;

    document.querySelectorAll('.import-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    document.querySelectorAll('.import-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === tabName);
    });
  }

  async parseManualInput() {
    const input = document.getElementById('manual-input');
    if (!input || !input.value.trim()) {
      showToast('请输入单词内容', 'warning');
      return;
    }

    this.parsedWords = parseImportText(input.value);
    if (this.parsedWords.length === 0) {
      showToast('未解析到有效单词，请检查格式', 'error');
      return;
    }

    // Get selected book
    const select = document.getElementById('import-book-select');
    this.importBookId = select ? parseInt(select.value) : null;

    // Auto-generate example sentences (if a source is selected)
    const btn = document.getElementById('manual-import-btn');
    const origText = btn ? btn.textContent : '';
    if (btn) btn.disabled = true;
    await this.generateExamples((done, total) => {
      if (btn) btn.textContent = `生成例句 ${done}/${total}...`;
    });
    if (btn) { btn.disabled = false; btn.textContent = origText; }

    this.showPreview();
    showToast(`已解析 ${this.parsedWords.length} 个单词`);
  }

  async handleOCRUpload(file) {
    const previewImg = document.getElementById('ocr-preview-img');
    const previewDiv = document.querySelector('.image-preview');
    const progressDiv = document.getElementById('ocr-progress');
    const progressBar = document.getElementById('ocr-progress-bar');
    const progressText = document.getElementById('ocr-progress-text');

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewDiv.classList.remove('hidden');
    };
    reader.readAsDataURL(file);

    // Start OCR
    progressDiv.classList.remove('hidden');
    progressText.textContent = '正在识别...';
    progressBar.style.width = '0%';

    try {
      const { text } = await ocrEngine.recognize(file, (message, percent) => {
        progressBar.style.width = `${Math.round(percent)}%`;
        progressText.textContent = message || `识别中... ${Math.round(percent)}%`;
      });

      progressText.textContent = '解析中...';
      this.parsedWords = parseImportText(text);

      if (this.parsedWords.length === 0) {
        showToast('未识别到有效单词，请尝试手动输入', 'warning');
        progressDiv.classList.add('hidden');
        return;
      }

      // Get selected book
      const select = document.getElementById('import-book-select');
      this.importBookId = select ? parseInt(select.value) : null;

      // Auto-generate example sentences (if a source is selected)
      await this.generateExamples((done, total) => {
        progressText.textContent = `生成例句 ${done}/${total}...`;
      });

      this.showPreview();
      showToast(`已识别 ${this.parsedWords.length} 个单词`);
      progressDiv.classList.add('hidden');

    } catch (error) {
      console.error('OCR failed:', error);
      showToast('识别失败，请重试', 'error');
      progressDiv.classList.add('hidden');
    }
  }

  showPreview() {
    const preview = document.getElementById('import-preview');
    const list = document.getElementById('preview-list');

    if (!preview || !list) return;

    // Refresh book select for preview
    this.loadBookSelects();

    const attr = (s) => escapeHtml(s || '').replace(/"/g, '&quot;');
    list.innerHTML = this.parsedWords.map((w, i) => `
      <div class="preview-item" data-index="${i}">
        <input type="text" class="preview-word" value="${attr(w.word)}" placeholder="单词">
        <input type="text" class="preview-meaning" value="${attr(w.meaning)}" placeholder="释义">
        <input type="text" class="preview-sentence" value="${attr(w.sentence)}" placeholder="例句（可选）">
      </div>
    `).join('');

    preview.classList.remove('hidden');
  }

  async confirmImport() {
    if (this.parsedWords.length === 0) return;

    // Collect edited data
    const items = document.querySelectorAll('.preview-item');
    const wordsToImport = [];

    items.forEach(item => {
      const word = item.querySelector('.preview-word').value.trim();
      const meaning = item.querySelector('.preview-meaning').value.trim();
      const sentence = item.querySelector('.preview-sentence').value.trim();

      if (word && meaning) {
        wordsToImport.push({ word, meaning, sentence });
      }
    });

    if (wordsToImport.length === 0) {
      showToast('没有有效的单词可导入', 'warning');
      return;
    }

    const confirmBtn = document.getElementById('import-confirm-btn');
    if (confirmBtn) confirmBtn.disabled = true;

    try {
      // Fetch phonetics
      if (confirmBtn) confirmBtn.textContent = '获取音标中...';
      const phoneticResults = await phoneticsService.batchFetchPhonetics(
        wordsToImport.map(w => w.word),
        (completed, total) => {
          if (confirmBtn) confirmBtn.textContent = `获取音标 ${completed}/${total}...`;
        }
      );

      wordsToImport.forEach(w => {
        const phonData = phoneticResults.get(w.word.toLowerCase());
        w.phoneticUk = phonData?.uk || '';
        w.phoneticUs = phonData?.us || '';
        w.phonetic = phonData?.us || phonData?.uk || '';
        w.pos = phonData?.pos || '';
      });

      // Get book from preview select
      const previewSelect = document.getElementById('preview-book-select');
      const bookId = previewSelect ? parseInt(previewSelect.value) : this.importBookId;

      // Import
      if (confirmBtn) confirmBtn.textContent = '导入中...';
      await db.batchImport(wordsToImport, bookId);

      showToast(`成功导入 ${wordsToImport.length} 个单词`);
      this.clearPreview();

      // Clear manual input
      const manualInput = document.getElementById('manual-input');
      if (manualInput) manualInput.value = '';

    } catch (error) {
      console.error('Import failed:', error);
      showToast('导入失败', 'error');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '确认导入';
      }
    }
  }

  clearPreview() {
    this.parsedWords = [];
    const preview = document.getElementById('import-preview');
    if (preview) preview.classList.add('hidden');
  }

  // ===== Data Management =====

  async exportData() {
    try {
      const data = await db.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vocab-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('备份已下载');
    } catch (error) {
      showToast('导出失败', 'error');
    }
  }

  async importDataFile(file) {
    const confirmed = await showConfirm('导入备份将覆盖现有数据，确定继续吗？');
    if (!confirmed) return;

    try {
      const text = await file.text();
      await db.importData(text);
      showToast('数据已恢复');
      this.clearPreview();
    } catch (error) {
      console.error('Import failed:', error);
      showToast('导入失败，请检查文件格式', 'error');
    }
  }

  async clearAllData() {
    const confirmed = await showConfirm('确定要清空所有数据吗？此操作不可恢复！');
    if (!confirmed) return;

    await db.clearAllWords();
    await db.clearAllBooks();
    // Recreate default book
    await db.addBook({ name: '默认单词书', createdAt: Date.now() });
    showToast('所有数据已清空');
    this.clearPreview();
  }

  onShow() {
    this.loadBookSelects();
  }

  onHide() {}
}

export const importMode = new ImportMode();
