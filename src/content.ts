/// <reference path="./types.ts" />

/**
 * Optimized function to generate a stable CSS selector for a given element.
 * Prioritizes stable attributes and limits depth for performance.
 * @param el The element to generate a selector for.
 * @returns A CSS selector string.
 */
function getCssSelector(el: HTMLElement): string {
  if (!(el instanceof Element)) {
    return 'unknown';
  }

  // Selector generation with performance optimizations
  const selectorParts: string[] = [];
  let currentElement = el as Element;
  let depth = 0;
  const maxDepth = 5; // Limit depth for performance

  while (currentElement && currentElement !== document.body && depth < maxDepth) {
    let selector = '';

    // Priority 1: data-testid for stable test attributes
    const testId = currentElement.getAttribute('data-testid') || currentElement.getAttribute('data-test');
    if (testId) {
      return `[data-testid="${testId}"]`;
    }

    // Priority 2: Unique ID
    if (currentElement.id) {
      return `#${currentElement.id}`;
    }

    // Priority 3: Stable attributes (aria-label, role, name)
    const ariaLabel = currentElement.getAttribute('aria-label');
    const role = currentElement.getAttribute('role');
    const name = currentElement.getAttribute('name');
    
    if (ariaLabel && ariaLabel.length < 30) {
      return `[aria-label="${ariaLabel}"]`;
    }
    
    if (role && ['button', 'link', 'textbox', 'checkbox', 'radio'].includes(role)) {
      selector = `[role="${role}"]`;
    } else if (name && name.length < 20) {
      selector = `[name="${name}"]`;
    } else {
      // Fallback to tag name
      selector = currentElement.tagName.toLowerCase();

      // Add class if meaningful and short
      if (currentElement.className && typeof currentElement.className === 'string') {
        const classes = currentElement.className.split(' ')
          .filter(cls => cls.length > 0 && cls.length < 20 && !cls.startsWith('_')) // Filter out generated classes
          .slice(0, 2); // Limit to 2 classes for performance
        
        if (classes.length > 0) {
          selector += '.' + classes.join('.');
        }
      }

      // Add position if needed for disambiguation (performance optimization)
      const siblings = Array.from(currentElement.parentElement?.children || [])
        .filter(sibling => sibling.tagName === currentElement.tagName);
      
      if (siblings.length > 1) {
        const index = siblings.indexOf(currentElement) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    selectorParts.unshift(selector);

    // Move up the DOM tree
    currentElement = currentElement.parentElement as Element;
    depth++;
  }

  // Return the most specific selector we found
  return selectorParts.length > 0 ? selectorParts.join(' > ') : 'unknown';
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
 * Event throttling utility to prevent overwhelming the background script
 */
class EventThrottler {
  private lastEventTime: number = 0;
  private eventQueue: Array<{event: any, callback: () => void}> = [];
  private throttleTimer: number | null = null;
  private readonly MIN_EVENT_INTERVAL = 50; // 50ms minimum between events
  private readonly MAX_QUEUE_SIZE = 20;

  public throttleEvent(event: any, callback: () => void): void {
    const now = Date.now();
    const timeSinceLastEvent = now - this.lastEventTime;

    // If enough time has passed, send immediately
    if (timeSinceLastEvent >= this.MIN_EVENT_INTERVAL && this.eventQueue.length === 0) {
      this.lastEventTime = now;
      callback();
      return;
    }

    // Add to queue
    this.eventQueue.push({ event, callback });
    
    // Limit queue size to prevent memory issues
    if (this.eventQueue.length > this.MAX_QUEUE_SIZE) {
      this.eventQueue.shift(); // Remove oldest event
    }

    // Process queue if not already scheduled
    if (this.throttleTimer === null) {
      this.scheduleQueueProcessing();
    }
  }

  private scheduleQueueProcessing(): void {
    const timeUntilNext = Math.max(0, this.MIN_EVENT_INTERVAL - (Date.now() - this.lastEventTime));
    
    this.throttleTimer = window.setTimeout(() => {
      this.processQueue();
    }, timeUntilNext);
  }

  private processQueue(): void {
    if (this.eventQueue.length === 0) {
      this.throttleTimer = null;
      return;
    }

    // Process the oldest event
    const { callback } = this.eventQueue.shift()!;
    this.lastEventTime = Date.now();
    callback();

    // Schedule next processing if queue is not empty
    if (this.eventQueue.length > 0) {
      this.scheduleQueueProcessing();
    } else {
      this.throttleTimer = null;
    }
  }
}

const eventThrottler = new EventThrottler();

/**
 * Advanced throttling utility for high-frequency events like scroll and mousemove
 */
class AdvancedEventThrottler {
  private throttleTimers: Map<string, number> = new Map();
  private debounceTimers: Map<string, number> = new Map();
  
  /**
   * Throttle function - executes at most once per interval
   */
  public throttle(key: string, func: () => void, delay: number): void {
    if (!this.throttleTimers.has(key)) {
      func();
      this.throttleTimers.set(key, window.setTimeout(() => {
        this.throttleTimers.delete(key);
      }, delay));
    }
  }
  
  /**
   * Debounce function - executes only after delay has passed since last call
   */
  public debounce(key: string, func: () => void, delay: number): void {
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const timer = window.setTimeout(() => {
      func();
      this.debounceTimers.delete(key);
    }, delay);
    
    this.debounceTimers.set(key, timer);
  }
  
  /**
   * Clear all timers (useful for cleanup)
   */
  public cleanup(): void {
    this.throttleTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.throttleTimers.clear();
    this.debounceTimers.clear();
  }
}

const advancedThrottler = new AdvancedEventThrottler();

/**
 * Monitor scroll behavior with throttling
 */
function setupScrollMonitoring(): void {
  let lastScrollTop = 0;
  let scrollDirection = 'none';
  
  document.addEventListener('scroll', (event) => {
    advancedThrottler.throttle('scroll', () => {
      const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const newDirection = currentScrollTop > lastScrollTop ? 'down' : 'up';
      
      // Only send events when scroll direction changes or significant scroll distance
      if (newDirection !== scrollDirection || Math.abs(currentScrollTop - lastScrollTop) > 200) {
        scrollDirection = newDirection;
        
        const features = {
          scroll_direction: newDirection,
          scroll_position: currentScrollTop,
          page_height: document.documentElement.scrollHeight,
          viewport_height: window.innerHeight,
          scroll_percentage: (currentScrollTop / (document.documentElement.scrollHeight - window.innerHeight)) * 100,
          domain: window.location.hostname,
          page_type: inferPageType(window.location.href)
        };
        
        // Send scroll event to background (less frequently than other events)
        eventThrottler.throttleEvent(event, () => {
          const message = {
            type: 'user_action_scroll',
            payload: {
              url: window.location.href,
              features: features,
              timestamp: Date.now()
            }
          };
          
          // Only send if this is a significant scroll action
          chrome.runtime.sendMessage(message);
        });
        
        lastScrollTop = currentScrollTop;
      }
    }, 250); // Throttle scroll events to at most 4 times per second
  }, { passive: true });
}

/**
 * Monitor mouse movement patterns with debouncing
 */
function setupMouseMoveMonitoring(): void {
  let mouseTrail: {x: number, y: number, timestamp: number}[] = [];
  const maxTrailLength = 5;
  
  document.addEventListener('mousemove', (event) => {
    // Use debounce to only process mouse movement after user stops moving for a moment
    advancedThrottler.debounce('mousemove', () => {
      // Add to trail
      mouseTrail.push({
        x: event.clientX,
        y: event.clientY,
        timestamp: Date.now()
      });
      
      // Keep trail size limited
      if (mouseTrail.length > maxTrailLength) {
        mouseTrail.shift();
      }
      
      // Analyze mouse movement pattern
      if (mouseTrail.length >= 3) {
        const pattern = analyzeMousePattern(mouseTrail);
        
        // Only send meaningful mouse patterns
        if (pattern.significance > 0.5) {
          const features = {
            pattern_type: pattern.type,
            movement_speed: pattern.speed,
            direction_changes: pattern.directionChanges,
            total_distance: pattern.totalDistance,
            significance: pattern.significance,
            domain: window.location.hostname,
            page_type: inferPageType(window.location.href)
          };
          
          const message = {
            type: 'user_action_mouse_pattern',
            payload: {
              url: window.location.href,
              features: features,
              trail: mouseTrail.slice(), // Copy of trail
              timestamp: Date.now()
            }
          };
          
          chrome.runtime.sendMessage(message);
          mouseTrail = []; // Reset trail after sending
        }
      }
    }, 200); // Debounce mouse movement analysis
  }, { passive: true });
}

/**
 * Analyze mouse movement pattern
 */
function analyzeMousePattern(trail: {x: number, y: number, timestamp: number}[]): any {
  if (trail.length < 2) {
    return { type: 'none', significance: 0 };
  }
  
  let totalDistance = 0;
  let directionChanges = 0;
  let lastDirection = null;
  
  for (let i = 1; i < trail.length; i++) {
    const dx = trail[i].x - trail[i-1].x;
    const dy = trail[i].y - trail[i-1].y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    totalDistance += distance;
    
    // Calculate direction
    const currentDirection = Math.atan2(dy, dx);
    if (lastDirection !== null && Math.abs(currentDirection - lastDirection) > Math.PI / 4) {
      directionChanges++;
    }
    lastDirection = currentDirection;
  }
  
  const timeSpan = trail[trail.length - 1].timestamp - trail[0].timestamp;
  const speed = totalDistance / Math.max(timeSpan, 1);
  
  // Determine pattern type
  let patternType = 'linear';
  if (directionChanges > 2) {
    patternType = 'erratic';
  } else if (speed < 0.1) {
    patternType = 'slow';
  } else if (speed > 2) {
    patternType = 'fast';
  }
  
  // Calculate significance (how noteworthy this pattern is)
  const significance = Math.min(1, (totalDistance / 100) * (directionChanges / 3) * Math.min(speed, 1));
  
  return {
    type: patternType,
    speed,
    directionChanges,
    totalDistance,
    significance
  };
}

/**
 * Initialize advanced event monitoring
 */
function initializeAdvancedEventMonitoring(): void {
  setupScrollMonitoring();
  setupMouseMoveMonitoring();
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    advancedThrottler.cleanup();
  });
  
  console.log('[Synapse] Advanced event monitoring initialized with throttling and debouncing');
}

/**
 * Captures click events and sends them to the background script.
 * Enhanced with feature extraction and throttling for optimized performance
 */
document.addEventListener('click', (event: MouseEvent) => {
  const element = event.target as HTMLElement;
  
  eventThrottler.throttleEvent(event, () => {
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
  });
}, true); // Use capture phase to ensure all clicks are caught

/**
 * 优化的键盘事件捕捉
 * 现在只捕捉特殊键盘快捷键，而不是所有按键
 * 常规文本输入由TextInputAggregator处理，增加了事件节流
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

  // Use throttler for keyboard events to prevent spam
  eventThrottler.throttleEvent(event, () => {
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
  });
}, true); // Use capture phase

/**
 * Form submission monitoring
 * 标记一个小型任务的完成
 */
function setupFormSubmitMonitoring(): void {
  document.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement;
    
    eventThrottler.throttleEvent(event, () => {
      const features = extractElementFeatures(form, window.location.href);
      
      // Analyze form structure
      const inputs = form.querySelectorAll('input, textarea, select');
      const requiredFields = form.querySelectorAll('[required]');
      
      const formSubmitPayload: UserActionFormSubmitPayload = {
        form_selector: getCssSelector(form),
        url: window.location.href,
        features: features,
        field_count: inputs.length,
        has_required_fields: requiredFields.length > 0,
        submit_method: form.method || 'GET'
      };

      const message: RawUserAction = {
        type: 'user_action_form_submit',
        payload: formSubmitPayload,
      };

      chrome.runtime.sendMessage(message);
      console.log('[Synapse] Form submitted:', getCssSelector(form));
    });
  }, true);
}

/**
 * Focus change tracking
 * 追踪用户的注意力焦点
 */
function setupFocusChangeMonitoring(): void {
  let lastFocusedElement: HTMLElement | null = null;
  
  // Focus gained
  document.addEventListener('focusin', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const features = extractElementFeatures(target, window.location.href);
      
      const focusChangePayload: UserActionFocusChangePayload = {
        from_selector: lastFocusedElement ? getCssSelector(lastFocusedElement) : undefined,
        to_selector: getCssSelector(target),
        url: window.location.href,
        features: features,
        focus_type: lastFocusedElement ? 'switched' : 'gained'
      };

      const message: RawUserAction = {
        type: 'user_action_focus_change',
        payload: focusChangePayload,
      };

      chrome.runtime.sendMessage(message);
      lastFocusedElement = target;
    });
  }, true);
  
  // Focus lost
  document.addEventListener('focusout', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const features = extractElementFeatures(target, window.location.href);
      
      const focusChangePayload: UserActionFocusChangePayload = {
        from_selector: getCssSelector(target),
        to_selector: undefined,
        url: window.location.href,
        features: features,
        focus_type: 'lost'
      };

      const message: RawUserAction = {
        type: 'user_action_focus_change',
        payload: focusChangePayload,
      };

      chrome.runtime.sendMessage(message);
      lastFocusedElement = null;
    });
  }, true);
}

/**
 * Page visibility monitoring
 * 识别工作流的中断与恢复
 */
function setupPageVisibilityMonitoring(): void {
  let pageLoadTime = Date.now();
  let lastVisibilityState = document.visibilityState;
  
  document.addEventListener('visibilitychange', () => {
    const currentState = document.visibilityState;
    const timeOnPage = Date.now() - pageLoadTime;
    
    const features = {
      domain: window.location.hostname,
      page_type: inferPageType(window.location.href),
      time_on_page: timeOnPage
    };
    
    const visibilityPayload: UserActionPageVisibilityPayload = {
      url: window.location.href,
      visibility_state: currentState as 'visible' | 'hidden',
      previous_state: lastVisibilityState,
      features: features
    };

    const message: RawUserAction = {
      type: 'user_action_page_visibility',
      payload: visibilityPayload,
    };

    chrome.runtime.sendMessage(message);
    console.log('[Synapse] Page visibility changed:', currentState, 'time on page:', timeOnPage);
    
    lastVisibilityState = currentState;
  });
}

/**
 * Mouse hover prediction monitoring
 * 预测即将发生的点击意图
 */
function setupMouseHoverMonitoring(): void {
  const hoverStartTimes = new Map<HTMLElement, number>();
  
  document.addEventListener('mouseover', (event) => {
    const target = event.target as HTMLElement;
    
    // Use throttling to prevent excessive hover events
    advancedThrottler.throttle('mouseover', () => {
      hoverStartTimes.set(target, Date.now());
      
      const features = extractElementFeatures(target, window.location.href);
      
      const hoverPayload: UserActionMouseHoverPayload = {
        selector: getCssSelector(target),
        url: window.location.href,
        features: features,
        x: event.clientX,
        y: event.clientY
      };

      const message: RawUserAction = {
        type: 'user_action_mouse_hover',
        payload: hoverPayload,
      };

      chrome.runtime.sendMessage(message);
    }, 100); // Throttle to once per 100ms
  }, true);
  
  // Track hover duration
  document.addEventListener('mouseout', (event) => {
    const target = event.target as HTMLElement;
    const hoverStartTime = hoverStartTimes.get(target);
    
    if (hoverStartTime) {
      const hoverDuration = Date.now() - hoverStartTime;
      hoverStartTimes.delete(target);
      
      // Only report significant hovers (>200ms)
      if (hoverDuration > 200) {
        const features = extractElementFeatures(target, window.location.href);
        
        const hoverPayload: UserActionMouseHoverPayload = {
          selector: getCssSelector(target),
          url: window.location.href,
          features: features,
          hover_duration: hoverDuration,
          x: event.clientX,
          y: event.clientY
        };

        const message: RawUserAction = {
          type: 'user_action_mouse_hover',
          payload: hoverPayload,
        };

        chrome.runtime.sendMessage(message);
        console.log('[Synapse] Significant hover:', getCssSelector(target), 'duration:', hoverDuration);
      }
    }
  }, true);
}

/**
 * Clipboard operations monitoring
 * 理解跨页面的信息流动
 */
function setupClipboardMonitoring(): void {
  // Copy event
  document.addEventListener('copy', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const features = extractElementFeatures(target, window.location.href);
      const selection = window.getSelection();
      const hasFormatting = selection && selection.toString() !== selection.toString();
      
      const clipboardPayload: UserActionClipboardPayload = {
        operation: 'copy',
        url: window.location.href,
        features: features,
        text_length: selection ? selection.toString().length : 0,
        has_formatting: hasFormatting || false
      };

      const message: RawUserAction = {
        type: 'user_action_clipboard',
        payload: clipboardPayload,
      };

      chrome.runtime.sendMessage(message);
      console.log('[Synapse] Copy operation detected');
    });
  }, true);
  
  // Cut event
  document.addEventListener('cut', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const features = extractElementFeatures(target, window.location.href);
      const selection = window.getSelection();
      
      const clipboardPayload: UserActionClipboardPayload = {
        operation: 'cut',
        url: window.location.href,
        features: features,
        text_length: selection ? selection.toString().length : 0,
        has_formatting: false
      };

      const message: RawUserAction = {
        type: 'user_action_clipboard',
        payload: clipboardPayload,
      };

      chrome.runtime.sendMessage(message);
      console.log('[Synapse] Cut operation detected');
    });
  }, true);
  
  // Paste event
  document.addEventListener('paste', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const features = extractElementFeatures(target, window.location.href);
      const clipboardData = event.clipboardData;
      const pastedText = clipboardData ? clipboardData.getData('text') : '';
      const hasFormatting = clipboardData ? clipboardData.types.includes('text/html') : false;
      
      const clipboardPayload: UserActionClipboardPayload = {
        operation: 'paste',
        url: window.location.href,
        features: features,
        text_length: pastedText.length,
        has_formatting: hasFormatting
      };

      const message: RawUserAction = {
        type: 'user_action_clipboard',
        payload: clipboardPayload,
      };

      chrome.runtime.sendMessage(message);
      console.log('[Synapse] Paste operation detected');
    });
  }, true);
}

/**
 * Initialize all event monitoring including new CLAUDE.md patterns
 */
function initializeAllEventMonitoring(): void {
  // Initialize existing advanced monitoring
  initializeAdvancedEventMonitoring();
  
  // Initialize new CLAUDE.md patterns
  setupFormSubmitMonitoring();
  setupFocusChangeMonitoring();
  setupPageVisibilityMonitoring();
  setupMouseHoverMonitoring();
  setupClipboardMonitoring();
  
  console.log('[Synapse] All event monitoring initialized including CLAUDE.md patterns');
}

// Initialize all event monitoring
initializeAllEventMonitoring();

console.log('[Synapse] Content script loaded with complete event monitoring suite.');