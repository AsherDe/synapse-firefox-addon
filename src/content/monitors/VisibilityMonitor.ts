import { createSynapseEvent, inferPageType } from '../feature-extractor';
import { sendToBackground, generateGeneralizedURL } from '../../shared/utils';

export function setupPageVisibilityMonitoring(): void {
  let pageLoadTime = Date.now();
  let lastVisibilityState = document.visibilityState;
  
  document.addEventListener('visibilitychange', () => {
    const currentState = document.visibilityState;
    const timeOnPage = Date.now() - pageLoadTime;
    
    const synapseEvent = createSynapseEvent('browser.page_visibility', null, undefined, {
      visibility_state: currentState,
      previous_state: lastVisibilityState,
      time_on_page: timeOnPage
    });

    sendToBackground(synapseEvent);
    
    console.log('[Synapse] Page visibility changed:', currentState, 'with enhanced context');
    
    lastVisibilityState = currentState;
  });
}