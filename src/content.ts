/// <reference path="./types.ts" />

// URL generalization function (inlined from url-generalization.ts)
function generateGeneralizedURL(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(p => p.length > 0);
    
    // Generalize path segments
    const generalizedSegments = pathSegments.map(segment => {
      // Keep common patterns but generalize specific content
      if (/^\d+$/.test(segment)) return '[ID]';
      if (segment.length > 15) return '[CONTENT]';
      if (/^[a-f0-9-]{32,}$/i.test(segment)) return '[HASH]';
      if (/^[a-f0-9-]{8,}$/i.test(segment)) return '[TOKEN]';
      
      // Keep common path keywords
      const commonPaths = ['api', 'admin', 'user', 'users', 'profile', 'settings', 'search', 'login', 'logout', 'home', 'about', 'contact', 'help', 'docs', 'wiki', 'forms', 'post'];
      if (commonPaths.includes(segment.toLowerCase())) {
        return segment.toLowerCase();
      }
      
      // For everything else, use a placeholder
      return '[PATH]';
    });
    
    // Reconstruct URL
    let generalizedURL = `${urlObj.protocol}//${urlObj.hostname}`;
    if (generalizedSegments.length > 0) {
      generalizedURL += '/' + generalizedSegments.join('/');
    }
    
    // Add query parameters in generalized form
    if (urlObj.search) {
      const paramCount = Array.from(urlObj.searchParams.keys()).length;
      if (paramCount > 0) {
        generalizedURL += `?[${paramCount}_PARAMS]`;
      }
    }
    
    // Add fragment indicator
    if (urlObj.hash) {
      generalizedURL += '#[FRAGMENT]';
    }
    
    return generalizedURL;
  } catch (e) {
    return url; // Return original if parsing fails
  }
}

// Browser API compatibility using webextension-polyfill
declare var browser: any; // webextension-polyfill provides this globally

const sendToBackground = (message: any) => {
  if (browser && browser.runtime && browser.runtime.sendMessage) {
    try {
      browser.runtime.sendMessage(message);
      console.log('[Synapse] Message sent successfully');
    } catch (e) {
      console.warn('[Synapse] Failed to send message:', e);
    }
  } else {
    console.warn('[Synapse] Browser API not available');
  }
};

// URLGeneralizationEngine is now defined in url-generalization.ts

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

// Initialize the URL generalization engine
// URL generalization engine now uses static methods

/**
 * Extract generalized features from DOM elements
 * Implements Strategy 1: Feature-based rather than instance-based tokens
 * Now uses advanced URL generalization for enhanced privacy and accuracy
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
  
  // PRIVACY: Check if this is a password field
  if (element.tagName.toLowerCase() === 'input') {
    const inputElement = element as HTMLInputElement;
    features.is_password_field = inputElement.type === 'password' || 
                                 inputElement.autocomplete?.includes('password') ||
                                 inputElement.name?.toLowerCase().includes('password') ||
                                 inputElement.placeholder?.toLowerCase().includes('password');
  } else {
    features.is_password_field = false;
  }
  
  // Use simplified feature extraction (URL generalization engine not needed for basic features)
  const urlObj = new URL(url);
  const urlFeatures = {
    domain: urlObj.hostname,
    domain_hash: simpleStringHash(urlObj.hostname),
    page_type: inferPageType(url, element),
    page_type_confidence: 0.8,
    path_depth: urlObj.pathname.split('/').filter(p => p.length > 0).length,
    path_component_types: ['unknown'],
    path_keywords: [],
    query_param_count: Array.from(urlObj.searchParams.keys()).length,
    query_param_keys: Array.from(urlObj.searchParams.keys()),
    query_param_key_hash: simpleStringHash(Array.from(urlObj.searchParams.keys()).join(',')),
    has_fragment: urlObj.hash.length > 0
  };
  
  function simpleStringHash(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash);
  }
  
  // Map all URL generalization features to GeneralizedEventFeatures
  features.domain = urlFeatures.domain;
  features.domain_hash = urlFeatures.domain_hash;
  features.path_depth = urlFeatures.path_depth;
  features.page_type = urlFeatures.page_type;
  features.page_type_confidence = urlFeatures.page_type_confidence;
  features.path_component_types = urlFeatures.path_component_types;
  features.path_keywords = urlFeatures.path_keywords;
  features.query_param_count = urlFeatures.query_param_count;
  features.query_param_keys = urlFeatures.query_param_keys;
  features.query_param_key_hash = urlFeatures.query_param_key_hash;
  features.has_fragment = urlFeatures.has_fragment;
  
  return features;
}

/**
 * Infer page type using heuristics
 * This function is kept for backward compatibility and now delegates to the advanced URL generalization engine
 */
function inferPageType(url: string, element?: HTMLElement): string {
  const path = url.toLowerCase();
  
  if (path.includes('github')) return 'code_repository';
  if (path.includes('stackoverflow')) return 'qa_forum';
  if (path.includes('/search')) return 'search_results';
  if (path.includes('/login') || path.includes('/signin')) return 'authentication';
  if (path.includes('/settings') || path.includes('/config')) return 'settings';
  
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
    
    // PRIVACY: Skip recording any input from password fields
    if (features.is_password_field) {
      console.log('[Synapse] Skipping password field input for privacy');
      this.cleanup();
      return;
    }
    
    const duration = Date.now() - this.inputStartTime;
    
    // PRIVACY: Only record metadata, never actual text content
    const textLength = this.inputBuffer.trim().length;
    const textInputPayload: UserActionTextInputPayload = {
      text: '', // Never record actual text content for privacy
      selector: getCssSelector(this.activeInput),
      url: generateGeneralizedURL(window.location.href),
      input_method: this.detectInputMethod(),
      features: {
        ...features,
        text_length: textLength // Only record length, not content
      },
      duration: duration
    };

    const message: RawUserAction = {
      type: 'user_action_text_input',
      payload: textInputPayload,
    };

    sendToBackground(message);
    
    console.log('[Synapse] Text input finalized:', {
      textLength: this.inputBuffer.trim().length, // Only log length, not content
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
  private readonly MIN_EVENT_INTERVAL = 20; // 20ms minimum between events
  private readonly MAX_QUEUE_SIZE = 30;

  public throttleEvent(event: any, callback: () => void): void {
    const now = Date.now();
    const timeSinceLastEvent = now - this.lastEventTime;
    console.log('[Synapse] EventThrottler:', event.type, 'timeSince:', timeSinceLastEvent, 'queue:', this.eventQueue.length);

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
    console.log('[Synapse] AdvancedThrottler throttle:', key, 'hasTimer:', this.throttleTimers.has(key));
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
    const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollDistance = Math.abs(currentScrollTop - lastScrollTop);
    console.log('[Synapse] Scroll detected:', currentScrollTop, 'distance:', scrollDistance);
    
    advancedThrottler.throttle('scroll', () => {
      const newDirection = currentScrollTop > lastScrollTop ? 'down' : 'up';
      
      console.log('[Synapse] Scroll throttle check:', 
                  'direction:', newDirection, 'vs', scrollDirection,
                  'distance:', Math.abs(currentScrollTop - lastScrollTop), '> 20?');
      
      // Only send events when scroll direction changes or significant scroll distance (降低门槛)
      if (newDirection !== scrollDirection || Math.abs(currentScrollTop - lastScrollTop) > 20) {
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
        
        console.log('[Synapse] Scroll event will be sent:', features);
        
        // Send scroll event to background (less frequently than other events)
        eventThrottler.throttleEvent(event, () => {
          const message = {
            type: 'user_action_scroll',
            payload: {
              url: generateGeneralizedURL(window.location.href),
              features: features,
              timestamp: Date.now()
            }
          };
          
          console.log('[Synapse] Scroll event sent:', message);
          sendToBackground(message);
        });
        
      } else {
        console.log('[Synapse] Scroll event skipped - conditions not met');
      }
      lastScrollTop = currentScrollTop; // Update position regardless of whether event was sent
    }, 250); // Throttle scroll events to at most 4 times per second
  }, { passive: true });
}

/**
 * Monitor mouse movement patterns with debouncing
 */
function setupMouseMoveMonitoring(): void {
  let mouseTrail: {x: number, y: number, timestamp: number}[] = [];
  const maxTrailLength = 8;
  
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
        
        // Only send meaningful mouse patterns (进一步降低门槛以收集更多数据用于研究)
        if (pattern.significance > 0.02) {
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
              url: generateGeneralizedURL(window.location.href),
              features: features,
              trail: mouseTrail.slice(), // Copy of trail
              timestamp: Date.now()
            }
          };
          
          sendToBackground(message);
          mouseTrail = []; // Reset trail after sending
        }
      }
    }, 100); // Debounce mouse movement analysis - 降低收集频率
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
  
  // Calculate significance (how noteworthy this pattern is) - 调整公式以更容易收集数据
  const significance = Math.min(1, 
    (totalDistance / 30) * 0.5 + // 距离因子，降低门槛
    (directionChanges / 2) * 0.3 + // 方向变化因子
    Math.min(speed * 2, 1) * 0.2 // 速度因子
  );
  
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
      url: generateGeneralizedURL(window.location.href),
      features: features
    };

    const message: RawUserAction = {
      type: 'user_action_click',
      payload: clickPayload,
    };

    sendToBackground(message);
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
      url: generateGeneralizedURL(window.location.href),
      features: features,
      modifier_keys: modifierKeys
    };

    const message: RawUserAction = {
      type: 'user_action_keydown',
      payload: keydownPayload,
    };

    sendToBackground(message);
  });
}, true); // Use capture phase

/**
 * Form submission monitoring
 * 标记一个小型任务的完成
 */
function setupFormSubmitMonitoring(): void {
  // Standard form submit event
  document.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement;
    
    eventThrottler.throttleEvent(event, () => {
      const features = extractElementFeatures(form, window.location.href);
      
      // Analyze form structure
      const inputs = form.querySelectorAll('input, textarea, select');
      const requiredFields = form.querySelectorAll('[required]');
      
      const formSubmitPayload: UserActionFormSubmitPayload = {
        form_selector: getCssSelector(form),
        url: generateGeneralizedURL(window.location.href),
        features: features,
        field_count: inputs.length,
        has_required_fields: requiredFields.length > 0,
        submit_method: form.method || 'GET'
      };

      const message: RawUserAction = {
        type: 'user_action_form_submit',
        payload: formSubmitPayload,
      };

      sendToBackground(message);
      console.log('[Synapse] Form submitted:', getCssSelector(form));
    });
  }, true);

  // Also monitor submit button clicks as fallback
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const isSubmitButton = (target as HTMLInputElement).type === 'submit' || 
                          target.getAttribute('type') === 'submit' ||
                          target.textContent?.toLowerCase().includes('submit') ||
                          target.textContent?.toLowerCase().includes('送信');
    
    if (isSubmitButton) {
      const form = target.closest('form');
      if (form) {
        eventThrottler.throttleEvent(event, () => {
            const features = extractElementFeatures(form, window.location.href);
            const inputs = form.querySelectorAll('input, textarea, select');
            const requiredFields = form.querySelectorAll('[required]');
            
            const formSubmitPayload: UserActionFormSubmitPayload = {
              form_selector: getCssSelector(form),
              url: generateGeneralizedURL(window.location.href),
              features: features,
              field_count: inputs.length,
              has_required_fields: requiredFields.length > 0,
              submit_method: form.method || 'GET'
            };

            const message: RawUserAction = {
              type: 'user_action_form_submit',
              payload: formSubmitPayload,
            };

            sendToBackground(message);
            console.log('[Synapse] Form submit button clicked:', getCssSelector(form));
          });
      }
    }
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
    console.log('[Synapse] Focus gained:', getCssSelector(target));
    
    eventThrottler.throttleEvent(event, () => {
      const features = extractElementFeatures(target, window.location.href);
      
      const focusChangePayload: UserActionFocusChangePayload = {
        from_selector: lastFocusedElement ? getCssSelector(lastFocusedElement) : undefined,
        to_selector: getCssSelector(target),
        url: generateGeneralizedURL(window.location.href),
        features: features,
        focus_type: lastFocusedElement ? 'switched' : 'gained'
      };

      const message: RawUserAction = {
        type: 'user_action_focus_change',
        payload: focusChangePayload,
      };

      sendToBackground(message);
      console.log('[Synapse] Focus change event sent:', focusChangePayload.focus_type, 'to', getCssSelector(target));
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
        url: generateGeneralizedURL(window.location.href),
        features: features,
        focus_type: 'lost'
      };

      const message: RawUserAction = {
        type: 'user_action_focus_change',
        payload: focusChangePayload,
      };

      sendToBackground(message);
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
      url: generateGeneralizedURL(window.location.href),
      visibility_state: currentState as 'visible' | 'hidden',
      previous_state: lastVisibilityState,
      features: features
    };

    const message: RawUserAction = {
      type: 'user_action_page_visibility',
      payload: visibilityPayload,
    };

    sendToBackground(message);
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
  
  // Start tracking hover without throttling to ensure proper event pairing
  document.addEventListener('mouseenter', (event) => {
    const target = event.target as HTMLElement;
    hoverStartTimes.set(target, Date.now());
    console.log('[Synapse] Hover started:', getCssSelector(target));
  }, true);
  
  // Track hover duration and send event on mouseleave
  document.addEventListener('mouseleave', (event) => {
    const target = event.target as HTMLElement;
    const hoverStartTime = hoverStartTimes.get(target);
    
    if (hoverStartTime) {
      const hoverDuration = Date.now() - hoverStartTime;
      hoverStartTimes.delete(target);
      
      console.log('[Synapse] Hover ended:', getCssSelector(target), 'duration:', hoverDuration);
      
      // Only report significant hovers (>100ms)
      if (hoverDuration > 100) {
        const features = extractElementFeatures(target, window.location.href);
        
        const hoverPayload: UserActionMouseHoverPayload = {
          selector: getCssSelector(target),
          url: generateGeneralizedURL(window.location.href),
          features: features,
          hover_duration: hoverDuration,
          x: event.clientX,
          y: event.clientY
        };

        const message: RawUserAction = {
          type: 'user_action_mouse_hover',
          payload: hoverPayload,
        };

        sendToBackground(message);
        console.log('[Synapse] Significant hover reported:', getCssSelector(target), 'duration:', hoverDuration);
      } else {
        console.log('[Synapse] Hover too short, not reported:', hoverDuration + 'ms');
      }
    } else {
      console.log('[Synapse] No start time found for mouseout on:', getCssSelector(target));
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
        url: generateGeneralizedURL(window.location.href),
        features: features,
        text_length: selection ? selection.toString().length : 0,
        has_formatting: hasFormatting || false
      };

      const message: RawUserAction = {
        type: 'user_action_clipboard',
        payload: clipboardPayload,
      };

      sendToBackground(message);
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
        url: generateGeneralizedURL(window.location.href),
        features: features,
        text_length: selection ? selection.toString().length : 0,
        has_formatting: false
      };

      const message: RawUserAction = {
        type: 'user_action_clipboard',
        payload: clipboardPayload,
      };

      sendToBackground(message);
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
        url: generateGeneralizedURL(window.location.href),
        features: features,
        text_length: pastedText.length,
        has_formatting: hasFormatting
      };

      const message: RawUserAction = {
        type: 'user_action_clipboard',
        payload: clipboardPayload,
      };

      sendToBackground(message);
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

// Add debug logging for missing events
console.log('[Synapse] All event monitoring initialized. Expected events:');
console.log('- user_action_scroll: scroll ≥20px');
console.log('- user_action_mouse_pattern: significance ≥0.02'); 
console.log('- user_action_form_submit: form submit or button click');
console.log('- user_action_focus_change: focus in/out');
console.log('- user_action_page_visibility: visibility change');
console.log('- user_action_mouse_hover: hover ≥100ms');
console.log('- user_action_clipboard: copy/cut/paste');

// Initialize smart assistant
let smartAssistantScript: HTMLScriptElement | null = null;

function initializeSmartAssistant(): void {
  // Check if smart assistant is enabled
  if (browser && browser.storage) {
    browser.storage.local.get(['assistantEnabled'], (result: any) => {
    const isEnabled = result.assistantEnabled !== false; // Default to true
    
    if (isEnabled && !smartAssistantScript) {
      // Load smart assistant script
      smartAssistantScript = document.createElement('script');
      if (browser && browser.runtime && browser.runtime.getURL) {
        smartAssistantScript.src = browser.runtime.getURL('dist/smart-assistant.js');
      }
      smartAssistantScript.onload = () => {
        console.log('[Synapse] Smart assistant loaded');
      };
      smartAssistantScript.onerror = (error) => {
        console.error('[Synapse] Failed to load smart assistant:', error);
      };
      document.head.appendChild(smartAssistantScript);
    } else if (!isEnabled && smartAssistantScript) {
      // Remove smart assistant if disabled
      smartAssistantScript.remove();
      smartAssistantScript = null;
      
      // Also remove the assistant UI if it exists
      const assistantElement = document.getElementById('synapse-smart-assistant');
      if (assistantElement) {
        assistantElement.remove();
      }
      
      console.log('[Synapse] Smart assistant disabled and removed');
    }
    });
  }
}

// Listen for messages from smart assistant in page context
window.addEventListener('message', async (event: MessageEvent) => {
  if (event.source === window && event.data._source === 'smart-assistant') {
    const { type, _messageId } = event.data;
    
    try {
      let response = null;
      
      switch (type) {
        case 'smart-assistant-ready':
          console.log('[Synapse] Smart assistant ready');
          break;
          
        case 'storage-get':
          if (browser?.storage?.local) {
            const result = await new Promise(resolve => {
              browser.storage.local.get(event.data.keys, resolve);
            });
            response = result;
          }
          break;
          
        case 'storage-set':
          if (browser?.storage?.local) {
            await new Promise(resolve => {
              browser.storage.local.set(event.data.data, resolve);
            });
            response = { success: true };
          }
          break;
          
        default:
          // Forward other messages to background script
          if (browser?.runtime) {
            response = await new Promise(resolve => {
              browser.runtime.sendMessage(event.data, resolve);
            });
          }
          break;
      }
      
      // Send response back to smart assistant
      window.postMessage({
        _responseId: _messageId,
        response: response
      }, '*');
      
    } catch (error) {
      window.postMessage({
        _responseId: _messageId,
        error: String(error)
      }, '*');
    }
  }
});

// Listen for messages from background script
if (browser && browser.runtime) {
  browser.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
    if (message.type === 'guidanceToggled') {
      // Re-initialize smart assistant based on new setting
      setTimeout(() => {
        initializeSmartAssistant();
      }, 100);
    } else if (message.type === 'generalizeURL') {
      // Handle URL generalization request from background script
      try {
        const generalizedURL = generateGeneralizedURL(message.url);
        sendResponse({ success: true, generalizedURL });
      } catch (error) {
        sendResponse({ success: false, error: String(error) });
      }
      return true; // Keep message channel open for async response
    } else {
      // Forward other messages to smart assistant in page context
      window.postMessage({
        _target: 'smart-assistant',
        _fromBackground: true,
        message: message
      }, '*');
    }
  });
}

// Initialize smart assistant
initializeSmartAssistant();

console.log('[Synapse] Content script loaded with complete event monitoring suite and smart assistant.');