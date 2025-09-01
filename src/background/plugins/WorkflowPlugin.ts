/**
 * Workflow Automation Plugin - Cross-tab sequence detection and automation
 * Linus: "The kernel does one thing: manage processes. This plugin does one thing: manage workflows."
 */

import { BasePlugin, PluginSuggestion, PluginContext } from './base';
import { AdaptedEvent } from './EventAdapter';

interface WorkflowPattern {
  id: string;
  name: string;
  sequence: WorkflowStep[];
  frequency: number;
  lastSeen: number;
  confidence: number;
}

interface WorkflowStep {
  type: string;
  target?: string;
  value?: string;
  url?: string;
  tabAction?: 'create' | 'switch' | 'close';
  delay?: number;
}

interface ActiveWorkflow {
  pattern: WorkflowPattern;
  completedSteps: number;
  startTime: number;
  tabIds: number[];
}

export class WorkflowPlugin extends BasePlugin {
  readonly id = 'workflow-automation';
  readonly name = 'Workflow Automation';
  readonly description = 'Detects and automates repetitive multi-step workflows';
  
  private patterns: Map<string, WorkflowPattern> = new Map();
  private activeWorkflows: Map<string, ActiveWorkflow> = new Map();
  private recentEvents: AdaptedEvent[] = [];
  private readonly MAX_RECENT_EVENTS = 50;
  private readonly MIN_PATTERN_FREQUENCY = 2;
  private readonly MIN_PATTERN_LENGTH = 3;
  
  async initialize(context: PluginContext): Promise<void> {
    await super.initialize(context);
    await this.loadPatterns();
    console.log(`[${this.name}] Initialized with ${this.patterns.size} patterns`);
  }
  
  canHandle(event: AdaptedEvent): boolean {
    // Handle user interaction events and tab events
    return event.type === 'click' || 
           event.type === 'keydown' || 
           event.type === 'text_input' ||
           event.type === 'tab_created' ||
           event.type === 'tab_activated';
  }
  
  async processEvent(event: AdaptedEvent): Promise<PluginSuggestion[]> {
    // Add to recent events buffer
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.MAX_RECENT_EVENTS) {
      this.recentEvents.shift();
    }
    
    const suggestions: PluginSuggestion[] = [];
    
    // Check if event continues an active workflow
    const continuationSuggestion = this.checkWorkflowContinuation(event);
    if (continuationSuggestion) {
      suggestions.push(continuationSuggestion);
    }
    
    // Check if event starts a known pattern
    const startSuggestion = this.checkPatternStart(event);
    if (startSuggestion) {
      suggestions.push(startSuggestion);
    }
    
    // Mine new patterns periodically (every 10 events)
    if (this.recentEvents.length % 10 === 0) {
      await this.mineNewPatterns();
    }
    
    return suggestions;
  }
  
  private checkWorkflowContinuation(event: AdaptedEvent): PluginSuggestion | null {
    for (const [workflowId, workflow] of this.activeWorkflows) {
      const nextStep = workflow.pattern.sequence[workflow.completedSteps];
      
      if (this.eventMatchesStep(event, nextStep)) {
        workflow.completedSteps++;
        
        // If workflow is complete, suggest automation for future
        if (workflow.completedSteps >= workflow.pattern.sequence.length) {
          this.activeWorkflows.delete(workflowId);
          
          return this.createSuggestion(
            'workflow',
            `Complete workflow: ${workflow.pattern.name}`,
            0.8,
            2,
            {
              workflowId: workflow.pattern.id,
              action: 'workflow_learned',
              pattern: workflow.pattern
            }
          );
        }
        
        // Suggest next step
        const remainingSteps = workflow.pattern.sequence.length - workflow.completedSteps;
        return this.createSuggestion(
          'workflow',
          `Continue workflow: ${workflow.pattern.name} (${remainingSteps} steps left)`,
          0.7,
          1.5,
          {
            workflowId: workflow.pattern.id,
            action: 'continue_workflow',
            nextSteps: workflow.pattern.sequence.slice(workflow.completedSteps)
          }
        );
      }
    }
    
    return null;
  }
  
  private checkPatternStart(event: AdaptedEvent): PluginSuggestion | null {
    for (const pattern of this.patterns.values()) {
      const firstStep = pattern.sequence[0];
      
      if (this.eventMatchesStep(event, firstStep) && pattern.frequency >= this.MIN_PATTERN_FREQUENCY) {
        // Start tracking this workflow
        const workflowId = `active_${pattern.id}_${Date.now()}`;
        this.activeWorkflows.set(workflowId, {
          pattern,
          completedSteps: 1,
          startTime: Date.now(),
          tabIds: event.tabId ? [event.tabId] : []
        });
        
        return this.createSuggestion(
          'workflow',
          `Start workflow: ${pattern.name}?`,
          pattern.confidence,
          1,
          {
            workflowId: pattern.id,
            action: 'start_workflow',
            totalSteps: pattern.sequence.length,
            nextSteps: pattern.sequence.slice(1)
          }
        );
      }
    }
    
    return null;
  }
  
  private eventMatchesStep(event: AdaptedEvent, step: WorkflowStep): boolean {
    if (event.type !== step.type) {
      return false;
    }
    
    // Simple matching - can be enhanced
    if (step.target && event.target !== step.target) {
      return false;
    }
    
    if (step.value && event.value !== step.value) {
      return false;
    }
    
    return true;
  }
  
  private async mineNewPatterns(): Promise<void> {
    if (this.recentEvents.length < this.MIN_PATTERN_LENGTH * 2) {
      return;
    }
    
    // Simple pattern mining: look for repeated subsequences
    const sequences = this.extractSequences(this.recentEvents);
    
    for (const sequence of sequences) {
      const patternId = this.generatePatternId(sequence);
      const existing = this.patterns.get(patternId);
      
      if (existing) {
        existing.frequency++;
        existing.lastSeen = Date.now();
        existing.confidence = Math.min(0.9, existing.confidence + 0.1);
      } else if (sequence.length >= this.MIN_PATTERN_LENGTH) {
        const pattern: WorkflowPattern = {
          id: patternId,
          name: this.generatePatternName(sequence),
          sequence,
          frequency: 1,
          lastSeen: Date.now(),
          confidence: 0.3
        };
        
        this.patterns.set(patternId, pattern);
        console.log(`[${this.name}] Discovered new pattern: ${pattern.name}`);
      }
    }
    
    await this.savePatterns();
  }
  
  private extractSequences(events: AdaptedEvent[]): WorkflowStep[][] {
    const sequences: WorkflowStep[][] = [];
    
    // Simple sliding window approach
    for (let i = 0; i < events.length - this.MIN_PATTERN_LENGTH + 1; i++) {
      for (let len = this.MIN_PATTERN_LENGTH; len <= Math.min(10, events.length - i); len++) {
        const sequence = events.slice(i, i + len).map(e => ({
          type: e.type,
          target: e.target,
          value: typeof e.value === 'string' ? e.value : String(e.value || ''),
          url: e.url
        }));
        
        sequences.push(sequence);
      }
    }
    
    return sequences;
  }
  
  private generatePatternId(sequence: WorkflowStep[]): string {
    const hash = sequence.map(s => `${s.type}:${s.target || 'any'}`).join('->');
    return `pattern_${this.simpleHash(hash)}`;
  }
  
  private generatePatternName(sequence: WorkflowStep[]): string {
    const actions = sequence.map(s => s.type).join(' → ');
    return `Workflow: ${actions}`;
  }
  
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  private async loadPatterns(): Promise<void> {
    try {
      const stored = await this.context.dataStorage.get('workflowPatterns');
      if (stored) {
        const patterns = JSON.parse(stored);
        for (const pattern of patterns) {
          this.patterns.set(pattern.id, pattern);
        }
      }
    } catch (error) {
      console.warn(`[${this.name}] Failed to load patterns:`, error);
    }
  }
  
  private async savePatterns(): Promise<void> {
    try {
      const patterns = Array.from(this.patterns.values());
      await this.context.dataStorage.set('workflowPatterns', JSON.stringify(patterns));
    } catch (error) {
      console.warn(`[${this.name}] Failed to save patterns:`, error);
    }
  }
  
  async cleanup(): Promise<void> {
    await this.savePatterns();
    this.patterns.clear();
    this.activeWorkflows.clear();
    this.recentEvents = [];
    await super.cleanup();
  }
}