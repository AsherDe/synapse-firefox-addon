/**
 * ML Service - Machine Learning functionality management
 */

import { StateManager } from './state-manager';
import { DataStorage } from './data-storage';

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
        break;
        
      case 'model_trained':
        this.stateManager.set('modelLastTrained', Date.now());
        this.stateManager.set('modelTrainingStatus', 'completed');
        break;
        
      case 'prediction_ready':
        this.stateManager.set('lastPrediction', message.data);
        break;
        
      case 'skills_updated':
        this.stateManager.set('skillsLastUpdated', Date.now());
        break;
        
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
      }, 30000); // 30 second timeout
      
      this.worker.postMessage(message);
    });
  }

  /**
   * Train the model with current sequence data
   */
  async trainModel(): Promise<void> {
    try {
      this.stateManager.set('modelTrainingStatus', 'training');
      
      const sequence = await this.dataStorage.getSequence('globalActionSequence');
      
      await this.sendToWorker({
        type: 'trainModel',
        data: { sequence }
      });
      
    } catch (error) {
      console.error('[MLService] Training failed:', error);
      this.stateManager.set('modelTrainingStatus', 'failed');
      throw error;
    }
  }

  /**
   * Get a prediction for the next action
   */
  async getPrediction(): Promise<any> {
    try {
      const result = await this.sendToWorker({
        type: 'getPrediction'
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
        type: 'getModelInfo'
      });
    } catch (error) {
      console.error('[MLService] Failed to get model info:', error);
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
   * Get current skills
   */
  async getSkills(): Promise<any> {
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
   * Process an event for tokenization and skill detection
   */
  async processEvent(event: any): Promise<any> {
    try {
      return await this.sendToWorker({
        type: 'processEvent',
        data: { event }
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
   * Get the current status of the ML worker
   */
  getWorkerStatus(): string {
    return this.stateManager.get('mlWorkerStatus') || 'unknown';
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