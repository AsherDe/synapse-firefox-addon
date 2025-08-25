/**
 * State Manager - Centralized state management for the extension
 */

import { TaskState } from '../../shared/types';

// Browser API compatibility using webextension-polyfill
declare var browser: any; // webextension-polyfill provides this globally

interface ExtensionState {
  [key: string]: any;
  activeTask?: TaskState | null;
  isPaused?: boolean;
  smartAssistantEnabled?: boolean;
}

type StateChangeListener = (newValue: any, oldValue: any) => void;

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
    this.notifyListeners(key, value, oldValue);
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
      this.notifyListeners(key, undefined, oldValue);
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

  private notifyListeners(key: string, newValue: any, oldValue: any): void {
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      keyListeners.forEach(listener => {
        try {
          listener(newValue, oldValue);
        } catch (error) {
          console.error(`[StateManager] Error in listener for ${key}:`, error);
        }
      });
    }
  }

  // Task management convenience methods
  
  /**
   * Set the active task state
   */
  setActiveTask(task: TaskState | null): void {
    this.set('activeTask', task);
  }

  /**
   * Get the active task state
   */
  getActiveTask(): TaskState | null {
    return this.get('activeTask') || null;
  }

  /**
   * Update the current step of the active task
   */
  updateTaskStep(stepNumber: number): void {
    const activeTask = this.getActiveTask();
    if (activeTask) {
      activeTask.currentStep = stepNumber;
      activeTask.lastActionAt = Date.now();
      this.setActiveTask(activeTask);
    }
  }

  /**
   * Complete the active task
   */
  completeActiveTask(): void {
    const activeTask = this.getActiveTask();
    if (activeTask) {
      activeTask.isActive = false;
      this.setActiveTask(null);
    }
  }

  /**
   * Check if user is currently in a task
   */
  isInTask(): boolean {
    const activeTask = this.getActiveTask();
    return activeTask !== null && activeTask.isActive;
  }

  /**
   * Check if task has timed out (no activity for 30 seconds)
   */
  isTaskTimedOut(): boolean {
    const activeTask = this.getActiveTask();
    if (!activeTask) return false;
    
    const timeout = 30 * 1000; // 30 seconds
    return Date.now() - activeTask.lastActionAt > timeout;
  }
}