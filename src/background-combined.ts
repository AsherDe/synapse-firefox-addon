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

const SEQUENCE_STORAGE_KEY = 'globalActionSequence';
const PAUSE_STATE_KEY = 'extensionPaused';

// Training and prediction configuration
const TRAINING_INTERVAL = 50; // Train every 50 events
const MIN_TRAINING_EVENTS = 20; // Minimum events needed for training

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
};

// Worker error handling
mlWorker.onerror = (error) => {
  console.error('[Background] ML Worker error:', error);
  mlWorkerReady = false;
};

/**
 * Adds a new event to the global sequence in session storage.
 * @param event The enriched event to add.
 */
async function addEventToSequence(event: EnrichedEvent): Promise<void> {
  // Skip if extension is paused
  if (isPaused) {
    console.log('[Synapse] Event ignored - extension is paused');
    return;
  }

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
 * Enhanced with advanced ML engine capabilities
 */
async function handleMLOperations(currentSequence: GlobalActionSequence): Promise<void> {
  try {
    // Train both the simple predictor and the advanced ML engine
    if (currentSequence.length >= MIN_TRAINING_EVENTS && 
        currentSequence.length % TRAINING_INTERVAL === 0) {
      console.log('[Synapse] Starting periodic model training...');
      
      // Train simple predictor (backward compatibility)
      await predictor.trainOnSequence(currentSequence);
      
      // Train ML Worker if available, otherwise fallback to local ML engine
      if (mlWorkerReady) {
        console.log('[Synapse] Sending sequence to ML Worker for training...');
        mlWorker.postMessage({ 
          type: 'train', 
          payload: { sequence: currentSequence } 
        });
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
    }

    // Make predictions using both systems
    if (currentSequence.length >= 5) {
      const recentEvents = currentSequence.slice(-10);
      
      // Check for skill pattern matching first
      const matchedSkill = skillDetector.matchSkillPattern(recentEvents.slice(-4));
      if (matchedSkill) {
        console.log(`[Synapse] Detected skill pattern: ${matchedSkill.name} (confidence: ${(matchedSkill.confidence * 100).toFixed(1)}%)`);
        
        // Store skill prediction
        chrome.storage.session.set({
          lastPrediction: {
            skillName: matchedSkill.name,
            skillDescription: matchedSkill.description,
            confidence: matchedSkill.confidence,
            timestamp: Date.now(),
            type: 'skill'
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

console.log('[Synapse] Background script loaded and ready.');

// Initialize pause state
initializePauseState();

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