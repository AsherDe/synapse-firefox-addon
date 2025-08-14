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
 * Captures keydown events and sends them to the background script.
 * Enhanced with modifier key detection and page feature extraction
 */
document.addEventListener('keydown', (event: KeyboardEvent) => {
  // Ignore modifier keys themselves
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
    return;
  }

  const modifierKeys = getModifierKeys(event);
  const features = extractElementFeatures(event.target as HTMLElement, window.location.href);
  
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