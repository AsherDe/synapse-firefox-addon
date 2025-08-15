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

// Enhanced ML Worker with LSTM, Incremental Learning, and Rich Context Features

// Type definitions for rich context features
interface RichContextFeatures {
  primaryToken: string;
  timeContext: TimeContext;
  spatialContext: SpatialContext;
  semanticContext: SemanticContext;
  behavioralContext: BehavioralContext;
  combinedSignature: string;
}

interface TimeContext {
  hour: number;
  dayOfWeek: number;
  isWeekend: boolean;
  timePeriod: string;
  timestamp: number;
}

interface SpatialContext {
  hasCoordinates: boolean;
  x?: number;
  y?: number;
  relativePosition: string;
  screenRegion: string;
}

interface SemanticContext {
  domain: string;
  pageType: string;
  elementType: string;
  intentCategory: string;
}

interface BehavioralContext {
  actionIntensity: number;
  sequencePosition: string;
  repeatPattern: boolean;
  confidenceLevel: number;
}

interface LearningMetrics {
  experienceCount: number;
  bufferUtilization: number;
  readyForIncremental: boolean;
  diversity: number;
}

// Constants
const WORKER_MODEL_STORAGE_URL = 'indexeddb://synapse-enhanced-model';
const WORKER_SKILLS_STORAGE_KEY = 'enhanced_action_skills';
const WORKER_VOCABULARY_STORAGE_KEY = 'enhanced_ml_vocabulary';
const WORKER_MIN_TRAINING_EVENTS = 20;
const MAX_PATTERN_LENGTH = 10;
const MIN_PATTERN_FREQUENCY = 2;
const PRUNING_THRESHOLD = 0.01;

/**
 * Rich context feature extractor for enhanced ML predictions
 */
class ContextExtractor {
  /**
   * Extract rich contextual features from events
   */
  public extractRichFeatures(event: EnrichedEvent): RichContextFeatures {
    const baseToken = this.getBaseToken(event);
    const timeFeatures = this.extractTimeFeatures(event.timestamp);
    const spatialFeatures = this.extractSpatialFeatures(event);
    const semanticFeatures = this.extractSemanticFeatures(event);
    const behavioralFeatures = this.extractBehavioralFeatures(event);
    
    return {
      primaryToken: baseToken,
      timeContext: timeFeatures,
      spatialContext: spatialFeatures,
      semanticContext: semanticFeatures,
      behavioralContext: behavioralFeatures,
      combinedSignature: this.createCombinedSignature(baseToken, timeFeatures, spatialFeatures, semanticFeatures)
    };
  }

  private getBaseToken(event: EnrichedEvent): string {
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

  private extractTimeFeatures(timestamp: number): TimeContext {
    const date = new Date(timestamp);
    const hour = date.getHours();
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    let timePeriod: string;
    if (hour >= 6 && hour < 12) timePeriod = 'morning';
    else if (hour >= 12 && hour < 18) timePeriod = 'afternoon';
    else if (hour >= 18 && hour < 22) timePeriod = 'evening';
    else timePeriod = 'night';
    
    return {
      hour,
      dayOfWeek,
      isWeekend,
      timePeriod,
      timestamp
    };
  }

  private extractSpatialFeatures(event: EnrichedEvent): SpatialContext {
    const spatial: SpatialContext = {
      hasCoordinates: false,
      relativePosition: 'unknown',
      screenRegion: 'unknown'
    };
    
    if (event.type === 'user_action_click') {
      const clickEvent = event as UserActionClickEvent;
      spatial.hasCoordinates = true;
      spatial.x = clickEvent.payload.x;
      spatial.y = clickEvent.payload.y;
      
      // Determine screen region (assuming 1920x1080 reference)
      const relativeX = clickEvent.payload.x / 1920;
      const relativeY = clickEvent.payload.y / 1080;
      
      if (relativeX < 0.33) spatial.screenRegion = relativeY < 0.33 ? 'top_left' : relativeY < 0.66 ? 'middle_left' : 'bottom_left';
      else if (relativeX < 0.66) spatial.screenRegion = relativeY < 0.33 ? 'top_center' : relativeY < 0.66 ? 'center' : 'bottom_center';
      else spatial.screenRegion = relativeY < 0.33 ? 'top_right' : relativeY < 0.66 ? 'middle_right' : 'bottom_right';
      
      spatial.relativePosition = `${Math.round(relativeX * 10)}_${Math.round(relativeY * 10)}`;
    }
    
    return spatial;
  }

  private extractSemanticFeatures(event: EnrichedEvent): SemanticContext {
    const semantic: SemanticContext = {
      domain: 'unknown',
      pageType: 'general',
      elementType: 'unknown',
      intentCategory: 'unknown'
    };
    
    // Extract domain and page type from URL
    if (event.context.tabInfo?.url) {
      try {
        const url = new URL(event.context.tabInfo.url);
        semantic.domain = url.hostname;
        semantic.pageType = this.inferPageType(event.context.tabInfo.url);
      } catch (error) {
        // Invalid URL, use defaults
      }
    }
    
    // Extract element type and intent
    if (event.type === 'user_action_click') {
      const features = (event.payload as any).features;
      if (features) {
        semantic.elementType = features.element_role || 'unknown';
        semantic.intentCategory = this.inferIntentFromFeatures(features);
      }
    }
    
    return semantic;
  }

  private extractBehavioralFeatures(event: EnrichedEvent): BehavioralContext {
    return {
      actionIntensity: this.calculateActionIntensity(event),
      sequencePosition: 'middle',
      repeatPattern: false,
      confidenceLevel: 0.8
    };
  }

  private calculateActionIntensity(event: EnrichedEvent): number {
    const intensityMap = {
      'user_action_click': 0.8,
      'user_action_keydown': 0.6,
      'user_action_text_input': 0.7,
      'browser_action_tab_activated': 0.9,
      'browser_action_tab_created': 1.0,
      'browser_action_tab_removed': 0.9,
      'browser_action_tab_updated': 0.5
    };
    
    return intensityMap[event.type as keyof typeof intensityMap] || 0.5;
  }

  private createCombinedSignature(baseToken: string, timeContext: TimeContext, 
                                 spatialContext: SpatialContext, semanticContext: SemanticContext): string {
    return `${baseToken}_${timeContext.timePeriod}_${spatialContext.screenRegion}_${semanticContext.pageType}`;
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

  private inferPageType(url: string): string {
    const urlLower = url.toLowerCase();
    const pathname = new URL(url).pathname.toLowerCase();
    
    if (url.includes('github.com')) {
      if (pathname.includes('/issues')) return 'issue_tracker';
      if (pathname.includes('/pull')) return 'pull_request';
      if (pathname.includes('/blob') || pathname.includes('/tree')) return 'code_browser';
      return 'code_repository';
    }
    
    if (urlLower.includes('login') || urlLower.includes('signin') || urlLower.includes('auth')) {
      return 'authentication';
    }
    if (urlLower.includes('search') || urlLower.includes('query')) {
      return 'search_results';
    }
    if (urlLower.includes('settings') || urlLower.includes('preferences') || urlLower.includes('config')) {
      return 'settings';
    }
    if (urlLower.includes('profile') || urlLower.includes('user') || urlLower.includes('account')) {
      return 'user_profile';
    }
    if (urlLower.includes('admin') || urlLower.includes('dashboard')) {
      return 'dashboard';
    }
    
    return 'general';
  }

  private inferIntentFromFeatures(features: any): string {
    const role = features.element_role || '';
    const text = features.element_text || '';
    const isNavLink = features.is_nav_link;
    
    if (isNavLink) return 'navigation';
    if (role === 'button' && (text.includes('submit') || text.includes('save'))) return 'submission';
    if (role === 'button' && (text.includes('cancel') || text.includes('close'))) return 'cancellation';
    if (role === 'link') return 'link_following';
    if (role === 'textbox') return 'data_input';
    
    return 'interaction';
  }
}

/**
 * Incremental learning system for continuous model improvement
 */
class IncrementalLearner {
  private recentExperiences: EnrichedEvent[] = [];
  private learningBuffer: { xs: any, ys: any }[] = [];
  private readonly BUFFER_SIZE = 100;
  private readonly INCREMENTAL_BATCH_SIZE = 10;
  
  public addExperience(event: EnrichedEvent): void {
    this.recentExperiences.push(event);
    
    if (this.recentExperiences.length > this.BUFFER_SIZE) {
      this.recentExperiences.shift();
    }
  }
  
  public prepareIncrementalBatch(contextExtractor: ContextExtractor, vocabulary: Map<string, number>): { xs: any, ys: any } | null {
    if (this.recentExperiences.length < this.INCREMENTAL_BATCH_SIZE || typeof self === 'undefined' || !(self as any).tf) {
      return null;
    }
    
    const tf = (self as any).tf;
    const batchEvents = this.recentExperiences.slice(-this.INCREMENTAL_BATCH_SIZE);
    
    const enhancedFeatures = batchEvents.map(event => 
      contextExtractor.extractRichFeatures(event)
    );
    
    const tokenSequence = enhancedFeatures.map(features => 
      vocabulary.get(features.primaryToken) || 0
    );
    
    if (tokenSequence.length < 2) return null;
    
    const inputSequences: number[][] = [];
    const outputTokens: number[] = [];
    
    for (let i = 0; i < tokenSequence.length - 1; i++) {
      inputSequences.push([tokenSequence[i]]);
      outputTokens.push(tokenSequence[i + 1]);
    }
    
    const xs = tf.tensor2d(inputSequences);
    const ys = tf.oneHot(outputTokens, vocabulary.size);
    
    return { xs, ys };
  }
  
  public getExperienceReplay(sampleSize: number = 5): EnrichedEvent[] {
    if (this.recentExperiences.length <= sampleSize) {
      return [...this.recentExperiences];
    }
    
    const samples: EnrichedEvent[] = [];
    const step = Math.floor(this.recentExperiences.length / sampleSize);
    
    for (let i = 0; i < sampleSize; i++) {
      const index = i * step;
      if (index < this.recentExperiences.length) {
        samples.push(this.recentExperiences[index]);
      }
    }
    
    return samples;
  }
  
  public getLearningMetrics(): LearningMetrics {
    return {
      experienceCount: this.recentExperiences.length,
      bufferUtilization: this.recentExperiences.length / this.BUFFER_SIZE,
      readyForIncremental: this.recentExperiences.length >= this.INCREMENTAL_BATCH_SIZE,
      diversity: this.calculateExperienceDiversity()
    };
  }
  
  private calculateExperienceDiversity(): number {
    const eventTypes = new Set(this.recentExperiences.map(e => e.type));
    return eventTypes.size / Math.max(this.recentExperiences.length, 1);
  }
}

/**
 * Enhanced ML Engine with LSTM and incremental learning
 */
class EnhancedMLEngine {
  private vocabulary: Map<string, number> = new Map();
  private reverseVocabulary: Map<number, string> = new Map();
  private skillsDatabase: Map<string, ActionSkill> = new Map();
  private model: any = null;
  private sequenceLength: number = 10;
  private contextExtractor: ContextExtractor;
  private incrementalLearner: IncrementalLearner;
  private isInitialized: boolean = false;

  constructor() {
    this.contextExtractor = new ContextExtractor();
    this.incrementalLearner = new IncrementalLearner();
    this.initializeModel();
    this.isInitialized = true;
  }

  private async initializeModel(): Promise<void> {
    try {
      if (typeof self !== 'undefined' && (self as any).tf) {
        try {
          this.model = await (self as any).tf.loadLayersModel(WORKER_MODEL_STORAGE_URL);
          console.log('[Enhanced ML] Existing LSTM model loaded');
        } catch (error) {
          console.log('[Enhanced ML] No existing model found, will create new LSTM model when needed');
        }
      }
    } catch (error) {
      console.warn('[Enhanced ML] Model initialization failed:', error);
    }
  }

  private createEnhancedLSTMModel(): any {
    if (typeof self === 'undefined' || !(self as any).tf) {
      console.warn('[Enhanced ML] TensorFlow.js not available');
      return null;
    }

    const tf = (self as any).tf;
    const vocabSize = Math.max(this.vocabulary.size, 50);
    
    console.log(`[Enhanced ML] Creating LSTM model with vocab size: ${vocabSize}`);
    
    const model = tf.sequential({
      layers: [
        tf.layers.embedding({
          inputDim: vocabSize,
          outputDim: 64,
          inputLength: this.sequenceLength,
          name: 'embedding'
        }),
        tf.layers.lstm({ 
          units: 128, 
          returnSequences: true,
          dropout: 0.3,
          name: 'lstm1'
        }),
        tf.layers.lstm({ 
          units: 64,
          dropout: 0.3,
          name: 'lstm2'
        }),
        tf.layers.dense({ 
          units: 128, 
          activation: 'relu',
          name: 'dense1'
        }),
        tf.layers.dropout({ rate: 0.4 }),
        tf.layers.dense({ 
          units: vocabSize, 
          activation: 'softmax',
          name: 'output'
        })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    return model;
  }

  public async train(sequence: GlobalActionSequence): Promise<void> {
    if (sequence.length < WORKER_MIN_TRAINING_EVENTS) {
      console.log("[Enhanced ML] Sequence too short to train.");
      return;
    }

    console.log("[Enhanced ML] Starting enhanced training...");
    
    // Add experiences to incremental learner
    sequence.forEach(event => this.incrementalLearner.addExperience(event));
    
    // Build vocabulary from enhanced features
    this.buildEnhancedVocabulary(sequence);
    
    // Create model if not exists
    if (!this.model) {
      this.model = this.createEnhancedLSTMModel();
    }

    if (this.model) {
      // Prepare enhanced training data
      const trainingData = this.prepareEnhancedTrainingData(sequence);
      
      if (trainingData) {
        await this.model.fit(trainingData.xs, trainingData.ys, {
          epochs: 5,
          batchSize: 16,
          validationSplit: 0.2,
          verbose: 0
        });
        
        // Clean up tensors
        trainingData.xs.dispose();
        trainingData.ys.dispose();
        
        // Perform incremental learning
        await this.performIncrementalLearning();
        
        // Save model
        await this.saveModel();
      }
    }
    
    // Analyze patterns for skills
    await this.analyzeEnhancedPatterns(sequence);
    
    console.log("[Enhanced ML] Training completed.");
  }

  private buildEnhancedVocabulary(sequence: GlobalActionSequence): void {
    const enhancedTokens = sequence.map(event => {
      const features = this.contextExtractor.extractRichFeatures(event);
      return features.primaryToken;
    });
    
    const uniqueTokens = [...new Set(enhancedTokens)];
    
    this.vocabulary.clear();
    this.reverseVocabulary.clear();
    
    uniqueTokens.forEach((token, index) => {
      this.vocabulary.set(token, index);
      this.reverseVocabulary.set(index, token);
    });
  }

  private prepareEnhancedTrainingData(sequence: GlobalActionSequence): { xs: any, ys: any } | null {
    if (typeof self === 'undefined' || !(self as any).tf) {
      return null;
    }

    const tf = (self as any).tf;
    
    const enhancedFeatures = sequence.map(event => 
      this.contextExtractor.extractRichFeatures(event)
    );
    
    const tokenSequence = enhancedFeatures.map(features => 
      this.vocabulary.get(features.primaryToken) || 0
    );
    
    const inputSequences: number[][] = [];
    const outputTokens: number[] = [];
    
    for (let i = 0; i < tokenSequence.length - this.sequenceLength; i++) {
      inputSequences.push(tokenSequence.slice(i, i + this.sequenceLength));
      outputTokens.push(tokenSequence[i + this.sequenceLength]);
    }
    
    if (inputSequences.length === 0) {
      return null;
    }
    
    const xs = tf.tensor2d(inputSequences);
    const ys = tf.oneHot(outputTokens, this.vocabulary.size);
    
    return { xs, ys };
  }

  private async performIncrementalLearning(): Promise<void> {
    const incrementalData = this.incrementalLearner.prepareIncrementalBatch(
      this.contextExtractor, 
      this.vocabulary
    );
    
    if (incrementalData && this.model) {
      await this.model.fit(incrementalData.xs, incrementalData.ys, {
        epochs: 1,
        batchSize: 4,
        verbose: 0
      });
      
      incrementalData.xs.dispose();
      incrementalData.ys.dispose();
      
      console.log('[Enhanced ML] Incremental learning completed');
    }
  }

  private async analyzeEnhancedPatterns(sequence: GlobalActionSequence): Promise<void> {
    // Enhanced pattern analysis with rich context
    const enhancedFeatures = sequence.map(event => 
      this.contextExtractor.extractRichFeatures(event)
    );
    
    // Group by combined signatures for better pattern recognition
    const signatureGroups = new Map<string, RichContextFeatures[]>();
    
    enhancedFeatures.forEach(features => {
      const signature = features.combinedSignature;
      if (!signatureGroups.has(signature)) {
        signatureGroups.set(signature, []);
      }
      signatureGroups.get(signature)!.push(features);
    });
    
    // Convert frequent signature groups to skills
    let skillId = 0;
    for (const [signature, features] of signatureGroups.entries()) {
      if (features.length >= MIN_PATTERN_FREQUENCY) {
        const skill: ActionSkill = {
          id: `enhanced_skill_${skillId++}`,
          name: this.generateEnhancedSkillName(signature, features),
          description: this.generateEnhancedSkillDescription(signature, features),
          token_sequence: features.map((_, i) => i),
          frequency: features.length,
          confidence: this.calculateEnhancedConfidence(features)
        };
        
        this.skillsDatabase.set(skill.id, skill);
      }
    }
    
    console.log(`[Enhanced ML] Generated ${skillId} enhanced skills`);
  }

  private generateEnhancedSkillName(signature: string, features: RichContextFeatures[]): string {
    const parts = signature.split('_');
    const action = parts[0] || 'action';
    const context = parts.slice(1).join(' ') || 'general';
    
    return `${action.replace(/([A-Z])/g, ' $1').trim()} in ${context.replace(/_/g, ' ')}`;
  }

  private generateEnhancedSkillDescription(signature: string, features: RichContextFeatures[]): string {
    const contextSample = features[0];
    const timeContext = contextSample.timeContext.timePeriod;
    const spatialContext = contextSample.spatialContext.screenRegion;
    
    return `Perform ${signature.split('_')[0]} action during ${timeContext} in ${spatialContext} area`;
  }

  private calculateEnhancedConfidence(features: RichContextFeatures[]): number {
    const intensity = features.reduce((sum, f) => sum + f.behavioralContext.actionIntensity, 0) / features.length;
    const frequency = Math.min(features.length / 10, 1.0);
    
    return Math.min(intensity * frequency, 1.0);
  }

  public async predict(recentEvents: EnrichedEvent[]): Promise<{ token: string, confidence: number } | null> {
    if (!this.model || recentEvents.length < this.sequenceLength) {
      return null;
    }

    try {
      const tf = (self as any).tf;
      
      const enhancedFeatures = recentEvents.slice(-this.sequenceLength).map(event => 
        this.contextExtractor.extractRichFeatures(event)
      );
      
      const tokenSequence = enhancedFeatures.map(features => 
        this.vocabulary.get(features.primaryToken) || 0
      );
      
      const input = tf.tensor2d([tokenSequence]);
      const prediction = this.model.predict(input);
      const probabilities = await prediction.data();
      
      let maxProb = 0;
      let maxIndex = 0;
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          maxIndex = i;
        }
      }
      
      const predictedToken = this.reverseVocabulary.get(maxIndex) || 'unknown';
      
      input.dispose();
      prediction.dispose();
      
      return {
        token: predictedToken,
        confidence: maxProb
      };
    } catch (error) {
      console.error('[Enhanced ML] Prediction error:', error);
      return null;
    }
  }

  private async saveModel(): Promise<void> {
    if (this.model) {
      try {
        await this.model.save(WORKER_MODEL_STORAGE_URL);
        console.log('[Enhanced ML] Model saved successfully');
      } catch (error) {
        console.error('[Enhanced ML] Failed to save model:', error);
      }
    }
  }

  public getSkills(): ActionSkill[] {
    return Array.from(this.skillsDatabase.values());
  }

  public getVocabularySize(): number {
    return this.vocabulary.size;
  }

  public getLearningMetrics(): LearningMetrics {
    return this.incrementalLearner.getLearningMetrics();
  }
}

// Initialize enhanced ML engine
const enhancedMLEngine = new EnhancedMLEngine();

// Performance monitoring
const performanceMonitor = {
  trainingTimes: [] as number[],
  predictionTimes: [] as number[],
  
  recordTrainingTime(duration: number) {
    this.trainingTimes.push(duration);
    if (this.trainingTimes.length > 10) {
      this.trainingTimes.shift();
    }
  },
  
  recordPredictionTime(duration: number) {
    this.predictionTimes.push(duration);
    if (this.predictionTimes.length > 50) {
      this.predictionTimes.shift();
    }
  },
  
  getAverageTrainingTime(): number {
    return this.trainingTimes.length > 0 
      ? this.trainingTimes.reduce((a, b) => a + b, 0) / this.trainingTimes.length 
      : 0;
  },
  
  getAveragePredictionTime(): number {
    return this.predictionTimes.length > 0 
      ? this.predictionTimes.reduce((a, b) => a + b, 0) / this.predictionTimes.length 
      : 0;
  }
};

// Worker message handler
self.onmessage = (event) => {
  const { type, payload } = event.data;

  if (type === 'train') {
    const startTime = performance.now();
    console.log('[Enhanced ML Worker] Starting enhanced training...');
    
    enhancedMLEngine.train(payload.sequence)
      .then(() => {
        const trainingDuration = performance.now() - startTime;
        performanceMonitor.recordTrainingTime(trainingDuration);
        
        console.log(`[Enhanced ML Worker] Enhanced training complete in ${trainingDuration.toFixed(2)}ms`);
        self.postMessage({ 
          type: 'training_complete', 
          success: true,
          vocabSize: enhancedMLEngine.getVocabularySize(),
          skillsCount: enhancedMLEngine.getSkills().length,
          trainingDuration,
          learningMetrics: enhancedMLEngine.getLearningMetrics(),
          performanceStats: {
            averageTrainingTime: performanceMonitor.getAverageTrainingTime(),
            averagePredictionTime: performanceMonitor.getAveragePredictionTime()
          }
        });
      })
      .catch((error) => {
        console.error('[Enhanced ML Worker] Enhanced training failed:', error);
        self.postMessage({ 
          type: 'training_complete', 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
  }

  if (type === 'predict') {
    const startTime = performance.now();
    
    enhancedMLEngine.predict(payload.currentSequence)
      .then((prediction) => {
        const predictionDuration = performance.now() - startTime;
        performanceMonitor.recordPredictionTime(predictionDuration);
        
        self.postMessage({ 
          type: 'prediction_result', 
          prediction,
          predictionDuration,
          learningMetrics: enhancedMLEngine.getLearningMetrics(),
          performanceStats: {
            averageTrainingTime: performanceMonitor.getAverageTrainingTime(),
            averagePredictionTime: performanceMonitor.getAveragePredictionTime()
          }
        });
      })
      .catch((error) => {
        console.error('[Enhanced ML Worker] Prediction failed:', error);
        self.postMessage({ 
          type: 'prediction_result', 
          prediction: null, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
  }

  if (type === 'getSkills') {
    const skills = enhancedMLEngine.getSkills();
    self.postMessage({ 
      type: 'skills_result', 
      skills 
    });
  }

  if (type === 'getInfo') {
    const info = {
      vocabSize: enhancedMLEngine.getVocabularySize(),
      skillsCount: enhancedMLEngine.getSkills().length,
      learningMetrics: enhancedMLEngine.getLearningMetrics(),
      isInitialized: true,
      features: {
        richContextExtraction: true,
        incrementalLearning: true,
        enhancedLSTM: true,
        performanceMonitoring: true
      }
    };
    self.postMessage({ 
      type: 'info_result', 
      info 
    });
  }
};

// Signal that enhanced worker is ready
console.log('[Enhanced ML Worker] Enhanced ML Worker initialized with LSTM, incremental learning, and rich context features.');
self.postMessage({ type: 'worker_ready' });