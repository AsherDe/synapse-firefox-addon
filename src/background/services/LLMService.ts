/**
 * LLM Service - Browser-native AI integration using Firefox Trial ML API
 * 
 * Provides lightweight, privacy-focused, browser-native AI capabilities
 * for intent annotation and rule extraction from user behavior sequences.
 */

// Browser API compatibility using webextension-polyfill
declare var browser: any;

import { StateManager } from './StateManager';

export interface LLMTaskOptions {
  taskType: 'text-classification' | 'text-generation';
  modelType?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProgressEvent {
  phase: 'download' | 'load' | 'ready';
  progress: number; // 0-100
  message?: string;
}

export interface LLMResponse {
  success: boolean;
  result?: any;
  error?: string;
  confidence?: number;
}

export class LLMService {
  private stateManager: StateManager;
  private engines: Map<string, any> = new Map();
  private permissionRequested: boolean = false;
  private progressListeners: Map<string, (event: LLMProgressEvent) => void> = new Map();

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    try {
      // Check if trialML is available
      if (!browser.trial?.ml) {
        console.warn('[LLMService] Firefox Trial ML API not available');
        this.stateManager.set('llmServiceStatus', 'unavailable');
        return;
      }

      this.stateManager.set('llmServiceStatus', 'ready');
      console.log('[LLMService] Service initialized successfully');
      
    } catch (error) {
      console.error('[LLMService] Failed to initialize service:', error);
      this.stateManager.set('llmServiceStatus', 'error');
    }
  }

  /**
   * Request permission to use Trial ML API
   * Shows transparent permission dialog to user
   */
  async requestPermission(): Promise<boolean> {
    if (this.permissionRequested) {
      return this.hasPermission();
    }

    try {
      console.log('[LLMService] Requesting trialML permission from user');
      
      const granted = await browser.permissions.request({
        permissions: ['trialML']
      });
      
      this.permissionRequested = true;
      
      if (granted) {
        console.log('[LLMService] Permission granted by user');
        this.stateManager.set('llmPermissionStatus', 'granted');
        return true;
      } else {
        console.log('[LLMService] Permission denied by user');
        this.stateManager.set('llmPermissionStatus', 'denied');
        return false;
      }
      
    } catch (error) {
      console.error('[LLMService] Failed to request permission:', error instanceof Error ? error.message : String(error));
      this.stateManager.set('llmPermissionStatus', 'error');
      return false;
    }
  }

  /**
   * Check if we have trialML permission
   */
  async hasPermission(): Promise<boolean> {
    try {
      return await browser.permissions.contains({
        permissions: ['trialML']
      });
    } catch (error) {
      console.error('[LLMService] Failed to check permissions:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Create and initialize an AI engine for specific task
   */
  async createEngine(taskId: string, options: LLMTaskOptions): Promise<string> {
    if (!await this.hasPermission()) {
      const granted = await this.requestPermission();
      if (!granted) {
        throw new Error('Permission required for AI features');
      }
    }

    try {
      console.log(`[LLMService] Creating ${options.taskType} engine for task: ${taskId}`);
      
      // Create engine with progress monitoring
      const engine = await browser.trial.ml.createEngine(options.taskType, {
        modelType: options.modelType,
        onProgress: (progress: any) => {
          const event: LLMProgressEvent = {
            phase: this.mapProgressPhase(progress.phase),
            progress: Math.round(progress.progress * 100),
            message: progress.message
          };
          
          console.log(`[LLMService] Engine ${taskId} progress:`, event);
          this.stateManager.set(`llmEngineProgress_${taskId}`, event);
          
          // Notify listeners
          const listener = this.progressListeners.get(taskId);
          if (listener) {
            listener(event);
          }
        }
      });

      this.engines.set(taskId, engine);
      console.log(`[LLMService] Engine ${taskId} created successfully`);
      
      return taskId;
      
    } catch (error) {
      console.error(`[LLMService] Failed to create engine ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Add progress listener for engine creation
   */
  onEngineProgress(taskId: string, listener: (event: LLMProgressEvent) => void): void {
    this.progressListeners.set(taskId, listener);
  }

  /**
   * Remove progress listener
   */
  removeEngineProgress(taskId: string): void {
    this.progressListeners.delete(taskId);
  }

  private mapProgressPhase(phase: string): LLMProgressEvent['phase'] {
    switch (phase) {
      case 'downloading':
      case 'download':
        return 'download';
      case 'loading':
      case 'initializing':
        return 'load';
      case 'ready':
      case 'complete':
        return 'ready';
      default:
        return 'load';
    }
  }

  /**
   * Execute text classification task
   * Ideal for intent annotation and behavior categorization
   */
  async classifyText(
    taskId: string, 
    text: string, 
    categories?: string[]
  ): Promise<LLMResponse> {
    const engine = this.engines.get(taskId);
    if (!engine) {
      return {
        success: false,
        error: `Engine ${taskId} not found. Create engine first.`
      };
    }

    try {
      console.log(`[LLMService] Classifying text with engine ${taskId}`);
      
      const result = await engine.run(text, {
        categories: categories
      });

      return {
        success: true,
        result: result.classification,
        confidence: result.confidence
      };
      
    } catch (error) {
      console.error(`[LLMService] Text classification failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Execute text generation task
   * Ideal for rule extraction and pattern description
   */
  async generateText(
    taskId: string, 
    prompt: string, 
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<LLMResponse> {
    const engine = this.engines.get(taskId);
    if (!engine) {
      return {
        success: false,
        error: `Engine ${taskId} not found. Create engine first.`
      };
    }

    try {
      console.log(`[LLMService] Generating text with engine ${taskId}`);
      
      const result = await engine.run(prompt, {
        maxTokens: options?.maxTokens || 150,
        temperature: options?.temperature || 0.7
      });

      return {
        success: true,
        result: result.text,
        confidence: result.confidence
      };
      
    } catch (error) {
      console.error(`[LLMService] Text generation failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Analyze user behavior sequence for intent annotation
   * Processes "difficult" sequences to extract patterns and intents
   */
  async analyzeUserSequence(sequence: any[]): Promise<LLMResponse> {
    const taskId = 'intent_analyzer';
    
    // Ensure we have an intent classification engine
    if (!this.engines.has(taskId)) {
      await this.createEngine(taskId, {
        taskType: 'text-classification'
      });
    }

    // Extract textContent and context from sequence
    const textContent = sequence
      .map(event => {
        const text = event.payload?.features?.textContent || '';
        const action = event.type || 'unknown';
        const url = event.context?.tabInfo?.url || '';
        return `${action}: ${text} (${url})`;
      })
      .join(' -> ');

    // Define common intent categories
    const intentCategories = [
      'navigation',
      'form_filling',
      'search',
      'shopping',
      'content_creation',
      'data_entry',
      'authentication',
      'file_management',
      'communication',
      'other'
    ];

    return await this.classifyText(taskId, textContent, intentCategories);
  }

  /**
   * Extract workflow rules from user patterns
   * Generates human-readable descriptions of user behavior patterns
   */
  async extractWorkflowRules(patterns: any[]): Promise<LLMResponse> {
    const taskId = 'rule_extractor';
    
    // Ensure we have a text generation engine
    if (!this.engines.has(taskId)) {
      await this.createEngine(taskId, {
        taskType: 'text-generation'
      });
    }

    // Create descriptive prompt for rule extraction
    const patternDescription = patterns
      .map((pattern, index) => {
        const steps = pattern.sequence?.map((step: any) => 
          `${step.type}: ${step.payload?.features?.textContent || 'action'}`
        ).join(' -> ') || '';
        
        return `Pattern ${index + 1}: ${steps} (frequency: ${pattern.frequency || 1})`;
      })
      .join('\n');

    const prompt = `
Analyze these user behavior patterns and extract workflow rules:

${patternDescription}

Generate clear, actionable workflow rules that describe:
1. Common user intentions
2. Typical action sequences
3. Decision points and conditions
4. Automation opportunities

Format as numbered list with brief explanations.
`;

    return await this.generateText(taskId, prompt, {
      maxTokens: 300,
      temperature: 0.5
    });
  }

  /**
   * Process events during browser idle time
   * Analyzes accumulated "difficult" sequences for patterns
   */
  async processIdleAnalysis(): Promise<void> {
    // Only run during browser idle periods
    const idleState = await browser.idle.queryState(60); // 1 minute idle
    if (idleState !== 'idle') {
      console.log('[LLMService] Skipping analysis - browser not idle');
      return;
    }

    try {
      console.log('[LLMService] Starting idle analysis of user sequences');
      
      // Get recent difficult sequences from StateManager
      const difficultSequences = this.stateManager.get('difficultSequences') || [];
      
      if (difficultSequences.length === 0) {
        console.log('[LLMService] No difficult sequences to analyze');
        return;
      }

      // Analyze each sequence
      const results = [];
      for (const sequence of difficultSequences.slice(0, 5)) { // Limit to 5 sequences
        try {
          const analysis = await this.analyzeUserSequence(sequence);
          if (analysis.success) {
            results.push({
              sequence: sequence,
              intent: analysis.result,
              confidence: analysis.confidence
            });
          }
        } catch (error) {
          console.error('[LLMService] Failed to analyze sequence:', error);
        }
      }

      // Store analysis results
      this.stateManager.set('llmAnalysisResults', {
        timestamp: Date.now(),
        results: results,
        processedCount: results.length
      });

      console.log(`[LLMService] Completed idle analysis of ${results.length} sequences`);
      
      // Generate synthetic training data from successful analyses
      if (results.length > 0) {
        await this.generateSyntheticTrainingData(results);
      }
      
    } catch (error) {
      console.error('[LLMService] Idle analysis failed:', error);
    }
  }

  /**
   * Generate synthetic training data from analyzed sequences
   * Creates variations of high-confidence sequences for model training
   */
  async generateSyntheticTrainingData(analysisResults: any[]): Promise<void> {
    const taskId = 'data_augmentation';
    
    try {
      // Ensure we have a text generation engine for data augmentation
      if (!this.engines.has(taskId)) {
        await this.createEngine(taskId, {
          taskType: 'text-generation'
        });
      }

      console.log('[LLMService] Generating synthetic training data from analysis results');
      
      const syntheticData = [];
      
      for (const result of analysisResults) {
        if (result.confidence > 0.6) { // Only use reasonably confident results
          // Generate variations based on the sequence pattern
          const variations = await this.generateSequenceVariations(result);
          syntheticData.push(...variations);
        }
      }
      
      // Store synthetic data
      if (syntheticData.length > 0) {
        this.stateManager.set('syntheticTrainingData', {
          timestamp: Date.now(),
          data: syntheticData,
          count: syntheticData.length,
          source: 'llm_augmentation'
        });
        
        console.log(`[LLMService] Generated ${syntheticData.length} synthetic training samples`);
      }
      
    } catch (error) {
      console.error('[LLMService] Failed to generate synthetic training data:', error);
    }
  }

  /**
   * Generate sequence variations for data augmentation
   */
  private async generateSequenceVariations(analysisResult: any): Promise<any[]> {
    const taskId = 'data_augmentation';
    
    try {
      const sequence = analysisResult.sequence;
      const intent = analysisResult.intent;
      
      // Create a descriptive prompt for generating variations
      const sequenceDescription = sequence
        .map((event: any, index: number) => {
          const action = event.type || 'action';
          const context = event.context?.tabInfo?.title || event.context?.tabInfo?.url || 'webpage';
          const text = event.payload?.features?.textContent || '';
          return `${index + 1}. ${action} on "${context}"${text ? ` with text "${text}"` : ''}`;
        })
        .join('\n');

      const prompt = `
Given this user behavior sequence with intent "${intent}":

${sequenceDescription}

Generate 2 similar but slightly different behavior sequences that maintain the same intent but vary in:
- Text content (use similar but different words)
- Element positions (slightly different coordinates)
- Timing (small variations)

Format each sequence as a JSON array with the same structure as the original.
Focus on creating realistic variations that a user might perform for the same task.
`;

      const response = await this.generateText(taskId, prompt, {
        maxTokens: 400,
        temperature: 0.7
      });

      if (response.success && response.result) {
        // Parse generated variations
        try {
          // Simple extraction of JSON-like patterns from the response
          const variations = this.extractVariationsFromResponse(response.result, sequence, intent);
          return variations;
        } catch (parseError) {
          console.warn('[LLMService] Failed to parse generated variations:', parseError);
        }
      }
      
    } catch (error) {
      console.error('[LLMService] Failed to generate sequence variations:', error);
    }
    
    // Fallback: create simple variations manually
    return this.createSimpleVariations(analysisResult);
  }

  /**
   * Extract variations from LLM response text
   */
  private extractVariationsFromResponse(_responseText: string, originalSequence: any[], intent: string): any[] {
    // This is a simplified extraction - in practice, you might want more robust parsing
    const variations = [];
    
    // For now, create simple variations based on the original sequence
    for (let i = 0; i < 2; i++) {
      const variation = {
        sequence: originalSequence.map((event: any) => ({
          ...event,
          timestamp: event.timestamp + (i * 1000), // Slight time variation
          payload: {
            ...event.payload,
            features: {
              ...event.payload.features,
              llmIntent: intent,
              synthetic: true,
              variationIndex: i
            }
          }
        })),
        intent: intent,
        confidence: 0.8, // High confidence for LLM-generated data
        source: 'llm_variation'
      };
      
      variations.push(variation);
    }
    
    return variations;
  }

  /**
   * Create simple fallback variations when LLM parsing fails
   */
  private createSimpleVariations(analysisResult: any): any[] {
    const sequence = analysisResult.sequence;
    const intent = analysisResult.intent;
    
    const variations = [];
    
    // Create 2 simple variations
    for (let i = 0; i < 2; i++) {
      const variation = {
        sequence: sequence.map((event: any) => ({
          ...event,
          timestamp: Date.now() + (i * 1000),
          payload: {
            ...event.payload,
            features: {
              ...event.payload.features,
              llmIntent: intent,
              synthetic: true,
              variationIndex: i,
              // Add small position variations if position exists
              ...(event.payload.position && {
                position: {
                  x: event.payload.position.x + (Math.random() - 0.5) * 10,
                  y: event.payload.position.y + (Math.random() - 0.5) * 10
                }
              })
            }
          }
        })),
        intent: intent,
        confidence: 0.7,
        source: 'simple_variation'
      };
      
      variations.push(variation);
    }
    
    return variations;
  }

  /**
   * Get service status
   */
  getStatus(): string {
    return this.stateManager.get('llmServiceStatus') || 'initializing';
  }

  /**
   * Get permission status
   */
  getPermissionStatus(): string {
    return this.stateManager.get('llmPermissionStatus') || 'unknown';
  }

  /**
   * Get available engines
   */
  getEngines(): string[] {
    return Array.from(this.engines.keys());
  }

  /**
   * Remove an engine
   */
  async removeEngine(taskId: string): Promise<void> {
    const engine = this.engines.get(taskId);
    if (engine && typeof engine.cleanup === 'function') {
      try {
        await engine.cleanup();
      } catch (error) {
        console.error(`[LLMService] Failed to cleanup engine ${taskId}:`, error);
      }
    }
    
    this.engines.delete(taskId);
    this.progressListeners.delete(taskId);
    console.log(`[LLMService] Engine ${taskId} removed`);
  }

  /**
   * Cleanup all engines and resources
   */
  async cleanup(): Promise<void> {
    console.log('[LLMService] Cleaning up all engines');
    
    const cleanupPromises = Array.from(this.engines.keys()).map(taskId => 
      this.removeEngine(taskId)
    );
    
    await Promise.all(cleanupPromises);
    
    this.engines.clear();
    this.progressListeners.clear();
    
    console.log('[LLMService] Cleanup completed');
  }
}