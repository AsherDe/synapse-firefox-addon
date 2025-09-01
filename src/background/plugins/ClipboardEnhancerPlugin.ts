/**
 * Clipboard Enhancer Plugin - Context-aware clipboard with intelligent paste suggestions
 * "Simple data structures and algorithms that work on them" - Linus
 */

import { BasePlugin, PluginSuggestion, PluginContext } from './base';
import { AdaptedEvent } from './EventAdapter';

// Plugin-specific types - self-contained module
interface ClipboardContext {
  id: string;
  copiedText: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceSelector?: string;
  timestamp: number;
  hasFormatting: boolean;
  suggestedActions: ClipboardAction[];
  usageCount: number;
  lastUsed: number;
}

interface ClipboardAction {
  type: 'paste' | 'transform' | 'translate' | 'format' | 'search';
  description: string;
  confidence: number;
  transformedText?: string;
  targetContext?: string;
}

interface InputFieldContext {
  selector: string;
  fieldType: string;
  expectedFormat?: string;
  currentValue?: string;
  placeholder?: string;
}

export class ClipboardEnhancerPlugin extends BasePlugin {
  readonly id = 'clipboard-enhancer';
  readonly name = 'Clipboard Enhancer';
  readonly description = 'Context-aware clipboard with intelligent paste suggestions and transformations';
  
  private clipboardHistory: Map<string, ClipboardContext> = new Map();
  private currentContext: ClipboardContext | null = null;
  private focusedInputContext: InputFieldContext | null = null;
  private readonly MAX_HISTORY_SIZE = 50;
  private readonly CONTEXT_EXPIRY = 5 * 60 * 1000; // 5 minutes

  async initialize(context: PluginContext): Promise<void> {
    await super.initialize(context);
    await this.loadClipboardHistory();
    this.setupClipboardStateManagement();
    console.log(`[${this.name}] Initialized with ${this.clipboardHistory.size} clipboard entries`);
  }

  canHandle(event: AdaptedEvent): boolean {
    // Handle clipboard events and input focus events
    return event.type === 'clipboard' || 
           event.type === 'focus_change' || 
           event.type === 'text_input' ||
           (event.type === 'click' && this.isInputRelated(event));
  }

  async processEvent(event: AdaptedEvent): Promise<PluginSuggestion[]> {
    const suggestions: PluginSuggestion[] = [];

    try {
      if (event.type === 'clipboard') {
        await this.handleClipboardEvent(event);
      } else if (event.type === 'focus_change') {
        this.handleFocusChange(event);
      } else if (this.isInputFocusEvent(event)) {
        const contextSuggestions = await this.generateContextualSuggestions(event);
        suggestions.push(...contextSuggestions);
      }

      // Clean up expired contexts
      this.cleanupExpiredContexts();

    } catch (error) {
      console.error(`[${this.name}] Error processing event:`, error);
    }

    return suggestions;
  }

  private async handleClipboardEvent(event: AdaptedEvent): Promise<void> {
    const clipboardData = this.extractClipboardData(event);
    
    if (clipboardData && clipboardData.operation === 'copy' && clipboardData.text) {
      // Create enhanced clipboard context
      const context: ClipboardContext = {
        id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        copiedText: clipboardData.text,
        sourceUrl: event.url || '',
        sourceTitle: event.pageTitle || '',
        sourceSelector: event.target || '',
        timestamp: event.timestamp,
        hasFormatting: clipboardData.hasFormatting || false,
        suggestedActions: [],
        usageCount: 0,
        lastUsed: event.timestamp
      };

      // Generate contextual actions
      context.suggestedActions = this.generateClipboardActions(context);
      
      // Store in history
      this.addToClipboardHistory(context);
      this.currentContext = context;
      
      // Cache in state manager for immediate access
      this.context.stateManager.set('clipboardContext', context);
      
      console.log(`[${this.name}] Captured clipboard context: ${context.copiedText.substring(0, 50)}...`);
    }
  }

  private handleFocusChange(event: AdaptedEvent): void {
    if (event.target && this.isInputField(event.target)) {
      this.focusedInputContext = this.analyzeInputField(event);
      console.log(`[${this.name}] Input field focused: ${event.target}`);
    } else {
      this.focusedInputContext = null;
    }
  }

  private async generateContextualSuggestions(event: AdaptedEvent): Promise<PluginSuggestion[]> {
    const suggestions: PluginSuggestion[] = [];

    // Only suggest when there's both clipboard context and focused input
    if (!this.currentContext || !this.focusedInputContext) {
      return suggestions;
    }

    // Check if clipboard context is still fresh (within 5 minutes)
    const contextAge = Date.now() - this.currentContext.timestamp;
    if (contextAge > this.CONTEXT_EXPIRY) {
      return suggestions;
    }

    // Generate intelligent paste suggestions
    const pasteActions = this.generateIntelligentPasteActions(
      this.currentContext,
      this.focusedInputContext
    );

    for (const action of pasteActions) {
      suggestions.push(this.createSuggestion(
        'clipboard',
        action.description,
        action.confidence,
        2, // High priority for clipboard suggestions
        {
          action: 'enhanced_paste',
          clipboardId: this.currentContext.id,
          transformationType: action.type,
          transformedText: action.transformedText || this.currentContext.copiedText,
          targetSelector: this.focusedInputContext.selector,
          originalText: this.currentContext.copiedText,
          sourceContext: {
            url: this.currentContext.sourceUrl,
            title: this.currentContext.sourceTitle
          }
        }
      ));
    }

    return suggestions;
  }

  private generateClipboardActions(context: ClipboardContext): ClipboardAction[] {
    const actions: ClipboardAction[] = [];
    const text = context.copiedText;

    // Basic paste action
    actions.push({
      type: 'paste',
      description: 'Paste as-is',
      confidence: 0.9
    });

    // Email detection and formatting
    if (this.isEmail(text)) {
      actions.push({
        type: 'format',
        description: 'Format as email link',
        confidence: 0.8,
        transformedText: `<a href="mailto:${text}">${text}</a>`
      });
    }

    // URL detection and formatting
    if (this.isURL(text)) {
      actions.push({
        type: 'format',
        description: 'Format as clickable link',
        confidence: 0.8,
        transformedText: `<a href="${text}" target="_blank">${text}</a>`
      });
    }

    // Phone number detection
    if (this.isPhoneNumber(text)) {
      actions.push({
        type: 'format',
        description: 'Format as phone link',
        confidence: 0.7,
        transformedText: `<a href="tel:${text.replace(/[^\d+]/g, '')}">${text}</a>`
      });
    }

    // Text transformations
    if (text.length > 10) {
      actions.push({
        type: 'transform',
        description: 'Convert to title case',
        confidence: 0.6,
        transformedText: this.toTitleCase(text)
      });

      actions.push({
        type: 'transform',
        description: 'Convert to lowercase',
        confidence: 0.5,
        transformedText: text.toLowerCase()
      });

      actions.push({
        type: 'transform',
        description: 'Convert to UPPERCASE',
        confidence: 0.5,
        transformedText: text.toUpperCase()
      });
    }

    // Search suggestion
    if (text.length > 3 && text.length < 100) {
      actions.push({
        type: 'search',
        description: `Search for "${text.substring(0, 30)}..."`,
        confidence: 0.4
      });
    }

    return actions;
  }

  private generateIntelligentPasteActions(
    clipboardContext: ClipboardContext,
    inputContext: InputFieldContext
  ): ClipboardAction[] {
    const actions: ClipboardAction[] = [];
    const text = clipboardContext.copiedText;

    // Field type specific suggestions
    switch (inputContext.fieldType.toLowerCase()) {
      case 'email':
        if (this.isEmail(text)) {
          actions.push({
            type: 'paste',
            description: 'Paste email address',
            confidence: 0.95
          });
        } else if (text.includes('@')) {
          actions.push({
            type: 'transform',
            description: 'Extract email from text',
            confidence: 0.7,
            transformedText: this.extractEmail(text) || text
          });
        }
        break;

      case 'url':
      case 'website':
        if (this.isURL(text)) {
          actions.push({
            type: 'paste',
            description: 'Paste URL',
            confidence: 0.95
          });
        } else if (text.includes('.')) {
          actions.push({
            type: 'transform',
            description: 'Format as URL',
            confidence: 0.6,
            transformedText: text.startsWith('http') ? text : `https://${text}`
          });
        }
        break;

      case 'tel':
      case 'phone':
        if (this.isPhoneNumber(text)) {
          actions.push({
            type: 'paste',
            description: 'Paste phone number',
            confidence: 0.95
          });
        } else {
          actions.push({
            type: 'transform',
            description: 'Extract numbers only',
            confidence: 0.6,
            transformedText: text.replace(/[^\d+\-\s]/g, '')
          });
        }
        break;

      case 'search':
        actions.push({
          type: 'paste',
          description: `Search for: "${text.substring(0, 30)}..."`,
          confidence: 0.8
        });
        break;

      default:
        // General text field suggestions
        if (inputContext.placeholder) {
          const confidence = this.calculateFieldCompatibility(text, inputContext.placeholder);
          if (confidence > 0.5) {
            actions.push({
              type: 'paste',
              description: `Paste (${Math.round(confidence * 100)}% match)`,
              confidence: confidence
            });
          }
        }

        // Always provide basic paste option
        actions.push({
          type: 'paste',
          description: 'Paste text',
          confidence: 0.7
        });
    }

    return actions.sort((a, b) => b.confidence - a.confidence);
  }

  private setupClipboardStateManagement(): void {
    // Listen for clipboard context requests
    this.context.stateManager.addListener('requestClipboardContext', () => {
      return this.currentContext;
    });
  }

  private addToClipboardHistory(context: ClipboardContext): void {
    // Remove oldest entries if at capacity
    while (this.clipboardHistory.size >= this.MAX_HISTORY_SIZE) {
      const oldest = Array.from(this.clipboardHistory.keys())[0];
      this.clipboardHistory.delete(oldest);
    }

    this.clipboardHistory.set(context.id, context);
    this.saveClipboardHistory();
  }

  private cleanupExpiredContexts(): void {
    const now = Date.now();
    for (const [id, context] of this.clipboardHistory) {
      if (now - context.timestamp > this.CONTEXT_EXPIRY * 2) { // Double expiry for history
        this.clipboardHistory.delete(id);
      }
    }
  }

  private extractClipboardData(event: AdaptedEvent): any {
    if (event.payload?.features) {
      return {
        operation: event.payload.features.operation,
        text: event.payload.features.copied_text || '',
        textLength: event.payload.features.text_length || 0,
        hasFormatting: event.payload.features.has_formatting || false
      };
    }
    return null;
  }

  private isInputRelated(event: AdaptedEvent): boolean {
    const target = event.target || '';
    return target.includes('input') || 
           target.includes('textarea') || 
           target.includes('[contenteditable]');
  }

  private isInputFocusEvent(event: AdaptedEvent): boolean {
    return event.type === 'click' && this.isInputField(event.target || '');
  }

  private isInputField(selector: string): boolean {
    return selector.includes('input') || 
           selector.includes('textarea') || 
           selector.includes('[contenteditable]');
  }

  private analyzeInputField(event: AdaptedEvent): InputFieldContext {
    const features = event.payload?.features || {};
    return {
      selector: event.target || '',
      fieldType: features.input_type || features.element_type || 'text',
      expectedFormat: features.pattern || features.format,
      currentValue: features.value || '',
      placeholder: features.placeholder || ''
    };
  }

  // Utility methods for text analysis
  private isEmail(text: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(text.trim());
  }

  private isURL(text: string): boolean {
    try {
      new URL(text.trim());
      return true;
    } catch {
      return /^(https?:\/\/|www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i.test(text.trim());
    }
  }

  private isPhoneNumber(text: string): boolean {
    const phoneRegex = /^[\+]?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(text.trim());
  }

  private extractEmail(text: string): string | null {
    const match = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    return match ? match[0] : null;
  }

  private toTitleCase(text: string): string {
    return text.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  private calculateFieldCompatibility(text: string, placeholder: string): number {
    const placeholderLower = placeholder.toLowerCase();
    const textLower = text.toLowerCase();
    
    // Simple heuristic based on placeholder keywords
    if (placeholderLower.includes('email') && this.isEmail(text)) return 0.9;
    if (placeholderLower.includes('phone') && this.isPhoneNumber(text)) return 0.9;
    if (placeholderLower.includes('url') && this.isURL(text)) return 0.9;
    if (placeholderLower.includes('name') && /^[a-zA-Z\s]+$/.test(text)) return 0.8;
    
    return 0.6; // Default compatibility
  }

  private async loadClipboardHistory(): Promise<void> {
    try {
      const stored = await this.context.dataStorage.get('clipboardHistory');
      if (stored) {
        const history = JSON.parse(stored);
        for (const context of history) {
          this.clipboardHistory.set(context.id, context);
        }
      }
    } catch (error) {
      console.warn(`[${this.name}] Failed to load clipboard history:`, error);
    }
  }

  private async saveClipboardHistory(): Promise<void> {
    try {
      const history = Array.from(this.clipboardHistory.values());
      await this.context.dataStorage.set('clipboardHistory', JSON.stringify(history));
    } catch (error) {
      console.warn(`[${this.name}] Failed to save clipboard history:`, error);
    }
  }

  async cleanup(): Promise<void> {
    await this.saveClipboardHistory();
    this.clipboardHistory.clear();
    this.currentContext = null;
    this.focusedInputContext = null;
    await super.cleanup();
  }
}