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

import { generateGeneralizedURL } from './url-generalization.js';

/// <reference path="./types.ts" />
/// <reference path="./indexeddb-manager.ts" />

// Since browser extensions with manifest v2 don't support ES modules in background scripts,
// we'll inline all the necessary code here to avoid import statements
// Load TensorFlow.js and other dependencies as needed

// Note: TensorFlow.js must be loaded via script tag in manifest.json
// This assumes TensorFlow.js is available globally as 'tf'
declare const tf: any;

// Type definitions for TensorFlow.js objects
interface TensorFlowModel {
  predict(input: any): any;
  fit(xs: any, ys: any, config?: any): Promise<any>;
  save(path: string): Promise<void>;
  compile(config: any): void;
}

interface TensorFlowTensor {
  data(): Promise<Float32Array>;
  dispose(): void;
}

const SEQUENCE_STORAGE_KEY = 'globalActionSequence'; // Legacy key for migration
const PAUSE_STATE_KEY = 'extensionPaused';

// Training and prediction configuration
const TRAINING_INTERVAL = 50; // Train every 50 events
const MIN_TRAINING_EVENTS = 20; // Minimum events needed for training

// Batch storage configuration
const BATCH_WRITE_DELAY = 2000; // 2 seconds delay for batch writes
const BATCH_WRITE_MAX_SIZE = 10; // Maximum events in batch before forced write
const MAX_SEQUENCE_SIZE = 5000; // Maximum sequence size to prevent memory issues

// ML Engine Constants
const MODEL_STORAGE_URL = 'indexeddb://synapse-model';
const SKILLS_STORAGE_KEY = 'action_skills';
const VOCABULARY_STORAGE_KEY = 'ml_vocabulary';

// Simplified ML Engine for browser extension compatibility
class MLEngine {
  private vocabulary: Map<string, number> = new Map();
  private reverseVocabulary: Map<number, string> = new Map();
  private skillsDatabase: Map<string, ActionSkill> = new Map();
  private isInitialized: boolean = false;

  constructor() {
    this.loadVocabulary();
    this.loadSkills();
    this.isInitialized = true;
  }

  /**
   * Convert event to generalized token (Strategy 1)
   */
  private eventToToken(event: EnrichedEvent): string {
    switch (event.type) {
      case 'user_action_click':
        return this.clickEventToToken(event as UserActionClickEvent);
      case 'user_action_keydown':
        return this.keydownEventToToken(event as UserActionKeydownEvent);
      case 'user_action_text_input':
        return this.textInputEventToToken(event as UserActionTextInputEvent);
      case 'browser_action_tab_activated':
        return 'tab_switch';
      case 'browser_action_tab_created':
        return 'tab_create';
      case 'browser_action_tab_removed':
        return 'tab_close';
      case 'browser_action_tab_updated':
        return 'page_navigate';
      default:
        return 'unknown_action';
    }
  }

  private clickEventToToken(event: UserActionClickEvent): string {
    const payload = event.payload as any;
    if (payload.features) {
      const role = payload.features.element_role || 'unknown';
      const pageType = payload.features.page_type || 'general';
      return `click_${role}_${pageType}`;
    }
    return 'click_generic';
  }

  private keydownEventToToken(event: UserActionKeydownEvent): string {
    const payload = event.payload as any;
    const modifiers = payload.modifier_keys || [];
    
    // Detect common keyboard shortcuts
    if (modifiers.includes('ctrl')) {
      switch (payload.key.toLowerCase()) {
        case 'c': return 'copy_action';
        case 'v': return 'paste_action';
        case 't': return 'new_tab_action';
        case 'w': return 'close_tab_action';
        default: return `ctrl_${payload.key.toLowerCase()}`;
      }
    }
    
    if (payload.key === 'Enter') return 'submit_action';
    if (payload.key === 'Tab') return 'tab_navigation';
    
    return 'key_input';
  }

  private textInputEventToToken(event: UserActionTextInputEvent): string {
    const payload = event.payload;
    const inputMethod = payload.input_method || 'keyboard';
    const elementRole = payload.features.element_role || 'textbox';
    const pageType = payload.features.page_type || 'general';
    
    // 根据输入方法分类
    switch (inputMethod) {
      case 'ime_chinese':
        return `text_input_chinese_${elementRole}_${pageType}`;
      case 'ime_japanese':
        return `text_input_japanese_${elementRole}_${pageType}`;
      case 'ime_korean':
        return `text_input_korean_${elementRole}_${pageType}`;
      case 'paste':
        return `text_paste_${elementRole}_${pageType}`;
      case 'emoji':
        return `emoji_input_${elementRole}_${pageType}`;
      default:
        return `text_input_${elementRole}_${pageType}`;
    }
  }

  public async train(sequence: GlobalActionSequence): Promise<void> {
    if (sequence.length < MIN_TRAINING_EVENTS) {
      console.log("[MLEngine] Sequence too short to train.");
      return;
    }

    console.log("[MLEngine] Building vocabulary and analyzing patterns...");
    
    // Build vocabulary from sequence
    this.buildVocabulary(sequence);
    
    // Simple pattern analysis (placeholder for full TensorFlow.js implementation)
    await this.analyzePatterns(sequence);
    
    // Save vocabulary and patterns
    await this.saveVocabulary();
    await this.saveSkills();
    
    console.log("[MLEngine] Training completed.");
  }

  private buildVocabulary(sequence: GlobalActionSequence): void {
    const allTokens = sequence.map(event => this.eventToToken(event));
    const uniqueTokens = [...new Set(allTokens)];
    
    this.vocabulary.clear();
    this.reverseVocabulary.clear();
    
    uniqueTokens.forEach((token, index) => {
      this.vocabulary.set(token, index);
      this.reverseVocabulary.set(index, token);
    });
  }

  private async analyzePatterns(sequence: GlobalActionSequence): Promise<void> {
    // Simplified pattern analysis - detect common sequences
    const tokenSequence = sequence.map(event => this.eventToToken(event));
    const patterns = new Map<string, number>();
    
    // Look for 2-3 token patterns
    for (let len = 2; len <= 3; len++) {
      for (let i = 0; i <= tokenSequence.length - len; i++) {
        const pattern = tokenSequence.slice(i, i + len).join('|');
        patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      }
    }
    
    // Convert frequent patterns to skills
    let skillId = 0;
    for (const [pattern, frequency] of patterns.entries()) {
      if (frequency >= 3) { // Minimum frequency threshold
        const tokens = pattern.split('|');
        const skill: ActionSkill = {
          id: `pattern_skill_${skillId++}`,
          name: this.generateSkillName(tokens),
          description: this.generateSkillDescription(tokens),
          token_sequence: tokens.map((_, i) => i),
          frequency,
          confidence: Math.min(frequency / 10, 1.0)
        };
        this.skillsDatabase.set(skill.id, skill);
      }
    }
  }

  private generateSkillName(tokens: string[]): string {
    const actionMap: { [key: string]: string } = {
      'copy_action': 'Copy',
      'paste_action': 'Paste',
      'tab_switch': 'Switch Tab',
      'new_tab_action': 'New Tab',
      'submit_action': 'Submit',
      'click_button_general': 'Button Click',
      'click_link_general': 'Link Click'
    };

    const readable = tokens.map(t => actionMap[t] || t.replace(/_/g, ' '));
    if (readable.length === 2) {
      return `${readable[0]} → ${readable[1]}`;
    }
    return readable.join(' → ');
  }

  private generateSkillDescription(tokens: string[]): string {
    return `Perform sequence: ${tokens.join(' → ')}`;
  }

  public async predict(recentEvents: EnrichedEvent[]): Promise<{ token: string, confidence: number } | null> {
    if (!this.isInitialized || recentEvents.length < 2) {
      return null;
    }

    // Simple prediction based on pattern matching
    const recentTokens = recentEvents.slice(-2).map(event => this.eventToToken(event));
    
    // Look for known patterns in skills database
    for (const skill of this.skillsDatabase.values()) {
      const skillName = skill.name.toLowerCase();
      const tokenPattern = recentTokens.join(' ').toLowerCase();
      
      if (skillName.includes(tokenPattern.split(' ')[0])) {
        return {
          token: skill.name,
          confidence: skill.confidence
        };
      }
    }

    return null;
  }

  private async loadVocabulary(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([VOCABULARY_STORAGE_KEY]);
      if (result[VOCABULARY_STORAGE_KEY]) {
        const vocabData = result[VOCABULARY_STORAGE_KEY] as [string, number][];
        this.vocabulary = new Map(vocabData);
        this.reverseVocabulary = new Map(vocabData.map(([k, v]) => [v, k]));
      }
    } catch (error) {
      console.error('[MLEngine] Error loading vocabulary:', error);
    }
  }

  private async saveVocabulary(): Promise<void> {
    try {
      const vocabData = Array.from(this.vocabulary.entries());
      await chrome.storage.local.set({ [VOCABULARY_STORAGE_KEY]: vocabData });
    } catch (error) {
      console.error('[MLEngine] Error saving vocabulary:', error);
    }
  }

  private async loadSkills(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([SKILLS_STORAGE_KEY]);
      if (result[SKILLS_STORAGE_KEY]) {
        const skillsData = result[SKILLS_STORAGE_KEY] as [string, ActionSkill][];
        this.skillsDatabase = new Map(skillsData);
      }
    } catch (error) {
      console.error('[MLEngine] Error loading skills:', error);
    }
  }

  private async saveSkills(): Promise<void> {
    try {
      const skillsData = Array.from(this.skillsDatabase.entries());
      await chrome.storage.local.set({ [SKILLS_STORAGE_KEY]: skillsData });
    } catch (error) {
      console.error('[MLEngine] Error saving skills:', error);
    }
  }

  public getSkills(): ActionSkill[] {
    return Array.from(this.skillsDatabase.values());
  }

  public getVocabularySize(): number {
    return this.vocabulary.size;
  }
}

// Simplified Skill Detector
class SkillDetector {
  private skillPatterns: Map<string, ActionSkill> = new Map();

  constructor() {
    // Initialize with common patterns
  }

  public detectSkills(events: EnrichedEvent[], _tokenizer: any): ActionSkill[] {
    // Simple skill detection based on event patterns
    const skills: ActionSkill[] = [];
    
    // Look for text input patterns
    const textInputEvents = events.filter(e => e.type === 'user_action_text_input');
    if (textInputEvents.length > 0) {
      const textInputSkill: ActionSkill = {
        id: 'text_input_skill',
        name: 'Text Input Patterns',
        description: 'User text input behavior patterns',
        token_sequence: [0, 1],
        frequency: textInputEvents.length,
        confidence: 0.9
      };
      skills.push(textInputSkill);
    }
    
    // Combine with existing patterns
    return skills.concat(Array.from(this.skillPatterns.values()));
  }

  public matchSkillPattern(recentEvents: EnrichedEvent[]): ActionSkill | null {
    // Simple pattern matching
    if (recentEvents.length >= 2) {
      const hasClickAndSubmit = recentEvents.some(e => e.type === 'user_action_click') &&
                               recentEvents.some(e => e.type === 'user_action_keydown');
      
      if (hasClickAndSubmit) {
        return {
          id: 'click_submit_pattern',
          name: 'Click and Submit',
          description: 'Click element and submit form',
          token_sequence: [0, 1],
          frequency: 1,
          confidence: 0.8
        };
      }
    }
    return null;
  }

  public getSkills(): ActionSkill[] {
    return Array.from(this.skillPatterns.values());
  }

  public getSkillStats(): { totalSkills: number, topSkills: ActionSkill[] } {
    const skills = this.getSkills();
    return {
      totalSkills: skills.length,
      topSkills: skills.slice(0, 5)
    };
  }
}

// Extension pause state
let isPaused = false;

// A/B Test variables
let isUserInTestGroup = false;
let abTestInitialized = false;

// IndexedDB Manager initialization
let dbManager: any = null;

// Initialize IndexedDB Manager
async function initializeDatabase(): Promise<void> {
  try {
    // Import IndexedDB manager (inline to avoid module issues)
    const { indexedDBManager } = await import('./indexeddb-manager.js');
    dbManager = indexedDBManager;
    await dbManager.init();
    console.log('[Synapse] IndexedDB initialized successfully');
    
    // Migrate existing data from chrome.storage.session if any
    await migrateLegacyData();
  } catch (error) {
    console.error('[Synapse] Failed to initialize IndexedDB:', error);
    // Fallback to chrome.storage.session if IndexedDB fails
    console.log('[Synapse] Falling back to chrome.storage.session');
  }
}

// Migrate legacy data from chrome.storage.session to IndexedDB
async function migrateLegacyData(): Promise<void> {
  try {
    const result = await new Promise<{ [key: string]: any }>(resolve => {
      chrome.storage.session.get([SEQUENCE_STORAGE_KEY], resolve);
    });
    
    const legacySequence = result[SEQUENCE_STORAGE_KEY] as GlobalActionSequence;
    if (legacySequence && legacySequence.length > 0) {
      console.log(`[Synapse] Migrating ${legacySequence.length} events from legacy storage`);
      await dbManager.addEvents(legacySequence);
      
      // Clear legacy storage after successful migration
      await new Promise<void>(resolve => {
        chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: [] }, resolve);
      });
      
      console.log('[Synapse] Legacy data migration completed');
    }
  } catch (error) {
    console.error('[Synapse] Error migrating legacy data:', error);
  }
}

// Batch storage management
let eventBatch: EnrichedEvent[] = [];
let batchWriteTimer: number | null = null;
let sequenceSize = 0;

// Dynamic training frequency management
let lastTrainingTime = 0;
let userActivityWindow: number[] = []; // Rolling window of event timestamps
const ACTIVITY_WINDOW_SIZE = 100; // Track last 100 events
const IDLE_TRAINING_DELAY = 5000; // 5 seconds of inactivity before training
let idleTrainingTimer: number | null = null;

// Phase 2.1: Chrome Idle API integration
let currentIdleState: 'active' | 'idle' | 'locked' = 'active';
let pendingTrainingData: GlobalActionSequence | null = null;
const IDLE_DETECTION_INTERVAL = 15; // seconds

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
// Initialize the new ML engine and skill detector
const mlEngine = new MLEngine();
const skillDetector = new SkillDetector();

// Create ML Worker instance
const mlWorker = new Worker(chrome.runtime.getURL('dist/ml-worker.js'));
let mlWorkerReady = false;

// Listen for messages from ML Worker
mlWorker.onmessage = (event) => {
  const { type } = event.data;
  
  if (type === 'worker_ready') {
    mlWorkerReady = true;
    console.log('[Background] ML Worker is ready');
  }
  
  if (type === 'training_complete') {
    if (event.data.success) {
      console.log(`[Background] ML Worker training completed. Vocab: ${event.data.vocabSize}, Skills: ${event.data.skillsCount}`);
      // Store training results in session storage for popup
      chrome.storage.session.set({
        mlWorkerInfo: {
          vocabSize: event.data.vocabSize,
          skillsCount: event.data.skillsCount,
          lastTraining: Date.now()
        }
      });
    } else {
      console.error('[Background] ML Worker training failed:', event.data.error);
    }
  }
  
  if (type === 'prediction_result') {
    if (event.data.prediction) {
      console.log(`[Background] ML Worker prediction: ${event.data.prediction.token} (confidence: ${(event.data.prediction.confidence * 100).toFixed(1)}%)`);
      // Store worker prediction
      chrome.storage.session.set({ 
        lastPrediction: {
          token: event.data.prediction.token,
          confidence: event.data.prediction.confidence,
          timestamp: Date.now(),
          type: 'worker'
        }
      });
    }
  }
  
  if (type === 'skills_result') {
    // Store skills from worker
    chrome.storage.session.set({
      workerSkills: event.data.skills.slice(0, 10)
    });
  }
  
  // Phase 2.2: Handle codebook update completion from Worker
  if (type === 'codebook_updated') {
    if (event.data.success) {
      console.log(`[Background] Codebook updated in Worker: ${event.data.eventsProcessed} events processed in ${event.data.updateDuration.toFixed(2)}ms`);
      // Store the codebook for potential use in background script
      chrome.storage.local.set({ 
        worker_codebook: event.data.codebook,
        codebook_updated: Date.now()
      });
    } else {
      console.error('[Background] Worker codebook update failed:', event.data.error);
    }
  }
  
  // Phase 2.2: Handle pattern analysis results from Worker
  if (type === 'analyze_patterns') {
    console.log('[Background] Pattern analysis completed in Worker');
  }
  
  // Phase 2.2: Handle model optimization results from Worker
  if (type === 'optimize_model') {
    console.log('[Background] Model optimization completed in Worker');
  }
  
  // Phase 3.2: Handle incremental learning results from Worker
  if (type === 'incremental_learning_complete') {
    if (event.data.success) {
      console.log(`[Background] Incremental learning completed: ${event.data.experienceCount} experiences processed, buffer utilization: ${(event.data.bufferUtilization * 100).toFixed(1)}%`);
      // Store incremental learning metrics
      chrome.storage.session.set({
        incrementalLearningMetrics: {
          experienceCount: event.data.experienceCount,
          bufferUtilization: event.data.bufferUtilization,
          lastIncrementalUpdate: Date.now(),
          readyForIncremental: event.data.readyForIncremental
        }
      });
      
      // Update any connected popups with new learning metrics
      notifyPopups('learningMetricsUpdate', {
        incrementalLearning: event.data,
        timestamp: Date.now()
      });
    } else {
      console.error('[Background] Incremental learning failed:', event.data.error);
    }
  }
};

// Worker error handling
mlWorker.onerror = (error) => {
  console.error('[Background] ML Worker error:', error);
  mlWorkerReady = false;
};

/**
 * Adds a new event to the batch for optimized batch writing.
 * @param event The enriched event to add.
 */
async function addEventToSequence(event: EnrichedEvent): Promise<void> {
  // Skip if extension is paused
  if (isPaused) {
    console.log('[Synapse] Event ignored - extension is paused');
    return;
  }

  try {
    // Add to batch
    eventBatch.push(event);
    sequenceSize++;
    
    // Check if we need to force write due to batch size
    if (eventBatch.length >= BATCH_WRITE_MAX_SIZE) {
      await flushEventBatch();
    } else {
      // Schedule batch write if not already scheduled
      scheduleBatchWrite();
    }
    
    // Trigger ML operations with current batch (non-blocking)
    if (eventBatch.length >= 5) {
      handleMLOperationsAsync();
    }
  } catch (error) {
    console.error('[Synapse] Error adding event to batch:', error);
  }
}

/**
 * Schedules a batch write operation.
 */
function scheduleBatchWrite(): void {
  if (batchWriteTimer !== null) {
    return; // Already scheduled
  }
  
  batchWriteTimer = window.setTimeout(async () => {
    await flushEventBatch();
  }, BATCH_WRITE_DELAY);
}

/**
 * Flushes the current event batch to IndexedDB storage.
 * Phase 1.1: High-performance O(1) write operations
 */
async function flushEventBatch(): Promise<void> {
  if (eventBatch.length === 0) {
    return;
  }
  
  try {
    // Clear the timer
    if (batchWriteTimer !== null) {
      clearTimeout(batchWriteTimer);
      batchWriteTimer = null;
    }
    
    if (dbManager) {
      // Use IndexedDB for high-performance storage
      await dbManager.addEvents(eventBatch);
      console.log(`[Synapse] IndexedDB batch written: ${eventBatch.length} events`);
    } else {
      // Fallback to chrome.storage.session if IndexedDB not available
      const result = await new Promise<{ [key: string]: any }>(resolve => {
        chrome.storage.session.get([SEQUENCE_STORAGE_KEY], resolve);
      });
      
      const currentSequence = (result[SEQUENCE_STORAGE_KEY] || []) as GlobalActionSequence;
      currentSequence.push(...eventBatch);
      
      // Implement sequence size management for fallback
      if (currentSequence.length > MAX_SEQUENCE_SIZE) {
        const removeCount = currentSequence.length - MAX_SEQUENCE_SIZE;
        currentSequence.splice(0, removeCount);
        console.log(`[Synapse] Trimmed ${removeCount} old events to maintain sequence size limit`);
      }
      
      await new Promise<void>(resolve => {
        chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: currentSequence }, resolve);
      });
      
      console.log(`[Synapse] Fallback batch written: ${eventBatch.length} events. Total: ${currentSequence.length}`);
    }
    
    // Clear the batch
    eventBatch = [];
    
    // Update sequence size (get actual count from IndexedDB)
    if (dbManager) {
      sequenceSize = await dbManager.getTotalEventCount();
    }
  } catch (error) {
    console.error('[Synapse] Error flushing event batch:', error);
    // Don't clear batch on error to prevent data loss
  }
}

/**
 * Handles ML operations asynchronously without blocking event processing.
 * Phase 1.1: Uses IndexedDB for efficient event retrieval
 */
async function handleMLOperationsAsync(): Promise<void> {
  try {
    let currentSequence: GlobalActionSequence = [];
    
    if (dbManager) {
      // Get recent events from IndexedDB for ML operations
      // Only get what we need for training/prediction (performance optimization)
      const recentEvents = await dbManager.getRecentEvents(1000);
      currentSequence = recentEvents;
    } else {
      // Fallback to chrome.storage.session
      const result = await new Promise<{ [key: string]: any }>(resolve => {
        chrome.storage.session.get([SEQUENCE_STORAGE_KEY], resolve);
      });
      currentSequence = (result[SEQUENCE_STORAGE_KEY] || []) as GlobalActionSequence;
    }
    
    // Combine with current batch for real-time analysis
    const fullSequence = [...currentSequence, ...eventBatch];
    
    await handleMLOperations(fullSequence);
  } catch (error) {
    console.error('[Synapse] Error in async ML operations:', error);
  }
}

/**
 * Handle ML operations: training and prediction
 * Enhanced with advanced ML engine capabilities and dynamic training
 */
async function handleMLOperations(currentSequence: GlobalActionSequence): Promise<void> {
  try {
    // Update activity tracking
    updateActivityWindow();
    
    // Check if we should train based on dynamic conditions
    const shouldTrain = shouldPerformTraining(currentSequence);
    
    if (shouldTrain) {
      console.log('[Synapse] Starting dynamic model training...');
      lastTrainingTime = Date.now();
      
      // Train simple predictor (backward compatibility)
      await predictor.trainOnSequence(currentSequence);
      
      // Train ML Worker if available, otherwise fallback to local ML engine
      if (mlWorkerReady) {
        console.log('[Synapse] Sending sequence to ML Worker for training...');
        mlWorker.postMessage({ 
          type: 'train', 
          payload: { sequence: currentSequence } 
        });
        
        // Phase 3.2: Also trigger incremental learning for recent experiences
        if (currentSequence.length >= 10) {
          const recentExperiences = currentSequence.slice(-50); // Use last 50 events for incremental learning
          mlWorker.postMessage({
            type: 'incremental_learn',
            payload: { experiences: recentExperiences }
          });
        }
      } else {
        // Fallback to local ML engine
        try {
          await mlEngine.train(currentSequence);
          console.log('[Synapse] Local ML engine training completed');
          
          // Detect and analyze skills
          const detectedSkills = skillDetector.detectSkills(currentSequence, mlEngine);
          console.log(`[Synapse] Detected ${detectedSkills.length} behavioral skills`);
          
          // Store skills for popup display
          chrome.storage.session.set({
            detectedSkills: detectedSkills.slice(0, 10), // Store top 10 skills
            skillStats: skillDetector.getSkillStats()
          });
        } catch (error) {
          console.warn('[Synapse] Local ML engine training failed, falling back to simple predictor:', error);
        }
      }
    } else {
      // Schedule training during user idle time
      scheduleIdleTraining(currentSequence);
    }

    // Make predictions using both systems
    if (currentSequence.length >= 5) {
      const recentEvents = currentSequence.slice(-10);
      
      // Check for skill pattern matching first
      const matchedSkill = skillDetector.matchSkillPattern(recentEvents.slice(-4));
      if (matchedSkill) {
        console.log(`[Synapse] Detected skill pattern: ${matchedSkill.name} (confidence: ${(matchedSkill.confidence * 100).toFixed(1)}%)`);
        
        // A/B Test: Show intelligent predictions to test group users
        if (abTestInitialized && isUserInTestGroup && matchedSkill.confidence > 0.7) {
          try {
            chrome.notifications.create(`synapse_prediction_${Date.now()}`, {
              type: 'basic',
              iconUrl: 'icons/icon-48.png',
              title: 'Synapse 智能预测',
              message: `检测到您可能正在执行: ${matchedSkill.name}. 需要我帮您继续吗?`
            });
            
            // Record this prediction event for analysis
            const predictionEvent = {
              type: 'internal_action_prediction_shown',
              payload: { 
                skillName: matchedSkill.name, 
                confidence: matchedSkill.confidence,
                userGroup: 'test'
              },
              timestamp: Date.now(),
              context: { tabId: null, windowId: null }
            } as any;
            
            await addEventToSequence(predictionEvent);
            
          } catch (error) {
            console.warn('[Synapse] Failed to show prediction notification:', error);
          }
        }
        
        // Store skill prediction
        chrome.storage.session.set({
          lastPrediction: {
            skillName: matchedSkill.name,
            skillDescription: matchedSkill.description,
            confidence: matchedSkill.confidence,
            timestamp: Date.now(),
            type: 'skill',
            userGroup: isUserInTestGroup ? 'test' : 'control'
          }
        });
      }
      
      // Try ML Worker prediction first, then fallback to local ML engine
      if (mlWorkerReady) {
        mlWorker.postMessage({ 
          type: 'predict', 
          payload: { currentSequence: recentEvents } 
        });
        // Note: Response will be handled in mlWorker.onmessage
      } else {
        // Fallback to local ML engine prediction
        try {
          const advancedPrediction = await mlEngine.predict(recentEvents);
          if (advancedPrediction) {
            console.log(`[Synapse] Local ML prediction: ${advancedPrediction.token} (confidence: ${(advancedPrediction.confidence * 100).toFixed(1)}%)`);
            
            // Store advanced prediction
            chrome.storage.session.set({ 
              lastPrediction: {
                token: advancedPrediction.token,
                confidence: advancedPrediction.confidence,
                timestamp: Date.now(),
                type: 'local'
              },
              mlEngineInfo: {
                vocabSize: mlEngine.getVocabularySize(),
                skillsCount: mlEngine.getSkills().length
              }
            });
            return; // Use local prediction if available
          }
        } catch (error) {
          console.warn('[Synapse] Local ML prediction failed, falling back to simple predictor:', error);
        }
      }
      
      // Fallback to simple predictor
      if (predictor.isReady()) {
        const simplePrediction = await predictor.predictNext(recentEvents.slice(-5));
        
        if (simplePrediction) {
          console.log(`[Synapse] Simple prediction: token ${simplePrediction.tokenId} (confidence: ${(simplePrediction.confidence * 100).toFixed(1)}%)`);
          
          // Store simple prediction
          chrome.storage.session.set({ 
            lastPrediction: {
              tokenId: simplePrediction.tokenId,
              confidence: simplePrediction.confidence,
              timestamp: Date.now(),
              type: 'simple'
            }
          });
        }
      }
    }
  } catch (error) {
    console.error('[Synapse] Error in ML operations:', error);
  }
}

/**
 * Updates the user activity window with current timestamp.
 */
function updateActivityWindow(): void {
  const now = Date.now();
  userActivityWindow.push(now);
  
  // Keep only recent events in the window
  if (userActivityWindow.length > ACTIVITY_WINDOW_SIZE) {
    userActivityWindow.shift();
  }
}

/**
 * Determines if training should be performed based on dynamic conditions.
 * Phase 2.1: Enhanced with idle state awareness
 */
function shouldPerformTraining(sequence: GlobalActionSequence): boolean {
  if (sequence.length < MIN_TRAINING_EVENTS) {
    return false;
  }
  
  const now = Date.now();
  const timeSinceLastTraining = now - lastTrainingTime;
  
  // Phase 2.1: If user is idle, prefer idle training over immediate training
  if (currentIdleState === 'idle' || currentIdleState === 'locked') {
    // Don't train immediately if user is idle - let idle training handle it
    return false;
  }
  
  // Calculate user activity rate (events per minute)
  const recentEvents = userActivityWindow.filter(timestamp => 
    now - timestamp < 60000 // Last minute
  );
  const activityRate = recentEvents.length;
  
  // Dynamic training conditions:
  // 1. Standard interval for normal activity (1-10 events/min)
  // 2. Longer interval for high activity (>10 events/min)
  // 3. Shorter interval for low activity (<1 event/min)
  
  let dynamicInterval = TRAINING_INTERVAL;
  
  if (activityRate > 10) {
    // High activity: train less frequently to avoid performance impact
    dynamicInterval = TRAINING_INTERVAL * 3; // Even less frequent during high activity
  } else if (activityRate < 1) {
    // Low activity: train more frequently for better responsiveness
    dynamicInterval = Math.max(TRAINING_INTERVAL / 2, MIN_TRAINING_EVENTS);
  }
  
  // Check if enough events have accumulated since last training
  const eventsSinceTraining = sequence.length % dynamicInterval === 0;
  
  // Also check minimum time between trainings (prevent too frequent training)
  const minTimeBetweenTraining = 45000; // 45 seconds (increased from 30)
  const timeCondition = timeSinceLastTraining > minTimeBetweenTraining;
  
  // Additional condition: only train during active state if it's been a long time since last training
  const emergencyTrainingThreshold = 300000; // 5 minutes
  const emergencyTraining = timeSinceLastTraining > emergencyTrainingThreshold;
  
  return (eventsSinceTraining && timeCondition) || emergencyTraining;
}

/**
 * Schedules training during user idle time using chrome.idle API.
 */
function scheduleIdleTraining(sequence: GlobalActionSequence): void {
  // Clear existing idle timer
  if (idleTrainingTimer !== null) {
    clearTimeout(idleTrainingTimer);
  }
  
  // Check if training is needed
  if (sequence.length < MIN_TRAINING_EVENTS) {
    return;
  }
  
  const now = Date.now();
  const timeSinceLastTraining = now - lastTrainingTime;
  
  // Only schedule if it's been a while since last training
  if (timeSinceLastTraining < 60000) { // Less than 1 minute
    return;
  }
  
  idleTrainingTimer = window.setTimeout(async () => {
    try {
      // Check if user is still idle by looking at recent activity
      const recentActivity = userActivityWindow.filter(timestamp => 
        Date.now() - timestamp < IDLE_TRAINING_DELAY
      );
      
      if (recentActivity.length === 0) {
        // User is idle, safe to train
        console.log('[Synapse] Starting idle-time training...');
        lastTrainingTime = Date.now();
        
        // Perform training (similar to handleMLOperations but focused on training)
        await performIdleTraining(sequence);
      }
    } catch (error) {
      console.error('[Synapse] Error in idle training:', error);
    }
    
    idleTrainingTimer = null;
  }, IDLE_TRAINING_DELAY);
}

/**
 * Performs training during idle time.
 */
async function performIdleTraining(sequence: GlobalActionSequence): Promise<void> {
  try {
    // Train simple predictor
    await predictor.trainOnSequence(sequence);
    
    // Train ML Worker if available
    if (mlWorkerReady) {
      console.log('[Synapse] Sending sequence to ML Worker for idle training...');
      mlWorker.postMessage({ 
        type: 'train', 
        payload: { sequence } 
      });
    } else {
      // Fallback to local ML engine
      try {
        await mlEngine.train(sequence);
        console.log('[Synapse] Local ML engine idle training completed');
        
        // Detect and analyze skills
        const detectedSkills = skillDetector.detectSkills(sequence, mlEngine);
        console.log(`[Synapse] Detected ${detectedSkills.length} behavioral skills during idle training`);
        
        // Store skills for popup display
        chrome.storage.session.set({
          detectedSkills: detectedSkills.slice(0, 10),
          skillStats: skillDetector.getSkillStats()
        });
      } catch (error) {
        console.warn('[Synapse] Local ML engine idle training failed:', error);
      }
    }
  } catch (error) {
    console.error('[Synapse] Error in idle training:', error);
  }
}

/**
 * Phase 2.1: Initialize Chrome Idle API for intelligent training scheduling
 */
function initializeIdleDetection(): void {
  try {
    // Set up idle detection interval
    chrome.idle.setDetectionInterval(IDLE_DETECTION_INTERVAL);
    
    // Listen for idle state changes
    chrome.idle.onStateChanged.addListener((state: chrome.idle.IdleState) => {
      handleIdleStateChange(state);
    });
    
    // Get initial idle state
    chrome.idle.queryState(IDLE_DETECTION_INTERVAL, (state: chrome.idle.IdleState) => {
      currentIdleState = state;
      console.log(`[Synapse] Initial idle state: ${state}`);
    });
    
    console.log('[Synapse] Chrome Idle API initialized for intelligent training scheduling');
  } catch (error) {
    console.error('[Synapse] Failed to initialize Chrome Idle API:', error);
  }
}

/**
 * Phase 2.1: Handle idle state changes for optimal training timing
 */
async function handleIdleStateChange(newState: chrome.idle.IdleState): Promise<void> {
  const previousState = currentIdleState;
  currentIdleState = newState;
  
  console.log(`[Synapse] Idle state changed: ${previousState} → ${newState}`);
  
  switch (newState) {
    case 'idle':
      // User became idle - perfect time for training
      await handleUserBecameIdle();
      break;
      
    case 'active':
      // User became active - stop any pending training
      handleUserBecameActive();
      break;
      
    case 'locked':
      // Screen locked - also a good time for training
      await handleUserBecameIdle();
      break;
  }
}

/**
 * Handle when user becomes idle - trigger ML training
 */
async function handleUserBecameIdle(): Promise<void> {
  try {
    // Get recent events for training
    let trainingSequence: GlobalActionSequence = [];
    
    if (dbManager) {
      // Get recent events from IndexedDB
      trainingSequence = await dbManager.getRecentEvents(1000);
    } else {
      // Fallback to chrome.storage.session
      const result = await new Promise<{ [key: string]: any }>(resolve => {
        chrome.storage.session.get([SEQUENCE_STORAGE_KEY], resolve);
      });
      trainingSequence = result[SEQUENCE_STORAGE_KEY] || [];
    }
    
    // Add current batch to training data
    if (eventBatch.length > 0) {
      trainingSequence.push(...eventBatch);
    }
    
    // Only train if we have sufficient data
    if (trainingSequence.length >= MIN_TRAINING_EVENTS) {
      console.log(`[Synapse] Starting idle-time training with ${trainingSequence.length} events`);
      
      // Store pending training data
      pendingTrainingData = trainingSequence;
      
      // Perform training during idle time
      await performIdleTrainingOptimized(trainingSequence);
      
      // Update last training time
      lastTrainingTime = Date.now();
    } else {
      console.log(`[Synapse] Insufficient events for idle training (${trainingSequence.length} < ${MIN_TRAINING_EVENTS})`);
    }
  } catch (error) {
    console.error('[Synapse] Error during idle training:', error);
  }
}

/**
 * Handle when user becomes active - pause training
 */
function handleUserBecameActive(): void {
  // Clear any pending training operations
  pendingTrainingData = null;
  
  // Note: We don't interrupt ongoing training as it's already in a Web Worker
  // and won't affect user experience
  console.log('[Synapse] User became active - training will continue in background');
}

/**
 * Optimized idle training that respects system resources
 */
async function performIdleTrainingOptimized(sequence: GlobalActionSequence): Promise<void> {
  try {
    // Check if user is still idle before starting intensive operations
    chrome.idle.queryState(IDLE_DETECTION_INTERVAL, async (state: chrome.idle.IdleState) => {
      if (state === 'active') {
        console.log('[Synapse] User became active, skipping intensive training');
        return;
      }
      
      // Proceed with training since user is still idle
      await performIdleTraining(sequence);
      
      // Additional ML operations during idle time
      if (mlWorkerReady) {
        // Send additional analysis tasks to worker during idle time
        mlWorker.postMessage({
          type: 'analyze_patterns',
          payload: { sequence, priority: 'low' }
        });
        
        mlWorker.postMessage({
          type: 'optimize_model',
          payload: { priority: 'low' }
        });
      }
    });
  } catch (error) {
    console.error('[Synapse] Error in optimized idle training:', error);
  }
}

/**
 * Main message listener for events from content scripts and popups.
 */
chrome.runtime.onMessage.addListener((message: RawUserAction | { type: string; data?: any; enabled?: boolean }, sender, sendResponse) => {
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

  if (type === 'user_action_text_input') {
    const event: UserActionTextInputEvent = {
      type,
      payload: (message as RawUserAction).payload as UserActionTextInputPayload,
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
    (async () => {
      if (dbManager) {
        await dbManager.clearAllEvents();
      } else {
        chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: [] }, () => {});
      }
      eventBatch = [];
      sequenceSize = 0;
      console.log('[Synapse] Global action sequence cleared.');
      sendResponse({ success: true });
    })();
    return true; // Indicate async response
  }

  if (message.type === 'getPrediction') {
    chrome.storage.session.get(['lastPrediction'], (result) => {
      sendResponse({ prediction: result.lastPrediction || null });
    });
    return true; // Indicate async response
  }

  if (message.type === 'getModelInfo') {
    const simpleModelInfo = predictor.getModelInfo();
    
    if (mlWorkerReady) {
      chrome.storage.session.get(['mlWorkerInfo'], (result) => {
        const workerInfo = result.mlWorkerInfo || { vocabSize: 0, skillsCount: 0 };
        const advancedModelInfo = {
          vocabSize: workerInfo.vocabSize,
          skillsCount: workerInfo.skillsCount,
          type: 'ML Worker with Web Worker isolation',
          lastTraining: workerInfo.lastTraining
        };
        
        sendResponse({ 
          simpleModel: simpleModelInfo,
          advancedModel: advancedModelInfo,
          isReady: predictor.isReady(),
          workerReady: mlWorkerReady
        });
      });
    } else {
      const advancedModelInfo = {
        vocabSize: mlEngine.getVocabularySize(),
        skillsCount: mlEngine.getSkills().length,
        type: 'Local ML Engine (fallback)'
      };
      
      sendResponse({ 
        simpleModel: simpleModelInfo,
        advancedModel: advancedModelInfo,
        isReady: predictor.isReady(),
        workerReady: false
      });
    }
    return true; // Indicate async response
  }
  
  if (message.type === 'getSkills') {
    if (mlWorkerReady) {
      mlWorker.postMessage({ type: 'getSkills' });
      // Response will be stored in session storage by worker message handler
      chrome.storage.session.get(['workerSkills'], (result) => {
        sendResponse({ skills: result.workerSkills || [] });
      });
    } else {
      const skills = mlEngine.getSkills();
      sendResponse({ skills });
    }
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

  if (message.type === 'togglePause') {
    isPaused = !isPaused;
    chrome.storage.session.set({ [PAUSE_STATE_KEY]: isPaused }, () => {
      console.log(`[Synapse] Extension ${isPaused ? 'paused' : 'resumed'}`);
      sendResponse({ isPaused: isPaused });
    });
    return true; // Indicate async response
  }

  if (message.type === 'getPauseState') {
    sendResponse({ isPaused: isPaused });
    return true; // Indicate async response
  }

  // Smart Assistant message handling
  if (message.type === 'getLearnedSkills') {
    const skills = mlEngine?.getSkills() || [];
    sendResponse({ skills });
    return true;
  }

  if (message.type === 'suggestionExecuted') {
    // Log executed suggestion for learning
    console.log('[Synapse] Suggestion executed:', message.data);
    // TODO: Store execution history for learning
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'suggestionRejected') {
    // Log rejected suggestion for learning
    console.log('[Synapse] Suggestion rejected:', message.data);
    // TODO: Update model based on rejection
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'feedbackSubmitted') {
    // Process user feedback
    console.log('[Synapse] User feedback received:', message.data);
    // TODO: Use feedback to improve suggestions
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'actionsRolledBack') {
    // Handle rollback and start learning mode
    console.log('[Synapse] Actions rolled back, entering learning mode:', message.data);
    // TODO: Monitor subsequent user actions for learning
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'guidanceToggled') {
    // Handle guidance toggle
    console.log('[Synapse] Guidance toggled:', message.enabled);
    sendResponse({ success: true });
    return true;
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
    url: generateGeneralizedURL(tab.pendingUrl || tab.url || ''),
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
      url: generateGeneralizedURL(changeInfo.url),
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

// Initialize pause state from storage
async function initializePauseState(): Promise<void> {
  try {
    const result = await chrome.storage.session.get([PAUSE_STATE_KEY]);
    isPaused = result[PAUSE_STATE_KEY] || false;
    console.log(`[Synapse] Pause state initialized: ${isPaused ? 'paused' : 'active'}`);
  } catch (error) {
    console.error('[Synapse] Error initializing pause state:', error);
    isPaused = false;
  }
}

// Initialize A/B test assignment
async function initializeABTest(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['ab_test_group']);
    if (result.ab_test_group) {
      // User already assigned to a group
      isUserInTestGroup = result.ab_test_group === 'test';
      console.log(`[Synapse] User in existing A/B test group: ${result.ab_test_group}`);
    } else {
      // First time user - randomly assign to test or control group
      isUserInTestGroup = Math.random() < 0.5;
      const group = isUserInTestGroup ? 'test' : 'control';
      await chrome.storage.local.set({ 'ab_test_group': group });
      console.log(`[Synapse] User assigned to A/B test group: ${group}`);
    }
    abTestInitialized = true;
  } catch (error) {
    console.error('[Synapse] Error initializing A/B test:', error);
    isUserInTestGroup = false;
    abTestInitialized = true;
  }
}

console.log('[Synapse] Background script loaded and ready.');

// Initialize IndexedDB first
initializeDatabase();

// Initialize pause state
initializePauseState();

// Initialize A/B test
initializeABTest();

// Phase 2.1: Initialize Chrome Idle API
initializeIdleDetection();

// Long-lived connections for real-time popup updates
const popupConnections = new Set<chrome.runtime.Port>();
const assistantConnections = new Set<chrome.runtime.Port>();

// Handle long-lived connections from popup and smart assistant
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    console.log('[Synapse] Popup connected via long-lived connection');
    popupConnections.add(port);
    
    // Handle messages from popup
    port.onMessage.addListener(async (message) => {
      await handlePopupMessage(port, message);
    });
    
    // Clean up when popup disconnects
    port.onDisconnect.addListener(() => {
      console.log('[Synapse] Popup disconnected');
      popupConnections.delete(port);
    });
  } else if (port.name === 'smart-assistant') {
    console.log('[Synapse] Smart assistant connected via long-lived connection');
    assistantConnections.add(port);
    
    // Handle messages from smart assistant
    port.onMessage.addListener(async (message) => {
      await handleAssistantMessage(port, message);
    });
    
    // Clean up when smart assistant disconnects
    port.onDisconnect.addListener(() => {
      console.log('[Synapse] Smart assistant disconnected');
      assistantConnections.delete(port);
    });
  }
});

/**
 * Handle messages from smart assistant via long-lived connection
 */
async function handleAssistantMessage(port: chrome.runtime.Port, message: any): Promise<void> {
  try {
    switch (message.type) {
      case 'getLearnedSkills':
        const skills = mlEngine?.getSkills() || [];
        port.postMessage({ 
          type: 'learnedSkills', 
          data: skills,
          messageId: message.messageId 
        });
        break;
        
      case 'userAction':
        // Process user action for pattern detection
        // TODO: Implement pattern detection logic
        console.log('[Synapse] User action received from assistant:', message.data);
        break;
        
      case 'suggestionExecuted':
        // Log executed suggestion for learning
        console.log('[Synapse] Suggestion executed:', message.data);
        port.postMessage({ 
          type: 'suggestionResult', 
          data: { success: true },
          messageId: message.messageId 
        });
        break;
        
      case 'suggestionRejected':
        // Log rejected suggestion for learning
        console.log('[Synapse] Suggestion rejected:', message.data);
        port.postMessage({ 
          type: 'suggestionResult', 
          data: { success: true },
          messageId: message.messageId 
        });
        break;
        
      case 'feedbackSubmitted':
        // Process user feedback
        console.log('[Synapse] User feedback received:', message.data);
        port.postMessage({ 
          type: 'suggestionResult', 
          data: { success: true },
          messageId: message.messageId 
        });
        break;
        
      case 'actionsRolledBack':
        // Handle rollback and start learning mode
        console.log('[Synapse] Actions rolled back, entering learning mode:', message.data);
        port.postMessage({ 
          type: 'suggestionResult', 
          data: { success: true },
          messageId: message.messageId 
        });
        break;
        
      default:
        console.warn('[Synapse] Unknown assistant message type:', message.type);
    }
  } catch (error) {
    console.error('[Synapse] Error handling assistant message:', error);
    port.postMessage({ 
      type: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error',
      messageId: message.messageId 
    });
  }
}

/**
 * Handle messages from popup via long-lived connection
 */
async function handlePopupMessage(port: chrome.runtime.Port, message: any): Promise<void> {
  const { type, messageId } = message;
  
  try {
    let response: any = {};
    
    switch (type) {
      case 'requestInitialData':
        // Send all initial data to popup using IndexedDB
        let sequence: GlobalActionSequence = [];
        
        if (dbManager) {
          // Get recent events for popup display (limited for performance)
          sequence = await dbManager.getRecentEvents(100);
        } else {
          // Fallback to chrome.storage.session
          const sequenceResult = await new Promise<{ [key: string]: any }>(resolve => {
            chrome.storage.session.get([SEQUENCE_STORAGE_KEY], resolve);
          });
          sequence = sequenceResult[SEQUENCE_STORAGE_KEY] || [];
        }
        
        const predictionResult = await new Promise<{ [key: string]: any }>(resolve => {
          chrome.storage.session.get(['lastPrediction'], resolve);
        });
        
        response = {
          sequence: sequence,
          prediction: predictionResult.lastPrediction,
          pauseState: isPaused,
          modelInfo: predictor.getModelInfo(),
          isReady: predictor.isReady()
        };
        
        port.postMessage({
          type: 'initialData',
          data: response,
          messageId
        });
        break;
        
      case 'clearSequence':
        if (dbManager) {
          await dbManager.clearAllEvents();
        } else {
          // Fallback to chrome.storage.session
          await new Promise<void>(resolve => {
            chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: [] }, resolve);
          });
        }
        
        // Clear event batch as well
        eventBatch = [];
        sequenceSize = 0;
        
        response = { success: true };
        
        // Notify all connected popups
        notifyPopups('sequenceUpdate', { sequence: [] });
        
        if (messageId) {
          port.postMessage({ messageId, data: response });
        }
        break;
        
      case 'togglePause':
        isPaused = !isPaused;
        await new Promise<void>(resolve => {
          chrome.storage.session.set({ [PAUSE_STATE_KEY]: isPaused }, resolve);
        });
        response = { isPaused };
        
        // Notify all connected popups
        notifyPopups('pauseStateUpdate', { isPaused });
        
        if (messageId) {
          port.postMessage({ messageId, data: response });
        }
        break;
        
      default:
        // Handle other message types with existing logic
        // This maintains backward compatibility
        break;
    }
  } catch (error) {
    console.error('[Synapse] Error handling popup message:', error);
    if (messageId) {
      port.postMessage({ 
        messageId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
}

/**
 * Notify all connected popups of updates
 */
function notifyPopups(type: string, data: any): void {
  const message = { type, data };
  popupConnections.forEach(port => {
    try {
      port.postMessage(message);
    } catch (error) {
      console.warn('[Synapse] Failed to send message to popup:', error);
      popupConnections.delete(port);
    }
  });
}

// Ensure batch is flushed on extension shutdown
chrome.runtime.onSuspend.addListener(async () => {
  console.log('[Synapse] Extension suspending, flushing event batch...');
  await flushEventBatch();
});

// Initialize storage on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: [] });
  console.log('[Synapse] New browser session started. Sequence cleared.');
  initializePauseState();
});

// Initialize storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: [] });
  console.log('[Synapse] Extension installed. Sequence storage initialized.');
  initializePauseState();
});