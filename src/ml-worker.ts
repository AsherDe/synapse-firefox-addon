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

// Note: TensorFlow.js must be loaded via script tag in manifest.json
// This assumes TensorFlow.js is available globally as 'tf'
// Using different variable names to avoid conflicts with background script

// Constants for ML Worker (using different names to avoid conflicts)
const WORKER_MODEL_STORAGE_URL = 'indexeddb://synapse-worker-model';
const WORKER_SKILLS_STORAGE_KEY = 'worker_action_skills';
const WORKER_VOCABULARY_STORAGE_KEY = 'worker_ml_vocabulary';
const WORKER_MIN_TRAINING_EVENTS = 20;

// ML Engine for Web Worker
class MLEngineWorker {
  private vocabulary: Map<string, number> = new Map();
  private reverseVocabulary: Map<number, string> = new Map();
  private skillsDatabase: Map<string, ActionSkill> = new Map();
  private isInitialized: boolean = false;

  constructor() {
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
    if (sequence.length < WORKER_MIN_TRAINING_EVENTS) {
      console.log("[ML Worker] Sequence too short to train.");
      return;
    }

    console.log("[ML Worker] Building vocabulary and analyzing patterns...");
    
    // Build vocabulary from sequence
    this.buildVocabulary(sequence);
    
    // Simple pattern analysis (placeholder for full TensorFlow.js implementation)
    await this.analyzePatterns(sequence);
    
    console.log("[ML Worker] Training completed.");
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

  public getSkills(): ActionSkill[] {
    return Array.from(this.skillsDatabase.values());
  }

  public getVocabularySize(): number {
    return this.vocabulary.size;
  }
}

// Initialize ML Engine Worker
const mlEngineWorker = new MLEngineWorker();

// Worker message handler
self.onmessage = (event) => {
  const { type, payload } = event.data;

  if (type === 'train') {
    console.log('[ML Worker] Starting training...');
    mlEngineWorker.train(payload.sequence)
      .then(() => {
        console.log('[ML Worker] Training complete.');
        self.postMessage({ 
          type: 'training_complete', 
          success: true,
          vocabSize: mlEngineWorker.getVocabularySize(),
          skillsCount: mlEngineWorker.getSkills().length
        });
      })
      .catch((error) => {
        console.error('[ML Worker] Training failed:', error);
        self.postMessage({ 
          type: 'training_complete', 
          success: false, 
          error: error.message 
        });
      });
  }

  if (type === 'predict') {
    mlEngineWorker.predict(payload.currentSequence)
      .then((prediction) => {
        self.postMessage({ 
          type: 'prediction_result', 
          prediction 
        });
      })
      .catch((error) => {
        console.error('[ML Worker] Prediction failed:', error);
        self.postMessage({ 
          type: 'prediction_result', 
          prediction: null, 
          error: error.message 
        });
      });
  }

  if (type === 'getSkills') {
    const skills = mlEngineWorker.getSkills();
    self.postMessage({ 
      type: 'skills_result', 
      skills 
    });
  }

  if (type === 'getInfo') {
    const info = {
      vocabSize: mlEngineWorker.getVocabularySize(),
      skillsCount: mlEngineWorker.getSkills().length,
      isInitialized: true
    };
    self.postMessage({ 
      type: 'info_result', 
      info 
    });
  }
};

// Signal that worker is ready
console.log('[ML Worker] Worker initialized and ready.');
self.postMessage({ type: 'worker_ready' });