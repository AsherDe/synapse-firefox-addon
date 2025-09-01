/**
 * Plugin Scheduler - Intent coordination without the complexity bullshit
 * Linus: "The best scheduler is no scheduler. This is the second best."
 */

import { PluginRegistry, PluginSuggestion } from '../plugins/base';
import { SynapseEvent } from '../../shared/types';
import { StateManager } from './StateManager';
import { MessageRouter } from './MessageRouter';

interface SchedulerConfig {
  maxConcurrentSuggestions: number;
  priorityThreshold: number;
  confidenceThreshold: number;
}

export class PluginScheduler {
  private registry: PluginRegistry;
  private stateManager: StateManager;
  private messageRouter: MessageRouter;
  private config: SchedulerConfig;
  private activeSuggestions = new Map<string, PluginSuggestion>();
  
  constructor(
    registry: PluginRegistry,
    stateManager: StateManager,
    messageRouter: MessageRouter,
    config: SchedulerConfig = {
      maxConcurrentSuggestions: 3,
      priorityThreshold: 0.5,
      confidenceThreshold: 0.3
    }
  ) {
    this.registry = registry;
    this.stateManager = stateManager;
    this.messageRouter = messageRouter;
    this.config = config;
  }
  
  async processEvent(event: SynapseEvent): Promise<void> {
    try {
      // Get all plugin suggestions
      const allSuggestions = await this.registry.processEvent(event);
      
      // Filter by confidence and priority
      const viableSuggestions = this.filterSuggestions(allSuggestions);
      
      if (viableSuggestions.length === 0) {
        return;
      }
      
      // Select the suggestion with the highest product of priority and confidence.
      // This approach balances both the importance of the suggestion and the system's certainty.
      const bestSuggestion = this.selectBestSuggestion(viableSuggestions);
      
      if (bestSuggestion) {
        await this.executeSuggestion(bestSuggestion);
      }
      
    } catch (error) {
      console.error('[PluginScheduler] Error processing event:', error);
    }
  }
  
  private filterSuggestions(suggestions: PluginSuggestion[]): PluginSuggestion[] {
    return suggestions.filter(s => 
      s.confidence >= this.config.confidenceThreshold &&
      s.priority >= this.config.priorityThreshold
    );
  }
  
  private selectBestSuggestion(suggestions: PluginSuggestion[]): PluginSuggestion | null {
    if (suggestions.length === 0) return null;
    
    // Check if we're at max concurrent suggestions
    if (this.activeSuggestions.size >= this.config.maxConcurrentSuggestions) {
      return null;
    }
    
    // Sort by score (priority * confidence) descending
    suggestions.sort((a, b) => (b.priority * b.confidence) - (a.priority * a.confidence));
    
    // Return the highest scoring suggestion that doesn't conflict
    for (const suggestion of suggestions) {
      if (!this.hasConflict(suggestion)) {
        return suggestion;
      }
    }
    
    return null;
  }
  
  private hasConflict(suggestion: PluginSuggestion): boolean {
    // Simple conflict detection: same type and target
    for (const active of this.activeSuggestions.values()) {
      if (active.type === suggestion.type && active.target === suggestion.target) {
        return true;
      }
    }
    return false;
  }
  
  private async executeSuggestion(suggestion: PluginSuggestion): Promise<void> {
    this.activeSuggestions.set(suggestion.id, suggestion);
    
    console.log(`[PluginScheduler] Executing suggestion: ${suggestion.action} (confidence: ${suggestion.confidence}, priority: ${suggestion.priority})`);
    
    // Broadcast to smart assistant
    this.messageRouter.broadcast('smart-assistant', {
      type: 'operation_suggestion',
      data: suggestion
    });
    
    // Update state for diagnostics
    this.stateManager.set('lastOperationSuggestion', {
      suggestion,
      timestamp: Date.now()
    });
    
    // Auto-cleanup after timeout (prevent memory leaks)
    setTimeout(() => {
      this.activeSuggestions.delete(suggestion.id);
    }, 30000); // 30 second timeout
  }
  
  // Manual cleanup for completed suggestions
  completeSuggestion(suggestionId: string): void {
    this.activeSuggestions.delete(suggestionId);
  }
  
  // Get current active suggestions for debugging
  getActiveSuggestions(): PluginSuggestion[] {
    return Array.from(this.activeSuggestions.values());
  }
  
  // Clear all active suggestions
  clearActiveSuggestions(): void {
    this.activeSuggestions.clear();
  }
}