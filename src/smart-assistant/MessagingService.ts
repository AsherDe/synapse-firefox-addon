/**
 * MessagingService - Handles all communication with content script and background
 */

declare var browser: any;

export type MessageHandler = (message: any) => void;

export class MessagingService {
  private messageHandlers: Map<string, MessageHandler> = new Map();
  private isInitialized: boolean = false;

  constructor() {
    this.initializeConnection();
  }

  /**
   * Initialize connection with background script
   */
  private initializeConnection(): void {
    try {
      window.addEventListener('message', (event: MessageEvent) => {
        if (event.source === window && event.data._target === 'smart-assistant' && event.data._fromBackground) {
          this.handleBackgroundMessage(event.data.message);
        }
      });
      
      this.sendToContentScript({ type: 'smart-assistant-ready' }).then(() => {
        return this.sendToContentScript({ type: 'getLearnedSkills' });
      }).then(() => {
        this.isInitialized = true;
      }).catch(error => {
        console.error('[MessagingService] Failed to initialize:', error);
      });
      
    } catch (error) {
      console.error('[MessagingService] Failed to initialize:', error);
    }
  }

  /**
   * Send message to content script
   */
  public sendToContentScript(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const messageId = Date.now() + Math.random();
      const messageWithId = { ...message, _messageId: messageId, _source: 'smart-assistant' };
      
      const responseHandler = (event: MessageEvent) => {
        if (event.source === window && event.data._responseId === messageId) {
          window.removeEventListener('message', responseHandler);
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.response);
          }
        }
      };
      
      window.addEventListener('message', responseHandler);
      window.postMessage(messageWithId, '*');
      
      setTimeout(() => {
        window.removeEventListener('message', responseHandler);
        reject(new Error('Message timeout'));
      }, 5000);
    });
  }

  /**
   * Register message handler
   */
  public onMessage(messageType: string, handler: MessageHandler): void {
    this.messageHandlers.set(messageType, handler);
  }

  /**
   * Handle messages from background script
   */
  private handleBackgroundMessage(message: any): void {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message);
    } else {
      console.log('[MessagingService] Unknown message:', message);
    }
  }

  /**
   * Load settings from storage
   */
  public async loadSettings(keys: string[]): Promise<any> {
    try {
      const result = await this.sendToContentScript({ 
        type: 'storage-get', 
        keys: keys 
      });
      return result;
    } catch (error) {
      console.error('[MessagingService] Failed to load settings:', error);
      return {};
    }
  }

  /**
   * Save settings to storage
   */
  public async saveSettings(data: any): Promise<void> {
    try {
      await this.sendToContentScript({ 
        type: 'storage-set', 
        data: data
      });
    } catch (error) {
      console.error('[MessagingService] Failed to save settings:', error);
    }
  }

  public isReady(): boolean {
    return this.isInitialized;
