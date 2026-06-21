// ===== Web Speech API Service =====

class SpeechService {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voices = [];
    this.preferredVoice = null;
    this.rate = 0.9;
    this.pitch = 1.0;
    this.isSpeaking = false;

    this.loadVoices();
    if (this.synth && this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }
  }

  loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();

    // Prefer high-quality English voices
    this.preferredVoice = this.voices.find(v =>
      v.lang === 'en-US' && (v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'))
    ) || this.voices.find(v =>
      v.lang === 'en-GB' && (v.name.includes('Google') || v.name.includes('Daniel'))
    ) || this.voices.find(v => v.lang === 'en-US')
      || this.voices.find(v => v.lang === 'en-GB')
        || this.voices.find(v => v.lang.startsWith('en'));
  }

  speak(text, options = {}) {
    if (!this.synth || !text) {
      console.warn('Speech synthesis not available');
      return;
    }

    // Cancel current speech
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = options.voice || this.preferredVoice;
    utterance.rate = options.rate || this.rate;
    utterance.pitch = options.pitch || this.pitch;
    utterance.lang = options.lang || 'en-US';
    utterance.volume = options.volume || 1.0;

    utterance.onstart = () => {
      this.isSpeaking = true;
      window.dispatchEvent(new CustomEvent('speech-start', { detail: { text } }));
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      window.dispatchEvent(new CustomEvent('speech-end'));
    };

    utterance.onerror = (e) => {
      this.isSpeaking = false;
      console.error('Speech error:', e);
      window.dispatchEvent(new CustomEvent('speech-end'));
    };

    this.synth.speak(utterance);
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
    }
  }

  autoSpeakWord(word) {
    this.speak(word, { rate: 0.85 });
  }

  speakSentence(sentence) {
    this.speak(sentence, { rate: 0.9 });
  }

  isSupported() {
    return 'speechSynthesis' in window;
  }
}

export const speechService = new SpeechService();
