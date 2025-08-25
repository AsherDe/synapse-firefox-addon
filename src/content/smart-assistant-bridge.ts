import { generateGeneralizedURL } from '../shared/utils';

declare var browser: any;

let smartAssistantScript: HTMLScriptElement | null = null;

function initializeSmartAssistant(): void {
  if (browser && browser.storage) {
    browser.storage.local.get(['assistantEnabled'], (result: any) => {
    const isEnabled = result.assistantEnabled !== false;
    
    if (isEnabled && !smartAssistantScript) {
      smartAssistantScript = document.createElement('script');
      if (browser && browser.runtime && browser.runtime.getURL) {
        smartAssistantScript.src = browser.runtime.getURL('dist/smart-assistant.js');
      }
      smartAssistantScript.onload = () => {
        console.log('[Synapse] Smart assistant loaded');
      };
      smartAssistantScript.onerror = (error) => {
        console.error('[Synapse] Failed to load smart assistant:', error);
      };
      if (document.head) {
        document.head.appendChild(smartAssistantScript);
      } else {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            if (document.head && smartAssistantScript) {
              document.head.appendChild(smartAssistantScript);
            }
          });
        }
      }
    } else if (!isEnabled && smartAssistantScript) {
      smartAssistantScript.remove();
      smartAssistantScript = null;
      
      const assistantElement = document.getElementById('synapse-smart-assistant');
      if (assistantElement) {
        assistantElement.remove();
      }
      
      console.log('[Synapse] Smart assistant disabled and removed');
    }
    });
  }
}

export function setupSmartAssistantBridge(): void {
  // Listen for messages from smart assistant in page context
  window.addEventListener('message', async (event: MessageEvent) => {
    if (event.source === window && event.data._source === 'smart-assistant') {
      const { type, _messageId } = event.data;
      
      try {
        let response = null;
        
        switch (type) {
          case 'smart-assistant-ready':
            console.log('[Synapse] Smart assistant ready');
            break;
            
          case 'storage-get':
            if (browser?.storage?.local) {
              const result = await new Promise(resolve => {
                browser.storage.local.get(event.data.keys, resolve);
              });
              response = result;
            }
            break;
            
          case 'storage-set':
            if (browser?.storage?.local) {
              await new Promise(resolve => {
                browser.storage.local.set(event.data.data, resolve);
              });
              response = { success: true };
            }
            break;
            
          default:
            if (browser?.runtime) {
              response = await new Promise(resolve => {
                browser.runtime.sendMessage(event.data, resolve);
              });
            }
            break;
        }
        
        window.postMessage({
          _responseId: _messageId,
          response: response
        }, '*');
        
      } catch (error) {
        window.postMessage({
          _responseId: _messageId,
          error: String(error)
        }, '*');
      }
    }
  });

  // Listen for messages from background script
  if (browser && browser.runtime) {
    browser.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
      if (message.type === 'guidanceToggled') {
        setTimeout(() => {
          initializeSmartAssistant();
        }, 100);
      } else if (message.type === 'generalizeURL') {
        try {
          const generalizedURL = generateGeneralizedURL(message.url);
          sendResponse({ success: true, generalizedURL });
        } catch (error) {
          sendResponse({ success: false, error: String(error) });
        }
        return true;
      } else if (message.type === 'INTELLIGENT_FOCUS_UPDATE') {
        // Forward intelligent focus suggestions to smart assistant
        window.postMessage({
          _target: 'smart-assistant',
          _fromBackground: true,
          type: 'intelligentFocusSuggestion',
          data: message.data
        }, '*');
      } else if (message.type === 'TASK_PATH_GUIDANCE') {
        // Forward task path guidance to smart assistant
        window.postMessage({
          _target: 'smart-assistant',
          _fromBackground: true,
          type: 'TASK_PATH_GUIDANCE',
          data: message.data
        }, '*');
      } else if (message.type === 'INTELLIGENT_FOCUS_SUGGESTION') {
        // Forward intelligent focus suggestions to smart assistant
        window.postMessage({
          _target: 'smart-assistant',
          _fromBackground: true,
          type: 'INTELLIGENT_FOCUS_SUGGESTION',
          data: message.data
        }, '*');
      } else {
        window.postMessage({
          _target: 'smart-assistant',
          _fromBackground: true,
          message: message
        }, '*');
      }
    });
  }

  // Initialize smart assistant
  initializeSmartAssistant();
}