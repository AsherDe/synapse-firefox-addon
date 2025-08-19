/// <reference path="./types.ts" />
// Licensed under the Apache License, Version 2.0

// Browser API compatibility using webextension-polyfill
declare var browser: any; // webextension-polyfill provides this globally

class PopupController {
  private sequence: GlobalActionSequence = [];
  private updateInterval: number | null = null;
  private backgroundPort: any | null = null;

  constructor() {
    this.setupBackgroundConnection();
    this.loadSequence();
    this.loadPrediction();
    this.loadModelInfo();
    this.loadPauseState();
    this.loadGuidanceState();
    this.setupEventListeners();
    // No longer using periodic updates - using real-time connection instead
  }

  /**
   * Setup long-lived connection with background script for real-time updates
   */
  private setupBackgroundConnection(): void {
    try {
      this.backgroundPort = browser.runtime.connect({ name: 'popup' });
      
      // Listen for real-time updates from background
      this.backgroundPort.onMessage.addListener((message: any) => {
        this.handleBackgroundMessage(message);
      });
      
      // Handle connection errors
      this.backgroundPort.onDisconnect.addListener(() => {
        console.log('[Popup] Background connection disconnected');
        this.backgroundPort = null;
        
        // Attempt to reconnect after a short delay
        setTimeout(() => {
          this.setupBackgroundConnection();
        }, 1000);
      });
      
      // Request initial data
      this.backgroundPort.postMessage({ type: 'requestInitialData' });
      
      console.log('[Popup] Long-lived connection established with background');
    } catch (error) {
      console.error('[Popup] Failed to establish background connection:', error);
      // Fallback to periodic updates if connection fails
      this.startPeriodicUpdates();
    }
  }

  /**
   * Handle real-time messages from background script
   */
  private handleBackgroundMessage(message: any): void {
    switch (message.type) {
      case 'sequenceUpdate':
        this.sequence = message.data.sequence || [];
        this.updateSequenceDisplay();
        break;
        
      case 'predictionUpdate':
        this.updatePredictionDisplay(message.data.prediction);
        break;
        
      case 'modelInfoUpdate':
        this.updateModelInfoDisplay(message.data.modelInfo, message.data.isReady);
        break;
        
      case 'pauseStateUpdate':
        this.updatePauseUI(message.data.isPaused);
        break;
        
      case 'initialData':
        // Handle initial data load
        if (message.data.sequence) {
          this.sequence = message.data.sequence;
          this.updateSequenceDisplay();
        }
        if (message.data.prediction) {
          this.updatePredictionDisplay(message.data.prediction);
        }
        if (message.data.modelInfo) {
          this.updateModelInfoDisplay(message.data.modelInfo, message.data.isReady);
        }
        if (message.data.pauseState !== undefined) {
          this.updatePauseUI(message.data.pauseState);
        }
        break;
        
      case 'error':
        console.error('[Popup] Background error:', message.error);
        break;
        
      default:
        console.log('[Popup] Unknown message from background:', message);
    }
  }

  /**
   * Send message to background via long-lived connection
   */
  private sendToBackground(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.backgroundPort) {
        // Fallback to regular message passing
        browser.runtime.sendMessage(message, (response: any) => {
          if (browser.runtime.lastError) {
            reject(browser.runtime.lastError);
          } else {
            resolve(response);
          }
        });
        return;
      }
      
      // Use long-lived connection
      const messageId = Date.now() + Math.random();
      const messageWithId = { ...message, messageId };
      
      // Setup response listener
      const responseListener = (response: any) => {
        if (response.messageId === messageId) {
          this.backgroundPort?.onMessage.removeListener(responseListener);
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.data);
          }
        }
      };
      
      this.backgroundPort.onMessage.addListener(responseListener);
      this.backgroundPort.postMessage(messageWithId);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        this.backgroundPort?.onMessage.removeListener(responseListener);
        reject(new Error('Message timeout'));
      }, 5000);
    });
  }

  private setupEventListeners(): void {
    const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
    const toggleBtn = document.getElementById('toggleBtn') as HTMLButtonElement;
    const devModeBtn = document.getElementById('devModeBtn') as HTMLButtonElement;
    const closeDev = document.getElementById('closeDev') as HTMLButtonElement;
    const exportBtn = document.getElementById('exportDataBtn') as HTMLButtonElement;
    const guidanceToggle = document.getElementById('guidanceToggle') as HTMLInputElement;

    clearBtn.addEventListener('click', () => {
      this.clearSequence();
    });

    toggleBtn.addEventListener('click', () => {
      this.togglePause();
    });

    devModeBtn.addEventListener('click', () => {
      this.toggleDevMode();
    });

    closeDev.addEventListener('click', () => {
      this.toggleDevMode();
    });

    exportBtn?.addEventListener('click', () => {
      this.exportAllData();
    });

    guidanceToggle?.addEventListener('change', (e) => {
      this.toggleGuidance((e.target as HTMLInputElement).checked);
    });

    // Developer mode tab switching
    const devTabs = document.querySelectorAll('.dev-tab');
    devTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        this.switchDevTab(target.dataset.tab!);
      });
    });
  }

  private clearSequence(): void {
    this.sendToBackground({ type: 'clearSequence' })
      .then((response: any) => {
        if (response && response.success) {
          this.sequence = [];
          this.updateSequenceDisplay();
          console.log('Sequence cleared and UI updated.');
        }
      })
      .catch((error) => {
        console.error('Failed to clear sequence:', error);
      });
  }

  private loadSequence(): void {
    this.sendToBackground({ type: 'getSequence' })
      .then((response: any) => {
        if (response && response.sequence) {
          this.sequence = response.sequence;
          this.updateSequenceDisplay();
        }
      })
      .catch((error) => {
        console.error('Failed to load sequence:', error);
      });
  }

  private loadPrediction(): void {
    browser.runtime.sendMessage({ type: 'getPrediction' }, (response: any) => {
      if (browser.runtime.lastError) {
        console.error('Failed to load prediction:', browser.runtime.lastError.message);
        return;
      }
      this.updatePredictionDisplay(response?.prediction);
    });
  }

  private loadModelInfo(): void {
    browser.runtime.sendMessage({ type: 'getModelInfo' }, (response: any) => {
      if (browser.runtime.lastError) {
        console.error('Failed to load model info:', browser.runtime.lastError.message);
        return;
      }
      this.updateModelInfoDisplay(response?.modelInfo, response?.isReady);
    });
  }

  private loadPauseState(): void {
    browser.runtime.sendMessage({ type: 'getPauseState' }, (response: any) => {
      if (browser.runtime.lastError) {
        console.error('Failed to load pause state:', browser.runtime.lastError.message);
        return;
      }
      this.updatePauseUI(response?.isPaused || false);
    });
  }

  private loadGuidanceState(): void {
    browser.storage.local.get(['assistantEnabled'], (result: any) => {
      const isEnabled = result.assistantEnabled !== false; // Default to true
      this.updateGuidanceUI(isEnabled);
    });
  }

  private toggleGuidance(enabled: boolean): void {
    browser.storage.local.set({ assistantEnabled: enabled }, () => {
      console.log(`Smart guidance ${enabled ? 'enabled' : 'disabled'}`);
      
      // Notify content scripts about the change
      browser.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
        if (tabs[0]?.id) {
          browser.tabs.sendMessage(tabs[0].id, {
            type: 'guidanceToggled',
            enabled: enabled
          });
        }
      });
      
      // Notify background script
      this.sendToBackground({
        type: 'guidanceToggled',
        enabled: enabled
      });
    });
  }

  private updateGuidanceUI(enabled: boolean): void {
    const guidanceToggle = document.getElementById('guidanceToggle') as HTMLInputElement;
    if (guidanceToggle) {
      guidanceToggle.checked = enabled;
    }
  }

  private togglePause(): void {
    this.sendToBackground({ type: 'togglePause' })
      .then((response: any) => {
        if (response) {
          this.updatePauseUI(response.isPaused);
          console.log(`Extension ${response.isPaused ? 'paused' : 'resumed'}`);
        }
      })
      .catch((error) => {
        console.error('Failed to toggle pause:', error);
      });
  }

  private updatePauseUI(isPaused: boolean): void {
    const toggleBtn = document.getElementById('toggleBtn') as HTMLButtonElement;
    const statusElement = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    const statusDot = statusElement?.querySelector('.status-dot');

    if (toggleBtn) {
      toggleBtn.textContent = isPaused ? 'Resume' : 'Pause';
      toggleBtn.className = isPaused ? 'btn btn-primary' : 'btn btn-secondary';
    }

    if (statusElement) {
      statusElement.className = isPaused ? 'status paused' : 'status capturing';
    }

    if (statusText) {
      statusText.textContent = isPaused ? 'Extension paused' : 'Capturing events...';
    }

    if (statusDot) {
      statusDot.className = isPaused ? 'status-dot paused' : 'status-dot';
    }
  }

  private startPeriodicUpdates(): void {
    // Fallback periodic updates when long-lived connection is not available
    console.log('[Popup] Using fallback periodic updates');
    this.updateInterval = window.setInterval(() => {
      this.loadPrediction();
      this.loadModelInfo();
      this.loadPauseState();
    }, 5000);
  }

  private updateSequenceDisplay(): void {
    const eventCount = document.getElementById('tokenCount')!;
    const eventList = document.getElementById('tokenList')!;

    eventCount.textContent = this.sequence.length.toString();

    if (this.sequence.length === 0) {
      eventList.innerHTML = '<div class="empty-state">No events recorded yet. Start interacting with web pages.</div>';
    } else {
      // Display recent events (last 20)
      const recentEvents = this.sequence.slice(-20).reverse();
      eventList.innerHTML = recentEvents.map(event => this.createEventItemHtml(event)).join('');
    }
  }

  private createEventItemHtml(event: EnrichedEvent): string {
    let details = '';
    switch(event.type) {
      case 'user_action_click':
        details = `Clicked <code>${event.payload.selector}</code>`;
        break;
      case 'user_action_keydown':
        details = `Pressed <code>${event.payload.key}</code>`;
        break;
      case 'user_action_text_input':
        details = `Text input in <code>${event.payload.selector}</code> (${event.payload.text.length} chars)`;
        break;
      case 'user_action_scroll':
        details = `Scrolled ${event.payload.features.scroll_direction} to ${event.payload.features.scroll_percentage.toFixed(1)}%`;
        break;
      case 'user_action_mouse_pattern':
        details = `Mouse ${event.payload.features.pattern_type} pattern (${event.payload.trail.length} points)`;
        break;
      case 'user_action_form_submit':
        details = `Submitted form <code>${event.payload.form_selector}</code>`;
        break;
      case 'user_action_focus_change':
        details = `Focus ${event.payload.focus_type}: <code>${event.payload.to_selector || 'unknown'}</code>`;
        break;
      case 'user_action_page_visibility':
        details = `Page visibility: ${event.payload.visibility_state}`;
        break;
      case 'user_action_mouse_hover':
        details = `Hovered over <code>${event.payload.selector}</code> for ${event.payload.hover_duration}ms`;
        break;
      case 'user_action_clipboard':
        details = `Clipboard ${event.payload.operation} (${event.payload.text_length} chars)`;
        break;
      case 'browser_action_tab_activated':
        details = `Switched to tab <code>${event.payload.tabId}</code>`;
        break;
      case 'browser_action_tab_created':
        details = `Created tab <code>${event.payload.tabId}</code>`;
        break;
      case 'browser_action_tab_updated':
        details = `Tab <code>${event.payload.tabId}</code> navigated to new URL`;
        break;
      case 'browser_action_tab_removed':
        details = `Closed tab <code>${event.payload.tabId}</code>`;
        break;
      default:
        details = 'Unknown event';
    }

    return `
      <div class="event-item">
        <div class="event-info">
          <div class="event-type">${event.type.replace(/_/g, ' ')}</div>
          <div class="event-details">${details}</div>
        </div>
        <div class="event-time">${this.formatTime(event.timestamp)}</div>
      </div>
    `;
  }

  private formatTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 1000) return 'just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  private updatePredictionDisplay(prediction: any): void {
    const predictionElement = document.getElementById('predictionInfo');
    if (!predictionElement) return;

    if (!prediction) {
      predictionElement.innerHTML = '<div class="empty-state">No prediction available yet</div>';
      return;
    }

    const timeSincePrediction = Date.now() - prediction.timestamp;
    const isRecent = timeSincePrediction < 30000; // 30 seconds

    predictionElement.innerHTML = `
      <div class="prediction-item ${isRecent ? 'recent' : 'stale'}">
        <div class="prediction-header">
          <strong>Next Token Prediction</strong>
          <span class="prediction-time">${this.formatTime(prediction.timestamp)}</span>
        </div>
        <div class="prediction-details">
          <div class="token-id">Token ID: <code>${prediction.tokenId}</code></div>
          <div class="confidence">Confidence: <span class="confidence-bar" style="width: ${prediction.confidence * 100}%">${(prediction.confidence * 100).toFixed(1)}%</span></div>
        </div>
      </div>
    `;
  }

  private updateModelInfoDisplay(modelInfo: any, isReady: boolean): void {
    const modelElement = document.getElementById('modelInfo');
    if (!modelElement) return;

    if (!modelInfo || !isReady) {
      modelElement.innerHTML = `
        <div class="model-status">
          <div class="status-indicator ${isReady ? 'ready' : 'loading'}"></div>
          <span>${isReady ? 'Model Ready' : 'Model Loading...'}</span>
        </div>
      `;
      return;
    }

    modelElement.innerHTML = `
      <div class="model-status">
        <div class="status-indicator ready"></div>
        <span>Model Ready</span>
      </div>
      <div class="model-details">
        <div class="model-param">Vocab Size: ${modelInfo.vocabSize}</div>
        <div class="model-param">Sequence Length: ${modelInfo.sequenceLength}</div>
        <div class="model-param">Total Parameters: ${modelInfo.totalParams?.toLocaleString()}</div>
      </div>
    `;
  }

  private toggleDevMode(): void {
    const devPanel = document.getElementById('devModePanel');
    if (!devPanel) return;

    if (devPanel.style.display === 'none') {
      devPanel.style.display = 'block';
      this.loadDevModeData();
    } else {
      devPanel.style.display = 'none';
      // Don't clear the connection-based updates, only the periodic fallback
      if (this.updateInterval && !this.backgroundPort) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }
    }
  }

  private switchDevTab(tabName: string): void {
    // Update tab buttons
    const tabs = document.querySelectorAll('.dev-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

    // Update content panels
    const contents = document.querySelectorAll('.dev-content');
    contents.forEach(content => content.classList.remove('active'));
    document.getElementById(`dev-${tabName}`)?.classList.add('active');

    // Load specific data for this tab
    this.loadDevTabData(tabName);
  }

  private loadDevModeData(): void {
    this.loadDevTabData('events');
  }

  private async loadDevTabData(tabName: string): Promise<void> {
    switch (tabName) {
      case 'events':
        await this.loadRawEvents();
        break;
      case 'tokens':
        await this.loadTokenStatistics();
        break;
      case 'model':
        await this.loadModelDebugInfo();
        break;
      case 'debug':
        await this.loadDebugInfo();
        break;
    }
  }

  private async loadRawEvents(): Promise<void> {
    const rawEventsElement = document.getElementById('rawEvents');
    if (!rawEventsElement) return;

    rawEventsElement.textContent = JSON.stringify(this.sequence.slice(-10), null, 2);
  }

  private async loadTokenStatistics(): Promise<void> {
    const tokenStatsElement = document.getElementById('tokenStats');
    const codebookInfoElement = document.getElementById('codebookInfo');
    
    if (tokenStatsElement) {
      const stats = {
        totalEvents: this.sequence.length,
        eventTypes: this.getEventTypeDistribution(),
        recentActivity: this.getRecentActivity()
      };
      tokenStatsElement.textContent = JSON.stringify(stats, null, 2);
    }

    if (codebookInfoElement) {
      // Request codebook info from background script
      browser.runtime.sendMessage({ type: 'getCodebookInfo' }, (response: any) => {
        if (response && codebookInfoElement) {
          codebookInfoElement.textContent = JSON.stringify(response, null, 2);
        }
      });
    }
  }

  private async loadModelDebugInfo(): Promise<void> {
    const modelArchElement = document.getElementById('modelArchitecture');
    const trainingHistoryElement = document.getElementById('trainingHistory');

    browser.runtime.sendMessage({ type: 'getModelInfo' }, (response: any) => {
      if (modelArchElement && response?.modelInfo) {
        modelArchElement.textContent = JSON.stringify(response.modelInfo, null, 2);
      }
      
      if (trainingHistoryElement) {
        const history = {
          lastTraining: 'Not available in this implementation',
          totalTrainingSessions: 'Tracked in background script',
          modelReady: response?.isReady || false
        };
        trainingHistoryElement.textContent = JSON.stringify(history, null, 2);
      }
    });
  }

  private async loadDebugInfo(): Promise<void> {
    const debugConsoleElement = document.getElementById('debugConsole');
    const storageInfoElement = document.getElementById('storageInfo');

    if (debugConsoleElement) {
      const debugInfo = {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        popup: {
          sequenceLength: this.sequence.length,
          updateInterval: this.updateInterval !== null
        }
      };
      debugConsoleElement.textContent = JSON.stringify(debugInfo, null, 2);
    }

    if (storageInfoElement) {
      // Get storage usage information
      browser.storage.session.getBytesInUse(null, (sessionBytes: any) => {
        browser.storage.local.getBytesInUse(null, (localBytes: any) => {
          const storageInfo = {
            sessionStorage: `${sessionBytes} bytes`,
            localStorage: `${localBytes} bytes`,
            lastUpdate: new Date().toISOString()
          };
          if (storageInfoElement) {
            storageInfoElement.textContent = JSON.stringify(storageInfo, null, 2);
          }
        });
      });
    }
  }

  private getEventTypeDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    this.sequence.forEach(event => {
      distribution[event.type] = (distribution[event.type] || 0) + 1;
    });
    return distribution;
  }

  private getRecentActivity(): any {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const recentEvents = this.sequence.filter(event => event.timestamp > oneHourAgo);
    
    return {
      lastHour: recentEvents.length,
      lastEvent: this.sequence.length > 0 ? this.sequence[this.sequence.length - 1].timestamp : null,
      avgEventsPerMinute: recentEvents.length / 60
    };
  }

  private async exportAllData(): Promise<void> {
    try {
      console.log('[Synapse] Starting data export...');

      // Collect all data
      const exportData = {
        exportInfo: {
          timestamp: new Date().toISOString(),
          version: '1.3.0',
          userAgent: navigator.userAgent,
          description: 'Complete Synapse extension data export for debugging - includes all event types including mouse patterns'
        },
        
        // Current session data
        eventSequence: this.sequence,
        sequenceStats: {
          totalEvents: this.sequence.length,
          eventTypeDistribution: this.getEventTypeDistribution(),
          recentActivity: this.getRecentActivity(),
          dataTypesIncluded: [
            'user_action_click',
            'user_action_keydown', 
            'user_action_text_input',
            'user_action_scroll',
            'user_action_mouse_pattern', // Mouse movement data included
            'user_action_form_submit',
            'user_action_focus_change',
            'user_action_page_visibility',
            'user_action_mouse_hover',
            'user_action_clipboard',
            'browser_action_tab_created',
            'browser_action_tab_activated',
            'browser_action_tab_updated',
            'browser_action_tab_removed'
          ]
        },

        // Get all stored data
        sessionStorage: await this.getSessionStorageData(),
        localStorage: await this.getLocalStorageData(),
        
        // Model information
        modelInfo: await this.getModelInfoData(),
        
        // Runtime information
        runtimeInfo: {
          popupLoadTime: new Date().toISOString(),
          updateIntervalActive: this.updateInterval !== null
        }
      };

      // Create downloadable file
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `synapse-debug-data-${timestamp}.json`;

      // Create download link and trigger download
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = filename;
      downloadLink.style.display = 'none';
      
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      // Clean up
      URL.revokeObjectURL(url);
      
      console.log(`[Synapse] Data exported successfully as ${filename}`);
      
      // Show success message
      this.showExportMessage('Data exported successfully!', 'success');

    } catch (error) {
      console.error('[Synapse] Error exporting data:', error);
      this.showExportMessage('Export failed. Check console for details.', 'error');
    }
  }

  private async getSessionStorageData(): Promise<any> {
    return new Promise((resolve) => {
      browser.storage.session.get(null, (data: any) => {
        resolve(data);
      });
    });
  }

  private async getLocalStorageData(): Promise<any> {
    return new Promise((resolve) => {
      browser.storage.local.get(null, (data: any) => {
        resolve(data);
      });
    });
  }

  private async getModelInfoData(): Promise<any> {
    return new Promise((resolve) => {
      browser.runtime.sendMessage({ type: 'getModelInfo' }, (response: any) => {
        browser.runtime.sendMessage({ type: 'getCodebookInfo' }, (codebookResponse: any) => {
          browser.runtime.sendMessage({ type: 'getPrediction' }, (predictionResponse: any) => {
            resolve({
              modelInfo: response?.modelInfo,
              isReady: response?.isReady,
              codebookInfo: codebookResponse?.codebookInfo,
              lastPrediction: predictionResponse?.prediction
            });
          });
        });
      });
    });
  }

  private showExportMessage(message: string, type: 'success' | 'error'): void {
    // Create temporary message element
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
      ${type === 'success' 
        ? 'background: #e8f5e8; color: #2d5016; border: 1px solid #34a853;' 
        : 'background: #fce8e6; color: #d93025; border: 1px solid #ea4335;'
      }
    `;
    messageDiv.textContent = message;

    // Add slide-in animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(messageDiv);

    // Remove after 3 seconds
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    }, 3000);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});