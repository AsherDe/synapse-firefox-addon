/// <reference path="./types.ts" />

/**
 * A simplified function to generate a CSS selector for a given element.
 * Tries to use ID, then classes, then falls back to tag name.
 * This is a basic implementation for demonstration purposes.
 * @param el The element to generate a selector for.
 * @returns A CSS selector string.
 */
function getCssSelector(el: HTMLElement): string {
  if (!(el instanceof Element)) {
    return 'unknown';
  }
  if (el.id) {
    return `#${el.id}`;
  }
  if (el.className && typeof el.className === 'string') {
    // Return the first class name, simplified
    const firstClass = el.className.split(' ')[0];
    return `${el.tagName.toLowerCase()}.${firstClass}`;
  }
  return el.tagName.toLowerCase();
}

/**
 * Extract generalized features from DOM elements
 * Implements Strategy 1: Feature-based rather than instance-based tokens
 */
function extractElementFeatures(element: HTMLElement, url: string): GeneralizedEventFeatures {
  const features: GeneralizedEventFeatures = {};
  
  // Extract element role
  if (element.getAttribute('role')) {
    features.element_role = element.getAttribute('role')!;
  } else {
    // Infer role from tag name
    const tagName = element.tagName.toLowerCase();
    switch (tagName) {
      case 'button':
      case 'input':
        if ((element as HTMLInputElement).type === 'submit') {
          features.element_role = 'button';
        } else if ((element as HTMLInputElement).type === 'text' || (element as HTMLInputElement).type === 'email') {
          features.element_role = 'textbox';
        } else {
          features.element_role = tagName;
        }
        break;
      case 'a':
        features.element_role = 'link';
        break;
      case 'textarea':
        features.element_role = 'textbox';
        break;
      default:
        features.element_role = tagName;
    }
  }
  
  // Extract and normalize element text
  const text = element.textContent || element.getAttribute('value') || element.getAttribute('placeholder') || '';
  features.element_text = text.toLowerCase().trim().substring(0, 50); // Limit length and normalize case
  
  // Determine if this is a navigation link
  if (element.tagName.toLowerCase() === 'a') {
    const href = element.getAttribute('href');
    if (href) {
      try {
        const linkUrl = new URL(href, url);
        const currentUrl = new URL(url);
        features.is_nav_link = linkUrl.hostname !== currentUrl.hostname || 
                              href.startsWith('#') || 
                              element.textContent?.toLowerCase().includes('nav') ||
                              element.className.toLowerCase().includes('nav');
      } catch {
        features.is_nav_link = false;
      }
    }
  } else {
    features.is_nav_link = false;
  }
  
  // Determine if this is an input field
  features.is_input_field = ['input', 'textarea', 'select'].includes(element.tagName.toLowerCase());
  
  // Extract page information
  const urlObj = new URL(url);
  features.domain = urlObj.hostname;
  features.path_depth = urlObj.pathname.split('/').filter(p => p.length > 0).length;
  
  // Heuristic page type inference
  features.page_type = inferPageType(url, element);
  
  return features;
}

/**
 * Infer page type using heuristics
 */
function inferPageType(url: string, element?: HTMLElement): string {
  const urlLower = url.toLowerCase();
  const pathname = new URL(url).pathname.toLowerCase();
  
  // GitHub-specific patterns
  if (url.includes('github.com')) {
    if (pathname.includes('/issues')) return 'issue_tracker';
    if (pathname.includes('/pull')) return 'pull_request';
    if (pathname.includes('/blob') || pathname.includes('/tree')) return 'code_browser';
    return 'code_repository';
  }
  
  // General patterns
  if (urlLower.includes('login') || urlLower.includes('signin') || urlLower.includes('auth')) {
    return 'authentication';
  }
  if (urlLower.includes('search') || urlLower.includes('query')) {
    return 'search_results';
  }
  if (urlLower.includes('settings') || urlLower.includes('preferences') || urlLower.includes('config')) {
    return 'settings';
  }
  if (urlLower.includes('profile') || urlLower.includes('user') || urlLower.includes('account')) {
    return 'user_profile';
  }
  if (urlLower.includes('admin') || urlLower.includes('dashboard')) {
    return 'dashboard';
  }
  if (pathname.includes('/edit') || (element && (element.tagName.toLowerCase() === 'textarea' || 
      (element.tagName.toLowerCase() === 'input' && (element as HTMLInputElement).type === 'text')))) {
    return 'editor';
  }
  
  return 'general';
}

/**
 * Detect keyboard modifier key states
 */
function getModifierKeys(event: KeyboardEvent): string[] {
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push('ctrl');
  if (event.shiftKey) modifiers.push('shift');
  if (event.altKey) modifiers.push('alt');
  if (event.metaKey) modifiers.push('meta');
  return modifiers;
}

/**
 * Text Input Aggregator
 * 实现文本输入聚合功能，支持中文/日语等IME输入
 */
class TextInputAggregator {
  private activeInput: HTMLElement | null = null;
  private inputBuffer: string = '';
  private inputStartTime: number = 0;
  private inputTimer: number | null = null;
  private isComposing: boolean = false;
  private readonly INPUT_TIMEOUT = 1000; // 1秒无输入后提交

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // 输入字段获得焦点
    document.addEventListener('focusin', (event) => {
      const target = event.target as HTMLElement;
      if (this.isInputElement(target)) {
        this.startInputSession(target);
      }
    }, true);

    // 输入字段失去焦点
    document.addEventListener('focusout', (event) => {
      const target = event.target as HTMLElement;
      if (this.isInputElement(target) && this.activeInput === target) {
        this.finalizeInput('blur');
      }
    }, true);

    // IME组合开始 (中文、日语等)
    document.addEventListener('compositionstart', (event) => {
      if (event.target === this.activeInput) {
        this.isComposing = true;
        console.log('[Synapse] IME composition started');
      }
    }, true);

    // IME组合更新
    document.addEventListener('compositionupdate', (event) => {
      if (event.target === this.activeInput) {
        console.log('[Synapse] IME composition update:', event.data);
      }
    }, true);

    // IME组合结束
    document.addEventListener('compositionend', (event) => {
      if (event.target === this.activeInput) {
        this.isComposing = false;
        this.appendToBuffer(event.data || '', 'ime');
        console.log('[Synapse] IME composition ended:', event.data);
      }
    }, true);

    // 输入事件（包括IME结果）
    document.addEventListener('input', (event) => {
      if (event.target === this.activeInput && !this.isComposing) {
        const inputEvent = event as InputEvent;
        const text = inputEvent.data || '';
        
        // 检测输入类型
        let inputMethod = 'keyboard';
        if (inputEvent.inputType === 'insertFromPaste') {
          inputMethod = 'paste';
        } else if (inputEvent.inputType === 'insertCompositionText') {
          inputMethod = 'ime';
        }
        
        this.appendToBuffer(text, inputMethod);
      }
    }, true);

    // Enter键提交
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
    // 如果有正在进行的输入会话，先完成它
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
    const duration = Date.now() - this.inputStartTime;
    
    const textInputPayload: UserActionTextInputPayload = {
      text: this.inputBuffer.trim(),
      selector: getCssSelector(this.activeInput),
      url: window.location.href,
      input_method: this.detectInputMethod(),
      features: features,
      duration: duration
    };

    const message: RawUserAction = {
      type: 'user_action_text_input',
      payload: textInputPayload,
    };

    chrome.runtime.sendMessage(message);
    
    console.log('[Synapse] Text input finalized:', {
      text: this.inputBuffer.trim(),
      trigger,
      duration,
      method: this.detectInputMethod()
    });
    
    this.cleanup();
  }

  private detectInputMethod(): string {
    // 简单的输入方法检测
    const text = this.inputBuffer;
    
    // 检测中文字符
    if (/[\u4e00-\u9fff]/.test(text)) {
      return 'ime_chinese';
    }
    
    // 检测日文字符
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
      return 'ime_japanese';
    }
    
    // 检测韩文字符
    if (/[\uac00-\ud7af]/.test(text)) {
      return 'ime_korean';
    }
    
    // 检测表情符号
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

// 创建全局文本输入聚合器实例
const textInputAggregator = new TextInputAggregator();

/**
 * Captures click events and sends them to the background script.
 * Enhanced with feature extraction for generalized event processing
 */
document.addEventListener('click', (event: MouseEvent) => {
  const element = event.target as HTMLElement;
  const features = extractElementFeatures(element, window.location.href);
  
  const clickPayload: ExtendedUserActionClickPayload = {
    selector: getCssSelector(element),
    x: event.clientX,
    y: event.clientY,
    url: window.location.href,
    features: features
  };

  const message: RawUserAction = {
    type: 'user_action_click',
    payload: clickPayload,
  };

  chrome.runtime.sendMessage(message);
}, true); // Use capture phase to ensure all clicks are caught

/**
 * 优化的键盘事件捕捉
 * 现在只捕捉特殊键盘快捷键，而不是所有按键
 * 常规文本输入由TextInputAggregator处理
 */
document.addEventListener('keydown', (event: KeyboardEvent) => {
  // 忽略修饰键本身
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
    return;
  }

  const modifierKeys = getModifierKeys(event);
  
  // 只捕捉有修饰键的快捷键或特殊功能键
  const isShortcut = modifierKeys.length > 0;
  const isFunctionKey = event.key.startsWith('F') && event.key.length <= 3; // F1-F12
  const isSpecialKey = ['Escape', 'Tab', 'Delete', 'Backspace', 'Insert', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key);
  const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key);
  
  // 对于输入字段中的Enter键，让TextInputAggregator处理
  const target = event.target as HTMLElement;
  const isInputField = ['input', 'textarea'].includes(target.tagName.toLowerCase()) || target.contentEditable === 'true';
  const isEnterInInput = event.key === 'Enter' && isInputField;
  
  if (!isShortcut && !isFunctionKey && !isSpecialKey && !isArrowKey && !isEnterInInput) {
    return; // 跳过常规字符输入，让TextInputAggregator处理
  }

  const features = extractElementFeatures(target, window.location.href);
  
  const keydownPayload: ExtendedUserActionKeydownPayload = {
    key: event.key,
    code: event.code,
    url: window.location.href,
    features: features,
    modifier_keys: modifierKeys
  };

  const message: RawUserAction = {
    type: 'user_action_keydown',
    payload: keydownPayload,
  };

  chrome.runtime.sendMessage(message);
}, true); // Use capture phase

console.log('[Synapse] Content script loaded and listening for events.');