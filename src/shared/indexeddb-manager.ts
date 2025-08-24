/// <reference path="./types.ts" />
import { SynapseEvent } from './types';

/**
 * IndexedDB Manager for Synapse Event Sequence Storage
 * 
 * This module provides high-performance event storage using IndexedDB,
 * replacing the chrome.storage.session approach for better scalability.
 */

interface SynapseDB extends IDBDatabase {
  // Type-safe database interface
}

interface EventRecord {
}

class IndexedDBManager {
  private dbName = 'synapse-events';
  private dbVersion = 1;
  private storeName = 'events';
  private db: SynapseDB | null = null;
  private readonly MAX_EVENTS = 5000; // Phase 1.2: Storage limit
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('[Synapse] IndexedDB init failed:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result as SynapseDB;
        console.log('[Synapse] IndexedDB initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result as SynapseDB;
        
        // Create events store with timestamp index
        const store = db.createObjectStore(this.storeName, { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        
        // Create indices for efficient querying
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('domain', 'domain', { unique: false });
        store.createIndex('url', 'url', { unique: false });
        
        console.log('[Synapse] IndexedDB schema created');
      };
    });

    return this.initPromise;
  }

  /**
   * Add a single event to the database
   * O(1) complexity for individual inserts
   */
  async addEvent(event: SynapseEvent): Promise<void> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    
    let url = '';
    let domain = '';
    
    // Extract URL based on event type
    if (event.type === 'user_action_click' || event.type === 'user_action_keydown' || event.type === 'user_action_text_input') {
      url = (event.payload as any)?.url || '';
    } else if (event.type === 'browser_action_tab_created' || event.type === 'browser_action_tab_updated') {
      url = (event.payload as any)?.url || '';
    }
    
    domain = this.extractDomain(url);
    
    const eventRecord: EventRecord = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      event: event,
      timestamp: event.timestamp
    };

    return new Promise((resolve, reject) => {
      const request = store.add(eventRecord);
      
      request.onsuccess = async () => {
        // Phase 1.2: Check and enforce storage limit
        await this.enforceStorageLimit();
        resolve();
      };
      
      request.onerror = () => {
        console.error('[Synapse] Failed to add event:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Add multiple events in a single transaction (batch operation)
   */
  async addEvents(events: SynapseEvent[]): Promise<void> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    
    return new Promise((resolve, reject) => {
      let completed = 0;
      let hasError = false;

      events.forEach(event => {
        let url = '';
        let domain = '';
        
        // Extract URL based on event type
        if (event.type === 'user_action_click' || event.type === 'user_action_keydown' || event.type === 'user_action_text_input') {
          url = (event.payload as any)?.url || '';
        } else if (event.type === 'browser_action_tab_created' || event.type === 'browser_action_tab_updated') {
          url = (event.payload as any)?.url || '';
        }
        
        domain = this.extractDomain(url);
        
        const eventRecord: EventRecord = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          event: event,
          timestamp: event.timestamp
        };

        const request = store.add(eventRecord);
        
        request.onsuccess = () => {
          completed++;
          if (completed === events.length && !hasError) {
            this.enforceStorageLimit().then(() => resolve());
          }
        };
        
        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            console.error('[Synapse] Batch add failed:', request.error);
            reject(request.error);
          }
        };
      });
    });
  }

  /**
   * Get recent events for training/prediction
   * Efficient query using timestamp index
   */
  async getRecentEvents(limit: number = 1000): Promise<SynapseEvent[]> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    const index = store.index('timestamp');
    
    return new Promise((resolve, reject) => {
      const events: SynapseEvent[] = [];
      const request = index.openCursor(null, 'prev'); // Descending order by timestamp
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && events.length < limit) {
          const eventRecord = cursor.value as EventRecord;
          events.push(eventRecord.event);
          cursor.continue();
        } else {
          // Return in chronological order (reverse the array)
          resolve(events.reverse());
        }
      };
      
      request.onerror = () => {
        console.error('[Synapse] Failed to get recent events:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get events within a time range
   */
  async getEventsByTimeRange(startTime: number, endTime: number): Promise<SynapseEvent[]> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    const index = store.index('timestamp');
    const range = IDBKeyRange.bound(startTime, endTime);
    
    return new Promise((resolve, reject) => {
      const events: SynapseEvent[] = [];
      const request = index.openCursor(range);
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const eventRecord = cursor.value as EventRecord;
          events.push(eventRecord.event);
          cursor.continue();
        } else {
          resolve(events);
        }
      };
      
      request.onerror = () => {
        console.error('[Synapse] Failed to get events by time range:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get total event count
   */
  async getTotalEventCount(): Promise<number> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.count();
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        console.error('[Synapse] Failed to get event count:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get statistics about stored events
   */
  async getEventStatistics(): Promise<{
    totalEvents: number;
    oldestTimestamp: number;
    newestTimestamp: number;
    eventTypes: Record<string, number>;
    topDomains: Record<string, number>;
  }> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    
    return new Promise((resolve, reject) => {
      let totalEvents = 0;
      let oldestTimestamp = Infinity;
      let newestTimestamp = 0;
      const eventTypes: Record<string, number> = {};
      const topDomains: Record<string, number> = {};
      
      const request = store.openCursor();
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const record = cursor.value as EventRecord;
          totalEvents++;
          
          // Update timestamp range
          oldestTimestamp = Math.min(oldestTimestamp, record.timestamp);
          newestTimestamp = Math.max(newestTimestamp, record.timestamp);
          
          // Count event types
          eventTypes[record.event.type] = (eventTypes[record.event.type] || 0) + 1;
          
          // Count domains from event context
          const domain = record.event.context?.url ? this.extractDomain(record.event.context.url) : 'unknown';
          topDomains[domain] = (topDomains[domain] || 0) + 1;
          
          cursor.continue();
        } else {
          resolve({
            totalEvents,
            oldestTimestamp: oldestTimestamp === Infinity ? 0 : oldestTimestamp,
            newestTimestamp,
            eventTypes,
            topDomains
          });
        }
      };
      
      request.onerror = () => {
        console.error('[Synapse] Failed to get statistics:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clear all events (for debugging/reset)
   */
  async clearAllEvents(): Promise<void> {
    await this.ensureInitialized();
    
    const transaction = this.db!.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.clear();
      
      request.onsuccess = () => {
        console.log('[Synapse] All events cleared from IndexedDB');
        resolve();
      };
      
      request.onerror = () => {
        console.error('[Synapse] Failed to clear events:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Phase 1.2: Enforce storage limit by removing oldest events
   */
  private async enforceStorageLimit(): Promise<void> {
    const totalCount = await this.getTotalEventCount();
    
    if (totalCount <= this.MAX_EVENTS) {
      return; // Within limit
    }
    
    const eventsToRemove = totalCount - this.MAX_EVENTS;
    console.log(`[Synapse] Storage limit exceeded. Removing ${eventsToRemove} oldest events.`);
    
    const transaction = this.db!.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    const index = store.index('timestamp');
    
    return new Promise((resolve, reject) => {
      let removed = 0;
      const request = index.openCursor(); // Ascending order (oldest first)
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && removed < eventsToRemove) {
          const deleteRequest = cursor.delete();
          deleteRequest.onsuccess = () => {
            removed++;
            cursor.continue();
          };
          deleteRequest.onerror = () => {
            console.error('[Synapse] Failed to delete old event:', deleteRequest.error);
            reject(deleteRequest.error);
          };
        } else {
          console.log(`[Synapse] Successfully removed ${removed} old events`);
          resolve();
        }
      };
      
      request.onerror = () => {
        console.error('[Synapse] Failed to enforce storage limit:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  /**
   * Ensure database is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

// Global instance
export const indexedDBManager = new IndexedDBManager();