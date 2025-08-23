import { PopupController } from './PopupController';

// Initialize popup when DOM is loaded
console.log('[SYNAPSE] Popup script loaded, waiting for DOMContentLoaded...');

document.addEventListener('DOMContentLoaded', () => {
  console.log('[SYNAPSE] DOMContentLoaded fired, initializing PopupController...');
  try {
    new PopupController();
    console.log('[SYNAPSE] PopupController created successfully!');
  } catch (error) {
    console.error('[SYNAPSE] Error creating PopupController:', error);
  }
});

console.log('[SYNAPSE] Event listener added for DOMContentLoaded');