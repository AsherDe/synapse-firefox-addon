/// <reference path="./types.ts" />

/**
 * Machine Learning Engine for Synapse
 * Implements event generalization and hierarchical skill abstraction
 * Licensed under the Apache License, Version 2.0
 */

// Note: For browser extensions, TensorFlow.js must be loaded via script tag
// This file assumes TensorFlow.js is available globally as 'tf'
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

const MODEL_STORAGE_URL = 'indexeddb://synapse-model';
const SKILLS_STORAGE_KEY = 'action_skills';
const VOCABULARY_STORAGE_KEY = 'ml_vocabulary';

class MLEngine {
  private model: TensorFlowModel | null = null;
  private vocabulary: Map<string, number> = new Map();
  private reverseVocabulary: Map<number, string> = new Map();
  private skillsDatabase: Map<string, ActionSkill> = new Map();
  private sequenceAnalyzer: SequenceAnalyzer;

  constructor() {
    this.sequenceAnalyzer = new SequenceAnalyzer();
    this.loadModel();
    this.loadVocabulary();
    this.loadSkills();
  }

  /**
   * 策略一：将具体事件泛化为特征化Token
   */
  private eventToToken(event: EnrichedEvent): string {
    switch (event.type) {
      case 'user_action_click':
        return this.clickEventToToken(event as UserActionClickEvent);
      case 'user_action_keydown':
        return this.keydownEventToToken(event as UserActionKeydownEvent);
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
    const payload = event.payload;
    const url = new URL(payload.url);
    
    // 提取元素特征
    const element = this.extractElementFeatures(payload.selector, payload.url);
    
    // 构建泛化token
    return `click_${element.role}_${element.semantic}`;
  }

  private keydownEventToToken(event: UserActionKeydownEvent): string {
    const payload = event.payload;
    
    // 识别常见快捷键组合
    if (payload.code === 'KeyC' && this.isCtrlPressed(payload)) {
      return 'copy_action';
    }
    if (payload.code === 'KeyV' && this.isCtrlPressed(payload)) {
      return 'paste_action';
    }
    if (payload.code === 'KeyT' && this.isCtrlPressed(payload)) {
      return 'new_tab_action';
    }
    if (payload.code === 'KeyW' && this.isCtrlPressed(payload)) {
      return 'close_tab_action';
    }
    if (payload.code === 'Tab') {
      return 'tab_navigation';
    }
    if (payload.code === 'Enter') {
      return 'submit_action';
    }
    
    // 默认按字符类型分类
    if (payload.key.length === 1 && payload.key.match(/[a-zA-Z]/)) {
      return 'text_input';
    }
    if (payload.key.match(/[0-9]/)) {
      return 'number_input';
    }
    
    return 'key_other';
  }

  private isCtrlPressed(payload: UserActionKeydownPayload): boolean {
    return payload.key.includes('Control') || payload.code.includes('Ctrl');
  }

  private extractElementFeatures(selector: string, url: string): { role: string, semantic: string } {
    const urlObj = new URL(url);
    
    // 基于选择器推断元素角色
    let role = 'unknown';
    let semantic = 'generic';
    
    if (selector.includes('button') || selector.includes('btn')) {
      role = 'button';
      if (selector.includes('submit') || selector.includes('login') || selector.includes('signin')) {
        semantic = 'submit';
      } else if (selector.includes('cancel') || selector.includes('close')) {
        semantic = 'cancel';
      } else if (selector.includes('nav') || selector.includes('menu')) {
        semantic = 'navigation';
      } else {
        semantic = 'action';
      }
    } else if (selector.includes('input') || selector.includes('textarea')) {
      role = 'input';
      if (selector.includes('password') || selector.includes('pwd')) {
        semantic = 'password';
      } else if (selector.includes('email') || selector.includes('username')) {
        semantic = 'credential';
      } else if (selector.includes('search')) {
        semantic = 'search';
      } else {
        semantic = 'text';
      }
    } else if (selector.includes('a') || selector.includes('link')) {
      role = 'link';
      if (urlObj.hostname !== new URL(url).hostname) {
        semantic = 'external';
      } else {
        semantic = 'internal';
      }
    } else if (selector.includes('form')) {
      role = 'form';
      semantic = 'container';
    }
    
    return { role, semantic };
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

  /**
   * 训练模型
   */
  public async train(sequence: GlobalActionSequence): Promise<void> {
    if (sequence.length < 20) {
      console.log("[MLEngine] Sequence too short to train.");
      return;
    }

    console.log("[MLEngine] Starting training...");
    
    // 构建词汇表
    this.buildVocabulary(sequence);
    
    // 分析序列中的技能模式
    const skills = await this.sequenceAnalyzer.analyzeSkills(sequence, this);
    this.updateSkillsDatabase(skills);
    
    // 将序列转换为token
    const tokenSequence = sequence.map(event => this.vocabulary.get(this.eventToToken(event)) || 0);
    
    // 准备训练数据
    const { xs, ys } = this.prepareTrainingData(tokenSequence);
    
    if (!this.model) {
      this.createModel();
    }

    // 训练模型
    await this.model!.fit(xs, ys, {
      epochs: 10,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch: number, logs: any) => {
          console.log(`[MLEngine] Epoch ${epoch + 1}: loss = ${logs?.loss?.toFixed(4)}`);
        }
      }
    });

    // 保存模型和词汇表
    await this.saveModel();
    await this.saveVocabulary();
    await this.saveSkills();
    
    // 清理内存
    xs.dispose();
    ys.dispose();
    
    console.log("[MLEngine] Training completed.");
  }

  private prepareTrainingData(tokenSequence: number[]): { xs: TensorFlowTensor, ys: TensorFlowTensor } {
    const sequenceLength = 10;
    const inputSequences: number[][] = [];
    const outputTokens: number[] = [];
    
    for (let i = 0; i < tokenSequence.length - sequenceLength; i++) {
      inputSequences.push(tokenSequence.slice(i, i + sequenceLength));
      outputTokens.push(tokenSequence[i + sequenceLength]);
    }
    
    // 转换为张量
    const xs = tf.tensor2d(inputSequences) as TensorFlowTensor;
    const ys = tf.oneHot(outputTokens, this.vocabulary.size) as TensorFlowTensor;
    
    return { xs, ys };
  }

  private async loadModel(): Promise<void> {
    try {
      this.model = await tf.loadLayersModel(MODEL_STORAGE_URL);
      console.log("[MLEngine] Existing model loaded.");
    } catch (error) {
      console.log("[MLEngine] No existing model found. Will create new one when training.");
    }
  }

  private createModel(): void {
    const sequenceLength = 10;
    const vocabSize = this.vocabulary.size;
    
    this.model = tf.sequential({
      layers: [
        tf.layers.embedding({
          inputDim: vocabSize,
          outputDim: 64,
          inputLength: sequenceLength
        }),
        tf.layers.lstm({ units: 128, returnSequences: true }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.lstm({ units: 64 }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: vocabSize, activation: 'softmax' })
      ]
    });

    this.model!.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });
  }

  private async saveModel(): Promise<void> {
    if (this.model) {
      await this.model.save(MODEL_STORAGE_URL);
    }
  }

  private async saveVocabulary(): Promise<void> {
    const vocabData = Array.from(this.vocabulary.entries());
    await chrome.storage.local.set({ [VOCABULARY_STORAGE_KEY]: vocabData });
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

  private updateSkillsDatabase(skills: ActionSkill[]): void {
    skills.forEach(skill => {
      this.skillsDatabase.set(skill.id, skill);
    });
  }

  private async saveSkills(): Promise<void> {
    const skillsData = Array.from(this.skillsDatabase.entries());
    await chrome.storage.local.set({ [SKILLS_STORAGE_KEY]: skillsData });
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

  /**
   * 预测下一个行为
   */
  public async predict(recentEvents: EnrichedEvent[]): Promise<{ token: string, confidence: number } | null> {
    if (!this.model || recentEvents.length < 10) {
      return null;
    }

    try {
      const tokenSequence = recentEvents.slice(-10).map(event => 
        this.vocabulary.get(this.eventToToken(event)) || 0
      );
      
      const input = tf.tensor2d([tokenSequence]) as TensorFlowTensor;
      const prediction = this.model.predict(input) as TensorFlowTensor;
      const probabilities = await prediction.data();
      
      // 找到概率最高的token
      let maxProb = 0;
      let maxIndex = 0;
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          maxIndex = i;
        }
      }
      
      const predictedToken = this.reverseVocabulary.get(maxIndex) || 'unknown';
      
      // 清理内存
      input.dispose();
      prediction.dispose();
      
      return {
        token: predictedToken,
        confidence: maxProb
      };
    } catch (error) {
      console.error('[MLEngine] Prediction error:', error);
      return null;
    }
  }

  public getSkills(): ActionSkill[] {
    return Array.from(this.skillsDatabase.values());
  }

  public getVocabularySize(): number {
    return this.vocabulary.size;
  }
}

/**
 * 策略二：序列分析器，用于发现高频行为模式和技能
 */
class SequenceAnalyzer {
  private readonly MIN_SKILL_FREQUENCY = 3;
  private readonly MIN_SKILL_LENGTH = 2;
  private readonly MAX_SKILL_LENGTH = 8;

  public async analyzeSkills(sequence: GlobalActionSequence, mlEngine: MLEngine): Promise<ActionSkill[]> {
    console.log("[SequenceAnalyzer] Analyzing skills in sequence...");
    
    // 将事件序列转换为token序列
    const tokenSequence = sequence.map(event => 
      (mlEngine as any).eventToToken(event) // 访问私有方法
    );

    // 使用N-gram分析寻找重复模式
    const patterns = this.findFrequentPatterns(tokenSequence);
    
    // 将模式转换为技能
    const skills: ActionSkill[] = [];
    let skillIdCounter = 0;

    for (const [pattern, frequency] of patterns.entries()) {
      if (frequency >= this.MIN_SKILL_FREQUENCY) {
        const tokens = pattern.split(',');
        const skill: ActionSkill = {
          id: `skill_${skillIdCounter++}`,
          name: this.generateSkillName(tokens),
          description: this.generateSkillDescription(tokens),
          token_sequence: tokens.map(token => (mlEngine as any).vocabulary.get(token) || 0),
          frequency,
          confidence: Math.min(frequency / 10, 1.0)
        };
        skills.push(skill);
      }
    }

    console.log(`[SequenceAnalyzer] Found ${skills.length} skills`);
    return skills;
  }

  private findFrequentPatterns(tokenSequence: string[]): Map<string, number> {
    const patterns = new Map<string, number>();

    // 分析不同长度的N-gram
    for (let n = this.MIN_SKILL_LENGTH; n <= this.MAX_SKILL_LENGTH; n++) {
      for (let i = 0; i <= tokenSequence.length - n; i++) {
        const pattern = tokenSequence.slice(i, i + n).join(',');
        patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      }
    }

    return patterns;
  }

  private generateSkillName(tokens: string[]): string {
    const actionDescriptions: { [key: string]: string } = {
      'copy_action': 'Copy',
      'paste_action': 'Paste',
      'tab_switch': 'Switch Tab',
      'new_tab_action': 'New Tab',
      'close_tab_action': 'Close Tab',
      'click_button_submit': 'Submit Form',
      'click_link_external': 'External Link',
      'text_input': 'Text Input'
    };

    const descriptions = tokens.map(token => actionDescriptions[token] || token.replace(/_/g, ' '));
    
    if (descriptions.length === 2) {
      return `${descriptions[0]} → ${descriptions[1]}`;
    } else if (descriptions.length > 2) {
      return `${descriptions[0]} → ... → ${descriptions[descriptions.length - 1]}`;
    } else {
      return descriptions[0] || 'Unknown Skill';
    }
  }

  private generateSkillDescription(tokens: string[]): string {
    const commonPatterns: { [key: string]: string } = {
      'copy_action,tab_switch,paste_action': 'Copy content and paste in another tab',
      'click_button_submit,tab_switch': 'Submit form then switch tab',
      'text_input,submit_action': 'Enter text and submit',
      'new_tab_action,page_navigate': 'Open new tab and navigate'
    };

    const pattern = tokens.join(',');
    return commonPatterns[pattern] || `Perform sequence: ${tokens.join(' → ')}`;
  }
}