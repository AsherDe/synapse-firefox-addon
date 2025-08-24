import { SynapseEvent } from '../shared/types';

declare var browser: any;

export class DebugTools {
  private sequence: SynapseEvent[] = [];

  constructor(sequence: SynapseEvent[]) {
    this.sequence = sequence;
  }

  public updateSequence(newSequence: SynapseEvent[]): void {
    this.sequence = newSequence;
  }

  public toggleDevMode(): void {
    const devPanel = document.getElementById('devModePanel');
    if (!devPanel) return;

    if (devPanel.style.display === 'none') {
      devPanel.style.display = 'block';
      this.loadDevModeData();
    } else {
      devPanel.style.display = 'none';
    }
  }

  public switchDevTab(tabName: string): void {
    const tabs = document.querySelectorAll('.dev-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

    const contents = document.querySelectorAll('.dev-content');
    contents.forEach(content => content.classList.remove('active'));
    document.getElementById(`dev-${tabName}`)?.classList.add('active');

    this.loadDevTabData(tabName);
    this.addRefreshButton(tabName);
  }

  private addRefreshButton(tabName: string): void {
    const tabContent = document.getElementById(`dev-${tabName}`);
    if (!tabContent) return;
    
    if (tabContent.querySelector('.btn')) return;
    
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn btn-secondary';
    refreshBtn.textContent = '🔄 Refresh Data';
    refreshBtn.style.marginBottom = '16px';
    
    refreshBtn.addEventListener('click', () => {
      this.loadDevTabData(tabName);
    });
    
    tabContent.insertBefore(refreshBtn, tabContent.firstChild);
  }

  private async loadDevModeData(): Promise<void> {
    this.loadDevTabData('events');
  }

  private async loadDevTabData(tabName: string): Promise<void> {
    const tabContent = document.getElementById(`dev-${tabName}`);
    const elements = tabContent?.querySelectorAll('pre, textarea');
    elements?.forEach(el => {
      if (el.tagName === 'PRE') {
        (el as HTMLPreElement).textContent = 'Loading...';
      }
    });
    
    try {
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
    } catch (error) {
      console.error(`[Popup] Error loading ${tabName} data:`, error);
      elements?.forEach(el => {
        if (el.tagName === 'PRE') {
          (el as HTMLPreElement).textContent = `Error: ${(error as Error).message}`;
        }
      });
    }
  }

  private async loadRawEvents(): Promise<void> {
    const rawEventsElement = document.getElementById('rawEvents');
    if (!rawEventsElement) return;

    try {
      const debugData = {
        timestamp: new Date().toISOString(),
        totalEvents: this.sequence.length,
        recentEvents: this.sequence.slice(-10),
        eventTypes: Object.keys(this.getEventTypeDistribution())
      };
      this.setElementContent(rawEventsElement, debugData);
    } catch (error) {
      this.setElementContent(rawEventsElement, { error: (error as Error).message }, true);
    }
  }

  private async loadTokenStatistics(): Promise<void> {
    const tokenStatsElement = document.getElementById('tokenStats');
    const codebookInfoElement = document.getElementById('codebookInfo');
    
    try {
      if (tokenStatsElement) {
        const stats = {
          timestamp: new Date().toISOString(),
          totalEvents: this.sequence.length,
          eventTypes: this.getEventTypeDistribution(),
          recentActivity: this.getRecentActivity()
        };
        this.setElementContent(tokenStatsElement, stats);
      }

      if (codebookInfoElement) {
        this.setElementContent(codebookInfoElement, 'Loading...');
        const response = await new Promise<any>(resolve => {
          browser.runtime.sendMessage({ type: 'getCodebookInfo' }, resolve);
        });
        
        const data = response?.success ? response.data : response;
        const codebookData = {
          timestamp: new Date().toISOString(),
          ...data
        };
        this.setElementContent(codebookInfoElement, codebookData);
      }
    } catch (error) {
      if (codebookInfoElement) {
        this.setElementContent(codebookInfoElement, { error: (error as Error).message }, true);
      }
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
      const modelInfo = modelResp?.success ? modelResp.data : modelResp;
      const stateData = stateResp?.success ? stateResp.data : {};
      const isReady = modelInfo?.status === 'ready';

      if (modelArchElement && modelInfo) {
        this.setElementContent(modelArchElement, modelInfo);
      }

      if (trainingHistoryElement) {
        const history = {
          lastTraining: null,
          trainingStatus: 'unknown',
          trainingInProgress: false,
          totalTrainingSessions: 0,
          modelReady: isReady,
          lastPrediction: stateData.lastPrediction ? {
            token: stateData.lastPrediction.token || stateData.lastPrediction.tokenId,
            confidence: stateData.lastPrediction.confidence
          } : null,
          workerStatus: modelInfo?.status || 'unknown'
        };
        this.setElementContent(trainingHistoryElement, history);
      }
    } catch (err) {
      if (trainingHistoryElement) {
        this.setElementContent(trainingHistoryElement, { error: (err as Error).message }, true);
      }
    }
  }

  private async loadDebugInfo(): Promise<void> {
    const debugConsoleElement = document.getElementById('debugConsole');
    const storageInfoElement = document.getElementById('storageInfo');

    try {
      if (debugConsoleElement) {
        const debugInfo = {
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          popup: {
            sequenceLength: this.sequence.length,
            updateInterval: false // Will be updated by caller if needed
          },
          browser: {
            name: this.getBrowserName(),
            version: this.getBrowserVersion()
          }
        };
        this.setElementContent(debugConsoleElement, debugInfo);
      }

      if (storageInfoElement) {
        this.setElementContent(storageInfoElement, 'Loading storage info...');
        const response = await new Promise<any>(resolve => {
          browser.runtime.sendMessage({ type: 'getStorageOverview' }, resolve);
        });
        
        const data = response?.data || {};
        const storageInfo = {
          timestamp: new Date().toISOString(),
          bytesInUse: data.bytesInUse || 0,
          keys: data.keys || [],
          quota: data.quota || 'unknown'
        };
        this.setElementContent(storageInfoElement, storageInfo);
      }
    } catch (error) {
      if (storageInfoElement) {
        this.setElementContent(storageInfoElement, { error: (error as Error).message }, true);
      }
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
      lastEvent: this.sequence.length > 0 ? new Date(this.sequence[this.sequence.length - 1].timestamp).toISOString() : null,
      avgEventsPerMinute: Math.round(recentEvents.length / 60 * 100) / 100
    };
  }

  private getBrowserName(): string {
    // Use WebExtension API for reliable browser detection
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getBrowserInfo) {
      // Firefox supports getBrowserInfo
      browser.runtime.getBrowserInfo().then((info: { name: string }) => info.name).catch(() => 'Unknown');
    }
    
    // Fallback to user agent detection for other browsers
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';  // Modern Edge uses 'Edg/'
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    return 'Unknown';
  }

  private getBrowserVersion(): string {
    // Use WebExtension API when available
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getBrowserInfo) {
      browser.runtime.getBrowserInfo().then((info: { version: string }) => info.version).catch(() => 'Unknown');
    }
    
    // Fallback: more robust regex for version extraction
    const ua = navigator.userAgent;
    const patterns = [
      /Firefox\/([0-9.]+)/,
      /Edg\/([0-9.]+)/,      // Modern Edge
      /Chrome\/([0-9.]+)/,
      /Version\/([0-9.]+).*Safari/  // Safari version pattern
    ];
    
    for (const pattern of patterns) {
      const match = ua.match(pattern);
      if (match) return match[1];
    }
    
    return 'Unknown';
  }

  private formatJsonWithSyntaxHighlight(obj: any): string {
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch (e) {
        return obj;
      }
    }

    const jsonString = JSON.stringify(obj, null, 2);
    return jsonString.replace(
      /"([^"]+)"(\s*):/g,
      '<span class="json-key">"$1"</span>$2<span class="json-punctuation">:</span>'
    ).replace(
      /"([^"]*)"/g,
      '<span class="json-string">"$1"</span>'
    ).replace(
      /\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g,
      '<span class="json-number">$1</span>'
    ).replace(
      /\b(true|false)\b/g,
      '<span class="json-boolean">$1</span>'
    ).replace(
      /\bnull\b/g,
      '<span class="json-null">null</span>'
    ).replace(
      /([{}\[\],])/g,
      '<span class="json-punctuation">$1</span>'
    );
  }

  private setElementContent(element: HTMLElement, data: any, isError: boolean = false): void {
    if (isError) {
      element.innerHTML = `<div class="error-text">${this.escapeHtml(JSON.stringify(data, null, 2))}</div>`;
    } else if (data === 'Loading...') {
      element.innerHTML = '<div class="loading-indicator">⏳ Loading...</div>';
    } else {
      element.innerHTML = this.formatJsonWithSyntaxHighlight(data);
    }
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}