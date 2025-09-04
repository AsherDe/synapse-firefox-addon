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
    
    // Initialize LLM status display
    setTimeout(() => {
      this.updateLLMStatus();
    }, 1000);
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
        this.dataExporter.addPredictionEntry(message.data);
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
          this.dataExporter.addPredictionEntry(message.data.prediction);
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
        if (message.data.llmSettings) {
          this.displayLLMStatus(message.data.llmSettings);
        }
        break;
        
      case 'llmSettingsUpdate':
        this.displayLLMStatus(message.data);
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

    // LLM Control Event Listeners
    const llmToggle = document.getElementById('llmToggle') as HTMLInputElement;
    const llmAnalysisToggle = document.getElementById('llmAnalysisToggle') as HTMLInputElement;
    const llmPluginToggle = document.getElementById('llmPluginToggle') as HTMLInputElement;

    llmToggle?.addEventListener('change', (e) => {
      this.toggleLLM((e.target as HTMLInputElement).checked);
    });

    llmAnalysisToggle?.addEventListener('change', (e) => {
      this.toggleLLMAnalysis((e.target as HTMLInputElement).checked);
    });

    llmPluginToggle?.addEventListener('change', (e) => {
      this.toggleLLMPluginIntegration((e.target as HTMLInputElement).checked);
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

  // LLM Control Methods
  private toggleLLM(enabled: boolean): void {
    console.log(`LLM functionality ${enabled ? 'enabled' : 'disabled'}`);
    
    if (this.backgroundPort) {
      this.backgroundPort.postMessage({ type: 'toggleLLMEnabled' });
    } else {
      browser.runtime.sendMessage({ type: 'toggleLLMEnabled' });
    }
    
    // Update sub-controls based on main toggle
    const analysisToggle = document.getElementById('llmAnalysisToggle') as HTMLInputElement;
    const pluginToggle = document.getElementById('llmPluginToggle') as HTMLInputElement;
    const llmDetails = document.getElementById('llmDetails') as HTMLElement;
    
    if (analysisToggle) analysisToggle.disabled = !enabled;
    if (pluginToggle) pluginToggle.disabled = !enabled;
    if (llmDetails) llmDetails.style.opacity = enabled ? '1' : '0.5';
    
    this.updateLLMStatus();
  }

  private toggleLLMAnalysis(enabled: boolean): void {
    console.log(`LLM analysis ${enabled ? 'enabled' : 'disabled'}`);
    
    if (this.backgroundPort) {
      this.backgroundPort.postMessage({ type: 'setLLMAnalysisEnabled', enabled });
    } else {
      browser.runtime.sendMessage({ type: 'setLLMAnalysisEnabled', enabled });
    }
    
    this.updateLLMStatus();
  }

  private toggleLLMPluginIntegration(enabled: boolean): void {
    console.log(`LLM plugin integration ${enabled ? 'enabled' : 'disabled'}`);
    
    if (this.backgroundPort) {
      this.backgroundPort.postMessage({ type: 'setLLMPluginIntegration', enabled });
    } else {
      browser.runtime.sendMessage({ type: 'setLLMPluginIntegration', enabled });
    }
    
    this.updateLLMStatus();
  }

  private updateLLMStatus(): void {
    const statusText = document.getElementById('llmStatusText');
    if (!statusText) return;
    
    // Request current LLM settings from background
    const message = { type: 'getLLMSettings' };
    
    if (this.backgroundPort) {
      this.backgroundPort.postMessage(message);
    } else {
      browser.runtime.sendMessage(message, (response: any) => {
        if (response?.success && response.data) {
          this.displayLLMStatus(response.data);
        }
      });
    }
  }

  private displayLLMStatus(llmData: any): void {
    const statusText = document.getElementById('llmStatusText');
    const statusContainer = document.getElementById('llmStatus') as HTMLElement;
    
    if (!statusText || !statusContainer) return;
    
    let status = '';
    let bgColor = '#f8f9fa';
    
    if (llmData.llmEnabled) {
      if (llmData.hasPermission) {
        status = '✅ Active & Ready';
        bgColor = '#f0f9f0';
      } else {
        status = '⚠️ Enabled, Permission Needed';
        bgColor = '#fef8e7';
      }
    } else {
      status = '❌ Disabled';
      bgColor = '#fdf2f0';
    }
    
    statusText.textContent = status;
    statusContainer.style.background = bgColor;
    
    // Update sub-control states to match backend
    const llmToggle = document.getElementById('llmToggle') as HTMLInputElement;
    const analysisToggle = document.getElementById('llmAnalysisToggle') as HTMLInputElement;
    const pluginToggle = document.getElementById('llmPluginToggle') as HTMLInputElement;
    
    if (llmToggle) llmToggle.checked = llmData.llmEnabled;
    if (analysisToggle) {
      analysisToggle.checked = llmData.llmAnalysisEnabled;
      analysisToggle.disabled = !llmData.llmEnabled;
    }
    if (pluginToggle) {
      pluginToggle.checked = llmData.llmPluginIntegrationEnabled;
      pluginToggle.disabled = !llmData.llmEnabled;
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
      if (prediction) {
        this.dataExporter.addPredictionEntry(prediction);
      }
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