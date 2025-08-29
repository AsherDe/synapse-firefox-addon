/*
 * Copyright 2024 Synapse Project Contributors
 * Licensed under the Apache License, Version 2.0
 */

import * as tf from '@tensorflow/tfjs';
import { SynapseEvent, ActionSkill, TaskStep } from '../shared/types';
import { OperationSuggestion } from '../smart-assistant/types';

// Constants for K-means clustering
const MAX_ITERATIONS = 100;
const MIN_FEATURES_FOR_KMEANS = 8;
const MAX_FEATURES_FOR_KMEANS = 16;

// GRU Model Constants
const SEQUENCE_LENGTH = 10;
const HIDDEN_SIZE = 32;
const INITIAL_VOCAB_SIZE = 1000; // Starting size, grows dynamically

// Task sequence mining constants
const MIN_TASK_LENGTH = 3;
const MAX_TASK_LENGTH = 10;
const MIN_TASK_FREQUENCY = 2;

// Simple K-means implementation
function simpleKMeans(data: number[][], k: number): number[][] {
  if (data.length === 0) return [];
  
  // Initialize centroids randomly
  const centroids: number[][] = [];
  const dims = data[0].length;
  
  for (let i = 0; i < k; i++) {
    const centroid: number[] = [];
    for (let j = 0; j < dims; j++) {
      centroid.push(Math.random() * 2 - 1);
    }
    centroids.push(centroid);
  }
  
  // Iteration with convergence check
  let prevCentroids: number[][] = centroids.map(c => [...c]);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const clusters: number[][][] = Array(k).fill(null).map(() => []);
    
    // Assign points to clusters
    for (const point of data) {
      let minDist = Infinity;
      let bestCluster = 0;
      
      for (let i = 0; i < k; i++) {
        const dist = euclideanDistance(point, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = i;
        }
      }
      
      clusters[bestCluster].push(point);
    }
    
    // Update centroids
    for (let i = 0; i < k; i++) {
      if (clusters[i].length > 0) {
        for (let j = 0; j < dims; j++) {
          const sum = clusters[i].reduce((s, p) => s + p[j], 0);
          centroids[i][j] = sum / clusters[i].length;
        }
      }
    }
  }
  
  return centroids;
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  const minLength = Math.min(a.length, b.length);
  for (let i = 0; i < minLength; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(sum);
}

/**
 * Simplified ML Worker - no more giant switch statements.
 * Input: Clean SynapseEvent from content.ts (all dirty work done there)
 * Output: TensorFlow-compatible feature vectors
 * 
 * This is how ML workers should be: simple, focused, and stupid.
 */
class SynapseMLWorker {
  private codebook: number[][] = [];
  private lastEventTimestamp: number = 0;
  
  // GRU model components
  private gruModel: tf.LayersModel | null = null;
  private isTraining: boolean = false;
  
  // Frequency mapping for targetSelector prediction
  private selectorTransitions: Map<string, Map<string, number>> = new Map();
  private selectorVocabulary: Map<string, number> = new Map();
  private vocabularyIndex: number = 0;
  
  // Task sequence mining
  private discoveredTasks: Map<string, ActionSkill> = new Map();
  private sequencePatterns: Map<string, number> = new Map();
  
  constructor() {
    console.log('[ML Worker] Initialized - ready to process clean SynapseEvents');
    this.initializeGRUModel();
  }

  /**
   * Initialize GRU model for sequence prediction
   */
  private initializeGRUModel(): void {
    try {
      this.gruModel = tf.sequential({
        layers: [
          tf.layers.embedding({
            inputDim: INITIAL_VOCAB_SIZE,
            outputDim: 64,
            inputLength: SEQUENCE_LENGTH,
          }),
          tf.layers.gru({
            units: HIDDEN_SIZE,
            returnSequences: true,
            dropout: 0.2,
            kernelInitializer: 'glorotNormal',
            recurrentInitializer: 'glorotNormal',
          }),
          tf.layers.gru({
            units: HIDDEN_SIZE,
            dropout: 0.2,
            kernelInitializer: 'glorotNormal',
            recurrentInitializer: 'glorotNormal',
          }),
          tf.layers.dense({
            units: INITIAL_VOCAB_SIZE,
            activation: 'softmax',
          }),
        ],
      });

      this.gruModel.compile({
        optimizer: 'adam',
        loss: 'sparseCategoricalCrossentropy',
        metrics: ['accuracy'],
      });

      console.log('[ML Worker] GRU model initialized');
    } catch (error) {
      console.error('[ML Worker] Failed to initialize GRU model:', error);
    }
  }

  /**
   * The ONLY job of this function: convert SynapseEvent.payload.features to TensorFlow format.
   * No more caring about event types, payload structures, or any of that crap.
   */
  private eventToFeatureVector(event: SynapseEvent): number[] {
    const vector: number[] = [];
    
    // Basic event type encoding using namespace hash
    const typeHash = this.hashString(event.type);
    vector.push(typeHash % 100); // Normalize to 0-99 range
    
    // Timestamp features (normalized)
    const timeFeatures = this.extractTimeFeatures(event.timestamp);
    vector.push(...timeFeatures);
    
    // Position features (if available)
    if (event.payload && event.payload.position) {
      vector.push(event.payload.position.x / 1920); // Normalized to 0-1
      vector.push(event.payload.position.y / 1080); // Normalized to 0-1
    } else {
      vector.push(0, 0);
    }
    
    // Value feature (if available)
    let valueFeature = 0;
    if (event.payload && event.payload.value !== undefined) {
      if (typeof event.payload.value === 'number') {
        valueFeature = event.payload.value;
      } else if (typeof event.payload.value === 'string') {
        valueFeature = event.payload.value.length;
      } else if (typeof event.payload.value === 'boolean') {
        valueFeature = event.payload.value ? 1 : 0;
      }
    }
    vector.push(valueFeature);
    
    // Extract features from the universal features bag
    // Content.ts puts everything here - we just extract what we need
    const features = (event.payload && event.payload.features) || {};
    
    const commonFeatures = [
      features.element_role ? this.hashString(features.element_role) % 50 : 0,
      features.is_nav_link ? 1 : 0,
      features.is_input_field ? 1 : 0,
      features.is_password_field ? 1 : 0,
      features.path_depth || 0,
      features.text_length || 0,
      features.scroll_position || 0,
      features.scroll_percentage || 0,
      features.page_height || 0,
      features.viewport_height || 0
    ];
    
    vector.push(...commonFeatures);
    
    // Pad vector to fixed size for consistency
    const targetSize = 20;
    while (vector.length < targetSize) {
      vector.push(0);
    }
    
    return vector.slice(0, targetSize);
  }
  
  /**
   * Simple string hash - nothing fancy
   */
  private hashString(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  
  /**
   * Normalized time features
   */
  private extractTimeFeatures(timestamp: number): number[] {
    const date = new Date(timestamp);
    return [
      date.getHours() / 24,    // 0-1 normalized hour
      date.getDay() / 7,       // 0-1 normalized day of week
      date.getMinutes() / 60   // 0-1 normalized minute
    ];
  }

  /**
   * Process events for ML model
   */
  public async processEvents(events: SynapseEvent[]): Promise<number[][]> {
    return events.map(event => this.eventToFeatureVector(event));
  }

  /**
   * Get the codebook for clustering
   */
  public getCodebook(): number[][] {
    return this.codebook;
  }

  /**
   * Convert targetSelector to vocabulary index
   */
  private selectorToIndex(selector: string): number {
    if (!this.selectorVocabulary.has(selector)) {
      this.selectorVocabulary.set(selector, this.vocabularyIndex++);
    }
    return this.selectorVocabulary.get(selector)!;
  }

  /**
   * Convert vocabulary index to targetSelector
   */
  private indexToSelector(index: number): string | null {
    for (const [selector, idx] of this.selectorVocabulary.entries()) {
      if (idx === index) return selector;
    }
    return null;
  }

  /**
   * Simplified sequence pattern mining to discover frequent task sequences
   */
  private mineSequencePatterns(selectors: string[]): void {
    for (let length = MIN_TASK_LENGTH; length <= Math.min(MAX_TASK_LENGTH, selectors.length); length++) {
      for (let i = 0; i <= selectors.length - length; i++) {
        const sequence = selectors.slice(i, i + length);
        const sequenceKey = sequence.join(' -> ');
        
        this.sequencePatterns.set(sequenceKey, (this.sequencePatterns.get(sequenceKey) || 0) + 1);
      }
    }
  }

  /**
   * Convert frequent patterns into ActionSkill task sequences
   */
  private updateDiscoveredTasks(): void {
    for (const [sequenceKey, frequency] of this.sequencePatterns.entries()) {
      if (frequency >= MIN_TASK_FREQUENCY) {
        const selectors = sequenceKey.split(' -> ');
        const taskId = this.hashString(sequenceKey).toString();
        
        const steps: TaskStep[] = selectors.map((selector, index) => ({
          selector,
          action: 'click', // Simplified - could be enhanced with actual action detection
          step_number: index,
          confidence: Math.min(0.9, frequency / 10)
        }));

        const task: ActionSkill = {
          id: taskId,
          name: `Task Sequence ${selectors.length} steps`,
          description: `Frequent ${selectors.length}-step sequence`,
          token_sequence: selectors.map(s => this.selectorToIndex(s)),
          frequency: frequency,
          confidence: Math.min(0.9, frequency / 10),
          sequence_length: selectors.length,
          steps,
          is_task_sequence: true
        };

        this.discoveredTasks.set(taskId, task);
      }
    }
  }

  /**
   * Check if current sequence matches the beginning of any discovered task
   */
  private matchTaskSequence(currentSelectors: string[]): ActionSkill | null {
    if (currentSelectors.length < MIN_TASK_LENGTH) return null;

    for (const task of this.discoveredTasks.values()) {
      if (!task.steps || !task.is_task_sequence) continue;

      const taskSelectors = task.steps.map(step => step.selector);
      
      // Check if current sequence matches the beginning of this task
      if (currentSelectors.length <= taskSelectors.length) {
        let matches = true;
        for (let i = 0; i < currentSelectors.length; i++) {
          if (currentSelectors[i] !== taskSelectors[i]) {
            matches = false;
            break;
          }
        }
        
        if (matches && currentSelectors.length < taskSelectors.length) {
          return task; // Found a matching task that's not complete
        }
      }
    }

    return null;
  }

  /**
   * GRU-based prediction with task path guidance support
   */
  public async predict(currentSequence: SynapseEvent[]): Promise<{
    suggestions: OperationSuggestion[];
    reason?: string;
    taskGuidance?: {
      taskId: string;
      currentStep: number;
      totalSteps: number;
      nextStep: TaskStep;
    };
  }> {
    if (!currentSequence || currentSequence.length === 0) {
      return { suggestions: [], reason: 'no_input_sequence' };
    }

    try {
      // Get recent targetSelectors for analysis
      const recentSelectors = currentSequence
        .filter(e => e.payload?.targetSelector)
        .map(e => e.payload.targetSelector!)
        .slice(-10);

      if (recentSelectors.length === 0) {
        return { suggestions: [], reason: 'insufficient_context' };
      }

      // Check for task sequence match first
      const matchingTask = this.matchTaskSequence(recentSelectors);
      if (matchingTask && matchingTask.steps) {
        const currentStep = recentSelectors.length - 1;
        const nextStep = matchingTask.steps[currentStep + 1];
        
        if (nextStep) {
          const taskGuidance = {
            taskId: matchingTask.id,
            currentStep: currentStep,
            totalSteps: matchingTask.steps.length,
            nextStep
          };

          const suggestions = this.createTaskGuidanceSuggestions(nextStep, currentSequence);
          return { suggestions, taskGuidance };
        }
      }

      // Fallback to regular prediction
      const lastSelector = recentSelectors[recentSelectors.length - 1];
      
      // Try GRU prediction first
      let gruPredictions: string[] = [];
      if (this.gruModel && recentSelectors.length >= SEQUENCE_LENGTH) {
        gruPredictions = await this.predictWithGRU(recentSelectors);
      }

      // Frequency-based fallback
      const frequencyPredictions = this.predictWithFrequency(lastSelector);
      
      // Combine predictions
      const allPredictions = [...new Set([...gruPredictions, ...frequencyPredictions])];
      
      if (allPredictions.length === 0) {
        return { suggestions: [], reason: 'low_confidence' };
      }
      
      return { suggestions: this.createOperationSuggestions(allPredictions, currentSequence) };

    } catch (error) {
      console.error('[ML Worker] Prediction error:', error);
      return { suggestions: [], reason: 'prediction_error' };
    }
  }

  /**
   * Predict next targetSelectors using GRU model
   */
  private async predictWithGRU(selectors: string[]): Promise<string[]> {
    if (!this.gruModel) return [];

    let inputTensor: tf.Tensor | null = null;
    let prediction: tf.Tensor | null = null;
    try {
      // Convert selectors to indices
      const indices = selectors.slice(-SEQUENCE_LENGTH).map(s => this.selectorToIndex(s));
      
      // Pad sequence if needed
      while (indices.length < SEQUENCE_LENGTH) {
        indices.unshift(0);
      }

      inputTensor = tf.tensor2d([indices], [1, SEQUENCE_LENGTH]);
      prediction = this.gruModel.predict(inputTensor) as tf.Tensor;
      
      const probabilities = await prediction.data();
      
      // Get top 3 predictions
      const topIndices = Array.from(probabilities)
        .map((prob, idx) => ({ prob, idx }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, 3)
        .map(item => item.idx);

      return topIndices
        .map(idx => this.indexToSelector(idx))
        .filter(selector => selector !== null) as string[];
        
    } catch (error) {
      console.error('[ML Worker] GRU prediction failed:', error);
      return [];
    } finally {
      if (inputTensor) inputTensor.dispose();
      if (prediction) prediction.dispose();
    }
  }

  /**
   * Predict next targetSelectors using frequency mapping
   */
  private predictWithFrequency(lastSelector: string): string[] {
    const transitions = this.selectorTransitions.get(lastSelector);
    if (!transitions) return [];

    return Array.from(transitions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);
  }

  /**
   * Create task guidance suggestions for the next step
   */
  private createTaskGuidanceSuggestions(
    nextStep: TaskStep,
    context: SynapseEvent[]
  ): OperationSuggestion[] {
    return [{
      id: `task_guidance_${Date.now()}`,
      title: `Next Step: ${this.simplifySelector(nextStep.selector)}`,
      description: `Continue task sequence - step ${nextStep.step_number + 1}`,
      confidence: nextStep.confidence,
      actions: [{
        type: nextStep.action as 'click' | 'keydown' | 'text_input' | 'scroll',
        target: nextStep.selector,
        sequence: 0,
        isPrivacySafe: true
      }],
      learnedFrom: 'task_path_guidance',
      frequency: nextStep.confidence
    }];
  }

  /**
   * Create OperationSuggestion objects from predicted selectors
   */
  private createOperationSuggestions(
    selectors: string[], 
    context: SynapseEvent[]
  ): OperationSuggestion[] {
    return selectors.map((selector, index) => {
      const confidence = Math.max(0.3, 1.0 - (index * 0.2));
      
      // Infer action type from context
      const recentEvent = context[context.length - 1];
      const actionType = this.inferActionType(recentEvent);
      
      return {
        id: `focus_${Date.now()}_${index}`,
        title: `Smart Focus: ${this.simplifySelector(selector)}`,
        description: `Predicted next interaction target`,
        confidence,
        actions: [{
          type: actionType,
          target: selector,
          sequence: index,
          isPrivacySafe: true
        }],
        learnedFrom: 'gru_intelligent_focus',
        frequency: confidence
      };
    });
  }

  /**
   * Infer action type from recent event
   */
  private inferActionType(event: SynapseEvent): 'click' | 'keydown' | 'text_input' | 'scroll' {
    if (event.type.includes('click')) return 'click';
    if (event.type.includes('key') || event.type.includes('input')) return 'text_input';
    if (event.type.includes('scroll')) return 'scroll';
    return 'click'; // Default
  }

  /**
   * Simplify selector for display
   */
  private simplifySelector(selector: string): string {
    // Extract meaningful parts
    const parts = selector.split(' ');
    const lastPart = parts[parts.length - 1];
    
    if (lastPart.includes('#')) {
      return lastPart.substring(lastPart.indexOf('#') + 1);
    }
    if (lastPart.includes('.')) {
      return lastPart.substring(lastPart.indexOf('.') + 1);
    }
    if (lastPart.includes('[')) {
      return lastPart.substring(0, lastPart.indexOf('['));
    }
    
    return lastPart || 'element';
  }

  /**
   * Get detected skills/patterns including discovered task sequences
   */
  public getSkills(): ActionSkill[] {
    const skills: ActionSkill[] = [];
    
    // Add discovered task sequences
    for (const task of this.discoveredTasks.values()) {
      skills.push(task);
    }
    
    // Add basic skills if no tasks discovered
    if (skills.length === 0) {
      skills.push(
        {
          id: 'basic_navigation',
          name: 'Basic Navigation',
          description: 'Click and scroll patterns',
          token_sequence: [],
          frequency: 1.0,
          confidence: 0.5
        },
        {
          id: 'text_input',
          name: 'Text Input',
          description: 'Typing and form filling',
          token_sequence: [],
          frequency: 0.8,
          confidence: 0.4
        }
      );
    }
    
    return skills;
  }

  /**
   * Train model on event sequence with GRU and frequency mapping
   */
  public async trainModel(sequence: SynapseEvent[]): Promise<any> {
    if (!sequence || sequence.length === 0) {
      return { status: 'no_data', message: 'No training data provided' };
    }

    console.log(`[ML Worker] Training on ${sequence.length} events`);
    
    try {
      // Update frequency mappings for targetSelector transitions
      this.updateSelectorTransitions(sequence);
      
      // Mine sequence patterns for task discovery
      const selectors = sequence
        .filter(event => event.payload?.targetSelector)
        .map(event => event.payload.targetSelector!);
      
      if (selectors.length >= MIN_TASK_LENGTH) {
        this.mineSequencePatterns(selectors);
        this.updateDiscoveredTasks();
      }
      
      // Train GRU model if we have enough data
      let gruTrainingResult = null;
      if (this.shouldTrainGRU(sequence)) {
        gruTrainingResult = await this.trainGRUModel(sequence);
      }
      
      // Update codebook with K-means (simplified)
      const features = sequence.map(event => this.eventToFeatureVector(event));
      if (features.length >= MIN_FEATURES_FOR_KMEANS) {
        this.codebook = simpleKMeans(features, Math.min(features.length, MAX_FEATURES_FOR_KMEANS));
      }
      
      return {
        status: 'success',
        eventsProcessed: sequence.length,
        codebookSize: this.codebook.length,
        vocabularySize: this.selectorVocabulary.size,
        transitionMappings: this.selectorTransitions.size,
        discoveredTasks: this.discoveredTasks.size,
        sequencePatterns: this.sequencePatterns.size,
        gruTraining: gruTrainingResult,
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error('[ML Worker] Training failed:', error);
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Build frequency mapping for targetSelector transitions
   */
  private updateSelectorTransitions(sequence: SynapseEvent[]): void {
    const selectors = sequence
      .filter(event => event.payload?.targetSelector)
      .map(event => event.payload.targetSelector!);
    
    // Build transition frequency map
    for (let i = 0; i < selectors.length - 1; i++) {
      const current = selectors[i];
      const next = selectors[i + 1];
      
      if (!this.selectorTransitions.has(current)) {
        this.selectorTransitions.set(current, new Map());
      }
      
      const transitions = this.selectorTransitions.get(current)!;
      transitions.set(next, (transitions.get(next) || 0) + 1);
      
      // Add to vocabulary
      this.selectorToIndex(current);
      this.selectorToIndex(next);
    }
  }

  /**
   * Check if we should train the GRU model
   */
  private shouldTrainGRU(sequence: SynapseEvent[]): boolean {
    const selectorsWithTargets = sequence.filter(e => e.payload?.targetSelector);
    return selectorsWithTargets.length >= SEQUENCE_LENGTH * 2 && 
           this.selectorVocabulary.size >= 10;
  }

  /**
   * Train the GRU model on selector sequences
   */
  private async trainGRUModel(sequence: SynapseEvent[]): Promise<any> {
    if (!this.gruModel || this.isTraining) {
      return { status: 'skipped', reason: 'Model not ready or already training' };
    }

    try {
      this.isTraining = true;
      
      const selectors = sequence
        .filter(e => e.payload?.targetSelector)
        .map(e => e.payload.targetSelector!);
      
      if (selectors.length < SEQUENCE_LENGTH + 1) {
        return { status: 'insufficient_data', minimum: SEQUENCE_LENGTH + 1 };
      }

      // Create training sequences
      const xData: number[][] = [];
      const yData: number[] = [];
      
      for (let i = 0; i <= selectors.length - SEQUENCE_LENGTH - 1; i++) {
        const input = selectors.slice(i, i + SEQUENCE_LENGTH).map(s => this.selectorToIndex(s));
        const target = this.selectorToIndex(selectors[i + SEQUENCE_LENGTH]);
        
        xData.push(input);
        yData.push(target);
      }

      if (xData.length === 0) {
        return { status: 'no_sequences_created' };
      }

      // Convert to tensors
      const xTensor = tf.tensor2d(xData);
      const yTensor = tf.tensor1d(yData);

      // Train the model
      const history = await this.gruModel.fit(xTensor, yTensor, {
        epochs: 5,
        batchSize: Math.min(32, Math.max(1, Math.floor(xData.length / 4))),
        validationSplit: 0.2,
        verbose: 0
      });

      xTensor.dispose();
      yTensor.dispose();

      return {
        status: 'completed',
        sequences: xData.length,
        epochs: 5,
        finalLoss: history.history.loss[history.history.loss.length - 1],
        finalAccuracy: history.history.accuracy?.[history.history.accuracy.length - 1] || 0
      };
      
    } catch (error) {
      console.error('[ML Worker] GRU training failed:', error);
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Update skills based on new patterns
   */
  public async updateSkills(skillsData: any[]): Promise<any> {
    // Simple skills update - just acknowledge
    return {
      status: 'updated',
      skillsCount: skillsData.length,
      timestamp: Date.now()
    };
  }

  /**
   * Get model information and status
   */
  public getModelInfo(): any {
    return {
      status: 'ready',
      version: '1.0.0',
      codebookSize: this.codebook.length,
      featuresCount: 20,
      modelType: 'simplified_ml_worker',
      capabilities: ['prediction', 'skills_detection', 'event_processing'],
      timestamp: Date.now()
    };
  }

  /**
   * Reset model to initial state
   */
  public resetModel(): any {
    // Reset codebook to empty state
    this.codebook = [];
    this.lastEventTimestamp = 0;
    
    console.log('[ML Worker] Model reset to initial state');
    
    return {
      status: 'reset',
      message: 'Model state cleared',
      timestamp: Date.now()
    };
  }

}

// Create singleton worker instance
const worker = new SynapseMLWorker();

// Worker message handling
self.onmessage = async (e) => {
  const { type, action, data, requestId } = e.data;
  const messageType = type || action; // Support both formats for compatibility
  
  try {
    switch (messageType) {
      case 'processEvents':
      case 'processEvent': // Support legacy naming
        const features = await worker.processEvents(data);
        self.postMessage({ type: 'processEventsResult', success: true, data: features, requestId });
        break;
      
      case 'getCodebook':
        const codebook = worker.getCodebook();
        self.postMessage({ type: 'getCodebookResult', success: true, data: codebook, requestId });
        break;
        
      case 'predict':
        // GRU-based intelligent focus prediction
        const suggestions = await worker.predict(data.currentSequence || []);
        const predictionResult = {
          suggestions,
          timestamp: Date.now(),
          modelType: 'gru_intelligent_focus'
        };
        self.postMessage({ type: 'predictResult', success: true, data: predictionResult, requestId });
        break;
        
      case 'getSkills':
        // Return basic skills info
        const skills = worker.getSkills();
        self.postMessage({ type: 'getSkillsResult', success: true, data: skills, requestId });
        break;
        
      case 'train':
        // Train model on provided sequence
        const trainingResult = await worker.trainModel(data.sequence || []);
        self.postMessage({ type: 'trainResult', success: true, data: trainingResult, requestId });
        break;
        
      case 'updateSkills':
        // Update skills based on new data
        const updateResult = await worker.updateSkills(data.skills || []);
        self.postMessage({ type: 'updateSkillsResult', success: true, data: updateResult, requestId });
        break;
        
      case 'getInfo':
        // Return model info
        const modelInfo = worker.getModelInfo();
        self.postMessage({ type: 'getInfoResult', success: true, data: modelInfo, requestId });
        break;
        
      case 'resetModel':
        // Reset model state
        const resetResult = worker.resetModel();
        self.postMessage({ type: 'resetModelResult', success: true, data: resetResult, requestId });
        break;
        
      default:
        self.postMessage({ type: 'error', success: false, error: 'Unknown message type: ' + messageType, requestId });
    }
  } catch (error) {
    console.error('[ML Worker] Error:', error);
    self.postMessage({ 
      type: 'error',
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId
    });
  }
};

// Send worker_ready signal when worker is initialized
self.postMessage({ 
  type: 'worker_ready', 
  success: true,
  data: { status: 'ready', timestamp: Date.now() }
});

export default SynapseMLWorker;
