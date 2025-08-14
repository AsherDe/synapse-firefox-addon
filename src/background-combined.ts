/*
 * Copyright 2024 Synapse Project Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/// <reference path="./types.ts" />

// Since browser extensions with manifest v2 don't support ES modules in background scripts,
// we'll inline all the necessary code here to avoid import statements

const SEQUENCE_STORAGE_KEY = 'globalActionSequence';

// Training and prediction configuration
const TRAINING_INTERVAL = 50; // Train every 50 events
const MIN_TRAINING_EVENTS = 20; // Minimum events needed for training

// Simplified tokenizer without external dependencies
class SimpleEventTokenizer {
  private codebook: number[][] = [];
  private isInitialized = false;
  private readonly CODEBOOK_SIZE = 256;
  private readonly FEATURE_DIM = 16;

  constructor() {
    this.initializeCodebook();
  }

  private async initializeCodebook(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(['tokenizer_codebook']);
      if (stored.tokenizer_codebook && stored.tokenizer_codebook.length > 0) {
        this.codebook = stored.tokenizer_codebook;
        this.isInitialized = true;
        console.log('[Synapse] Loaded existing codebook with', this.codebook.length, 'tokens');
        return;
      }

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

  private generateDefaultCodebook(): void {
    this.codebook = [];
    for (let i = 0; i < this.CODEBOOK_SIZE; i++) {
      const vector = [];
      for (let j = 0; j < this.FEATURE_DIM; j++) {
        vector.push(Math.random() * 2 - 1);
      }
      this.codebook.push(vector);
    }
  }

  private async saveCodebook(): Promise<void> {
    try {
      await chrome.storage.local.set({ tokenizer_codebook: this.codebook });
    } catch (error) {
      console.error('[Synapse] Error saving codebook:', error);
    }
  }

  private eventToFeatureVector(event: EnrichedEvent): number[] {
    const features: number[] = [];

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

    const date = new Date(event.timestamp);
    features.push(date.getHours() / 24);
    features.push(date.getMinutes() / 60);
    features.push(date.getDay() / 7);

    features.push((event.context.tabId || 0) % 100 / 100);
    features.push((event.context.windowId || 0) % 10 / 10);

    switch (event.type) {
      case 'user_action_click':
        const clickPayload = event.payload as UserActionClickPayload;
        features.push(clickPayload.x / 1920);
        features.push(clickPayload.y / 1080);
        features.push(clickPayload.selector.length / 100);
        break;
      case 'user_action_keydown':
        const keyPayload = event.payload as UserActionKeydownPayload;
        features.push(keyPayload.key.charCodeAt(0) / 255);
        features.push(keyPayload.code.length / 20);
        break;
      default:
        features.push(0, 0, 0);
    }

    while (features.length < this.FEATURE_DIM) {
      features.push(0);
    }
    features.splice(this.FEATURE_DIM);

    return features;
  }

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

  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    const minLength = Math.min(a.length, b.length);
    for (let i = 0; i < minLength; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }

  public async tokenizeEvent(event: EnrichedEvent): Promise<{ tokenId: number, timestamp: number, originalEvent: EnrichedEvent }> {
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

  public isReady(): boolean {
    return this.isInitialized;
  }
}

// Simplified predictor using basic pattern matching instead of TensorFlow.js
class SimpleSequencePredictor {
  private tokenizer: SimpleEventTokenizer;
  private patterns: Map<string, Map<number, number>> = new Map();
  private readonly SEQUENCE_LENGTH = 5;

  constructor() {
    this.tokenizer = new SimpleEventTokenizer();
    this.loadPatterns();
  }

  private async loadPatterns(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get(['predictor_patterns']);
      if (stored.predictor_patterns) {
        this.patterns = new Map(stored.predictor_patterns);
      }
    } catch (error) {
      console.error('[Synapse] Error loading patterns:', error);
    }
  }

  private async savePatterns(): Promise<void> {
    try {
      await chrome.storage.local.set({ 
        predictor_patterns: Array.from(this.patterns.entries()) 
      });
    } catch (error) {
      console.error('[Synapse] Error saving patterns:', error);
    }
  }

  public async trainOnSequence(events: EnrichedEvent[]): Promise<void> {
    if (events.length <= this.SEQUENCE_LENGTH + 1) {
      console.log('[Synapse] Not enough events for training');
      return;
    }

    console.log('[Synapse] Training sequence predictor...');

    const tokenSequence: number[] = [];
    for (const event of events) {
      const tokenized = await this.tokenizer.tokenizeEvent(event);
      tokenSequence.push(tokenized.tokenId);
    }

    // Learn patterns: sequence -> next token
    for (let i = 0; i <= tokenSequence.length - this.SEQUENCE_LENGTH - 1; i++) {
      const sequence = tokenSequence.slice(i, i + this.SEQUENCE_LENGTH);
      const nextToken = tokenSequence[i + this.SEQUENCE_LENGTH];
      const key = sequence.join(',');

      if (!this.patterns.has(key)) {
        this.patterns.set(key, new Map());
      }
      
      const tokenCounts = this.patterns.get(key)!;
      tokenCounts.set(nextToken, (tokenCounts.get(nextToken) || 0) + 1);
    }

    await this.savePatterns();
    console.log('[Synapse] Training completed. Learned', this.patterns.size, 'patterns');
  }

  public async predictNext(recentEvents: EnrichedEvent[]): Promise<{ tokenId: number, confidence: number } | null> {
    if (!this.tokenizer.isReady() || recentEvents.length < this.SEQUENCE_LENGTH) {
      return null;
    }

    try {
      const eventsToUse = recentEvents.slice(-this.SEQUENCE_LENGTH);
      const tokenSequence: number[] = [];
      
      for (const event of eventsToUse) {
        const tokenized = await this.tokenizer.tokenizeEvent(event);
        tokenSequence.push(tokenized.tokenId);
      }

      const key = tokenSequence.join(',');
      const tokenCounts = this.patterns.get(key);

      if (!tokenCounts || tokenCounts.size === 0) {
        return null;
      }

      // Find most frequent next token
      let maxCount = 0;
      let predictedToken = 0;
      let totalCount = 0;

      for (const [token, count] of tokenCounts.entries()) {
        totalCount += count;
        if (count > maxCount) {
          maxCount = count;
          predictedToken = token;
        }
      }

      const confidence = maxCount / totalCount;

      return {
        tokenId: predictedToken,
        confidence: confidence
      };
    } catch (error) {
      console.error('[Synapse] Error during prediction:', error);
      return null;
    }
  }

  public isReady(): boolean {
    return this.tokenizer.isReady();
  }

  public getModelInfo(): any {
    return {
      sequenceLength: this.SEQUENCE_LENGTH,
      patternsLearned: this.patterns.size,
      type: 'Pattern-based predictor',
      vocabSize: 256
    };
  }
}

const tokenizer = new SimpleEventTokenizer();
const predictor = new SimpleSequencePredictor();

/**
 * Adds a new event to the global sequence in session storage.
 * @param event The enriched event to add.
 */
async function addEventToSequence(event: EnrichedEvent): Promise<void> {
  try {
    const result = await new Promise<{ [key: string]: any }>(resolve => {
      chrome.storage.session.get([SEQUENCE_STORAGE_KEY], resolve);
    });

    const currentSequence = (result[SEQUENCE_STORAGE_KEY] || []) as GlobalActionSequence;
    currentSequence.push(event);

    await new Promise<void>(resolve => {
      chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: currentSequence }, resolve);
    });
    
    // Log for debugging
    console.log(`[Synapse] Event added. Total sequence length: ${currentSequence.length}`);
    console.table(currentSequence.slice(-5)); // Log last 5 events

    // Train model periodically and make predictions
    await handleMLOperations(currentSequence);
  } catch (error) {
    console.error('[Synapse] Error adding event to sequence:', error);
  }
}

/**
 * Handle ML operations: training and prediction
 */
async function handleMLOperations(currentSequence: GlobalActionSequence): Promise<void> {
  try {
    // Train model periodically
    if (currentSequence.length >= MIN_TRAINING_EVENTS && 
        currentSequence.length % TRAINING_INTERVAL === 0) {
      console.log('[Synapse] Starting periodic model training...');
      await predictor.trainOnSequence(currentSequence);
    }

    // Make prediction if we have enough recent events
    if (currentSequence.length >= 5 && predictor.isReady()) {
      const recentEvents = currentSequence.slice(-5);
      const prediction = await predictor.predictNext(recentEvents);
      
      if (prediction) {
        console.log(`[Synapse] Predicted next token: ${prediction.tokenId} (confidence: ${(prediction.confidence * 100).toFixed(1)}%)`);
        
        // Store prediction for popup to display
        chrome.storage.session.set({ 
          lastPrediction: {
            tokenId: prediction.tokenId,
            confidence: prediction.confidence,
            timestamp: Date.now()
          }
        });
      }
    }
  } catch (error) {
    console.error('[Synapse] Error in ML operations:', error);
  }
}

/**
 * Main message listener for events from content scripts and popups.
 */
chrome.runtime.onMessage.addListener((message: RawUserAction | { type: string }, sender, sendResponse) => {
  const { type } = message;

  const context = {
    tabId: sender.tab?.id ?? null,
    windowId: sender.tab?.windowId ?? null,
    tabInfo: sender.tab,
  };

  if (type === 'user_action_click') {
    const event: UserActionClickEvent = {
      type,
      payload: (message as RawUserAction).payload as UserActionClickPayload,
      timestamp: Date.now(),
      context,
    };
    addEventToSequence(event);
    return;
  }

  if (type === 'user_action_keydown') {
    const event: UserActionKeydownEvent = {
      type,
      payload: (message as RawUserAction).payload as UserActionKeydownPayload,
      timestamp: Date.now(),
      context,
    };
    addEventToSequence(event);
    return;
  }

  // Handle requests from the popup
  if (type === 'getSequence') {
    chrome.storage.session.get([SEQUENCE_STORAGE_KEY], (result) => {
      sendResponse({ sequence: result[SEQUENCE_STORAGE_KEY] || [] });
    });
    return true; // Indicate async response
  }

  if (message.type === 'clearSequence') {
    chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: [] }, () => {
      console.log('[Synapse] Global action sequence cleared.');
      sendResponse({ success: true });
    });
    return true; // Indicate async response
  }

  if (message.type === 'getPrediction') {
    chrome.storage.session.get(['lastPrediction'], (result) => {
      sendResponse({ prediction: result.lastPrediction || null });
    });
    return true; // Indicate async response
  }

  if (message.type === 'getModelInfo') {
    const modelInfo = predictor.getModelInfo();
    sendResponse({ modelInfo, isReady: predictor.isReady() });
    return true; // Indicate async response
  }

  if (message.type === 'getCodebookInfo') {
    chrome.storage.local.get(['tokenizer_codebook'], (result) => {
      const codebook = result.tokenizer_codebook || [];
      const info = {
        codebookSize: codebook.length,
        vectorDimension: codebook.length > 0 ? codebook[0].length : 0,
        isInitialized: codebook.length > 0,
        sampleVectors: codebook.slice(0, 3)
      };
      sendResponse({ codebookInfo: info });
    });
    return true; // Indicate async response
  }

  return false; // No async response
});

/**
 * Listeners for browser-level tab events.
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const payload: TabActivatedPayload = {
    tabId: activeInfo.tabId,
    windowId: activeInfo.windowId,
  };
  const event: BrowserActionTabActivatedEvent = {
    type: 'browser_action_tab_activated',
    payload,
    timestamp: Date.now(),
    context: { tabId: activeInfo.tabId, windowId: activeInfo.windowId },
  };
  await addEventToSequence(event);
});

chrome.tabs.onCreated.addListener(async (tab) => {
  const payload: TabCreatedPayload = {
    tabId: tab.id!,
    windowId: tab.windowId,
    url: tab.pendingUrl || tab.url,
  };
  const event: BrowserActionTabCreatedEvent = {
    type: 'browser_action_tab_created',
    payload,
    timestamp: Date.now(),
    context: { tabId: tab.id!, windowId: tab.windowId, tabInfo: tab },
  };
  await addEventToSequence(event);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && changeInfo.url) {
    const payload: TabUpdatedPayload = {
      tabId: tabId,
      url: changeInfo.url,
      title: tab.title,
    };
    const event: BrowserActionTabUpdatedEvent = {
      type: 'browser_action_tab_updated',
      payload,
      timestamp: Date.now(),
      context: { tabId, windowId: tab.windowId, tabInfo: tab },
    };
    await addEventToSequence(event);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const payload: TabRemovedPayload = {
    tabId,
    windowId: removeInfo.windowId,
  };
  const event: BrowserActionTabRemovedEvent = {
    type: 'browser_action_tab_removed',
    payload,
    timestamp: Date.now(),
    context: { tabId, windowId: removeInfo.windowId },
  };
  await addEventToSequence(event);
});

console.log('[Synapse] Background script loaded and ready.');

// Initialize storage on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: [] });
  console.log('[Synapse] New browser session started. Sequence cleared.');
});

// Initialize storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: [] });
  console.log('[Synapse] Extension installed. Sequence storage initialized.');
});