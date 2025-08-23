declare var browser: any;

// URL generalization function (inlined from url-generalization.ts)
export function generateGeneralizedURL(url: string): string {
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

export const sendToBackground = (message: any) => {
  if (browser && browser.runtime && browser.runtime.sendMessage) {
    browser.runtime.sendMessage(message, (response: any) => {
      if (browser.runtime.lastError) {
        console.warn('[Synapse] Failed to send message:', browser.runtime.lastError.message);
      }
    });
  } else {
    console.warn('[Synapse] Browser API not available');
  }
};

/**
 * Detect keyboard modifier key states
 */
export function getModifierKeys(event: KeyboardEvent): string[] {
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push('ctrl');
  if (event.shiftKey) modifiers.push('shift');
  if (event.altKey) modifiers.push('alt');
  if (event.metaKey) modifiers.push('meta');
  return modifiers;
}

/**
 * Event throttling utility to prevent overwhelming the background script
 */
export class EventThrottler {
  private lastEventTime: number = 0;
  private eventQueue: Array<{event: any, callback: () => void}> = [];
  private throttleTimer: number | null = null;
  private readonly MIN_EVENT_INTERVAL = 100;
  private readonly MAX_QUEUE_SIZE = 30;

  public throttleEvent(event: any, callback: () => void): void {
    const now = Date.now();
    const timeSinceLastEvent = now - this.lastEventTime;
    console.log('[Synapse] EventThrottler:', event.type, 'timeSince:', timeSinceLastEvent, 'queue:', this.eventQueue.length);

    if (timeSinceLastEvent >= this.MIN_EVENT_INTERVAL && this.eventQueue.length === 0) {
      this.lastEventTime = now;
      callback();
      return;
    }

    this.eventQueue.push({ event, callback });
    
    if (this.eventQueue.length > this.MAX_QUEUE_SIZE) {
      this.eventQueue.shift();
    }

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

    const { callback } = this.eventQueue.shift()!;
    this.lastEventTime = Date.now();
    callback();

    if (this.eventQueue.length > 0) {
      this.scheduleQueueProcessing();
    } else {
      this.throttleTimer = null;
    }
  }
}

/**
 * Advanced throttling utility for high-frequency events like scroll and mousemove
 */
export class AdvancedEventThrottler {
  private throttleTimers: Map<string, number> = new Map();
  private debounceTimers: Map<string, number> = new Map();
  
  public throttle(key: string, func: () => void, delay: number): void {
    console.log('[Synapse] AdvancedThrottler throttle:', key, 'hasTimer:', this.throttleTimers.has(key));
    if (!this.throttleTimers.has(key)) {
      func();
      this.throttleTimers.set(key, window.setTimeout(() => {
        this.throttleTimers.delete(key);
      }, delay));
    }
  }
  
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
  
  public cleanup(): void {
    this.throttleTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.throttleTimers.clear();
