import { SynapseEvent } from '../shared/types';

declare var browser: any;

export class DataExporter {
  private sequence: SynapseEvent[] = [];

  constructor(sequence: SynapseEvent[]) {
    this.sequence = sequence;
  }

  public updateSequence(newSequence: SynapseEvent[]): void {
    this.sequence = newSequence;
  }

  public async exportAllData(): Promise<void> {
    try {
      console.log('[Synapse] Export button clicked - starting data export...');

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
          updateIntervalActive: false
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

    } catch (error) {
      console.error('[Synapse] Error exporting data:', error);
      throw error;
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
    return new Promise((resolve) => {
      browser.runtime.sendMessage({ type: 'getState' }, (response: any) => {
        resolve({ stateSnapshot: response?.data || {} });
      });
    });
  }

  private async getModelInfoData(): Promise<any> {
    try {
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

      const modelInfo = (modelResponse as any)?.success ? (modelResponse as any).data : (modelResponse as any);
      return {
        modelInfo: modelInfo,
        isReady: modelInfo?.status === 'ready',
        codebookInfo: (codebookResponse as any)?.success ? (codebookResponse as any).data : (codebookResponse as any),
        lastPrediction: (predictionResponse as any)?.success ? (predictionResponse as any).data : (predictionResponse as any)
      };
    } catch (error) {
      console.error('[Popup] Error in getModelInfoData:', error);
      throw error;
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
}