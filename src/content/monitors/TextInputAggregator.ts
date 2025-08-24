import { getCssSelector, createSynapseEvent, extractElementFeatures } from '../feature-extractor';
import { sendToBackground } from '../../shared/utils';

/**
 * Text Input Aggregator
 * 实现文本输入聚合功能，支持中文/日语等IME输入
 */
export class TextInputAggregator {
  private activeInput: HTMLElement | null = null;
  private inputBuffer: string = '';
  private inputStartTime: number = 0;
  private inputTimer: number | null = null;
  private isComposing: boolean = false;
  private readonly INPUT_TIMEOUT = 2500;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    document.addEventListener('focusin', (event) => {
      const target = event.target as HTMLElement;
      if (this.isInputElement(target)) {
        this.startInputSession(target);
      }
    }, true);

    document.addEventListener('focusout', (event) => {
      const target = event.target as HTMLElement;
      if (this.isInputElement(target) && this.activeInput === target) {
        this.finalizeInput('blur');
      }
    }, true);

    document.addEventListener('compositionstart', (event) => {
      if (event.target === this.activeInput) {
        this.isComposing = true;
        console.log('[Synapse] IME composition started');
      }
    }, true);

    document.addEventListener('compositionupdate', (event) => {
      if (event.target === this.activeInput) {
        console.log('[Synapse] IME composition update:', event.data);
      }
    }, true);

    document.addEventListener('compositionend', (event) => {
      if (event.target === this.activeInput) {
        this.isComposing = false;
        this.appendToBuffer(event.data || '', 'ime');
        console.log('[Synapse] IME composition ended:', event.data);
      }
    }, true);

    document.addEventListener('input', (event) => {
      if (event.target === this.activeInput && !this.isComposing) {
        const inputEvent = event as InputEvent;
        const text = inputEvent.data || '';
        
        let inputMethod = 'keyboard';
        if (inputEvent.inputType === 'insertFromPaste') {
          inputMethod = 'paste';
        } else if (inputEvent.inputType === 'insertCompositionText') {
          inputMethod = 'ime';
        }
        
        this.appendToBuffer(text, inputMethod);
      }
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.target === this.activeInput && event.key === 'Enter' && !this.isComposing) {
        this.finalizeInput('enter');
      }
    }, true);
  }

  private isInputElement(element: HTMLElement): boolean {
    const tagName = element.tagName.toLowerCase();
    const inputTypes = ['text', 'email', 'password', 'search', 'url', 'tel'];
    
    if (tagName === 'textarea') return true;
    if (tagName === 'input') {
      const inputType = (element as HTMLInputElement).type.toLowerCase();
      return inputTypes.includes(inputType);
    }
    if (element.contentEditable === 'true') return true;
    
    return false;
  }

  private startInputSession(element: HTMLElement): void {
    if (this.activeInput) {
      this.finalizeInput('focus_change');
    }

    this.activeInput = element;
    this.inputBuffer = '';
    this.inputStartTime = Date.now();
    this.isComposing = false;
    
    console.log('[Synapse] Started input session on:', getCssSelector(element));
  }

  private appendToBuffer(text: string, inputMethod: string): void {
    if (text) {
      this.inputBuffer += text;
      this.resetInputTimer();
      console.log('[Synapse] Buffer updated:', this.inputBuffer, 'method:', inputMethod);
    }
  }

  private resetInputTimer(): void {
    if (this.inputTimer) {
      clearTimeout(this.inputTimer);
    }
    
    this.inputTimer = window.setTimeout(() => {
      this.finalizeInput('timeout');
    }, this.INPUT_TIMEOUT);
  }

  private finalizeInput(trigger: string): void {
    if (!this.activeInput || !this.inputBuffer.trim()) {
      this.cleanup();
      return;
    }

    const features = extractElementFeatures(this.activeInput, window.location.href);
    
    if (features.is_password_field) {
      console.log('[Synapse] Skipping password field input for privacy');
      this.cleanup();
      return;
    }
    
    const duration = Date.now() - this.inputStartTime;
    const textLength = this.inputBuffer.trim().length;
    
    const synapseEvent = createSynapseEvent('ui.text_input', this.activeInput, undefined, {
      text_length: textLength,
      input_method: this.detectInputMethod(),
      duration: duration
    });
    
    sendToBackground(synapseEvent);
    
    console.log('[Synapse] Text input finalized:', {
      textLength: this.inputBuffer.trim().length,
      trigger,
      duration,
      method: this.detectInputMethod()
    });
    
    this.cleanup();
  }

  private detectInputMethod(): string {
    const text = this.inputBuffer;
    
    if (/[\u4e00-\u9fff]/.test(text)) {
      return 'ime_chinese';
    }
    
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
      return 'ime_japanese';
    }
    
    if (/[\uac00-\ud7af]/.test(text)) {
      return 'ime_korean';
    }
    
    if (/[\u{1f600}-\u{1f64f}\u{1f300}-\u{1f5ff}\u{1f680}-\u{1f6ff}\u{1f700}-\u{1f77f}\u{1f780}-\u{1f7ff}\u{1f800}-\u{1f8ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}]/u.test(text)) {
      return 'emoji';
    }
    
    return 'keyboard';
  }

  private cleanup(): void {
    if (this.inputTimer) {
      clearTimeout(this.inputTimer);
      this.inputTimer = null;
    }
    
    this.activeInput = null;
    this.inputBuffer = '';
    this.inputStartTime = 0;
    this.isComposing = false;
  }
}

export const textInputAggregator = new TextInputAggregator();