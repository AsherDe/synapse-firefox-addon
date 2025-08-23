/**
 * ML Service - Centralized machine learning operations
 */

// Browser API compatibility using webextension-polyfill
declare var browser: any; // webextension-polyfill provides this globally

import { StateManager } from './StateManager';
import { DataStorage } from './DataStorage';

interface MLWorkerMessage {
  type: string;
  data?: any;
  requestId?: string;
}

interface MLWorkerResponse {
  type: string;
  data?: any;
  error?: string;
  requestId?: string;
}

export class MLService {
  private worker: Worker | null = null;
  private stateManager: StateManager;
  private dataStorage: DataStorage;
  private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();
  private requestCounter: number = 0;
  // Training concurrency control
  private trainingLock = false; // true while a trainModel call is in-flight
  private pendingTrainAfterCurrent = false; // flag to run another training right after current finishes

  // Normalize an event object to ensure it has the EnrichedEvent context
  private async normalizeEvent(event: any): Promise<any> {
    if (event && !event.context) {
      const tabId = event.tabId ?? null;
      let windowId: number | null = null;
      let tabInfo: chrome.tabs.Tab | undefined = undefined;
      if (typeof tabId === 'number') {
        try {
          const fetched = await browser.tabs.get(tabId);
            tabInfo = fetched;
            windowId = fetched?.windowId ?? null;
        } catch {/* ignore */}
      }
      event.context = { tabId, windowId, tabInfo };
    }
    return event;
  }

  private async normalizeSequence(sequence: any[]): Promise<any[]> {
    return Promise.all(sequence.map(ev => this.normalizeEvent(ev)));
  }

  constructor(stateManager: StateManager, dataStorage: DataStorage) {
    this.stateManager = stateManager;
    this.dataStorage = dataStorage;
    this.initializeWorker();
  }

  private initializeWorker(): void {
    try {
      const workerUrl = browser.runtime.getURL('dist/ml-worker.js');
      console.log('[MLService] Initializing worker with URL:', workerUrl);
      
      this.worker = new Worker(workerUrl);
      
      this.worker.onmessage = (event: MessageEvent<MLWorkerResponse>) => {
        console.log('[MLService] Worker message received:', event.data);
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (error: ErrorEvent) => {
        console.error('[MLService] Worker error:', error);
        this.stateManager.set('mlWorkerStatus', 'error');
      };

      // Set initial status
      this.stateManager.set('mlWorkerStatus', 'initializing');
      console.log('[MLService] Worker initialization started');
      
    } catch (error) {
      console.error('[MLService] Failed to initialize worker:', error);
      this.stateManager.set('mlWorkerStatus', 'failed');
    }
  }

  private handleWorkerMessage(message: MLWorkerResponse): void {
    if (!message || !message.type) {
      console.warn('[MLService] Received an invalid or untyped message from worker:', message);
      return;
    }
    console.log('[MLService] Received from worker:', message.type);

    // Handle responses to specific requests
    if (message.requestId) {
      const pending = this.pendingRequests.get(message.requestId);
      if (pending) {
        this.pendingRequests.delete(message.requestId);
        
        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.data);
        }
        return;
      }
    }

    // Handle general worker messages
    switch (message.type) {
      case 'worker_ready':
        this.stateManager.set('mlWorkerStatus', 'ready');
        // [关键修复] 当 worker 就绪时，立即获取其详细信息
        // 并将其作为一个完整的对象存入状态管理器，以便广播
        this.getModelInfoWithRetry().then(infoResponse => {
          if (infoResponse && infoResponse.info) {
            const modelInfoData = {
              info: infoResponse.info,
              isReady: true,
              workerReady: true,
              workerStatus: 'ready'
            };
            this.stateManager.set('fullModelInfo', modelInfoData);
            console.log('[MLService] Full model info cached:', modelInfoData);
          }
        }).catch(err => {
          console.error('[MLService] Failed to get model info after worker ready:', err);
        });
        break;
        
      case 'training_complete':
        this.stateManager.set('modelLastTrained', Date.now());
        this.stateManager.set('modelTrainingStatus', 'completed');
        try {
          const currentSessions = this.stateManager.get('modelTrainingSessions') || 0;
          this.stateManager.set('modelTrainingSessions', currentSessions + 1);
        } catch {/* ignore */}
        console.log('[MLService] Training completed successfully');
        break;
        
      case 'prediction_result':
        this.stateManager.set('lastPrediction', message.data);
        console.log('[MLService] Prediction result received');
        break;
        
      case 'skills_result':
        this.stateManager.set('skillsLastUpdated', Date.now());
        console.log('[MLService] Skills updated');
        break;
        
      case 'info_result':
        console.log('[MLService] Model info received');
        break;
        
      case 'codebook_updated':
        console.log('[MLService] Codebook updated');
        break;
        
      case 'incremental_learning_complete':
        console.log('[MLService] Incremental learning completed');
        break;
      case 'event_processed': {
        // Store latest learning metrics & timestamp for UI/diagnostics
        const anyMsg: any = message;
        if (anyMsg.learningMetrics) {
          this.stateManager.set('learningMetrics', anyMsg.learningMetrics);
        }
        this.stateManager.set('lastEventProcessedAt', Date.now());
        break;
      }
        
      default:
        console.warn('[MLService] Unknown worker message type:', message.type);
    }
  }

  private sendToWorker(message: MLWorkerMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('ML Worker not initialized'));
        return;
      }

      const requestId = `req_${++this.requestCounter}`;
      message.requestId = requestId;
      
      this.pendingRequests.set(requestId, { resolve, reject });
      
      // Set timeout for requests
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('ML Worker request timeout'));
        }
      }, 180000); // 3min timeout
      
      this.worker.postMessage(message);
    });
  }

  /**
   * Train the model with current sequence data
   */
  async trainModel(): Promise<void> {
    // If a training job is already running, mark a pending retrigger and exit
    if (this.trainingLock) {
      this.pendingTrainAfterCurrent = true; // coalesce multiple rapid calls
      console.log('[MLService] Training already in progress; coalescing request.');
      return;
    }

    this.trainingLock = true;
    this.pendingTrainAfterCurrent = false; // reset before starting
    this.stateManager.set('modelTrainingStatus', 'training');
    this.stateManager.set('trainingInProgress', true);

    try {
      const sequence = await this.dataStorage.getSequence('globalActionSequence');
      const normalized = await this.normalizeSequence(sequence);

      await this.sendToWorker({
        type: 'train',
        data: { sequence: normalized }
      });
    } catch (error) {
      console.error('[MLService] Training failed:', error);
      this.stateManager.set('modelTrainingStatus', 'failed');
      throw error;
    } finally {
      // Release lock
      this.trainingLock = false;
      this.stateManager.set('trainingInProgress', false);
      // If another training was requested during execution, schedule it (microtask) to avoid deep recursion
      if (this.pendingTrainAfterCurrent) {
        console.log('[MLService] Running coalesced training request.');
        // Defer to next event loop turn
        setTimeout(() => {
          // Guard: if another training started in meantime, the lock will prevent duplicate
          this.trainModel().catch(err => console.error('[MLService] Coalesced training failed:', err));
        }, 0);
      }
    }
  }

  /**
   * Get a prediction for the next action
   */
  async getPrediction(): Promise<any> {
    try {
      // Get recent sequence for prediction
      const sequence = await this.dataStorage.getSequence('globalActionSequence');
      const currentSequence = sequence.slice(-10); // Get last 10 events for prediction
      const normalized = await this.normalizeSequence(currentSequence);
      
      const result = await this.sendToWorker({
        type: 'predict',
        data: { currentSequence: normalized }
      });
      
      this.stateManager.set('lastPrediction', result);
      return result;
      
    } catch (error) {
      console.error('[MLService] Prediction failed:', error);
      throw error;
    }
  }

  /**
   * Get model information
   */
  async getModelInfo(): Promise<any> {
    try {
      return await this.sendToWorker({
        type: 'getInfo'
      });
    } catch (error) {
      console.error('[MLService] Failed to get model info:', error);
      throw error;
    }
  }

  /**
   * Get model information with retry mechanism
   */
  async getModelInfoWithRetry(maxRetries: number = 3, delay: number = 1000): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[MLService] Getting model info (attempt ${attempt}/${maxRetries})`);
        const result = await this.getModelInfo();
        console.log('[MLService] Model info retrieved successfully:', result);
        return result;
      } catch (error) {
        console.error(`[MLService] Model info retrieval attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          console.log(`[MLService] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 1.5; // Exponential backoff
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Get learned skills
   */
  async getSkills(): Promise<any[]> {
    try {
      return await this.sendToWorker({
        type: 'getSkills'
      });
    } catch (error) {
      console.error('[MLService] Failed to get skills:', error);
      throw error;
    }
  }

  /**
   * Update skills database
   */
  async updateSkills(skills: any[]): Promise<void> {
    try {
      await this.sendToWorker({
        type: 'updateSkills',
        data: { skills }
      });
    } catch (error) {
      console.error('[MLService] Failed to update skills:', error);
      throw error;
    }
  }


  /**
   * Get current worker status
   */
  getWorkerStatus(): string {
    return this.stateManager.get('mlWorkerStatus') || 'initializing';
  }

  /**
   * Process an event for tokenization and skill detection
   */
  async processEvent(event: any): Promise<any> {
    try {
  event = await this.normalizeEvent(event);
      return await this.sendToWorker({
        type: 'processEvents',
        data: [event]  // ml-worker expects array of events
      });
    } catch (error) {
      console.error('[MLService] Failed to process event:', error);
      throw error;
    }
  }

  /**
   * Reset the model
   */
  async resetModel(): Promise<void> {
    try {
      await this.sendToWorker({
        type: 'resetModel'
      });
      
      this.stateManager.set('modelLastTrained', null);
      this.stateManager.set('lastPrediction', null);
      
    } catch (error) {
      console.error('[MLService] Failed to reset model:', error);
      throw error;
    }
  }


  /**
   * Restart the ML worker
   */
  restartWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    // Clear pending requests
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('Worker restarted'));
    });
    this.pendingRequests.clear();
    
    // Reinitialize
    this.initializeWorker();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('ML Service cleanup'));
    });
    this.pendingRequests.clear();
  }
}