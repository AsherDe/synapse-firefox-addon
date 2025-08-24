import { createSynapseEvent, inferPageType } from '../feature-extractor';
import { sendToBackground, EventThrottler, AdvancedEventThrottler } from '../../shared/utils';

const eventThrottler = new EventThrottler();
const advancedThrottler = new AdvancedEventThrottler();

export function setupScrollMonitoring(): void {
  let lastScrollTop = 0;
  let scrollDirection = 'none';
  
  document.addEventListener('scroll', (event) => {
    const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollDistance = Math.abs(currentScrollTop - lastScrollTop);
    
    advancedThrottler.throttle('scroll', () => {
      const newDirection = currentScrollTop > lastScrollTop ? 'down' : 'up';
      
      if (newDirection !== scrollDirection || Math.abs(currentScrollTop - lastScrollTop) > 20) {
        scrollDirection = newDirection;
        
        eventThrottler.throttleEvent(event, () => {
          const synapseEvent = createSynapseEvent('user.scroll', null, event, {
            scroll_direction: newDirection,
            scroll_position: currentScrollTop,
            page_height: document.documentElement.scrollHeight,
            viewport_height: window.innerHeight,
            scroll_percentage: (currentScrollTop / (document.documentElement.scrollHeight - window.innerHeight)) * 100,
            domain: window.location.hostname,
            page_type: inferPageType(window.location.href)
          });
          
          sendToBackground(synapseEvent);
        });
      }
      lastScrollTop = currentScrollTop;
    }, 500);
  }, { passive: true });
}