import { createSynapseEvent, getCssSelector } from '../feature-extractor';
import { sendToBackground, EventThrottler } from '../../shared/utils';

const eventThrottler = new EventThrottler();

export function setupClipboardMonitoring(): void {
  document.addEventListener('copy', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const selection = window.getSelection();
      const selectedText = selection ? selection.toString() : '';
      const hasFormatting = selection && selection.toString() !== selection.toString();
      
      // Enhanced clipboard context capture
      const clipboardContext = {
        sourceUrl: window.location.href,
        sourceTitle: document.title,
        sourceSelector: target ? getCssSelector(target) : undefined,
        copiedText: selectedText.substring(0, 500), // Limit size
        timestamp: Date.now()
      };
      
      const synapseEvent = createSynapseEvent('ui.clipboard', target, event, {
        operation: 'copy',
        text_length: selectedText.length,
        has_formatting: hasFormatting || false,
        copied_text: selectedText.substring(0, 100), // Shorter version for features
        source_context: clipboardContext
      });

      // Add clipboard context to event context
      synapseEvent.context.clipboardContext = clipboardContext;

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