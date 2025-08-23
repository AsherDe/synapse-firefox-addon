/// <reference path="./types.ts" />
import { SynapseEvent, ActionSkill } from './types';

/**
 * DEPRECATED: This tokenizer is replaced by the simplified ML worker.
 * Kept for backward compatibility only.
 */

// Simple type aliases for legacy compatibility
type EnrichedEvent = SynapseEvent;
type TokenizedEvent = { tokenId: number; timestamp: number; originalEvent: SynapseEvent };
type TokenSequence = TokenizedEvent[];
type UserActionClickPayload = any;
type UserActionKeydownPayload = any;

// Simple DCT implementation
function simpleDCT(input: number[]): number[] {
  const N = input.length;
  const output: number[] = [];
  
  for (let k = 0; k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += input[n] * Math.cos(Math.PI * k * (2 * n + 1) / (2 * N));
    }
    output[k] = sum;
  }
  
  return output;
}

// Simple K-means implementation
function simpleKMeans(data: number[][], k: number): number[][] {
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
  for (let iter = 0; iter < 10; iter++) {
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

export class EventTokenizer {
  private codebook: number[][] = [];
  private isInitialized = false;
  private readonly CODEBOOK_SIZE = 256;
  private readonly FEATURE_DIM = 16;

  constructor() {
    this.initializeCodebook();
  }

  /**
   * Initialize or load the codebook for token conversion
   */
  private async initializeCodebook(): Promise<void> {
    try {
      // Try to load existing codebook from storage
      const stored = await chrome.storage.local.get(['tokenizer_codebook']);
      if (stored.tokenizer_codebook && stored.tokenizer_codebook.length > 0) {
        this.codebook = stored.tokenizer_codebook;
        this.isInitialized = true;
        console.log('[Synapse] Loaded existing codebook with', this.codebook.length, 'tokens');
        return;
      }

      // Initialize with default codebook if none exists
      this.generateDefaultCodebook();
      await this.saveCodebook();
      this.isInitialized = true;
      console.log('[Synapse] Generated new codebook with', this.codebook.length, 'tokens');
    } catch (error) {
      console.error('[Synapse] Error initializing codebook:', error);
      this.generateDefaultCodebook();
      this.isInitialized = true;
    }
  }

  /**
   * Generate a default codebook using random vectors
   */
  private generateDefaultCodebook(): void {
    this.codebook = [];
    for (let i = 0; i < this.CODEBOOK_SIZE; i++) {
      const vector = [];
      for (let j = 0; j < this.FEATURE_DIM; j++) {
        vector.push(Math.random() * 2 - 1); // Random values between -1 and 1
      }
      this.codebook.push(vector);
    }
  }

  /**
   * Save codebook to chrome storage
   */
  private async saveCodebook(): Promise<void> {
    try {
      await chrome.storage.local.set({ tokenizer_codebook: this.codebook });
    } catch (error) {
      console.error('[Synapse] Error saving codebook:', error);
    }
  }

  /**
   * Convert an enriched event to a feature vector using DCT
   */
  private eventToFeatureVector(event: EnrichedEvent): number[] {
    // Create a feature vector from the event
    const features: number[] = [];

    // Event type encoding (one-hot-like)
    const eventTypes = [
      'user_action_click',
      'user_action_keydown', 
      'browser_action_tab_created',
      'browser_action_tab_activated',
      'browser_action_tab_updated',
      'browser_action_tab_removed'
    ];
    const typeIndex = eventTypes.indexOf(event.type);
    features.push(typeIndex >= 0 ? typeIndex / eventTypes.length : 0);

    // Timestamp features (time of day, day of week)
    const date = new Date(event.timestamp);
    features.push(date.getHours() / 24);
    features.push(date.getMinutes() / 60);
    features.push(date.getDay() / 7);

    // Context features
    features.push((event.context.tabId || 0) % 100 / 100); // Normalize tab ID
    features.push((event.context.windowId || 0) % 10 / 10); // Normalize window ID

    // Event-specific features
    switch (event.type) {
      case 'user_action_click':
        const clickPayload = event.payload as UserActionClickPayload;
        features.push(clickPayload.x / 1920); // Normalize to common screen width
        features.push(clickPayload.y / 1080); // Normalize to common screen height
        features.push(clickPayload.selector.length / 100); // Selector complexity
        break;
      case 'user_action_keydown':
        const keyPayload = event.payload as UserActionKeydownPayload;
        features.push(keyPayload.key.charCodeAt(0) / 255); // Key code normalized
        features.push(keyPayload.code.length / 20); // Code length
        break;
      default:
        features.push(0, 0, 0); // Padding for other event types
    }

    // Pad or truncate to fixed size
    while (features.length < this.FEATURE_DIM) {
      features.push(0);
    }
    features.splice(this.FEATURE_DIM);

    // Apply DCT to the feature vector
    try {
      return simpleDCT(features);
    } catch (error) {
      console.warn('[Synapse] DCT failed, using raw features:', error);
      return features;
    }
  }

  /**
   * Find the closest token in the codebook for a given feature vector
   */
  private findClosestToken(featureVector: number[]): number {
    let minDistance = Infinity;
    let closestToken = 0;

    for (let i = 0; i < this.codebook.length; i++) {
      const distance = this.euclideanDistance(featureVector, this.codebook[i]);
      if (distance < minDistance) {
        minDistance = distance;
        closestToken = i;
      }
    }

    return closestToken;
  }

  /**
   * Calculate Euclidean distance between two vectors
   */
  private euclideanDistance(a: number[], b: number[]): number {
    return euclideanDistance(a, b);
  }

  /**
   * Tokenize a single event
   */
  public async tokenizeEvent(event: EnrichedEvent): Promise<TokenizedEvent> {
    if (!this.isInitialized) {
      await this.initializeCodebook();
    }

    const featureVector = this.eventToFeatureVector(event);
    const tokenId = this.findClosestToken(featureVector);

    return {
      tokenId,
      timestamp: event.timestamp,
      originalEvent: event
    };
  }

  /**
   * Tokenize a sequence of events
   */
  public async tokenizeSequence(events: EnrichedEvent[]): Promise<TokenSequence> {
    if (!this.isInitialized) {
      await this.initializeCodebook();
    }

    const tokenSequence: TokenSequence = [];
    for (const event of events) {
      const tokenizedEvent = await this.tokenizeEvent(event);
      tokenSequence.push(tokenizedEvent);
    }

    return tokenSequence;
  }

  /**
   * Update codebook using K-means clustering on collected feature vectors
   */
  public async updateCodebook(events: EnrichedEvent[]): Promise<void> {
    if (events.length < this.CODEBOOK_SIZE) {
      console.log('[Synapse] Not enough events to update codebook');
      return;
    }

    try {
      // Convert events to feature vectors
      const featureVectors = events.map(event => this.eventToFeatureVector(event));
      
      // Apply K-means clustering
      const centroids = simpleKMeans(featureVectors, this.CODEBOOK_SIZE);

      // Update codebook with cluster centers
      this.codebook = centroids;
      await this.saveCodebook();

      console.log('[Synapse] Codebook updated with K-means clustering');
    } catch (error) {
      console.error('[Synapse] Error updating codebook:', error);
    }
  }

  /**
   * Get the current codebook size
   */
  public getCodebookSize(): number {
    return this.codebook.length;
  }

  /**
   * Check if tokenizer is ready
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
}