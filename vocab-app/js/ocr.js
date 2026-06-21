// ===== Tesseract.js OCR Engine =====

class OCREngine {
  constructor() {
    this.worker = null;
    this.isReady = false;
    this.isInitializing = false;
    this.language = 'eng+chi_sim';
  }

  async init(onProgress) {
    if (this.isReady) return;
    if (this.isInitializing) {
      // Wait for initialization to complete
      while (this.isInitializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      return;
    }

    this.isInitializing = true;

    try {
      if (onProgress) onProgress('正在加载OCR引擎...', 5);

      // Dynamic import of Tesseract.js
      if (typeof Tesseract === 'undefined') {
        await this.loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      }

      if (onProgress) onProgress('初始化Worker...', 20);

      this.worker = await Tesseract.createWorker(this.language, 1, {
        logger: (m) => {
          if (m.status === 'loading tesseract core') {
            if (onProgress) onProgress('加载核心引擎...', 20 + m.progress * 20);
          } else if (m.status === 'loading language traineddata') {
            if (onProgress) onProgress('加载语言模型...', 40 + m.progress * 40);
          } else if (m.status === 'initializing api') {
            if (onProgress) onProgress('初始化API...', 80 + m.progress * 20);
          } else if (m.status === 'recognizing text') {
            if (onProgress) onProgress('识别文字中...', m.progress * 100);
          }
        },
        errorHandler: (err) => console.error('OCR Error:', err)
      });

      this.isReady = true;
      if (onProgress) onProgress('OCR引擎就绪', 100);
    } catch (err) {
      console.error('OCR initialization failed:', err);
      throw err;
    } finally {
      this.isInitializing = false;
    }
  }

  loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async recognize(imageSource, onProgress) {
    if (!this.isReady) {
      await this.init(onProgress);
    }

    const { data: { text, confidence } } = await this.worker.recognize(imageSource);
    return { text, confidence };
  }

  cleanText(rawText) {
    const lines = rawText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const words = [];
    for (const line of lines) {
      // Try to match: EnglishWord 中文释义
      // Support formats: word meaning / word - meaning / word: meaning / word — meaning
      const match = line.match(/^([a-zA-Z][a-zA-Z\s'-]*)[\s\-—:]+(.+)$/);
      if (match) {
        const word = match[1].trim();
        const meaning = match[2].trim();
        // Validate: word should contain mostly English letters
        if (/^[a-zA-Z\s'-]+$/.test(word) && meaning.length > 0) {
          words.push({ word, meaning, sentence: '' });
        }
      }
    }
    return words;
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isReady = false;
    }
  }
}

export const ocrEngine = new OCREngine();
