/**
 * State Manager - Centralized state management for the background script
 */

interface StateChangeListener {
  (key: string, oldValue: any, newValue: any): void;
}

export class StateManager {
  private state: Map<string, any> = new Map();
  private listeners: Map<string, Set<StateChangeListener>> = new Map();
  private persistentKeys: Set<string> = new Set();

  constructor() {
    this.loadPersistentState();
  }

  /**
   * Set a value in the state
   */
  set(key: string, value: any): void {
    const oldValue = this.state.get(key);
    this.state.set(key, value);

    // Persist if marked as persistent
    if (this.persistentKeys.has(key)) {
      this.persistValue(key, value);
    }

    // Notify listeners
    this.notifyListeners(key, oldValue, value);
  }

  /**
   * Get a value from the state
   */
  get(key: string): any {
    return this.state.get(key);
  }

  /**
   * Check if a key exists in the state
   */
  has(key: string): boolean {
    return this.state.has(key);
  }

  /**
   * Delete a key from the state
   */
  delete(key: string): boolean {
    const oldValue = this.state.get(key);
    const deleted = this.state.delete(key);

    if (deleted) {
      // Remove from persistent storage if needed
      if (this.persistentKeys.has(key)) {
        browser.storage.local.remove(key);
      }

      // Notify listeners
      this.notifyListeners(key, oldValue, undefined);
    }

    return deleted;
  }

  /**
   * Mark a key as persistent (will be saved to browser storage)
   */
  markAsPersistent(key: string): void {
    this.persistentKeys.add(key);
    
    // Persist current value if it exists
    if (this.state.has(key)) {
      this.persistValue(key, this.state.get(key));
    }
  }

  /**
   * Unmark a key as persistent
   */
  unmarkAsPersistent(key: string): void {
    this.persistentKeys.delete(key);
    browser.storage.local.remove(key);
  }

  /**
   * Add a listener for state changes on a specific key
   */
  addListener(key: string, listener: StateChangeListener): void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);
  }

  /**
   * Remove a listener for a specific key
   */
  removeListener(key: string, listener: StateChangeListener): void {
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      keyListeners.delete(listener);
      if (keyListeners.size === 0) {
        this.listeners.delete(key);
      }
    }
  }

  /**
   * Get all keys in the state
   */
  keys(): string[] {
    return Array.from(this.state.keys());
  }

  /**
   * Clear all state (non-persistent only by default)
   */
  clear(includePersistent: boolean = false): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.state.keys()) {
      if (!this.persistentKeys.has(key) || includePersistent) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.delete(key));
  }

  /**
   * Export current state
   */
  exportState(): Record<string, any> {
    const exported: Record<string, any> = {};
    for (const [key, value] of this.state) {
      exported[key] = value;
    }
    return exported;
  }

  /**
   * Import state from an object
   */
  importState(stateObject: Record<string, any>): void {
    Object.entries(stateObject).forEach(([key, value]) => {
      this.set(key, value);
    });
  }

  private async persistValue(key: string, value: any): Promise<void> {
    try {
      await browser.storage.local.set({ [key]: value });
    } catch (error) {
      console.error(`[StateManager] Failed to persist ${key}:`, error);
    }
  }

  private async loadPersistentState(): Promise<void> {
    try {
      // Load all persistent keys that were previously marked
      const result = await browser.storage.local.get(null);
      Object.entries(result).forEach(([key, value]) => {
        this.state.set(key, value);
        this.persistentKeys.add(key);
      });
    } catch (error) {
      console.error('[StateManager] Failed to load persistent state:', error);
    }
  }

  private notifyListeners(key: string, oldValue: any, newValue: any): void {
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      keyListeners.forEach(listener => {
        try {
          listener(key, oldValue, newValue);
        } catch (error) {
          console.error(`[StateManager] Error in listener for ${key}:`, error);
        }
      });
    }
  }
}