import { createSynapseEvent, getCssSelector } from '../feature-extractor';
import { sendToBackground } from '../../shared/utils';

export function setupMouseHoverMonitoring(): void {
  const hoverStartTimes = new Map<HTMLElement, number>();
  const hoverEnterTimers = new Map<HTMLElement, number>();
  let lastHoverSentAt = 0;
  const HOVER_COOLDOWN = 50;
  const HOVER_DEBOUNCE_DELAY = 300;

  document.addEventListener('mouseenter', (event) => {
    const target = event.target as HTMLElement;

    if (hoverEnterTimers.has(target)) {
      clearTimeout(hoverEnterTimers.get(target)!);
    }

    const timer = window.setTimeout(() => {
      hoverStartTimes.set(target, Date.now());
      console.log('[Synapse] Hover started:', getCssSelector(target));
      hoverEnterTimers.delete(target);
    }, HOVER_DEBOUNCE_DELAY);

    hoverEnterTimers.set(target, timer);
  }, true);

  document.addEventListener('mouseleave', (event) => {
    const target = event.target as HTMLElement;

    if (hoverEnterTimers.has(target)) {
      clearTimeout(hoverEnterTimers.get(target)!);
      hoverEnterTimers.delete(target);
      return;
    }

    const hoverStartTime = hoverStartTimes.get(target);

    if (hoverStartTime) {
      const hoverDuration = Date.now() - hoverStartTime;
      hoverStartTimes.delete(target);

      console.log('[Synapse] Hover ended:', getCssSelector(target), 'duration:', hoverDuration);

      const isInteractive = target.tagName.toLowerCase() === 'a' || 
                           target.tagName.toLowerCase() === 'button' ||
                           target.tagName.toLowerCase() === 'input' ||
                           target.closest('[role="button"], [role="link"], [role="menuitem"]') !== null;

      if (hoverDuration > 300 && isInteractive) {
        const now = Date.now();
        if (now - lastHoverSentAt > HOVER_COOLDOWN) {
          lastHoverSentAt = now;
          
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