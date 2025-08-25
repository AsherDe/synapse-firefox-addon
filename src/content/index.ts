/// <reference path="../shared/types.ts" />
import { createSynapseEvent } from './feature-extractor';
import { sendToBackground, EventThrottler, getModifierKeys } from '../shared/utils';
import { setupScrollMonitoring } from './monitors/ScrollMonitor';
import { setupFocusChangeMonitoring } from './monitors/FocusMonitor';
import { setupClipboardMonitoring } from './monitors/ClipboardMonitor';
import { setupFormSubmitMonitoring } from './monitors/FormMonitor';
import { setupPageVisibilityMonitoring } from './monitors/VisibilityMonitor';
import { setupMouseHoverMonitoring } from './monitors/HoverMonitor';
import { setupSmartAssistantBridge } from './smart-assistant-bridge';
import { FloatingControlCenter } from './FloatingControlCenter';
import './monitors/TextInputAggregator';
import './monitors/MouseTrajectoryMonitor';

declare var browser: any;

// Context cache to ensure URL and title are always available
export let lastKnownURL = window.location.href;
export let lastKnownTitle = document.title;

const eventThrottler = new EventThrottler();

// Optimized click monitoring
document.addEventListener('click', (event: MouseEvent) => {
  const element = event.target as HTMLElement;
  
  eventThrottler.throttleEvent(event, () => {
    const synapseEvent = createSynapseEvent('ui.click', element, event, {}, lastKnownURL, lastKnownTitle);
    // Quality gate: only send events with valid target selectors
    if (synapseEvent.payload.targetSelector && synapseEvent.payload.targetSelector !== 'unknown') {
      sendToBackground(synapseEvent);
    }
  });
}, true);

// Optimized keyboard monitoring
document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
    return;
  }

  const modifierKeys = getModifierKeys(event);
  
  const isShortcut = modifierKeys.length > 0;
  const isFunctionKey = event.key.startsWith('F') && event.key.length <= 3;
  const isSpecialKey = ['Escape', 'Tab', 'Delete', 'Backspace', 'Insert', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key);
  const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key);
  
  const target = event.target as HTMLElement;
  const isInputField = ['input', 'textarea'].includes(target.tagName.toLowerCase()) || target.contentEditable === 'true';
  const isEnterInInput = event.key === 'Enter' && isInputField;
  
  if (!isShortcut && !isFunctionKey && !isSpecialKey && !isArrowKey && !isEnterInInput) {
    return;
  }

  eventThrottler.throttleEvent(event, () => {
    const synapseEvent = createSynapseEvent('ui.keydown', target, event, {
      code: event.code,
      modifier_keys: modifierKeys
    }, lastKnownURL, lastKnownTitle);
    
    sendToBackground(synapseEvent);
  });
}, true);

export function updateContextCache(): void {
  lastKnownURL = window.location.href;
  lastKnownTitle = document.title;
}

function initializeAdvancedEventMonitoring(): void {
  setupScrollMonitoring();
  
  // Update context cache on key events
  document.addEventListener('DOMContentLoaded', updateContextCache);
  window.addEventListener('popstate', updateContextCache);
  
  // Periodic context cache update for SPA navigation
  setInterval(updateContextCache, 1000);
  
  window.addEventListener('beforeunload', () => {
    // Cleanup throttlers if needed
  });
  
  console.log('[Synapse] Advanced event monitoring initialized with context caching');
}

function initializeAllEventMonitoring(): void {
  initializeAdvancedEventMonitoring();
  
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

// Initialize smart assistant bridge
setupSmartAssistantBridge();

// Initialize floating control center
let floatingControlCenter: FloatingControlCenter | null = null;

function initializeFloatingControlCenter(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      floatingControlCenter = new FloatingControlCenter();
      // Show by default for easy access
      setTimeout(() => {
        if (floatingControlCenter) {
          floatingControlCenter.show();
        }
      }, 1000);
    });
  } else {
    floatingControlCenter = new FloatingControlCenter();
    // Show by default for easy access
    setTimeout(() => {
      if (floatingControlCenter) {
        floatingControlCenter.show();
      }
    }, 1000);
  }
}

// Listen for messages from background script
browser.runtime.onMessage.addListener((message: any) => {
  if (!floatingControlCenter) return;
  
  switch (message.type) {
    case 'SHOW_FLOATING_CONTROL':
      floatingControlCenter.show();
      break;
    case 'HIDE_FLOATING_CONTROL':
      floatingControlCenter.hide();
      break;
    case 'TOGGLE_FLOATING_CONTROL':
      floatingControlCenter.toggle();
      break;
  }
});

// Initialize floating control center
initializeFloatingControlCenter();

console.log('[Synapse] Content script loaded with complete event monitoring suite, smart assistant, and floating control center.');