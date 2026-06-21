// ===== Custom LLM Service =====
// Generates example sentences via any OpenAI-compatible chat-completions endpoint
// (OpenAI, DeepSeek, Moonshot/Kimi, 通义, local Ollama, gateways, ...).
// Config is stored locally in the browser (localStorage).

const LS_KEY = 'vocab_llm_config';

const DEFAULT_PROMPT =
  '为英文单词 "{word}"（中文释义：{meaning}）写一个自然、地道的英文例句，' +
  '长度 8 到 16 个单词，句子里必须包含该单词。只返回这一句英文，' +
  '不要引号、不要序号、不要中文翻译。';

class LLMService {
  getConfig() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || {};
    } catch {
      return {};
    }
  }

  saveConfig(cfg) {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  }

  isConfigured() {
    const c = this.getConfig();
    return !!(c.url && c.key && c.model);
  }

  buildPrompt(word, meaning) {
    const tpl = (this.getConfig().prompt || '').trim() || DEFAULT_PROMPT;
    return tpl.replace(/\{word\}/g, word).replace(/\{meaning\}/g, meaning || '');
  }

  async generateExample(word, meaning) {
    const c = this.getConfig();
    if (!c.url || !c.key || !c.model) throw new Error('LLM not configured');

    const res = await fetch(c.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.key}`
      },
      body: JSON.stringify({
        model: c.model,
        messages: [{ role: 'user', content: this.buildPrompt(word, meaning) }],
        temperature: 0.7,
        max_tokens: 80
      })
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`LLM ${res.status} ${detail.slice(0, 120)}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    // Strip surrounding quotes / stray whitespace
    return text.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
  }

  /**
   * Generate examples for many words. Concurrency-limited.
   * items: [{ word, meaning }]  ->  Map<word, sentence>
   */
  async batchGenerate(items, onProgress) {
    const results = new Map();
    let done = 0;
    const total = items.length;
    const size = 3;

    for (let i = 0; i < items.length; i += size) {
      const batch = items.slice(i, i + size);
      await Promise.all(batch.map(async (it) => {
        try {
          results.set(it.word, await this.generateExample(it.word, it.meaning));
        } catch (err) {
          console.warn(`LLM example failed for "${it.word}":`, err);
          results.set(it.word, '');
        }
        done++;
        if (onProgress) onProgress(done, total);
      }));
    }

    return results;
  }
}

export const llmService = new LLMService();
