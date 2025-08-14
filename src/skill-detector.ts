/// <reference path="./types.ts" />

/**
 * Skill Detection and Hierarchical Action Processing
 * Implements Strategy 2: Hierarchical Actions & Skill Abstraction
 * Licensed under the Apache License, Version 2.0
 */

class SkillDetector {
  private skillPatterns: Map<string, ActionSkill> = new Map();
  private readonly MIN_PATTERN_LENGTH = 2;
  private readonly MAX_PATTERN_LENGTH = 6;
  private readonly MIN_FREQUENCY_THRESHOLD = 3;
  
  constructor() {
    this.initializeCommonSkills();
  }

  /**
   * Initialize common interaction skills that are likely to occur
   */
  private initializeCommonSkills(): void {
    const commonSkills: Partial<ActionSkill>[] = [
      {
        name: "Copy-Paste Workflow",
        description: "Copy content from one location and paste it elsewhere",
        token_sequence: [], // Will be populated dynamically
        frequency: 0,
        confidence: 0.9
      },
      {
        name: "Tab Navigation",
        description: "Switch between browser tabs for comparison or workflow",
        token_sequence: [],
        frequency: 0,
        confidence: 0.8
      },
      {
        name: "Form Submission",
        description: "Fill out form fields and submit",
        token_sequence: [],
        frequency: 0,
        confidence: 0.85
      },
      {
        name: "Search and Select",
        description: "Search for content and select relevant results",
        token_sequence: [],
        frequency: 0,
        confidence: 0.7
      }
    ];

    commonSkills.forEach((skill, index) => {
      const fullSkill: ActionSkill = {
        id: `common_skill_${index}`,
        name: skill.name!,
        description: skill.description!,
        token_sequence: [],
        frequency: 0,
        confidence: skill.confidence!
      };
      this.skillPatterns.set(fullSkill.id, fullSkill);
    });
  }

  /**
   * Analyze a sequence of events to detect and extract skill patterns
   */
  public detectSkills(events: EnrichedEvent[], tokenizer: any): ActionSkill[] {
    console.log('[SkillDetector] Analyzing sequence for skill patterns...');
    
    if (events.length < this.MIN_PATTERN_LENGTH) {
      return [];
    }

    // Convert events to generalized tokens
    const tokenSequence = events.map(event => this.eventToGeneralizedToken(event));
    
    // Find frequent n-gram patterns
    const patterns = this.extractNGramPatterns(tokenSequence);
    
    // Convert patterns to skills
    const detectedSkills: ActionSkill[] = [];
    let skillId = Date.now();

    for (const [patternKey, frequency] of patterns.entries()) {
      if (frequency >= this.MIN_FREQUENCY_THRESHOLD) {
        const tokens = patternKey.split('|');
        const skill = this.createSkillFromPattern(
          `detected_skill_${skillId++}`,
          tokens,
          frequency,
          events
        );
        detectedSkills.push(skill);
      }
    }

    // Update existing skill patterns
    this.updateSkillDatabase(detectedSkills);
    
    console.log(`[SkillDetector] Detected ${detectedSkills.length} skill patterns`);
    return detectedSkills;
  }

  /**
   * Convert an event to a generalized token for pattern matching
   */
  private eventToGeneralizedToken(event: EnrichedEvent): string {
    switch (event.type) {
      case 'user_action_click':
        const clickEvent = event as UserActionClickEvent;
        const clickFeatures = (clickEvent.payload as any).features;
        if (clickFeatures) {
          return `click_${clickFeatures.element_role || 'unknown'}_${clickFeatures.page_type || 'general'}`;
        }
        return 'click_generic';

      case 'user_action_keydown':
        const keyEvent = event as UserActionKeydownEvent;
        const keyFeatures = (keyEvent.payload as any).features;
        const modifiers = (keyEvent.payload as any).modifier_keys || [];
        
        // Detect common keyboard shortcuts
        if (modifiers.includes('ctrl')) {
          switch (keyEvent.payload.key.toLowerCase()) {
            case 'c': return 'copy_action';
            case 'v': return 'paste_action';
            case 't': return 'new_tab';
            case 'w': return 'close_tab';
            case 'f': return 'search_action';
            default: return `ctrl_${keyEvent.payload.key.toLowerCase()}`;
          }
        }
        
        if (keyEvent.payload.key === 'Enter') {
          return keyFeatures?.page_type === 'authentication' ? 'login_submit' : 'form_submit';
        }
        
        if (keyEvent.payload.key === 'Tab') {
          return 'tab_navigation';
        }
        
        return 'key_input';

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

  /**
   * Extract n-gram patterns from token sequence
   */
  private extractNGramPatterns(tokens: string[]): Map<string, number> {
    const patterns = new Map<string, number>();
    
    for (let n = this.MIN_PATTERN_LENGTH; n <= this.MAX_PATTERN_LENGTH; n++) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const pattern = tokens.slice(i, i + n).join('|');
        patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      }
    }
    
    return patterns;
  }

  /**
   * Create a skill object from a detected pattern
   */
  private createSkillFromPattern(
    id: string, 
    tokens: string[], 
    frequency: number, 
    originalEvents: EnrichedEvent[]
  ): ActionSkill {
    const skill: ActionSkill = {
      id,
      name: this.generateSkillName(tokens),
      description: this.generateSkillDescription(tokens),
      token_sequence: tokens.map((_, index) => index), // Simplified for now
      frequency,
      confidence: this.calculateConfidence(frequency, tokens.length)
    };
    
    return skill;
  }

  /**
   * Generate a human-readable name for the skill
   */
  private generateSkillName(tokens: string[]): string {
    const actionMap: { [key: string]: string } = {
      'copy_action': 'Copy',
      'paste_action': 'Paste',
      'tab_switch': 'Switch Tab',
      'tab_create': 'New Tab',
      'tab_close': 'Close Tab',
      'form_submit': 'Submit Form',
      'login_submit': 'Login',
      'search_action': 'Search',
      'click_button_general': 'Button Click',
      'click_link_general': 'Link Click',
      'page_navigate': 'Navigate'
    };

    const readableTokens = tokens.map(token => actionMap[token] || token.replace(/_/g, ' '));
    
    if (readableTokens.length === 2) {
      return `${readableTokens[0]} → ${readableTokens[1]}`;
    } else if (readableTokens.length > 2) {
      return `${readableTokens[0]} → ... → ${readableTokens[readableTokens.length - 1]}`;
    }
    
    return readableTokens[0] || 'Unknown Skill';
  }

  /**
   * Generate a description for the skill
   */
  private generateSkillDescription(tokens: string[]): string {
    const commonPatterns: { [key: string]: string } = {
      'copy_action|tab_switch|paste_action': 'Copy content and paste in another tab',
      'copy_action|paste_action': 'Copy and paste content',
      'tab_create|page_navigate': 'Open new tab and navigate to page',
      'search_action|click_link_general': 'Search and click on results',
      'key_input|form_submit': 'Enter data and submit form',
      'click_button_authentication|login_submit': 'Click login button and submit credentials',
      'tab_switch|tab_switch': 'Navigate between multiple tabs'
    };

    const pattern = tokens.join('|');
    if (commonPatterns[pattern]) {
      return commonPatterns[pattern];
    }

    // Generate generic description
    const actionCount = tokens.length;
    if (actionCount === 2) {
      return `Perform ${tokens[0].replace(/_/g, ' ')} followed by ${tokens[1].replace(/_/g, ' ')}`;
    } else if (actionCount > 2) {
      return `Multi-step workflow involving ${actionCount} actions`;
    }
    
    return `Single action: ${tokens[0]?.replace(/_/g, ' ') || 'unknown'}`;
  }

  /**
   * Calculate confidence score for a skill based on frequency and pattern complexity
   */
  private calculateConfidence(frequency: number, patternLength: number): number {
    // Base confidence from frequency (logarithmic scale)
    const frequencyScore = Math.min(Math.log10(frequency + 1) / 2, 0.8);
    
    // Bonus for meaningful pattern length (2-4 actions are most meaningful)
    const lengthBonus = patternLength >= 2 && patternLength <= 4 ? 0.2 : 0;
    
    return Math.min(frequencyScore + lengthBonus, 1.0);
  }

  /**
   * Update the skill database with newly detected skills
   */
  private updateSkillDatabase(newSkills: ActionSkill[]): void {
    newSkills.forEach(skill => {
      const existingSkill = this.skillPatterns.get(skill.id);
      if (existingSkill) {
        // Update existing skill
        existingSkill.frequency += skill.frequency;
        existingSkill.confidence = this.calculateConfidence(
          existingSkill.frequency, 
          existingSkill.token_sequence.length
        );
      } else {
        // Add new skill
        this.skillPatterns.set(skill.id, skill);
      }
    });
  }

  /**
   * Check if a sequence of recent events matches any known skill pattern
   */
  public matchSkillPattern(recentEvents: EnrichedEvent[]): ActionSkill | null {
    if (recentEvents.length < this.MIN_PATTERN_LENGTH) {
      return null;
    }

    const recentTokens = recentEvents.map(event => this.eventToGeneralizedToken(event));
    
    // Check against known skills
    for (const skill of this.skillPatterns.values()) {
      if (this.tokensMatchSkill(recentTokens, skill)) {
        return skill;
      }
    }
    
    return null;
  }

  /**
   * Check if a token sequence matches a skill pattern
   */
  private tokensMatchSkill(tokens: string[], skill: ActionSkill): boolean {
    // For now, use simple pattern matching
    // In a more sophisticated implementation, this could use fuzzy matching
    const skillPattern = skill.name.toLowerCase().replace(/[^a-z]/g, '_');
    const tokenPattern = tokens.join('_').toLowerCase();
    
    return tokenPattern.includes(skillPattern) || skillPattern.includes(tokenPattern);
  }

  /**
   * Get all detected skills
   */
  public getSkills(): ActionSkill[] {
    return Array.from(this.skillPatterns.values());
  }

  /**
   * Get skill statistics
   */
  public getSkillStats(): { totalSkills: number, topSkills: ActionSkill[] } {
    const allSkills = this.getSkills();
    const topSkills = allSkills
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    return {
      totalSkills: allSkills.length,
      topSkills
    };
  }
}