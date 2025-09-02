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
    // Initialize default LLM settings
    this.initializeDefaultSettings();
  }

  private initializeDefaultSettings(): void {
    // Initialize LLM feature toggle - default enabled but can be disabled
    if (!this.state.has('llmEnabled')) {
      this.set('llmEnabled', true);
      this.markAsPersistent('llmEnabled');
    }
    
    // Initialize LLM analysis settings
    if (!this.state.has('llmAnalysisEnabled')) {
      this.set('llmAnalysisEnabled', true);
      this.markAsPersistent('llmAnalysisEnabled');
    }
    
    // Initialize LLM plugin integration
    if (!this.state.has('llmPluginIntegration')) {
      this.set('llmPluginIntegration', true);
      this.markAsPersistent('llmPluginIntegration');
    }
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

  // LLM control convenience methods
  
  /**
   * Check if LLM functionality is enabled
   */
  isLLMEnabled(): boolean {
    return this.get('llmEnabled') === true;
  }

  /**
   * Enable or disable LLM functionality
   */
  setLLMEnabled(enabled: boolean): void {
    this.set('llmEnabled', enabled);
    console.log(`[StateManager] LLM functionality ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if LLM analysis is enabled
   */
  isLLMAnalysisEnabled(): boolean {
    return this.get('llmAnalysisEnabled') === true && this.isLLMEnabled();
  }

  /**
   * Enable or disable LLM analysis
   */
  setLLMAnalysisEnabled(enabled: boolean): void {
    this.set('llmAnalysisEnabled', enabled);
    console.log(`[StateManager] LLM analysis ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if LLM plugin integration is enabled
   */
  isLLMPluginIntegrationEnabled(): boolean {
    return this.get('llmPluginIntegration') === true && this.isLLMEnabled();
  }

  /**
   * Enable or disable LLM plugin integration
   */
  setLLMPluginIntegrationEnabled(enabled: boolean): void {
    this.set('llmPluginIntegration', enabled);
    console.log(`[StateManager] LLM plugin integration ${enabled ? 'enabled' : 'disabled'}`);
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

  // Clipboard context management convenience methods
  
  /**
   * Set clipboard context with enhanced metadata
   */
  setClipboardContext(context: any): void {
    this.set('clipboardContext', {
      ...context,
      cached_at: Date.now()
    });
  }

  /**
   * Get current clipboard context if still fresh
   */
  getClipboardContext(): any | null {
    const context = this.get('clipboardContext');
    if (!context) return null;
    
    const CONTEXT_EXPIRY = 5 * 60 * 1000; // 5 minutes
    if (Date.now() - context.cached_at > CONTEXT_EXPIRY) {
      this.delete('clipboardContext');
      return null;
    }
    
    return context;
  }

  /**
   * Check if clipboard context is available and fresh
   */
  hasClipboardContext(): boolean {
    return this.getClipboardContext() !== null;
  }

  /**
   * Clear expired clipboard context
   */
  clearExpiredClipboardContext(): void {
    const context = this.get('clipboardContext');
    if (context) {
      const CONTEXT_EXPIRY = 5 * 60 * 1000; // 5 minutes
      if (Date.now() - context.cached_at > CONTEXT_EXPIRY) {
        this.delete('clipboardContext');
      }
    }
  }

  /**
   * Update clipboard context usage statistics
   */
  updateClipboardUsage(contextId: string): void {
    const context = this.getClipboardContext();
    if (context && context.id === contextId) {
      context.usage_count = (context.usage_count || 0) + 1;
      context.last_used = Date.now();
      this.setClipboardContext(context);
    }
  }

  // Workflow state management enhancements
  
  /**
   * Set active workflow execution state
   */
  setActiveWorkflow(workflow: any): void {
    this.set('activeWorkflow', workflow);
  }

  /**
   * Get active workflow execution state
   */
  getActiveWorkflow(): any | null {
    return this.get('activeWorkflow') || null;
  }

  /**
   * Complete active workflow
   */
  completeActiveWorkflow(): void {
    const workflow = this.getActiveWorkflow();
    if (workflow) {
      workflow.completed_at = Date.now();
      workflow.is_active = false;
      this.set('completedWorkflows', [
        ...(this.get('completedWorkflows') || []).slice(-9), // Keep last 10
        workflow
      ]);
      this.delete('activeWorkflow');
    }
  }

  /**
   * Check if workflow is currently active
   */
  isWorkflowActive(): boolean {
    const workflow = this.getActiveWorkflow();
    return workflow !== null && workflow.is_active === true;
  }
}