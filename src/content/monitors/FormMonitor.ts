import { createSynapseEvent, getCssSelector } from '../feature-extractor';
import { sendToBackground, EventThrottler } from '../../shared/utils';

const eventThrottler = new EventThrottler();

export function setupFormSubmitMonitoring(): void {
  document.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement;
    
    eventThrottler.throttleEvent(event, () => {
      const inputs = form.querySelectorAll('input, textarea, select');
      const requiredFields = form.querySelectorAll('[required]');
      
      const synapseEvent = createSynapseEvent('form.submit', form, event, {
        field_count: inputs.length,
        has_required_fields: requiredFields.length > 0,
        submit_method: form.method || 'GET'
      });

      sendToBackground(synapseEvent);
      console.log('[Synapse] Form submitted:', getCssSelector(form));
    });
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const isSubmitButton = (target as HTMLInputElement).type === 'submit' || 
                          target.getAttribute('type') === 'submit' ||
                          target.textContent?.toLowerCase().includes('submit') ||
                          target.textContent?.toLowerCase().includes('送信');
    
    if (isSubmitButton) {
      const form = target.closest('form');
      if (form) {
        eventThrottler.throttleEvent(event, () => {
          const inputs = form.querySelectorAll('input, textarea, select');
          const requiredFields = form.querySelectorAll('[required]');
          
          const synapseEvent = createSynapseEvent('form.submit', form, event, {
            field_count: inputs.length,
            has_required_fields: requiredFields.length > 0,
            submit_method: form.method || 'GET'
          });

          sendToBackground(synapseEvent);
          console.log('[Synapse] Form submit button clicked:', getCssSelector(form));
        });
      }
    }
  }, true);
}