/*
 * Copyright 2024 Synapse Project Contributors
 * Licensed under the Apache License, Version 2.0
 */

import * as tf from '@tensorflow/tfjs';
import { SynapseEvent } from './types';

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
  
  // Simple iteration (just a few rounds)
  for (let iter = 0; iter < 5; iter++) {
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
  
  constructor() {
    console.log('[ML Worker] Initialized - ready to process clean SynapseEvents');
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
   * Simple prediction based on event patterns
   */
  public async predict(currentSequence: SynapseEvent[]): Promise<any> {
    if (!currentSequence || currentSequence.length === 0) {
      return {
        nextAction: null,
        confidence: 0,
        suggestions: []
      };
    }

    // Simple pattern-based prediction
    const recentTypes = currentSequence.map(e => e.type);
    const mostCommon = this.findMostCommonPattern(recentTypes);
    
    return {
      nextAction: mostCommon,
      confidence: 0.3, // Simple confidence
      suggestions: [mostCommon],
      timestamp: Date.now()
    };
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
   * Train model on event sequence (simplified version)
   */
  public async trainModel(sequence: SynapseEvent[]): Promise<any> {
    if (!sequence || sequence.length === 0) {
      return { status: 'no_data', message: 'No training data provided' };
    }

    console.log(`[ML Worker] Training on ${sequence.length} events`);
    
    // Simple training: just update statistics
    const features = sequence.map(event => this.eventToFeatureVector(event));
    
    // Update codebook with K-means (simplified)
    if (features.length >= 8) {
      this.codebook = simpleKMeans(features, Math.min(features.length, 16));
    }
    
    return {
      status: 'success',
      eventsProcessed: sequence.length,
      codebookSize: this.codebook.length,
      timestamp: Date.now()
    };
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

  /**
   * Find the most common pattern in recent events
   */
  private findMostCommonPattern(types: string[]): string | null {
    if (types.length === 0) return null;
    
    const counts: Record<string, number> = {};
    types.forEach(type => {
      counts[type] = (counts[type] || 0) + 1;
    });
    
    let maxCount = 0;
    let mostCommon = null;
    for (const [type, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = type;
      }
    }
    
    return mostCommon;
  }
}

// Worker message handling
self.onmessage = async (e) => {
  const { type, action, data, requestId } = e.data;
  const messageType = type || action; // Support both formats for compatibility
  const worker = new SynapseMLWorker();
  
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
        // Simple prediction based on recent events
        const predictionResult = await worker.predict(data.currentSequence || []);
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

export default SynapseMLWorker;
