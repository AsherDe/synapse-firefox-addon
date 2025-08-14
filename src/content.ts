import { RawUserAction, UserActionClickPayload, UserActionKeydownPayload } from './types';

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
 * Captures click events and sends them to the background script.
 */
document.addEventListener('click', (event: MouseEvent) => {
  const clickPayload: UserActionClickPayload = {
    selector: getCssSelector(event.target as HTMLElement),
    x: event.clientX,
    y: event.clientY,
    url: window.location.href,
  };

  const message: RawUserAction = {
    type: 'user_action_click',
    payload: clickPayload,
  };

  chrome.runtime.sendMessage(message);
}, true); // Use capture phase to ensure all clicks are caught

/**
 * Captures keydown events and sends them to the background script.
 */
document.addEventListener('keydown', (event: KeyboardEvent) => {
  // Ignore modifier keys themselves
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
    return;
  }

  const keydownPayload: UserActionKeydownPayload = {
    key: event.key,
    code: event.code,
    url: window.location.href,
  };

  const message: RawUserAction = {
    type: 'user_action_keydown',
    payload: keydownPayload,
  };

  chrome.runtime.sendMessage(message);
}, true); // Use capture phase

console.log('[Synapse] Content script loaded and listening for events.');