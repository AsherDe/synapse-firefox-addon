import { SynapseEvent } from '../shared/types';
import { DebugTools } from './DebugTools';
import { UIManager } from './UIManager';
import { DataExporter } from './DataExporter';

declare var browser: any;

export class PopupController {
  private sequence: SynapseEvent[] = [];
  private updateInterval: number | null = null;
  private backgroundPort: any | null = null;
  
  // Specialized modules
  private debugTools: DebugTools;
  private uiManager: UIManager;
  private dataExporter: DataExporter;

  constructor() {
    this.uiManager = new UIManager();
    this.debugTools = new DebugTools(this.sequence);
    this.dataExporter = new DataExporter(this.sequence);
    
    this.setupBackgroundConnection();
    this.setupEventListeners();
  }

  private setupBackgroundConnection(): void {
    try {
      this.backgroundPort = browser.runtime.connect({ name: 'popup' });
      
      this.backgroundPort.onMessage.addListener((message: any) => {
        this.handleBackgroundMessage(message);
      });
      
      this.backgroundPort.onDisconnect.addListener(() => {
        console.log('[Popup] Background connection disconnected');
        this.backgroundPort = null;
        
        setTimeout(() => {
          this.setupBackgroundConnection();
        }, 1000);
      });
      
      this.backgroundPort.postMessage({ type: 'requestInitialData' });
      
      console.log('[Popup] Long-lived connection established with background');
    } catch (error) {
      console.error('[Popup] Failed to establish background connection:', error);
      this.startPeriodicUpdates();
    }
  }

  private handleBackgroundMessage(message: any): void {
    switch (message.type) {
      case 'sequenceUpdate':
        this.sequence = message.data.sequence || [];
        this.updateAllModules();
        this.uiManager.updateSequence(this.sequence);
        break;
        
      case 'eventAdded':
        if (message.data) {
          this.sequence.push(message.data);
          this.updateAllModules();
          this.uiManager.updateSequence(this.sequence);
        }
        break;
        
      case 'sequenceCleared':
        this.sequence = [];
        this.updateAllModules();
        this.uiManager.updateSequence(this.sequence);
        break;
        
      case 'predictionUpdate':
        this.uiManager.updatePredictionDisplay(message.data);
        break;
        
      case 'modelInfoUpdate':
        if (message.data) {
          const isReady = message.data.status === 'ready';
          this.uiManager.updateModelInfoDisplay(message.data, isReady);
        }
        break;
        
      case 'pauseStateChanged':
        this.uiManager.updatePauseUI(message.data);
        break;
        
      case 'dataReset':
        this.sequence = [];
        this.updateAllModules();
        this.uiManager.updateSequence(this.sequence);
        this.uiManager.updatePredictionDisplay(null);
        break;
        
      case 'dataCleared':
        this.sequence = [];
        this.updateAllModules();
        this.uiManager.updateSequence(this.sequence);
        break;
        
      case 'initialData':
        console.log('[Popup] Received initial data:', message.data);
        if (message.data.sequence) {
          this.sequence = message.data.sequence;
          this.updateAllModules();
          this.uiManager.updateSequence(this.sequence);
        }
        if (message.data.prediction) {
          this.uiManager.updatePredictionDisplay(message.data.prediction);
        }
        if (message.data.modelInfo) {
          const isReady = message.data.modelInfo.status === 'ready';
          this.uiManager.updateModelInfoDisplay(message.data.modelInfo, isReady);
        }
        if (message.data.paused !== undefined) {
          this.uiManager.updatePauseUI(message.data.paused);
        }
        if (message.data.guidanceEnabled !== undefined) {
          this.uiManager.updateGuidanceUI(message.data.guidanceEnabled);
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

    clearBtn.addEventListener('click', () => this.clearSequence());
    toggleBtn.addEventListener('click', () => this.togglePause());
    devModeBtn.addEventListener('click', () => this.debugTools.toggleDevMode());
    closeDev.addEventListener('click', () => this.debugTools.toggleDevMode());
    
    exportBtn?.addEventListener('click', async () => {
      try {
        this.uiManager.showExportMessage('Export started...', 'success');
        await this.dataExporter.exportAllData();
        this.uiManager.showExportMessage('Data exported successfully!', 'success');
      } catch (error) {
        console.error('[Synapse] Error exporting data:', error);
        this.uiManager.showExportMessage('Export failed. Check console for details.', 'error');
      }
    });

    guidanceToggle?.addEventListener('change', (e) => {
      this.toggleGuidance((e.target as HTMLInputElement).checked);
    });

    // Developer mode tab switching
    const devTabs = document.querySelectorAll('.dev-tab');
    devTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        this.debugTools.switchDevTab(target.dataset.tab!);
      });
    });
  }

  private clearSequence(): void {
    if (this.backgroundPort) {
      this.backgroundPort.postMessage({ type: 'clearSequence' });
    } else {
      browser.runtime.sendMessage({ type: 'clearSequence' });
    }
  }

  private togglePause(): void {
    if (this.backgroundPort) {
      this.backgroundPort.postMessage({ type: 'togglePause' });
    } else {
      browser.runtime.sendMessage({ type: 'togglePause' });
    }
  }

  private toggleGuidance(enabled: boolean): void {
    console.log(`Smart guidance ${enabled ? 'enabled' : 'disabled'}`);
    
    browser.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
      if (tabs[0]?.id) {
        browser.tabs.sendMessage(tabs[0].id, {
          type: 'guidanceToggled',
          enabled: enabled
        });
      }
    });
    
    if (this.backgroundPort) {
      this.backgroundPort.postMessage({ type: 'setGuidanceState', enabled });
      this.backgroundPort.postMessage({ type: 'guidanceToggled', enabled });
    }
  }

  private startPeriodicUpdates(): void {
    console.log('[Popup] Using fallback periodic updates');
    this.updateInterval = window.setInterval(() => {
      this.loadPrediction();
      this.loadPauseState();
    }, 5000);
  }

  private loadPrediction(): void {
    browser.runtime.sendMessage({ type: 'getPrediction' }, (response: any) => {
      if (browser.runtime.lastError) {
        console.error('Failed to load prediction:', browser.runtime.lastError.message);
        return;
      }
      const prediction = response?.success ? response.data : response?.prediction;
      this.uiManager.updatePredictionDisplay(prediction);
    });
  }

  private loadPauseState(): void {
    browser.runtime.sendMessage({ type: 'getPauseState' }, (response: any) => {
      if (browser.runtime.lastError) {
        console.error('Failed to load pause state:', browser.runtime.lastError.message);
        return;
      }
      const isPaused = response?.success ? response.data : response?.isPaused;
      this.uiManager.updatePauseUI(isPaused || false);
    });
  }

  private updateAllModules(): void {
    this.debugTools.updateSequence(this.sequence);
    this.dataExporter.updateSequence(this.sequence);
  }
}