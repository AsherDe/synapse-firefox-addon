import { createSynapseEvent, getCssSelector } from '../feature-extractor';
import { sendToBackground, EventThrottler } from '../../shared/utils';

const eventThrottler = new EventThrottler();

export function setupFocusChangeMonitoring(): void {
  let lastFocusedElement: HTMLElement | null = null;
  
  document.addEventListener('focusin', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const synapseEvent = createSynapseEvent('ui.focus_change', target, event, {
        focus_type: lastFocusedElement ? 'switched' : 'gained',
        from_selector: lastFocusedElement ? getCssSelector(lastFocusedElement) : undefined
      });

      sendToBackground(synapseEvent);
      lastFocusedElement = target;
    });
  }, true);
  
  document.addEventListener('focusout', (event) => {
    const target = event.target as HTMLElement;
    
    eventThrottler.throttleEvent(event, () => {
      const synapseEvent = createSynapseEvent('ui.focus_change', target, event, {
        focus_type: 'lost',
        from_selector: getCssSelector(target)
      });

      sendToBackground(synapseEvent);
      lastFocusedElement = null;
    });
  }, true);
}