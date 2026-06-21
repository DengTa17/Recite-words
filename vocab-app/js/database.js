// ===== IndexedDB Database =====

import { showToast } from './utils.js';

const DB_NAME = 'WordMemorizerDB';
const DB_VERSION = 3;

class WordDatabase {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        showToast('请关闭其他标签页后刷新', 'warning');
        reject(new Error('Database blocked'));
      };
      request.onsuccess = async () => {
        this.db = request.result;
        // Migrate words to default book if needed
        await this._migrateWordsToBooks();
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        // Version 1: create words and studyRecords stores
        if (oldVersion < 1) {
          const wordStore = db.createObjectStore('words', { keyPath: 'id', autoIncrement: true });
          wordStore.createIndex('word', 'word', { unique: false });
          wordStore.createIndex('createdAt', 'createdAt', { unique: false });

          const recordStore = db.createObjectStore('studyRecords', { keyPath: 'id', autoIncrement: true });
          recordStore.createIndex('wordId', 'wordId', { unique: false });
          recordStore.createIndex('date', 'date', { unique: false });
        }

        // Version 3: add books store and bookId index on words
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('books')) {
            const bookStore = db.createObjectStore('books', { keyPath: 'id', autoIncrement: true });
            bookStore.createIndex('name', 'name', { unique: false });
          }

          if (db.objectStoreNames.contains('words')) {
            const wordStore = event.target.transaction.objectStore('words');
            if (!wordStore.indexNames.contains('bookId')) {
              wordStore.createIndex('bookId', 'bookId', { unique: false });
            }
          }
        }
      };
    });
  }

  // ===== Migration =====

  async _migrateWordsToBooks() {
    const books = await this.getAllBooks();
    if (books.length === 0) {
      // Create default book
      await this.addBook({ name: '默认单词书', createdAt: Date.now() });
    }

    const allWords = await this.getAllWords();
    const wordsWithoutBook = allWords.filter(w => !w.bookId);
    if (wordsWithoutBook.length === 0) return;

    const defaultBook = (await this.getAllBooks())[0];
    if (!defaultBook) return;

    for (const word of wordsWithoutBook) {
      word.bookId = defaultBook.id;
      await this._putWord(word);
    }
  }

  // ===== Book Operations =====

  async addBook(bookData) {
    await this.init();
    const tx = this.db.transaction('books', 'readwrite');
    const store = tx.objectStore('books');

    return new Promise((resolve, reject) => {
      const request = store.add({ ...bookData, createdAt: Date.now() });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllBooks() {
    await this.init();
    const tx = this.db.transaction('books', 'readonly');
    const store = tx.objectStore('books');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async updateBook(id, updates) {
    await this.init();
    const tx = this.db.transaction('books', 'readwrite');
    const store = tx.objectStore('books');

    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const book = getReq.result;
        if (!book) { reject(new Error('Book not found')); return; }
        const updated = { ...book, ...updates };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async deleteBook(id) {
    await this.init();
    // Move words to default book first
    const books = await this.getAllBooks();
    const defaultBook = books.find(b => b.id !== id) || books[0];

    if (defaultBook) {
      const wordsInBook = await this.getWordsByBook(id);
      for (const word of wordsInBook) {
        word.bookId = defaultBook.id;
        await this._putWord(word);
      }
    }

    const tx = this.db.transaction('books', 'readwrite');
    const store = tx.objectStore('books');

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ===== Word Operations =====

  async addWord(wordData) {
    await this.init();
    const tx = this.db.transaction('words', 'readwrite');
    const store = tx.objectStore('words');

    const data = {
      ...wordData,
      createdAt: Date.now(),
      reviewCount: 0,
      correctCount: 0,
      lastReviewed: null
    };

    return new Promise((resolve, reject) => {
      const request = store.add(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async _putWord(word) {
    await this.init();
    const tx = this.db.transaction('words', 'readwrite');
    const store = tx.objectStore('words');

    return new Promise((resolve, reject) => {
      const request = store.put(word);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async updateWord(id, updates) {
    await this.init();
    const tx = this.db.transaction('words', 'readwrite');
    const store = tx.objectStore('words');

    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const word = getReq.result;
        if (!word) {
          reject(new Error('Word not found'));
          return;
        }
        const updated = { ...word, ...updates };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async deleteWord(id) {
    await this.init();
    const tx = this.db.transaction('words', 'readwrite');
    const store = tx.objectStore('words');

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getWord(id) {
    await this.init();
    const tx = this.db.transaction('words', 'readonly');
    const store = tx.objectStore('words');

    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllWords() {
    await this.init();
    const tx = this.db.transaction('words', 'readonly');
    const store = tx.objectStore('words');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getWordsByBook(bookId) {
    await this.init();
    const tx = this.db.transaction('words', 'readonly');
    const store = tx.objectStore('words');
    const index = store.index('bookId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(bookId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getUnlearnedWords() {
    const allWords = await this.getAllWords();
    return allWords.filter(w => (w.reviewCount || 0) === 0);
  }

  async batchImport(wordsArray, bookId) {
    await this.init();
    const tx = this.db.transaction('words', 'readwrite');
    const store = tx.objectStore('words');

    const promises = wordsArray.map(word => {
      return new Promise((resolve, reject) => {
        const data = {
          ...word,
          bookId: bookId || word.bookId,
          createdAt: Date.now(),
          reviewCount: 0,
          correctCount: 0,
          lastReviewed: null
        };
        const request = store.add(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          if (request.error && request.error.name === 'ConstraintError') {
            resolve(null);
          } else {
            reject(request.error);
          }
        };
      });
    });

    return Promise.all(promises);
  }

  async searchWords(query) {
    const words = await this.getAllWords();
    if (!query) return words;
    const lowerQuery = query.toLowerCase();
    return words.filter(w =>
      w.word.toLowerCase().includes(lowerQuery) ||
      w.meaning.includes(query)
    );
  }

  // ===== Study Record Operations =====

  async recordStudy(wordId, isCorrect) {
    await this.init();
    const tx = this.db.transaction(['words', 'studyRecords'], 'readwrite');
    const wordStore = tx.objectStore('words');
    const recordStore = tx.objectStore('studyRecords');

    const word = await new Promise((resolve, reject) => {
      const req = wordStore.get(wordId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (word) {
      word.reviewCount = (word.reviewCount || 0) + 1;
      if (isCorrect) word.correctCount = (word.correctCount || 0) + 1;
      word.lastReviewed = Date.now();
      wordStore.put(word);
    }

    recordStore.add({
      wordId,
      isCorrect,
      date: Date.now()
    });
  }

  // ===== Data Management =====

  async exportData() {
    const words = await this.getAllWords();
    const books = await this.getAllBooks();
    return JSON.stringify({ words, books }, null, 2);
  }

  async importData(jsonString) {
    const data = JSON.parse(jsonString);
    if (!data.words || !Array.isArray(data.words)) throw new Error('Invalid data format');

    await this.clearAllWords();
    await this.clearAllBooks();

    // Import books first
    const bookMap = new Map(); // oldId -> newId
    if (data.books && Array.isArray(data.books)) {
      for (const book of data.books) {
        const oldId = book.id;
        delete book.id;
        const newId = await this.addBook(book);
        bookMap.set(oldId, newId);
      }
    }

    // If no books in backup, create default
    if (bookMap.size === 0) {
      const defaultId = await this.addBook({ name: '默认单词书', createdAt: Date.now() });
      bookMap.set(null, defaultId);
      bookMap.set(undefined, defaultId);
    }

    const wordsToImport = data.words.map(item => ({
      word: item.word || '',
      meaning: item.meaning || '',
      sentence: item.sentence || '',
      phonetic: item.phonetic || '',
      phoneticUk: item.phoneticUk || '',
      phoneticUs: item.phoneticUs || '',
      pos: item.pos || '',
      currentScore: item.currentScore || 0,
      mastered: item.mastered || false,
      bookId: bookMap.get(item.bookId) || bookMap.values().next().value,
      reviewCount: item.reviewCount || 0,
      correctCount: item.correctCount || 0,
      lastReviewed: item.lastReviewed || null
    }));

    return this.batchImport(wordsToImport);
  }

  async clearAllWords() {
    await this.init();
    const tx = this.db.transaction('words', 'readwrite');
    const store = tx.objectStore('words');

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllBooks() {
    await this.init();
    const tx = this.db.transaction('books', 'readwrite');
    const store = tx.objectStore('books');

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getStats() {
    const words = await this.getAllWords();
    const total = words.length;
    const mastered = words.filter(w => (w.correctCount || 0) >= 3).length;
    return { total, mastered };
  }

  async getBookStats(bookId) {
    const words = await this.getWordsByBook(bookId);
    const total = words.length;
    const mastered = words.filter(w => (w.correctCount || 0) >= 3).length;
    return { total, mastered };
  }
}

export const db = new WordDatabase();
