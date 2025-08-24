import { createSynapseEvent } from '../feature-extractor';
import { sendToBackground, EventThrottler } from '../../shared/utils';

const eventThrottler = new EventThrottler();

export function setupClipboardMonitoring(): void {
  document.addEventListener('copy', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const selection = window.getSelection();
      const hasFormatting = selection && selection.toString() !== selection.toString();
      
      const synapseEvent = createSynapseEvent('ui.clipboard', target, event, {
        operation: 'copy',
        text_length: selection ? selection.toString().length : 0,
        has_formatting: hasFormatting || false
      });

      sendToBackground(synapseEvent);
    });
  }, true);
  
  document.addEventListener('cut', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const selection = window.getSelection();
      
      const synapseEvent = createSynapseEvent('ui.clipboard', target, event, {
        operation: 'cut',
        text_length: selection ? selection.toString().length : 0,
        has_formatting: false
      });

      sendToBackground(synapseEvent);
    });
  }, true);
  
  document.addEventListener('paste', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const clipboardEventData = event.clipboardData;
      const pastedText = clipboardEventData ? clipboardEventData.getData('text') : '';
      const hasFormatting = clipboardEventData ? clipboardEventData.types.includes('text/html') : false;
      
      const synapseEvent = createSynapseEvent('ui.clipboard', target, event, {
        operation: 'paste',
        text_length: pastedText.length,
        has_formatting: hasFormatting
      });

      sendToBackground(synapseEvent);
    });
  }, true);
}