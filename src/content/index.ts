/// <reference path="../shared/types.ts" />
import { createSynapseEvent } from './feature-extractor';
import { sendToBackground, EventThrottler } from '../shared/utils';
import { setupScrollMonitoring } from './monitors/ScrollMonitor';
import { setupFocusChangeMonitoring } from './monitors/FocusMonitor';
import { setupClipboardMonitoring } from './monitors/ClipboardMonitor';
import './monitors/TextInputAggregator';
import './monitors/MouseTrajectoryMonitor';

declare var browser: any;

const eventThrottler = new EventThrottler();

// Basic click monitoring
document.addEventListener('click', (event: MouseEvent) => {
  const element = event.target as HTMLElement;
  
  eventThrottler.throttleEvent(event, () => {
    const synapseEvent = createSynapseEvent('ui.click', element, event);
    sendToBackground(synapseEvent);
  });
}, true);

// Basic keyboard monitoring  
document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
    return;
  }

  const target = event.target as HTMLElement;
  eventThrottler.throttleEvent(event, () => {
    const synapseEvent = createSynapseEvent('ui.keydown', target, event);
    sendToBackground(synapseEvent);
  });
}, true);

// Initialize all monitoring
setupScrollMonitoring();
setupFocusChangeMonitoring(); 
setupClipboardMonitoring();

console.log('[Synapse] Content script loaded with complete event monitoring suite.');