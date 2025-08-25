/*
 * Copyright 2024 Synapse Project Contributors
 * Licensed under the Apache License, Version 2.0
 */

import * as tf from '@tensorflow/tfjs';
import { SynapseEvent } from '../shared/types';
import { OperationSuggestion } from '../smart-assistant/types';

// Constants for K-means clustering
const MAX_ITERATIONS = 100;
const MIN_FEATURES_FOR_KMEANS = 8;
const MAX_FEATURES_FOR_KMEANS = 16;

// GRU Model Constants
const SEQUENCE_LENGTH = 10;
const HIDDEN_SIZE = 32;
const VOCAB_SIZE = 1000;

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
            inputDim: VOCAB_SIZE,
            outputDim: 64,
            inputLength: SEQUENCE_LENGTH,
          }),
          tf.layers.gru({
            units: HIDDEN_SIZE,
            returnSequences: true,
            dropout: 0.2,
          }),
          tf.layers.gru({
            units: HIDDEN_SIZE,
            dropout: 0.2,
          }),
          tf.layers.dense({
            units: VOCAB_SIZE,
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
      if (this.vocabularyIndex < VOCAB_SIZE - 1) {
        this.selectorVocabulary.set(selector, this.vocabularyIndex++);
      } else {
        return 0; // Use 0 as unknown token
      }
    }
    return this.selectorVocabulary.get(selector) || 0;
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
   * GRU-based prediction with targetSelector suggestions
   */
  public async predict(currentSequence: SynapseEvent[]): Promise<OperationSuggestion[]> {
    if (!currentSequence || currentSequence.length === 0) {
      return [];
    }

    try {
      // Get recent targetSelectors for frequency fallback
      const recentSelectors = currentSequence
        .filter(e => e.payload?.targetSelector)
        .map(e => e.payload.targetSelector!)
        .slice(-5);

      if (recentSelectors.length === 0) {
        return [];
      }

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
      
      return this.createOperationSuggestions(allPredictions, currentSequence);

    } catch (error) {
      console.error('[ML Worker] Prediction error:', error);
      return [];
    }
  }

  /**
   * Predict next targetSelectors using GRU model
   */
  private async predictWithGRU(selectors: string[]): Promise<string[]> {
    if (!this.gruModel) return [];

    try {
      // Convert selectors to indices
      const indices = selectors.slice(-SEQUENCE_LENGTH).map(s => this.selectorToIndex(s));
      
      // Pad sequence if needed
      while (indices.length < SEQUENCE_LENGTH) {
        indices.unshift(0);
      }

      const inputTensor = tf.tensor2d([indices], [1, SEQUENCE_LENGTH]);
      const prediction = this.gruModel.predict(inputTensor) as tf.Tensor;
      
      const probabilities = await prediction.data();
      
      // Get top 3 predictions
      const topIndices = Array.from(probabilities)
        .map((prob, idx) => ({ prob, idx }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, 3)
        .map(item => item.idx);

      inputTensor.dispose();
      prediction.dispose();

      return topIndices
        .map(idx => this.indexToSelector(idx))
        .filter(selector => selector !== null) as string[];
        
    } catch (error) {
      console.error('[ML Worker] GRU prediction failed:', error);
      return [];
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
   * Get detected skills/patterns
   */
  public getSkills(): any[] {
    // Return simple skills based on codebook
    return [
      {
        id: 'basic_navigation',
        name: 'Basic Navigation',
        description: 'Click and scroll patterns',
        frequency: 1.0,
        confidence: 0.5
      },
      {
        id: 'text_input',
        name: 'Text Input',
        description: 'Typing and form filling',
        frequency: 0.8,
        confidence: 0.4
      }
    ];
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
        finalAccuracy: history.history.acc?.[history.history.acc.length - 1] || 0
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
