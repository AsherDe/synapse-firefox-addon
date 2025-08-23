import { SynapseEvent } from './types';
// Licensed under the Apache License, Version 2.0

// Browser API compatibility using webextension-polyfill
declare var browser: any; // webextension-polyfill provides this globally

class PopupController {
  private sequence: SynapseEvent[] = [];
  private updateInterval: number | null = null;
  private backgroundPort: any | null = null;

  constructor() {
    this.setupBackgroundConnection();
    this.setupEventListeners();
    // All data now loaded via background connection
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
        
      case 'eventAdded':
        // Handle single event addition
        if (message.data) {
          this.sequence.push(message.data);
          this.updateSequenceDisplay();
        }
        break;
        
      case 'sequenceCleared':
        this.sequence = [];
        this.updateSequenceDisplay();
        break;
        
      case 'predictionUpdate':
  this.updatePredictionDisplay(message.data);
        break;
        
      case 'modelInfoUpdate':
        // 直接使用收到的完整数据对象
        if (message.data && message.data.isReady) {
          this.updateModelInfoDisplay(message.data, true);
        }
        break;
        
      case 'pauseStateChanged':
        this.updatePauseUI(message.data);
        break;
        
      case 'dataReset':
        this.sequence = [];
        this.updateSequenceDisplay();
        this.updatePredictionDisplay(null);
        break;
        
      case 'dataCleared':
        this.sequence = [];
        this.updateSequenceDisplay();
        break;
        
      case 'initialData':
        console.log('[Popup] Received initial data:', message.data);
        if (message.data.sequence) {
          this.sequence = message.data.sequence;
          this.updateSequenceDisplay();
        }
        if (message.data.prediction) {
          this.updatePredictionDisplay(message.data.prediction);
        }
        // 处理初始模型信息
        if (message.data.modelInfo && message.data.modelInfo.isReady) {
          this.updateModelInfoDisplay(message.data.modelInfo, true);
        }
        if (message.data.paused !== undefined) {
          this.updatePauseUI(message.data.paused);
        }
        if (message.data.guidanceEnabled !== undefined) {
          this.updateGuidanceUI(message.data.guidanceEnabled);
        }
        break;
        
      case 'error':
        console.error('[Popup] Background error:', message.error);
        break;
        
      default:
        console.log('[Popup] Unknown message from background:', message);
    }
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
    // Send clear request - background will broadcast the result
    if (this.backgroundPort) {
      this.backgroundPort.postMessage({ type: 'clearSequence' });
    } else {
      browser.runtime.sendMessage({ type: 'clearSequence' });
    }
  }


  private loadPrediction(): void {
    browser.runtime.sendMessage({ type: 'getPrediction' }, (response: any) => {
      if (browser.runtime.lastError) {
        console.error('Failed to load prediction:', browser.runtime.lastError.message);
        return;
      }
      const prediction = response?.success ? response.data : response?.prediction;
      this.updatePredictionDisplay(prediction);
    });
  }


  private loadPauseState(): void {
    browser.runtime.sendMessage({ type: 'getPauseState' }, (response: any) => {
      if (browser.runtime.lastError) {
        console.error('Failed to load pause state:', browser.runtime.lastError.message);
        return;
      }
      const isPaused = response?.success ? response.data : response?.isPaused;
      this.updatePauseUI(isPaused || false);
    });
  }


  private toggleGuidance(enabled: boolean): void {
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
    // Persist via background
    if (this.backgroundPort) {
      this.backgroundPort.postMessage({ type: 'setGuidanceState', enabled });
      this.backgroundPort.postMessage({ type: 'guidanceToggled', enabled });
    }
  }

  private updateGuidanceUI(enabled: boolean): void {
    const guidanceToggle = document.getElementById('guidanceToggle') as HTMLInputElement;
    if (guidanceToggle) {
      guidanceToggle.checked = enabled;
    }
  }

  private togglePause(): void {
    // Send toggle request - background will broadcast the result
    if (this.backgroundPort) {
      this.backgroundPort.postMessage({ type: 'togglePause' });
    } else {
      browser.runtime.sendMessage({ type: 'togglePause' });
    }
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

  private createEventItemHtml(event: SynapseEvent): string {
    let details = '';
    const eventType = event.type; // New unified structure uses just event.type

    switch(eventType) {
      case 'ui.click':
        details = `Clicked <code>${event.payload.targetSelector || 'unknown'}</code>`;
        break;
      case 'ui.keydown':
        details = `Pressed <code>${event.payload.value || 'unknown'}</code>`;
        break;
      case 'ui.text_input':
        details = `Text input in <code>${event.payload.targetSelector || 'unknown'}</code> (${event.payload.features?.text_length || 0} chars)`;
        break;
      case 'user.scroll':
        details = `Scrolled ${event.payload.features?.scroll_direction || 'unknown'} to ${(event.payload.features?.scroll_percentage || 0).toFixed(1)}%`;
        break;
      case 'ui.mouse_pattern':
        details = `Mouse ${event.payload.features?.pattern_type || 'unknown'} pattern`;
        break;
      case 'form.submit':
        details = `Submitted form <code>${event.payload.targetSelector || 'unknown'}</code>`;
        break;
      case 'ui.focus_change':
        details = `Focus ${event.payload.features?.focus_type || 'unknown'}: <code>${event.payload.features?.to_selector || 'unknown'}</code>`;
        break;
      case 'browser.page_visibility':
        details = `Page visibility: ${event.payload.features?.visibility_state || 'unknown'}`;
        break;
      case 'ui.mouse_hover':
        details = `Hovered over <code>${event.payload.targetSelector || 'unknown'}</code> for ${event.payload.features?.hover_duration || 0}ms`;
        break;
      case 'ui.clipboard':
        details = `Clipboard ${event.payload.features?.operation || 'unknown'} (${event.payload.features?.text_length || 0} chars)`;
        break;
      case 'browser.tab.activated':
        details = `Switched to tab <code>${event.context.tabId || 'unknown'}</code>`;
        break;
      case 'browser.tab.created':
        details = `Created tab <code>${event.context.tabId || 'unknown'}</code>`;
        break;
      case 'browser.tab.updated':
        details = `Tab <code>${event.context.tabId || 'unknown'}</code> navigated to new URL`;
        break;
      case 'browser.tab.removed':
        details = `Closed tab <code>${event.context.tabId || 'unknown'}</code>`;
        break;
      default:
        details = 'Unknown event';
    }

    return `
      <div class="event-item">
        <div class="event-info">
          <div class="event-type">${event.type.replace(/[._]/g, ' ')}</div>
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
    const token = prediction.token || prediction.tokenId || 'unknown';
    const confidence = typeof prediction.confidence === 'number' ? prediction.confidence : 0;
    const ts = prediction.timestamp || Date.now();
    const isRecent = (Date.now() - ts) < 30000;

    predictionElement.innerHTML = `
      <div class="prediction-item ${isRecent ? 'recent' : 'stale'}">
        <div class="prediction-header">
          <strong>Next Action Prediction</strong>
          <span class="prediction-time">${this.formatTime(ts)}</span>
        </div>
        <div class="prediction-details">
          <div class="token-id">Token: <code>${token}</code></div>
          <div class="confidence">Confidence: <span class="confidence-bar" style="width: ${confidence * 100}%">${(confidence * 100).toFixed(1)}%</span></div>
        </div>
      </div>`;
  }

  private updateModelInfoDisplay(modelInfo: any, isReady: boolean): void {
    const modelElement = document.getElementById('modelInfo');
    if (!modelElement) return;

    // Since we only call this with complete model info, simplify the logic
    if (!modelInfo || !isReady) {
      modelElement.innerHTML = `
        <div class="model-status">
          <div class="status-indicator loading"></div>
          <span>Loading model information...</span>
        </div>
      `;
      return;
    }
    
    // Model info data is nested in modelInfo.info
    const details = modelInfo.info || modelInfo;

    modelElement.innerHTML = `
      <div class="model-status">
        <div class="status-indicator ready"></div>
        <span>Model Ready</span>
      </div>
      <div class="model-details">
        <div class="model-param">Vocab Size: ${details.vocabSize || 'N/A'}</div>
        <div class="model-param">Sequence Length: ${details.sequenceLength || 'N/A'}</div>
        <div class="model-param">ML Worker: ${details.workerReady ? 'Active' : 'Inactive'}</div>
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
          const data = response?.success ? response.data : response;
          codebookInfoElement.textContent = JSON.stringify(data, null, 2);
        }
      });
    }
  }

  private async loadModelDebugInfo(): Promise<void> {
    const modelArchElement = document.getElementById('modelArchitecture');
    const trainingHistoryElement = document.getElementById('trainingHistory');
    const modelInfoPromise = new Promise<any>(resolve => {
      browser.runtime.sendMessage({ type: 'getModelInfo' }, (resp: any) => resolve(resp));
    });
    const statePromise = new Promise<any>(resolve => {
      browser.runtime.sendMessage({ type: 'getState' }, (resp: any) => resolve(resp));
    });

    try {
      const [modelResp, stateResp] = await Promise.all([modelInfoPromise, statePromise]);
      const modelInfo = modelResp?.success ? modelResp.data : modelResp?.modelInfo;
      const stateData = stateResp?.success ? stateResp.data : {};
      const isReady = !!(stateData?.modelReady || (modelResp?.success && modelResp.data));

      if (modelArchElement && modelInfo) {
        modelArchElement.textContent = JSON.stringify(modelInfo, null, 2);
      }

      if (trainingHistoryElement) {
        const history = {
          lastTraining: stateData.modelLastTrained ? new Date(stateData.modelLastTrained).toISOString() : null,
          trainingStatus: stateData.modelTrainingStatus || 'unknown',
          trainingInProgress: !!stateData.trainingInProgress,
          totalTrainingSessions: stateData.modelTrainingSessions ?? 0,
          modelReady: isReady,
          lastPrediction: stateData.lastPrediction ? {
            token: stateData.lastPrediction.token || stateData.lastPrediction.tokenId,
            confidence: stateData.lastPrediction.confidence
          } : null,
          workerStatus: stateData.mlWorkerStatus || 'unknown'
        };
        trainingHistoryElement.textContent = JSON.stringify(history, null, 2);
      }
    } catch (err) {
      if (trainingHistoryElement) {
        trainingHistoryElement.textContent = JSON.stringify({ error: (err as Error).message }, null, 2);
      }
    }
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
      browser.runtime.sendMessage({ type: 'getStorageOverview' }, (response: any) => {
        const data = response?.data || {};
        const storageInfo = {
          bytesInUse: data.bytesInUse || 0,
          keys: data.keys || [],
          lastUpdate: new Date().toISOString()
        };
        storageInfoElement.textContent = JSON.stringify(storageInfo, null, 2);
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
      console.log('[Synapse] Export button clicked - starting data export...');

      this.showExportMessage('Export started...', 'success');

      // 使用 Promise.allSettled 来确保所有数据获取都会完成，即使其中一些失败
      const [sessionDataResult, localDataResult, modelDataResult] = await Promise.allSettled([
        this.getSessionStorageData(),
        this.getLocalStorageData(),
        this.getModelInfoData()
      ]);

      const sessionData = sessionDataResult.status === 'fulfilled' ? sessionDataResult.value : { error: sessionDataResult.reason };
      const localData = localDataResult.status === 'fulfilled' ? localDataResult.value : { error: localDataResult.reason };
      const modelData = modelDataResult.status === 'fulfilled' ? modelDataResult.value : { error: modelDataResult.reason };

      console.log('[Synapse] Session storage data:', sessionData);
      console.log('[Synapse] Local storage data:', localData);
      console.log('[Synapse] Model data:', modelData);

      // Collect all data
      const exportData = {
        exportInfo: {
          timestamp: new Date().toISOString(),
          version: '1.3.1',
          userAgent: navigator.userAgent,
          description: 'Complete Synapse extension data export for debugging - includes all event types including mouse patterns'
        },
        eventSequence: this.sequence,
        sequenceStats: {
          totalEvents: this.sequence.length,
          eventTypeDistribution: this.getEventTypeDistribution(),
          recentActivity: this.getRecentActivity(),
          dataTypesIncluded: [
            'user_action_click', 'user_action_keydown', 'user_action_text_input',
            'user_action_scroll', 'user_action_mouse_pattern', 'user_action_form_submit',
            'user_action_focus_change', 'user_action_page_visibility', 'user_action_mouse_hover',
            'user_action_clipboard', 'browser_action_tab_created', 'browser_action_tab_activated',
            'browser_action_tab_updated', 'browser_action_tab_removed'
          ]
        },
        sessionStorage: sessionData,
        localStorage: localData,
        modelInfo: modelData,
        runtimeInfo: {
          popupLoadTime: new Date().toISOString(),
          updateIntervalActive: this.updateInterval !== null
        }
      };

      console.log('[Synapse] Creating export file...');
      const jsonString = JSON.stringify(exportData, (_, value) => 
        value instanceof Error ? `Error: ${value.message}` : value, 2
      );
      
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `synapse-debug-data-${timestamp}.json`;

      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      URL.revokeObjectURL(url);
      
      console.log(`[Synapse] Data exported successfully as ${filename}`);
      this.showExportMessage('Data exported successfully!', 'success');

    } catch (error) {
      console.error('[Synapse] Error exporting data:', error);
      this.showExportMessage('Export failed. Check console for details.', 'error');
    }
  }

  private async getSessionStorageData(): Promise<any> {
    try {
      return new Promise((resolve) => {
        browser.runtime.sendMessage({ type: 'getState' }, (response: any) => {
          resolve({ stateSnapshot: response?.data || {} });
        });
      });
    } catch (error) {
      console.warn('[Synapse] Session storage error:', error);
      return {};
    }
  }

  private async getLocalStorageData(): Promise<any> {
    // Use background aggregated snapshot; local storage raw dump avoided for privacy
    return new Promise((resolve) => {
      browser.runtime.sendMessage({ type: 'getState' }, (response: any) => {
        resolve({ stateSnapshot: response?.data || {} });
      });
    });
  }

  private async getModelInfoData(): Promise<any> {
    try {
      // 使用 Promise.all 并行发送三个请求，提高效率
      const [modelResponse, codebookResponse, predictionResponse] = await Promise.all([
        new Promise((resolve) => {
          browser.runtime.sendMessage({ type: 'getModelInfo' }, (response: any) => {
            console.log('[Popup] getModelInfo response:', response);
            resolve(response);
          });
        }),
        new Promise((resolve) => {
          browser.runtime.sendMessage({ type: 'getCodebookInfo' }, (response: any) => {
            console.log('[Popup] getCodebookInfo response:', response);
            resolve(response);
          });
        }),
        new Promise((resolve) => {
          browser.runtime.sendMessage({ type: 'getPrediction' }, (response: any) => {
            console.log('[Popup] getPrediction response:', response);
            resolve(response);
          });
        })
      ]);

      return {
        modelInfo: (modelResponse as any)?.success ? (modelResponse as any).data : (modelResponse as any)?.modelInfo,
        isReady: (modelResponse as any)?.success ? ((modelResponse as any).data ? true : false) : (modelResponse as any)?.isReady,
        codebookInfo: (codebookResponse as any)?.success ? (codebookResponse as any).data : (codebookResponse as any)?.codebookInfo,
        lastPrediction: (predictionResponse as any)?.success ? (predictionResponse as any).data : (predictionResponse as any)?.prediction
      };
    } catch (error) {
      console.error('[Popup] Error in getModelInfoData:', error);
      throw error;
    }
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