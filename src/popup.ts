/// <reference path="./types.ts" />
// Licensed under the Apache License, Version 2.0

class PopupController {
  private sequence: GlobalActionSequence = [];
  private updateInterval: number | null = null;

  constructor() {
    this.loadSequence();
    this.loadPrediction();
    this.loadModelInfo();
    this.setupEventListeners();
    this.startPeriodicUpdates();
  }

  private setupEventListeners(): void {
    const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
    const devModeBtn = document.getElementById('devModeBtn') as HTMLButtonElement;
    const closeDev = document.getElementById('closeDev') as HTMLButtonElement;

    clearBtn.addEventListener('click', () => {
      this.clearSequence();
    });

    devModeBtn.addEventListener('click', () => {
      this.toggleDevMode();
    });

    closeDev.addEventListener('click', () => {
      this.toggleDevMode();
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
    chrome.runtime.sendMessage({ type: 'clearSequence' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to clear sequence:', chrome.runtime.lastError.message);
        return;
      }
      if (response && response.success) {
        this.sequence = [];
        this.updateSequenceDisplay();
        console.log('Sequence cleared and UI updated.');
      }
    });
  }

  private loadSequence(): void {
    chrome.runtime.sendMessage({ type: 'getSequence' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to load sequence:', chrome.runtime.lastError.message);
        return;
      }
      if (response && response.sequence) {
        this.sequence = response.sequence;
        this.updateSequenceDisplay();
      }
    });
  }

  private loadPrediction(): void {
    chrome.runtime.sendMessage({ type: 'getPrediction' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to load prediction:', chrome.runtime.lastError.message);
        return;
      }
      this.updatePredictionDisplay(response?.prediction);
    });
  }

  private loadModelInfo(): void {
    chrome.runtime.sendMessage({ type: 'getModelInfo' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to load model info:', chrome.runtime.lastError.message);
        return;
      }
      this.updateModelInfoDisplay(response?.modelInfo, response?.isReady);
    });
  }

  private startPeriodicUpdates(): void {
    // Update prediction and model info every 5 seconds
    this.updateInterval = window.setInterval(() => {
      this.loadPrediction();
      this.loadModelInfo();
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
      if (this.updateInterval) {
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
      chrome.runtime.sendMessage({ type: 'getCodebookInfo' }, (response) => {
        if (response && codebookInfoElement) {
          codebookInfoElement.textContent = JSON.stringify(response, null, 2);
        }
      });
    }
  }

  private async loadModelDebugInfo(): Promise<void> {
    const modelArchElement = document.getElementById('modelArchitecture');
    const trainingHistoryElement = document.getElementById('trainingHistory');

    chrome.runtime.sendMessage({ type: 'getModelInfo' }, (response) => {
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
      chrome.storage.session.getBytesInUse(null, (sessionBytes) => {
        chrome.storage.local.getBytesInUse(null, (localBytes) => {
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
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});