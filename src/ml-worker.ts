/*
 * Copyright 2024 Synapse Project Contributors
 * Licensed under the Apache License, Version 2.0
 */

import * as tf from '@tensorflow/tfjs';
import { SynapseEvent } from './types';

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
    if (event.payload.position) {
      vector.push(event.payload.position.x / 1920); // Normalized to 0-1
      vector.push(event.payload.position.y / 1080); // Normalized to 0-1
    } else {
      vector.push(0, 0);
    }
    
    // Value feature (if available)
    let valueFeature = 0;
    if (event.payload.value !== undefined) {
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
    const features = event.payload.features || {};
    
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
}

// Worker message handling
self.onmessage = async (e) => {
  const { action, data } = e.data;
  const worker = new SynapseMLWorker();
  
  try {
    switch (action) {
      case 'processEvents':
        const features = await worker.processEvents(data);
        self.postMessage({ success: true, result: features });
        break;
      
      case 'getCodebook':
        const codebook = worker.getCodebook();
        self.postMessage({ success: true, result: codebook });
        break;
        
      default:
        self.postMessage({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (error) {
    console.error('[ML Worker] Error:', error);
    self.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export default SynapseMLWorker;
