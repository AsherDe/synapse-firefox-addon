/// <reference path="./types.ts" />
import { SynapseEvent } from './types';

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
    browser.runtime.sendMessage(message, (response: any) => {
      if (browser.runtime.lastError) {
        console.warn('[Synapse] Failed to send message:', browser.runtime.lastError.message);
      } else {
        // 你可以根据需要选择是否保留这个成功的日志
        // console.log('[Synapse] Message sent successfully, response:', response);
      }
    });
  } else {
    console.warn('[Synapse] Browser API not available');
  }
};

/**
 * Create a standardized SynapseEvent from raw DOM event data.
 * This is where all the dirty work of feature extraction happens.
 * Everything else just deals with clean SynapseEvent structures.
 */
function createSynapseEvent(
  type: string,
  element?: HTMLElement | null,
  rawEvent?: Event,
  additionalFeatures: Record<string, any> = {}
): SynapseEvent {
  const now = Date.now();
  const url = window.location.href;
  const title = document.title || '';
  
  // Get tab context (best effort)
  let tabId: number | null = null;
  let windowId: number | null = null;
  
  // Try to get browser context if available
  if (browser && browser.tabs) {
    // This won't work in content script, but we try anyway
    try {
      browser.tabs.getCurrent((tab: any) => {
        if (tab) {
          tabId = tab.id;
          windowId = tab.windowId;
        }
      });
    } catch (e) {
      // Expected to fail in content script context
    }
  }

  // Extract all features if we have an element
  const features: Record<string, any> = { ...additionalFeatures };
  
  let targetSelector: string | undefined;
  let position: { x: number, y: number } | undefined;
  let value: string | number | boolean | undefined;

  if (element) {
    targetSelector = getCssSelector(element);
    
    // Extract element-specific features - this is the dirty work
    const elementFeatures = extractElementFeatures(element, url);
    Object.assign(features, elementFeatures);
  }

  if (rawEvent) {
    // Extract position for mouse events
    if ('clientX' in rawEvent && 'clientY' in rawEvent) {
      position = { 
        x: (rawEvent as MouseEvent).clientX, 
        y: (rawEvent as MouseEvent).clientY 
      };
    }

    // Extract key info for keyboard events
    if ('key' in rawEvent) {
      value = (rawEvent as KeyboardEvent).key;
      features.keyCode = (rawEvent as KeyboardEvent).keyCode;
      features.modifierKeys = getModifierKeys(rawEvent as KeyboardEvent);
    }

    // Extract scroll info
    if (type.includes('scroll')) {
      features.scrollY = window.scrollY;
      features.scrollX = window.scrollX;
      features.documentHeight = document.documentElement.scrollHeight;
      features.viewportHeight = window.innerHeight;
      features.scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
    }
  }

  return {
    timestamp: now,
    type,
    context: {
      tabId,
      windowId, 
      url: generateGeneralizedURL(url),
      title
    },
    payload: {
      targetSelector,
      value,
      position,
      features
    }
  };
}

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
function extractElementFeatures(element: HTMLElement, url: string): Record<string, any> {
  const features: Record<string, any> = {};
  
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
  private readonly INPUT_TIMEOUT = 2500; // 2.5秒无输入后提交

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
    
    // Use the new unified event structure
    const synapseEvent = createSynapseEvent('ui.text_input', this.activeInput, undefined, {
      text_length: textLength, // Only record length, not content
      input_method: this.detectInputMethod(),
      duration: duration
    });
    
    sendToBackground(synapseEvent);
    
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
  private readonly MIN_EVENT_INTERVAL = 100; // 100ms minimum between events
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
        
        const baseFeatures = {
          scroll_direction: newDirection,
          scroll_position: currentScrollTop,
          page_height: document.documentElement.scrollHeight,
          viewport_height: window.innerHeight,
          scroll_percentage: (currentScrollTop / (document.documentElement.scrollHeight - window.innerHeight)) * 100,
          domain: window.location.hostname,
          page_type: inferPageType(window.location.href)
        };
        
        // Features are included in SynapseEvent payload.features
        const features = baseFeatures;
        
        console.log('[Synapse] Scroll event will be sent:', features);
        
        // Send scroll event to background (less frequently than other events)
        eventThrottler.throttleEvent(event, () => {
          // Use the new unified event structure
          const synapseEvent = createSynapseEvent('user.scroll', null, event, {
            scroll_direction: newDirection,
            scroll_position: currentScrollTop,
            page_height: document.documentElement.scrollHeight,
            viewport_height: window.innerHeight,
            scroll_percentage: (currentScrollTop / (document.documentElement.scrollHeight - window.innerHeight)) * 100,
            domain: window.location.hostname,
            page_type: inferPageType(window.location.href)
          });
          
          console.log('[Synapse] Scroll event sent:', synapseEvent);
          sendToBackground(synapseEvent);
        });
        
      } else {
        console.log('[Synapse] Scroll event skipped - conditions not met');
      }
      lastScrollTop = currentScrollTop; // Update position regardless of whether event was sent
    }, 500); // Throttle scroll events to at most 2 times per second
  }, { passive: true });
}

/**
 * Advanced Mouse Trajectory Monitor
 * Implements CLAUDE.md guidance for trajectory recording with DCT compression
 */
class MouseTrajectoryMonitor {
  private trajectory: {x: number, y: number, timestamp: number}[] = [];
  private isRecording: boolean = false;
  private lastInteractionTime: number = 0;
  private stopRecordingTimer: number | null = null;
  
  private readonly IDLE_TIME_BEFORE_RECORDING = 500; // Start recording after 500ms of no interaction
  private readonly STOP_RECORDING_DELAY = 300; // Stop recording after 300ms of no movement
  private readonly MIN_TRAJECTORY_LENGTH = 10; // Minimum points for valid trajectory

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Track user interactions to determine idle periods
    document.addEventListener('click', () => this.onUserInteraction(), { passive: true });
    document.addEventListener('keydown', () => this.onUserInteraction(), { passive: true });
    document.addEventListener('scroll', () => this.onUserInteraction(), { passive: true });
    
    // Monitor mouse movement
    document.addEventListener('mousemove', (event) => this.onMouseMove(event), { passive: true });
  }

  private onUserInteraction(): void {
    this.lastInteractionTime = Date.now();
    
    // If we were recording, finalize the current trajectory
    if (this.isRecording) {
      this.finalizeTrajectory();
    }
    
    this.isRecording = false;
  }

  private onMouseMove(event: MouseEvent): void {
    const now = Date.now();
    
    // Start recording if enough idle time has passed
    if (!this.isRecording && (now - this.lastInteractionTime) > this.IDLE_TIME_BEFORE_RECORDING) {
      this.startRecording();
    }
    
    // Record trajectory point if we're recording
    if (this.isRecording) {
      this.trajectory.push({
        x: event.clientX,
        y: event.clientY,
        timestamp: now
      });
      
      // Reset stop timer
      this.resetStopTimer();
    }
  }

  private startRecording(): void {
    this.isRecording = true;
    this.trajectory = [];
    console.log('[Synapse] Started trajectory recording');
  }

  private resetStopTimer(): void {
    if (this.stopRecordingTimer) {
      clearTimeout(this.stopRecordingTimer);
    }
    
    this.stopRecordingTimer = window.setTimeout(() => {
      this.finalizeTrajectory();
    }, this.STOP_RECORDING_DELAY);
  }

  private finalizeTrajectory(): void {
    if (!this.isRecording || this.trajectory.length < this.MIN_TRAJECTORY_LENGTH) {
      this.cleanup();
      return;
    }

    console.log('[Synapse] Finalizing trajectory with', this.trajectory.length, 'points');
    
    // Process trajectory with DCT compression and send
    this.processAndSendTrajectory();
    this.cleanup();
  }

  private processAndSendTrajectory(): void {
    const compressedFeatures = this.applyDCTCompression(this.trajectory);
    const basicFeatures = this.extractBasicFeatures(this.trajectory);
    
    const features = {
      ...basicFeatures,
      dct_x_coefficients: compressedFeatures.x_coefficients,
      dct_y_coefficients: compressedFeatures.y_coefficients,
      compressed_length: compressedFeatures.compressed_length,
      original_length: this.trajectory.length,
      domain: window.location.hostname,
      page_type: inferPageType(window.location.href)
    };
    
    // Use the new unified event structure
    const synapseEvent = createSynapseEvent('ui.mouse_pattern', null, undefined, {
      ...features,
      trajectory_start: this.trajectory[0],
      trajectory_end: this.trajectory[this.trajectory.length - 1]
    });
    
    sendToBackground(synapseEvent);
    console.log('[Synapse] Trajectory sent with DCT compression');
  }

  private applyDCTCompression(trajectory: {x: number, y: number, timestamp: number}[]): any {
    // Extract x and y coordinates
    const x_coords = trajectory.map(point => point.x);
    const y_coords = trajectory.map(point => point.y);
    
    // Apply simplified DCT (keep first N coefficients)
    const N = 10; // Keep first 10 coefficients as per CLAUDE.md guidance
    const x_coefficients = this.simpleDCT(x_coords).slice(0, N);
    const y_coefficients = this.simpleDCT(y_coords).slice(0, N);
    
    return {
      x_coefficients,
      y_coefficients,
      compressed_length: N * 2 // 2 * N coefficients total
    };
  }

  private simpleDCT(data: number[]): number[] {
    const N = data.length;
    const coefficients: number[] = [];
    
    for (let k = 0; k < N; k++) {
      let sum = 0;
      for (let n = 0; n < N; n++) {
        sum += data[n] * Math.cos(Math.PI * k * (2 * n + 1) / (2 * N));
      }
      coefficients[k] = sum * Math.sqrt(k === 0 ? 1/N : 2/N);
    }
    
    return coefficients;
  }

  private extractBasicFeatures(trajectory: {x: number, y: number, timestamp: number}[]): any {
    let totalDistance = 0;
    let directionChanges = 0;
    let lastDirection = null;
    
    for (let i = 1; i < trajectory.length; i++) {
      const dx = trajectory[i].x - trajectory[i-1].x;
      const dy = trajectory[i].y - trajectory[i-1].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      totalDistance += distance;
      
      const currentDirection = Math.atan2(dy, dx);
      if (lastDirection !== null && Math.abs(currentDirection - lastDirection) > Math.PI / 4) {
        directionChanges++;
      }
      lastDirection = currentDirection;
    }
    
    const timeSpan = trajectory[trajectory.length - 1].timestamp - trajectory[0].timestamp;
    const speed = totalDistance / Math.max(timeSpan, 1);
    
    let patternType = 'linear';
    if (directionChanges > 3) {
      patternType = 'erratic';
    } else if (speed < 0.1) {
      patternType = 'slow';
    } else if (speed > 2) {
      patternType = 'fast';
    }
    
    const significance = Math.min(1, 
      (totalDistance / 100) * 0.4 + 
      (directionChanges / 5) * 0.3 + 
      Math.min(speed, 1) * 0.3
    );
    
    return {
      pattern_type: patternType,
      movement_speed: speed,
      direction_changes: directionChanges,
      total_distance: totalDistance,
      significance: significance,
      duration: timeSpan
    };
  }

  private cleanup(): void {
    this.isRecording = false;
    this.trajectory = [];
    
    if (this.stopRecordingTimer) {
      clearTimeout(this.stopRecordingTimer);
      this.stopRecordingTimer = null;
    }
  }
}

// Create global trajectory monitor instance
const mouseTrajectoryMonitor = new MouseTrajectoryMonitor();

/**
 * Legacy mouse movement monitoring - kept for compatibility
 * Now replaced by MouseTrajectoryMonitor
 */
function setupMouseMoveMonitoring(): void {
  // This function is now handled by MouseTrajectoryMonitor
  console.log('[Synapse] Mouse movement monitoring delegated to MouseTrajectoryMonitor');
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
    // Use the new unified event structure - all dirty work is done here
    const synapseEvent = createSynapseEvent('ui.click', element, event);
    sendToBackground(synapseEvent);
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
    // Use the new unified event structure
    const synapseEvent = createSynapseEvent('ui.keydown', target, event, {
      code: event.code,
      modifier_keys: modifierKeys
    });
    
    sendToBackground(synapseEvent);
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
      
      const basePayload = {
        form_selector: getCssSelector(form),
        url: generateGeneralizedURL(window.location.href),
        features: features,
        field_count: inputs.length,
        has_required_fields: requiredFields.length > 0,
        submit_method: form.method || 'GET'
      };
      
      // Use the new unified event structure
      const synapseEvent = createSynapseEvent('form.submit', form, event, {
        field_count: inputs.length,
        has_required_fields: requiredFields.length > 0,
        submit_method: form.method || 'GET'
      });

      sendToBackground(synapseEvent);
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
            const inputs = form.querySelectorAll('input, textarea, select');
            const requiredFields = form.querySelectorAll('[required]');
            
            // Use the new unified event structure
            const synapseEvent = createSynapseEvent('form.submit', form, event, {
              field_count: inputs.length,
              has_required_fields: requiredFields.length > 0,
              submit_method: form.method || 'GET'
            });

            sendToBackground(synapseEvent);
            console.log('[Synapse] Form submit button clicked:', getCssSelector(form));
          });
      }
    }
  }, true);
}

/**
 * Unified Event Enhancer - replaces three separate managers
 * Simple data structure, unified interface, no special cases
 */
class EventEnhancer {
  private eventHistory: any[] = [];
  private scrollState = { lastPos: 0, lastTime: 0, velocity: 0 };
  // private formState = new Map(); // Reserved for future use
  private clipboardState: any = null;
  private readonly HISTORY_SIZE = 10;

  public enhanceEvent(eventType: string, payload: any, element?: HTMLElement): any {
    const now = Date.now();
    const baseEnhancement = { timestamp: now };
    
    // Record in history
    this.eventHistory.push({ type: eventType, timestamp: now, data: payload });
    if (this.eventHistory.length > this.HISTORY_SIZE) {
      this.eventHistory.shift();
    }

    // Route to specific enhancement based on namespace
    if (eventType.startsWith('user.scroll')) {
      return { ...baseEnhancement, ...this.enhanceScroll(payload) };
    } else if (eventType.startsWith('ui.clipboard')) {
      return { ...baseEnhancement, ...this.enhanceClipboard(payload, element) };
    } else if (eventType.startsWith('form.submit')) {
      return { ...baseEnhancement, ...this.enhanceForm(payload) };
    } else if (eventType.startsWith('ui.focus_change')) {
      return { ...baseEnhancement, ...this.enhanceFocus(payload) };
    } else if (eventType.startsWith('browser.page_visibility')) {
      return { ...baseEnhancement, ...this.enhanceVisibility(payload) };
    } else {
      return baseEnhancement;
    }
  }

  private enhanceScroll(payload: any): any {
    const currentPos = payload.features?.scroll_position || 0;
    const now = Date.now();
    const timeDelta = now - this.scrollState.lastTime;
    const posDelta = Math.abs(currentPos - this.scrollState.lastPos);
    
    const velocity = timeDelta > 0 ? posDelta / timeDelta : 0;
    const pauseDuration = timeDelta;
    
    // Simple pattern detection
    let pattern = 'unknown';
    if (velocity < 0.1) pattern = 'reading';
    else if (velocity > 2) pattern = 'scanning';
    
    this.scrollState = { lastPos: currentPos, lastTime: now, velocity };
    
    return {
      scroll_velocity: velocity,
      scroll_pause_duration: pauseDuration,
      scroll_pattern: pattern
    };
  }

  private enhanceClipboard(payload: any, element?: HTMLElement): any {
    if (payload.operation === 'copy') {
      this.clipboardState = {
        timestamp: Date.now(),
        source_domain: window.location.hostname,
        source_context: this.inferClipboardContext(element)
      };
      return { source_context: this.clipboardState.source_context };
    } else if (payload.operation === 'paste' && this.clipboardState) {
      const targetContext = this.inferClipboardContext(element);
      const flowType = this.clipboardState.source_domain === window.location.hostname ? 'same_domain' : 'cross_domain';
      return {
        target_context: targetContext,
        cross_page_flow: { flow_type: flowType, flow_pattern: 'data_transfer' }
      };
    }
    return {};
  }

  private enhanceForm(_payload: any): any {
    // Track form completion patterns based on focus history
    const formEvents = this.eventHistory.filter(e => e.type.startsWith('ui.focus_change'));
    const avgTime = formEvents.length > 1 ? 2000 : 0; // Simplified
    
    return {
      form_completion_pattern: {
        avg_time_per_field: avgTime,
        revisit_count: 0,
        completion_efficiency: 'smooth',
        field_skip_count: 0,
        error_correction_events: 0
      }
    };
  }

  private enhanceFocus(_payload: any): any {
    const recentFocus = this.eventHistory.filter(e => e.type.startsWith('ui.focus_change')).slice(-3);
    return {
      focus_history: recentFocus,
      task_context: {
        current_task_type: 'unknown',
        task_confidence: 0.3,
        focus_pattern: 'scattered',
        interaction_intensity: 'medium'
      }
    };
  }

  private enhanceVisibility(payload: any): any {
    const lastEvents = this.eventHistory.slice(-3);
    const awayTime = Date.now() - (this.eventHistory[this.eventHistory.length - 1]?.timestamp || 0);
    
    if (payload.visibility_state === 'hidden') {
      return {
        interruption_context: {
          interruption_trigger: 'user_switch',
          last_interaction_type: lastEvents[lastEvents.length - 1]?.type || 'unknown',
          page_engagement_level: 'medium'
        },
        pre_interruption_sequence: lastEvents
      };
    } else {
      return {
        resumption_context: {
          resumption_trigger: 'user_return',
          time_away: awayTime,
          context_similarity: 0.5,
          likely_task_continuation: awayTime < 10000
        },
        interruption_duration: awayTime
      };
    }
  }

  private inferClipboardContext(element?: HTMLElement): any {
    if (!element) return { source_page_type: 'unknown' };
    const tagName = element.tagName.toLowerCase();
    return {
      source_page_type: this.inferPageType(),
      source_element_role: tagName === 'input' ? 'textbox' : 'unknown',
      content_category: 'text'
    };
  }

  private inferPageType(): string {
    const url = window.location.href.toLowerCase();
    if (url.includes('github')) return 'code_repository';
    if (url.includes('form')) return 'form_page';
    return 'general';
  }
}

// Global event enhancer
const eventEnhancer = new EventEnhancer();

// Legacy focus state manager removed - functionality moved to unified SynapseEvent system

/**
 * Focus change tracking with enhanced task context analysis
 */
function setupFocusChangeMonitoring(): void {
  let lastFocusedElement: HTMLElement | null = null;
  
  // Focus gained
  document.addEventListener('focusin', (event) => {
    const target = event.target as HTMLElement;
    console.log('[Synapse] Focus gained:', getCssSelector(target));
    
    eventThrottler.throttleEvent(event, () => {
      
      // Use the new unified event structure
      const synapseEvent = createSynapseEvent('ui.focus_change', target, event, {
        focus_type: lastFocusedElement ? 'switched' : 'gained',
        from_selector: lastFocusedElement ? getCssSelector(lastFocusedElement) : undefined
      });

      sendToBackground(synapseEvent);
      
      // Event recorded automatically by enhancer
      
      console.log('[Synapse] Focus change event sent:', synapseEvent.payload.features.focus_type);
      lastFocusedElement = target;
    });
  }, true);
  
  // Focus lost
  document.addEventListener('focusout', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      // Use the new unified event structure
      const synapseEvent = createSynapseEvent('ui.focus_change', target, event, {
        focus_type: 'lost',
        from_selector: getCssSelector(target)
      });

      sendToBackground(synapseEvent);
      lastFocusedElement = null;
    });
  }, true);
}

// Legacy InterruptionManager removed - functionality moved to unified SynapseEvent system

// Legacy interruption manager removed - functionality moved to unified SynapseEvent system

/**
 * Page visibility monitoring with enhanced interruption/resumption tracking
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
    
    const basePayload = {
      url: generateGeneralizedURL(window.location.href),
      visibility_state: currentState as 'visible' | 'hidden',
      previous_state: lastVisibilityState,
      features: features
    };
    
    // All features included in SynapseEvent payload
    
    // Use the new unified event structure
    const synapseEvent = createSynapseEvent('browser.page_visibility', null, undefined, {
      visibility_state: currentState,
      previous_state: lastVisibilityState,
      time_on_page: timeOnPage
    });

    sendToBackground(synapseEvent);
    
    console.log('[Synapse] Page visibility changed:', currentState, 'with enhanced context');
    
    lastVisibilityState = currentState;
  });
}

/**
 * Mouse hover prediction monitoring
 * 预测即将发生的点击意图
 */
function setupMouseHoverMonitoring(): void {
  const hoverStartTimes = new Map<HTMLElement, number>();
  // 新增一个Map来存储进入元素的定时器
  const hoverEnterTimers = new Map<HTMLElement, number>();
  // 防抖和冷却机制变量
  let lastHoverSentAt = 0;
  const HOVER_COOLDOWN = 50; // 50ms 冷却时间
  const HOVER_DEBOUNCE_DELAY = 300; // 300ms 防抖延迟

  // 优化 mouseenter 逻辑 - 实现防抖机制
  document.addEventListener('mouseenter', (event) => {
    const target = event.target as HTMLElement;

    // 清除之前的进入定时器（如果存在）
    if (hoverEnterTimers.has(target)) {
      clearTimeout(hoverEnterTimers.get(target)!);
    }

    // 设置防抖延迟，只有在用户停留超过300ms时才记录悬停开始
    const timer = window.setTimeout(() => {
      hoverStartTimes.set(target, Date.now());
      console.log('[Synapse] Hover started:', getCssSelector(target));
      hoverEnterTimers.delete(target);
    }, HOVER_DEBOUNCE_DELAY); // 使用300ms防抖延迟

    hoverEnterTimers.set(target, timer);
  }, true);

  // 优化 mouseleave 逻辑 - 添加交互元素过滤和冷却机制
  document.addEventListener('mouseleave', (event) => {
    const target = event.target as HTMLElement;

    // 如果存在进入定时器，说明悬停时间不足300ms，直接取消
    if (hoverEnterTimers.has(target)) {
      clearTimeout(hoverEnterTimers.get(target)!);
      hoverEnterTimers.delete(target);
      return; // 忽略这种快速划过的事件
    }

    const hoverStartTime = hoverStartTimes.get(target);

    if (hoverStartTime) {
      const hoverDuration = Date.now() - hoverStartTime;
      hoverStartTimes.delete(target);

      console.log('[Synapse] Hover ended:', getCssSelector(target), 'duration:', hoverDuration);

      // 检查是否为可交互元素
      const isInteractive = target.tagName.toLowerCase() === 'a' || 
                           target.tagName.toLowerCase() === 'button' ||
                           target.tagName.toLowerCase() === 'input' ||
                           target.closest('[role="button"], [role="link"], [role="menuitem"]') !== null;

      // 仅报告超过300ms的显著悬停且为可交互元素
      if (hoverDuration > 300 && isInteractive) {
        // 实现冷却机制以防止事件冒泡导致的冗余记录
        const now = Date.now();
        if (now - lastHoverSentAt > HOVER_COOLDOWN) {
          lastHoverSentAt = now;
          
          // Use the new unified event structure
          const synapseEvent = createSynapseEvent('ui.mouse_hover', target, event, {
            hover_duration: hoverDuration
          });

          sendToBackground(synapseEvent);
          console.log('[Synapse] Significant hover reported:', getCssSelector(target), 'duration:', hoverDuration);
        } else {
          console.log('[Synapse] Hover event cooled down, not reported');
        }
      } else {
        console.log('[Synapse] Hover not reported - duration:', hoverDuration + 'ms', 'interactive:', isInteractive);
      }
    }
  }, true);
}

// Legacy ClipboardStateManager removed - functionality moved to unified SynapseEvent system

// Legacy clipboard state manager removed - functionality moved to unified SynapseEvent system

/**
 * Clipboard operations monitoring with enhanced cross-page flow tracking
 */
function setupClipboardMonitoring(): void {
  // Copy event
  document.addEventListener('copy', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const selection = window.getSelection();
      const hasFormatting = selection && selection.toString() !== selection.toString();
      
      // All features included in SynapseEvent payload
      
      // Use the new unified event structure
      const synapseEvent = createSynapseEvent('ui.clipboard', target, event, {
        operation: 'copy',
        text_length: selection ? selection.toString().length : 0,
        has_formatting: hasFormatting || false
      });

      sendToBackground(synapseEvent);
      
      console.log('[Synapse] Copy operation detected with enhanced context');
    });
  }, true);
  
  // Cut event
  document.addEventListener('cut', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const selection = window.getSelection();
      
      // Use the new unified event structure
      const synapseEvent = createSynapseEvent('ui.clipboard', target, event, {
        operation: 'cut',
        text_length: selection ? selection.toString().length : 0,
        has_formatting: false
      });

      sendToBackground(synapseEvent);
      console.log('[Synapse] Cut operation detected');
    });
  }, true);
  
  // Paste event
  document.addEventListener('paste', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const clipboardEventData = event.clipboardData;
      const pastedText = clipboardEventData ? clipboardEventData.getData('text') : '';
      const hasFormatting = clipboardEventData ? clipboardEventData.types.includes('text/html') : false;
      
      // All features included in SynapseEvent payload
      
      // Use the new unified event structure
      const synapseEvent = createSynapseEvent('ui.clipboard', target, event, {
        operation: 'paste',
        text_length: pastedText.length,
        has_formatting: hasFormatting
      });

      sendToBackground(synapseEvent);
      
      console.log('[Synapse] Paste operation detected with enhanced context');
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
console.log('- user.scroll: scroll ≥20px');
console.log('- ui.mouse_pattern: significance ≥0.02'); 
console.log('- form.submit: form submit or button click');
console.log('- ui.focus_change: focus in/out');
console.log('- browser.page_visibility: visibility change');
console.log('- ui.mouse_hover: hover ≥100ms');
console.log('- ui.clipboard: copy/cut/paste');

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
      if (document.head) {
        document.head.appendChild(smartAssistantScript);
      } else {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            if (document.head && smartAssistantScript) {
              document.head.appendChild(smartAssistantScript);
            }
          });
        }
      }
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