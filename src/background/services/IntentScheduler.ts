/**
 * Intent Scheduler - The coordination layer between plugins and existing ML service
 * Linus: "This is not a scheduler. This is a traffic cop with good taste."
 */

import { PluginScheduler } from './PluginScheduler';
import { MLService } from './MLService';
import { StateManager } from './StateManager';
import { MessageRouter } from './MessageRouter';
import { PluginSuggestion } from '../plugins/base';
import { SynapseEvent } from '../../shared/types';
import { OperationSuggestion } from '../../smart-assistant/types';

interface IntentDecision {
  source: 'plugin' | 'ml_service';
  suggestion: PluginSuggestion | OperationSuggestion;
  confidence: number;
  priority: number;
  reason: string;
}

export class IntentScheduler {
  private pluginScheduler: PluginScheduler;
  private mlService: MLService;
  private stateManager: StateManager;
  private messageRouter: MessageRouter;
  private lastDecisionTime: number = 0;
  private readonly DECISION_COOLDOWN = 1000; // 1 second between decisions
  
  constructor(
    pluginScheduler: PluginScheduler,
    mlService: MLService,
    stateManager: StateManager,
    messageRouter: MessageRouter
  ) {
    this.pluginScheduler = pluginScheduler;
    this.mlService = mlService;
    this.stateManager = stateManager;
    this.messageRouter = messageRouter;
  }
  
  async processEvent(event: SynapseEvent): Promise<void> {
    // Linus: "Throttle requests. The CPU is not infinite."
    const now = Date.now();
    if (now - this.lastDecisionTime < this.DECISION_COOLDOWN) {
      return;
    }
    
    try {
      // Get suggestions from both systems concurrently
      const [pluginSuggestions, mlPrediction] = await Promise.allSettled([
        this.pluginScheduler.processEvent(event),
        this.mlService.processEvent(event)
      ]);
      
      // Convert results to unified format
      const allSuggestions: IntentDecision[] = [];
      
      // Process plugin suggestions
      if (pluginSuggestions.status === 'fulfilled') {
        await this.pluginScheduler.processEvent(event);
        // Plugin scheduler handles its own suggestions internally
      }
      
      // Process ML service predictions
      if (mlPrediction.status === 'fulfilled') {
        const mlResult = await this.mlService.getPrediction();
        if (mlResult && this.isValidMLResult(mlResult)) {
          const mlSuggestion = this.convertMLResultToSuggestion(mlResult);
          if (mlSuggestion) {
            allSuggestions.push({
              source: 'ml_service',
              suggestion: mlSuggestion,
              confidence: mlResult.confidence || 0.5,
              priority: 1,
              reason: 'ML prediction based on learned patterns'
            });
          }
        }
      }
      
      // Make decision based on current state
      if (allSuggestions.length > 0) {
        const decision = this.makeDecision(allSuggestions);
        if (decision) {
          await this.executeDecision(decision);
        }
      }
      
      this.lastDecisionTime = now;
      
    } catch (error) {
      console.error('[IntentScheduler] Error processing event:', error);
    }
  }
  
  private isValidMLResult(result: any): boolean {
    return result && 
           (result.targetElement || result.predictions || result.nextActions);
  }
  
  private convertMLResultToSuggestion(mlResult: any): OperationSuggestion | null {
    try {
      // Convert ML prediction to OperationSuggestion format
      if (mlResult.targetElement) {
        return {
          id: `ml_${Date.now()}`,
          title: 'Predicted Action',
          description: `Focus on ${mlResult.targetElement}`,
          confidence: mlResult.confidence || 0.5,
          actions: [{
            type: 'click',
            target: mlResult.targetElement,
            sequence: 1,
            isPrivacySafe: true
          }],
          learnedFrom: 'ml_patterns',
          frequency: mlResult.frequency || 1
        };
      }
      
      return null;
    } catch (error) {
      console.warn('[IntentScheduler] Failed to convert ML result:', error);
      return null;
    }
  }
  
  private makeDecision(suggestions: IntentDecision[]): IntentDecision | null {
    if (suggestions.length === 0) {
      return null;
    }
    
    // Simple decision algorithm: highest score wins
    // Score = confidence * priority * source_bias
    let bestDecision: IntentDecision | null = null;
    let bestScore = 0;
    
    for (const decision of suggestions) {
      // Bias towards plugins (they're more specific)
      const sourceBias = decision.source === 'plugin' ? 1.2 : 1.0;
      const score = decision.confidence * decision.priority * sourceBias;
      
      if (score > bestScore) {
        bestScore = score;
        bestDecision = decision;
      }
    }
    
    // Only return decision if it meets minimum threshold
    if (bestScore > 0.4) {
      return bestDecision;
    }
    
    return null;
  }
  
  private async executeDecision(decision: IntentDecision): Promise<void> {
    console.log(`[IntentScheduler] Executing decision from ${decision.source}: ${decision.reason}`);
    
    // Update state for diagnostics
    this.stateManager.set('lastIntentDecision', {
      source: decision.source,
      confidence: decision.confidence,
      priority: decision.priority,
      reason: decision.reason,
      timestamp: Date.now()
    });
    
    if (decision.source === 'plugin') {
      // Plugin suggestions are handled by PluginScheduler
      // This is just for logging/state management
      console.log(`[IntentScheduler] Plugin suggestion: ${decision.reason}`);
    } else {
      // Handle ML service suggestions
      this.messageRouter.broadcast('smart-assistant', {
        type: 'ml_prediction',
        data: decision.suggestion
      });
    }
  }
  
  // Get current state for debugging
  getStatus(): any {
    const pluginSuggestions = this.pluginScheduler.getActiveSuggestions();
    const lastDecision = this.stateManager.get('lastIntentDecision');
    
    return {
      activePluginSuggestions: pluginSuggestions.length,
      lastDecision,
      cooldownRemaining: Math.max(0, this.DECISION_COOLDOWN - (Date.now() - this.lastDecisionTime)),
      mlWorkerStatus: this.mlService.getWorkerStatus()
    };
  }
  
  // Manual override for testing
  async forceMLPrediction(): Promise<any> {
    try {
      return await this.mlService.getPrediction();
    } catch (error) {
      console.error('[IntentScheduler] Force ML prediction failed:', error);
      return null;
    }
  }
  
  // Manual override for clearing state
  clearState(): void {
    this.pluginScheduler.clearActiveSuggestions();
    this.lastDecisionTime = 0;
    console.log('[IntentScheduler] State cleared');
  }
}