/**
 * Data Storage - Centralized data persistence layer
 */

import { StateManager } from './StateManager';

// Browser API compatibility using webextension-polyfill
declare var browser: any; // webextension-polyfill provides this globally

interface StorageConfig {
  batchWriteDelay: number;
  batchWriteMaxSize: number;
  maxSequenceSize: number;
}

export class DataStorage {
  private stateManager: StateManager;
  private config: StorageConfig;
  private pendingWrites: Map<string, any[]> = new Map();
  private writeTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(stateManager: StateManager, config?: Partial<StorageConfig>) {
    this.stateManager = stateManager;
    this.config = {
      batchWriteDelay: 5000,
      batchWriteMaxSize: 20,
      maxSequenceSize: 5000,
      ...config
    };
  }

  /**
   * Add an event to a sequence with batched writing
   */
  async addToSequence(sequenceKey: string, event: any): Promise<void> {
    try {
      // Get current sequence
      let sequence = await this.getSequence(sequenceKey) || [];
      
      // Add new event
      sequence.push(event);
      
      // Trim if too large
      if (sequence.length > this.config.maxSequenceSize) {
        sequence = sequence.slice(-this.config.maxSequenceSize);
      }
      
      // Add to pending writes
      if (!this.pendingWrites.has(sequenceKey)) {
        this.pendingWrites.set(sequenceKey, []);
      }
      this.pendingWrites.get(sequenceKey)!.push(event);
      
      // Check if we need to force write
      const pendingCount = this.pendingWrites.get(sequenceKey)!.length;
      if (pendingCount >= this.config.batchWriteMaxSize) {
        await this.flushPendingWrites(sequenceKey);
      } else {
        this.scheduleBatchWrite(sequenceKey);
      }
      
      // Update in-memory state immediately
      this.stateManager.set(sequenceKey, sequence);
      
    } catch (error) {
      console.error(`[DataStorage] Error adding to sequence ${sequenceKey}:`, error);
    }
  }

  /**
   * Get a sequence from storage
   */
  async getSequence(sequenceKey: string): Promise<any[]> {
    try {
      // Try memory first
      const memoryData = this.stateManager.get(sequenceKey);
      if (memoryData) {
        return memoryData;
      }

      // Fall back to browser storage
      const result = await browser.storage.local.get(sequenceKey);
      const sequence = result[sequenceKey] || [];
      
      // Cache in memory
      this.stateManager.set(sequenceKey, sequence);
      this.stateManager.markAsPersistent(sequenceKey);
      
      return sequence;
    } catch (error) {
      console.error(`[DataStorage] Error getting sequence ${sequenceKey}:`, error);
      return [];
    }
  }

  /**
   * Set an entire sequence
   */
  async setSequence(sequenceKey: string, sequence: any[]): Promise<void> {
    try {
      // Trim if too large
      if (sequence.length > this.config.maxSequenceSize) {
        sequence = sequence.slice(-this.config.maxSequenceSize);
      }

      // Update memory and mark as persistent
      this.stateManager.set(sequenceKey, sequence);
      this.stateManager.markAsPersistent(sequenceKey);
      
      // Clear any pending writes for this key
      this.clearPendingWrites(sequenceKey);
      
    } catch (error) {
      console.error(`[DataStorage] Error setting sequence ${sequenceKey}:`, error);
    }
  }

  /**
   * Delete a sequence
   */
  async deleteSequence(sequenceKey: string): Promise<void> {
    try {
      this.stateManager.delete(sequenceKey);
      this.clearPendingWrites(sequenceKey);
    } catch (error) {
      console.error(`[DataStorage] Error deleting sequence ${sequenceKey}:`, error);
    }
  }

  /**
   * Generic get method for plugin compatibility
   */
  async get(key: string): Promise<string | null> {
    try {
      const result = await browser.storage.local.get(key);
      return result[key] || null;
    } catch (error) {
      console.error(`[DataStorage] Failed to get data for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Generic set method for plugin compatibility
   */
  async set(key: string, value: string): Promise<void> {
    try {
      await browser.storage.local.set({ [key]: value });
    } catch (error) {
      console.error(`[DataStorage] Failed to set data for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{ bytesInUse: number; keys: string[] }> {
    try {
      const allData = await browser.storage.local.get(null);
      const keys = Object.keys(allData);
      
      // Calculate approximate size since getBytesInUse() is not supported in Firefox
      let bytesInUse = 0;
      try {
        if (browser.storage.local.getBytesInUse) {
          bytesInUse = await browser.storage.local.getBytesInUse();
        } else {
          // Fallback: estimate size by JSON string length
          const jsonString = JSON.stringify(allData);
          bytesInUse = new Blob([jsonString]).size;
        }
      } catch (e) {
        // Fallback calculation
        const jsonString = JSON.stringify(allData);
        bytesInUse = new Blob([jsonString]).size;
      }
      
      return { bytesInUse, keys };
    } catch (error) {
      console.error('[DataStorage] Error getting storage stats:', error);
      return { bytesInUse: 0, keys: [] };
    }
  }

  /**
   * Clear all storage data
   */
  async clearAll(): Promise<void> {
    try {
      await browser.storage.local.clear();
      this.stateManager.clear(true);
      this.clearAllPendingWrites();
    } catch (error) {
      console.error('[DataStorage] Error clearing all data:', error);
    }
  }

  /**
   * Manually flush all pending writes
   */
  async flushAllPendingWrites(): Promise<void> {
    const promises = Array.from(this.pendingWrites.keys()).map(key => 
      this.flushPendingWrites(key)
    );
    await Promise.all(promises);
  }

  /**
   * Export data for backup/analysis
   */
  async exportData(): Promise<Record<string, any>> {
    try {
      const allData = await browser.storage.local.get(null);
      return allData;
    } catch (error) {
      console.error('[DataStorage] Error exporting data:', error);
      return {};
    }
  }

  /**
   * Import data from backup
   */
  async importData(data: Record<string, any>): Promise<void> {
    try {
      await browser.storage.local.set(data);
      
      // Update in-memory state
      Object.entries(data).forEach(([key, value]) => {
        this.stateManager.set(key, value);
        this.stateManager.markAsPersistent(key);
      });
    } catch (error) {
      console.error('[DataStorage] Error importing data:', error);
    }
  }

  private scheduleBatchWrite(sequenceKey: string): void {
    // Clear existing timer
    const existingTimer = this.writeTimers.get(sequenceKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Schedule new write
    const timer = setTimeout(() => {
      this.flushPendingWrites(sequenceKey);
    }, this.config.batchWriteDelay);
    
    this.writeTimers.set(sequenceKey, timer);
  }

  private async flushPendingWrites(sequenceKey: string): Promise<void> {
    try {
      const pending = this.pendingWrites.get(sequenceKey);
      if (!pending || pending.length === 0) {
        return;
      }

      // Get current sequence and apply pending writes
      const currentSequence = this.stateManager.get(sequenceKey) || [];
      
      // Save to persistent storage
      await browser.storage.local.set({ [sequenceKey]: currentSequence });
      
      // Clear pending writes
      this.clearPendingWrites(sequenceKey);
      
    } catch (error) {
      console.error(`[DataStorage] Error flushing writes for ${sequenceKey}:`, error);
    }
  }

  private clearPendingWrites(sequenceKey: string): void {
    this.pendingWrites.delete(sequenceKey);
    
    const timer = this.writeTimers.get(sequenceKey);
    if (timer) {
      clearTimeout(timer);
      this.writeTimers.delete(sequenceKey);
    }
  }

  private clearAllPendingWrites(): void {
    this.pendingWrites.clear();
    
    this.writeTimers.forEach(timer => clearTimeout(timer));
    this.writeTimers.clear();
  }
}