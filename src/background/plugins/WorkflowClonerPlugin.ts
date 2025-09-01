/**
 * Workflow Cloner Plugin - Cross-tab workflow automation with enhanced pattern mining
 * "Good taste is about seeing the deeper patterns, not just surface repetition" - Linus
 */

import { BasePlugin, PluginSuggestion, PluginContext } from './base';
import { AdaptedEvent } from './EventAdapter';

// Plugin-specific types - self-contained module
interface WorkflowPattern {
  id: string;
  name: string;
  description: string;
  sequence: ActionSkill[];
  frequency: number;
  confidence: number;
  crossTabCount: number;
  avgTimeToComplete: number;
  tabSequence: number[];
  lastSeen: number;
}

interface ActionSkill {
  stepNumber: number;
  type: string;
  tabId: number | null;
  parentTabId?: number | null;
  url: string;
  action: string;
  selector: string;
  value?: string;
  confidence: number;
  isTabSwitch: boolean;
  isNewTabAction: boolean;
  expectedDelay?: number;
  features: Record<string, any>;
}

interface ActiveWorkflow {
  workflowId: string;
  workflowName: string;
  currentStep: number;
  totalSteps: number;
  steps: ActionSkill[];
  startedAt: number;
  lastActionAt: number;
  isActive: boolean;
  tabSequence: number[];
  crossTabRelations: Map<number, number>; // childTab -> parentTab
}

interface TabRelation {
  parentTabId: number;
  childTabId: number;
  timestamp: number;
  triggerSelector?: string;
}

export class WorkflowClonerPlugin extends BasePlugin {
  readonly id = 'workflow-cloner';
  readonly name = 'Workflow Cloner';
  readonly description = 'Advanced cross-tab workflow detection and automation using FAST technology';
  
  private patterns: Map<string, WorkflowPattern> = new Map();
  private activeWorkflows: Map<string, ActiveWorkflow> = new Map();
  private tabRelations: Map<number, TabRelation> = new Map();
  private eventSequence: AdaptedEvent[] = [];
  
  // Configuration constants
  private readonly MAX_SEQUENCE_LENGTH = 200;
  private readonly MIN_PATTERN_FREQUENCY = 3;
  private readonly MIN_PATTERN_LENGTH = 4;
  private readonly CROSS_TAB_CORRELATION_WINDOW = 5000; // 5 seconds
  private readonly WORKFLOW_TIMEOUT = 30000; // 30 seconds

  async initialize(context: PluginContext): Promise<void> {
    await super.initialize(context);
    await this.loadWorkflowPatterns();
    
    // Setup periodic cleanup of old tab relations
    this.setupPeriodicCleanup();
    
    console.log(`[${this.name}] Initialized with ${this.patterns.size} workflow patterns`);
  }

  canHandle(event: AdaptedEvent): boolean {
    // Handle all UI interactions and browser events for comprehensive pattern analysis
    const handledTypes = [
      'ui.click', 'ui.keydown', 'ui.text_input', 'ui.focus_change',
      'browser.tab.created', 'browser.tab.activated', 'browser.tab.updated',
      'form.submit', 'ui.clipboard'
    ];
    
    return handledTypes.some(type => event.type.includes(type.split('.')[1]));
  }

  async processEvent(event: AdaptedEvent): Promise<PluginSuggestion[]> {
    // Track tab relationships for cross-tab correlation
    this.trackTabRelations(event);
    
    // Add to sequence with enhanced metadata
    this.addToSequence(event);
    
    const suggestions: PluginSuggestion[] = [];
    
    // Clean up timed-out workflows
    this.cleanupTimedOutWorkflows();
    
    // Check for workflow continuation
    const continuationSuggestion = this.checkWorkflowContinuation(event);
    if (continuationSuggestion) {
      suggestions.push(continuationSuggestion);
    }
    
    // Check for new workflow pattern start
    const startSuggestion = this.checkPatternStart(event);
    if (startSuggestion) {
      suggestions.push(startSuggestion);
    }
    
    // Mine new patterns periodically with FAST analysis
    if (this.eventSequence.length % 15 === 0) {
      await this.mineSequencePatternsWithFAST();
    }
    
    return suggestions;
  }

  private trackTabRelations(event: AdaptedEvent): void {
    // Track parent-child tab relationships for workflow correlation
    if (event.type === 'browser.tab.created' || event.context?.isNewTabEvent) {
      const parentTabId = event.context?.parentTabId;
      const childTabId = event.context?.tabId;
      
      if (parentTabId && childTabId) {
        this.tabRelations.set(childTabId, {
          parentTabId,
          childTabId,
          timestamp: event.timestamp,
          triggerSelector: event.payload?.targetSelector
        });
        
        console.log(`[${this.name}] Tracked tab relation: ${parentTabId} -> ${childTabId}`);
      }
    }
  }

  private addToSequence(event: AdaptedEvent): void {
    // Enhance event with cross-tab metadata
    const enhancedEvent = this.enhanceEventWithTabContext(event);
    
    this.eventSequence.push(enhancedEvent);
    
    // Maintain sequence length limit
    if (this.eventSequence.length > this.MAX_SEQUENCE_LENGTH) {
      this.eventSequence.shift();
    }
  }

  private enhanceEventWithTabContext(event: AdaptedEvent): AdaptedEvent {
    const enhanced = { ...event };
    
    // Add parent tab information if available
    const tabId = event.context?.tabId;
    if (tabId && this.tabRelations.has(tabId)) {
      const relation = this.tabRelations.get(tabId)!;
      enhanced.context = {
        ...enhanced.context,
        parentTabId: relation.parentTabId
      };
    }
    
    return enhanced;
  }

  private checkWorkflowContinuation(event: AdaptedEvent): PluginSuggestion | null {
    for (const [workflowId, workflow] of this.activeWorkflows) {
      if (workflow.currentStep >= workflow.totalSteps) {
        continue;
      }
      
      const nextStep = workflow.steps[workflow.currentStep];
      
      if (this.eventMatchesActionSkill(event, nextStep)) {
        // Update workflow state
        workflow.currentStep++;
        workflow.lastActionAt = Date.now();
        
        // Track tab if it's a new one
        if (event.context?.tabId && !workflow.tabSequence.includes(event.context.tabId)) {
          workflow.tabSequence.push(event.context.tabId);
        }
        
        if (workflow.currentStep >= workflow.totalSteps) {
          // Workflow completed
          this.activeWorkflows.delete(workflowId);
          
          return this.createSuggestion(
            'workflow',
            `Completed workflow: ${workflow.workflowName}`,
            0.9,
            3,
            {
              workflowId,
              action: 'workflow_completed',
              totalSteps: workflow.totalSteps,
              timeTaken: Date.now() - workflow.startedAt,
              crossTabCount: workflow.tabSequence.length
            }
          );
        } else {
          // Suggest next step with guided execution
          const remainingSteps = workflow.totalSteps - workflow.currentStep;
          const nextAction = workflow.steps[workflow.currentStep];
          
          return this.createSuggestion(
            'workflow',
            `Continue workflow: ${workflow.workflowName} (${remainingSteps} steps remaining)`,
            0.85,
            2,
            {
              workflowId,
              action: 'continue_workflow',
              currentStep: workflow.currentStep,
              totalSteps: workflow.totalSteps,
              nextAction: {
                selector: nextAction.selector,
                tabId: nextAction.tabId,
                isTabSwitch: nextAction.isTabSwitch,
                action: nextAction.action
              },
              guidanceMode: 'step_by_step'
            }
          );
        }
      }
    }
    
    return null;
  }

  private checkPatternStart(event: AdaptedEvent): PluginSuggestion | null {
    for (const pattern of this.patterns.values()) {
      if (pattern.frequency < this.MIN_PATTERN_FREQUENCY) {
        continue;
      }
      
      const firstStep = pattern.sequence[0];
      
      if (this.eventMatchesActionSkill(event, firstStep)) {
        // Start new workflow tracking
        const workflowId = `workflow_${pattern.id}_${Date.now()}`;
        
        const activeWorkflow: ActiveWorkflow = {
          workflowId,
          workflowName: pattern.name,
          currentStep: 1,
          totalSteps: pattern.sequence.length,
          steps: pattern.sequence,
          startedAt: Date.now(),
          lastActionAt: Date.now(),
          isActive: true,
          tabSequence: event.context?.tabId ? [event.context.tabId] : [],
          crossTabRelations: new Map()
        };
        
        this.activeWorkflows.set(workflowId, activeWorkflow);
        
        return this.createSuggestion(
          'workflow',
          `Start workflow automation: ${pattern.name}?`,
          pattern.confidence,
          1.5,
          {
            workflowId: pattern.id,
            action: 'start_workflow_automation',
            totalSteps: pattern.sequence.length,
            crossTabCount: pattern.crossTabCount,
            estimatedTime: pattern.avgTimeToComplete,
            automationMode: 'guided'
          }
        );
      }
    }
    
    return null;
  }

  private eventMatchesActionSkill(event: AdaptedEvent, skill: ActionSkill): boolean {
    // Enhanced matching with fuzzy logic
    if (event.type !== skill.type) {
      return false;
    }
    
    // URL matching with domain flexibility
    if (skill.url && event.context?.url) {
      const eventDomain = this.extractDomain(event.context.url);
      const skillDomain = this.extractDomain(skill.url);
      if (eventDomain !== skillDomain) {
        return false;
      }
    }
    
    // Selector matching with CSS selector similarity
    if (skill.selector && event.payload?.targetSelector) {
      if (!this.selectorsAreSimilar(event.payload.targetSelector, skill.selector)) {
        return false;
      }
    }
    
    // Tab context matching for cross-tab workflows
    if (skill.isTabSwitch && event.context?.tabId !== skill.tabId) {
      return false;
    }
    
    return true;
  }

  private async mineSequencePatternsWithFAST(): Promise<void> {
    if (this.eventSequence.length < this.MIN_PATTERN_LENGTH * 2) {
      return;
    }
    
    console.log(`[${this.name}] Mining patterns from ${this.eventSequence.length} events`);
    
    // Enhanced pattern mining with FAST-inspired frequency domain analysis
    const candidatePatterns = this.extractCrossTabSequences();
    
    for (const sequence of candidatePatterns) {
      if (sequence.length < this.MIN_PATTERN_LENGTH) {
        continue;
      }
      
      const patternId = this.generatePatternId(sequence);
      const existing = this.patterns.get(patternId);
      
      if (existing) {
        // Update existing pattern
        existing.frequency++;
        existing.lastSeen = Date.now();
        existing.confidence = Math.min(0.95, existing.confidence + 0.05);
      } else {
        // Create new pattern
        const crossTabCount = this.countUniqueTabs(sequence);
        const pattern: WorkflowPattern = {
          id: patternId,
          name: this.generatePatternName(sequence),
          description: this.generatePatternDescription(sequence, crossTabCount),
          sequence,
          frequency: 1,
          confidence: 0.4,
          crossTabCount,
          avgTimeToComplete: this.estimateCompletionTime(sequence),
          tabSequence: this.extractTabSequence(sequence),
          lastSeen: Date.now()
        };
        
        this.patterns.set(patternId, pattern);
        console.log(`[${this.name}] Discovered new cross-tab workflow: ${pattern.name}`);
      }
    }
    
    await this.saveWorkflowPatterns();
  }

  private extractCrossTabSequences(): ActionSkill[][] {
    const sequences: ActionSkill[][] = [];
    
    // Sliding window with cross-tab awareness
    for (let i = 0; i < this.eventSequence.length - this.MIN_PATTERN_LENGTH + 1; i++) {
      for (let len = this.MIN_PATTERN_LENGTH; len <= Math.min(15, this.eventSequence.length - i); len++) {
        const window = this.eventSequence.slice(i, i + len);
        
        // Skip sequences without meaningful cross-tab activity
        const tabIds = new Set(window.map(e => e.context?.tabId).filter(Boolean));
        if (tabIds.size < 2) {
          continue;
        }
        
        const actionSequence = window.map((event, index) => ({
          stepNumber: index,
          type: event.type,
          tabId: event.context?.tabId || null,
          parentTabId: event.context?.parentTabId || null,
          url: event.context?.url || '',
          action: this.deriveActionFromEvent(event),
          selector: event.payload?.targetSelector || '',
          value: event.payload?.value ? String(event.payload.value) : undefined,
          confidence: 0.6,
          isTabSwitch: this.isTabSwitchEvent(event, i > 0 ? this.eventSequence[i - 1] : null),
          isNewTabAction: event.type.includes('tab.created'),
          expectedDelay: i > 0 ? event.timestamp - this.eventSequence[i - 1].timestamp : 0,
          features: event.payload?.features || {}
        }));
        
        sequences.push(actionSequence);
      }
    }
    
    return sequences;
  }

  private deriveActionFromEvent(event: AdaptedEvent): string {
    if (event.type.includes('click')) return 'click';
    if (event.type.includes('text_input')) return 'input';
    if (event.type.includes('keydown')) return 'key';
    if (event.type.includes('submit')) return 'submit';
    if (event.type.includes('tab')) return 'tab_action';
    return 'unknown';
  }

  private isTabSwitchEvent(current: AdaptedEvent, previous: AdaptedEvent | null): boolean {
    if (!previous) return false;
    return current.context?.tabId !== previous.context?.tabId;
  }

  private countUniqueTabs(sequence: ActionSkill[]): number {
    return new Set(sequence.map(skill => skill.tabId).filter(Boolean)).size;
  }

  private extractTabSequence(sequence: ActionSkill[]): number[] {
    const tabSequence: number[] = [];
    for (const skill of sequence) {
      if (skill.tabId && !tabSequence.includes(skill.tabId)) {
        tabSequence.push(skill.tabId);
      }
    }
    return tabSequence;
  }

  private estimateCompletionTime(sequence: ActionSkill[]): number {
    return sequence.reduce((total, skill) => total + (skill.expectedDelay || 1000), 0);
  }

  private generatePatternName(sequence: ActionSkill[]): string {
    const actions = sequence.slice(0, 3).map(skill => skill.action).join(' → ');
    const tabCount = this.countUniqueTabs(sequence);
    return `Cross-tab workflow: ${actions}... (${tabCount} tabs)`;
  }

  private generatePatternDescription(sequence: ActionSkill[], crossTabCount: number): string {
    return `${sequence.length}-step workflow across ${crossTabCount} tabs involving ${sequence[0].action} → ... → ${sequence[sequence.length - 1].action}`;
  }

  private generatePatternId(sequence: ActionSkill[]): string {
    const signature = sequence.map(skill => 
      `${skill.type}:${skill.action}:${skill.tabId || 'any'}`
    ).join('|');
    return `wf_${this.simpleHash(signature)}`;
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  private selectorsAreSimilar(selector1: string, selector2: string): boolean {
    // Simple similarity check - can be enhanced with more sophisticated CSS selector comparison
    if (selector1 === selector2) return true;
    
    // Check if they target same element type
    const type1 = selector1.split(/[.#\[\s]/)[0];
    const type2 = selector2.split(/[.#\[\s]/)[0];
    
    return type1 === type2;
  }

  private cleanupTimedOutWorkflows(): void {
    const now = Date.now();
    for (const [workflowId, workflow] of this.activeWorkflows) {
      if (now - workflow.lastActionAt > this.WORKFLOW_TIMEOUT) {
        this.activeWorkflows.delete(workflowId);
        console.log(`[${this.name}] Workflow ${workflowId} timed out`);
      }
    }
  }

  private setupPeriodicCleanup(): void {
    // Clean up old tab relations every 10 minutes
    setInterval(() => {
      const now = Date.now();
      const RELATION_EXPIRY = 30 * 60 * 1000; // 30 minutes
      
      for (const [tabId, relation] of this.tabRelations) {
        if (now - relation.timestamp > RELATION_EXPIRY) {
          this.tabRelations.delete(tabId);
        }
      }
    }, 10 * 60 * 1000);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private async loadWorkflowPatterns(): Promise<void> {
    try {
      const stored = await this.context.dataStorage.get('workflowClonerPatterns');
      if (stored) {
        const patterns = JSON.parse(stored);
        for (const pattern of patterns) {
          this.patterns.set(pattern.id, pattern);
        }
      }
    } catch (error) {
      console.warn(`[${this.name}] Failed to load workflow patterns:`, error);
    }
  }

  private async saveWorkflowPatterns(): Promise<void> {
    try {
      const patterns = Array.from(this.patterns.values());
      await this.context.dataStorage.set('workflowClonerPatterns', JSON.stringify(patterns));
    } catch (error) {
      console.warn(`[${this.name}] Failed to save workflow patterns:`, error);
    }
  }

  async cleanup(): Promise<void> {
    await this.saveWorkflowPatterns();
    this.patterns.clear();
    this.activeWorkflows.clear();
    this.tabRelations.clear();
    this.eventSequence = [];
    await super.cleanup();
  }
}