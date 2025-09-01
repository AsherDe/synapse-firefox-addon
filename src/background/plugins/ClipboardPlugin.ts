/**
 * Context-Aware Clipboard Plugin - Bridge to future LLM integration
 * Linus: "We save content, but we also save context. The context is the real treasure."
 */

import { BasePlugin, PluginSuggestion, PluginContext } from './base';
import { AdaptedEvent } from './EventAdapter';

interface ClipboardContext {
  id: string;
  content: string;
  sourceUrl: string;
  sourceTitle: string;
  selectionContext: string;
  timestamp: number;
  elementType: string;
  elementAttributes?: Record<string, string>;
}

interface EnhancedPasteOption {
  id: string;
  label: string;
  description: string;
  action: 'paste_plain' | 'paste_formatted' | 'paste_citation' | 'paste_summary' | 'send_to_ai';
  confidence: number;
}

export class ClipboardPlugin extends BasePlugin {
  readonly id = 'context-clipboard';
  readonly name = 'Context-Aware Clipboard';
  readonly description = 'Enhanced clipboard with context awareness and smart paste options';
  
  private currentContext: ClipboardContext | null = null;
  private contextHistory: ClipboardContext[] = [];
  private readonly MAX_HISTORY = 20;
  private pendingPasteTarget: string | null = null;
  
  async initialize(context: PluginContext): Promise<void> {
    await super.initialize(context);
    await this.loadClipboardHistory();
    console.log(`[${this.name}] Initialized with ${this.contextHistory.length} clipboard entries`);
  }
  
  canHandle(event: AdaptedEvent): boolean {
    return event.type === 'copy' || 
           event.type === 'cut' || 
           event.type === 'focus' || 
           event.type === 'text_input';
  }
  
  async processEvent(event: AdaptedEvent): Promise<PluginSuggestion[]> {
    const suggestions: PluginSuggestion[] = [];
    
    if (event.type === 'copy' || event.type === 'cut') {
      await this.handleCopyEvent(event);
    }
    
    if (event.type === 'focus' && this.isTextInput(event)) {
      const pasteSuggestions = this.generatePasteSuggestions(event);
      suggestions.push(...pasteSuggestions);
    }
    
    return suggestions;
  }
  
  private async handleCopyEvent(event: AdaptedEvent): Promise<void> {
    if (!event.value || !event.url) {
      return;
    }
    
    // Create rich clipboard context
    const context: ClipboardContext = {
      id: `clipboard_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      content: String(event.value),
      sourceUrl: event.url,
      sourceTitle: event.pageTitle || 'Unknown',
      selectionContext: this.extractSelectionContext(event),
      timestamp: Date.now(),
      elementType: event.targetType || 'unknown',
      elementAttributes: event.targetAttributes
    };
    
    this.currentContext = context;
    this.addToHistory(context);
    
    console.log(`[${this.name}] Captured clipboard context from ${context.sourceTitle}`);
    
    await this.saveClipboardHistory();
  }
  
  private generatePasteSuggestions(event: AdaptedEvent): PluginSuggestion[] {
    if (!this.currentContext || !this.pendingPasteRelevant(event)) {
      return [];
    }
    
    const suggestions: PluginSuggestion[] = [];
    const context = this.currentContext;
    
    // Generate enhanced paste options
    const pasteOptions = this.generatePasteOptions(context, event);
    
    for (const option of pasteOptions) {
      suggestions.push(this.createSuggestion(
        'clipboard',
        `Enhanced Paste: ${option.label}`,
        option.confidence,
        1.2,
        {
          action: 'enhanced_paste',
          option,
          context,
          target: event.target
        }
      ));
    }
    
    return suggestions;
  }
  
  private generatePasteOptions(context: ClipboardContext, event: AdaptedEvent): EnhancedPasteOption[] {
    const options: EnhancedPasteOption[] = [];
    
    // Always offer plain paste
    options.push({
      id: 'paste_plain',
      label: 'Paste Plain Text',
      description: 'Paste content without formatting',
      action: 'paste_plain',
      confidence: 0.9
    });
    
    // Offer citation if from web source
    if (context.sourceUrl && context.sourceUrl !== 'unknown') {
      options.push({
        id: 'paste_citation',
        label: 'Paste with Citation',
        description: `"${context.content}" - ${context.sourceTitle}`,
        action: 'paste_citation',
        confidence: 0.8
      });
    }
    
    // Offer summary for long content
    if (context.content.length > 200) {
      options.push({
        id: 'paste_summary',
        label: 'Paste Summary',
        description: 'Paste a condensed version (future: AI-generated)',
        action: 'paste_summary',
        confidence: 0.6
      });
    }
    
    // Offer AI integration (future feature)
    if (this.isAiIntegrationCandidate(context, event)) {
      options.push({
        id: 'send_to_ai',
        label: 'Send to AI Assistant',
        description: 'Process this content with AI before pasting',
        action: 'send_to_ai',
        confidence: 0.7
      });
    }
    
    return options;
  }
  
  private isTextInput(event: AdaptedEvent): boolean {
    const inputTypes = ['textarea', 'input', 'contenteditable', 'text'];
    return inputTypes.includes(event.targetType || '');
  }
  
  private pendingPasteRelevant(event: AdaptedEvent): boolean {
    if (!this.currentContext) {
      return false;
    }
    
    // Check if clipboard context is recent (within 2 minutes)
    const timeDiff = Date.now() - this.currentContext.timestamp;
    return timeDiff < 2 * 60 * 1000;
  }
  
  private isAiIntegrationCandidate(context: ClipboardContext, event: AdaptedEvent): boolean {
    // Heuristics for when AI integration would be useful
    const hasComplexContent = context.content.length > 100;
    const hasCodeContext = context.elementType === 'code' || context.content.includes('function') || context.content.includes('class');
    const hasAcademicContent = context.sourceTitle.toLowerCase().includes('paper') || 
                              context.sourceTitle.toLowerCase().includes('research') ||
                              context.content.includes('doi:');
    
    return hasComplexContent && (hasCodeContext || hasAcademicContent);
  }
  
  private extractSelectionContext(event: AdaptedEvent): string {
    // Extract surrounding context from the selection
    // For now, return the content itself - can be enhanced
    const content = String(event.value || '');
    if (content.length < 50) {
      return content;
    }
    
    // Return first and last parts for context
    return `${content.substring(0, 25)}...${content.substring(content.length - 25)}`;
  }
  
  private addToHistory(context: ClipboardContext): void {
    this.contextHistory.unshift(context);
    if (this.contextHistory.length > this.MAX_HISTORY) {
      this.contextHistory.pop();
    }
  }
  
  private async loadClipboardHistory(): Promise<void> {
    try {
      const stored = await this.context.dataStorage.get('clipboardHistory');
      if (stored) {
        this.contextHistory = JSON.parse(stored);
      }
    } catch (error) {
      console.warn(`[${this.name}] Failed to load clipboard history:`, error);
    }
  }
  
  private async saveClipboardHistory(): Promise<void> {
    try {
      const toSave = this.contextHistory.slice(0, this.MAX_HISTORY);
      await this.context.dataStorage.set('clipboardHistory', JSON.stringify(toSave));
    } catch (error) {
      console.warn(`[${this.name}] Failed to save clipboard history:`, error);
    }
  }
  
  // Public API for enhanced paste execution
  async executePasteOption(optionId: string, target: string, context: ClipboardContext): Promise<string> {
    switch (optionId) {
      case 'paste_plain':
        return context.content;
        
      case 'paste_citation':
        return `"${context.content}" - ${context.sourceTitle} (${context.sourceUrl})`;
        
      case 'paste_summary':
        // For now, return truncated version - future: AI summarization
        return context.content.length > 200 
          ? context.content.substring(0, 200) + '...'
          : context.content;
          
      case 'send_to_ai':
        // Future: integrate with LLM service
        return `[AI Processing] ${context.content}`;
        
      default:
        return context.content;
    }
  }
  
  // Get clipboard history for debugging/UI
  getClipboardHistory(): ClipboardContext[] {
    return [...this.contextHistory];
  }
  
  // Clear sensitive clipboard data
  clearSensitiveData(): void {
    this.contextHistory = this.contextHistory.filter(ctx => 
      !this.containsSensitiveData(ctx.content)
    );
    this.saveClipboardHistory();
  }
  
  private containsSensitiveData(content: string): boolean {
    // Simple heuristics for sensitive data
    const patterns = [
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}-?\d{2}-?\d{4}\b/ // SSN
    ];
    
    return patterns.some(pattern => pattern.test(content));
  }
  
  async cleanup(): Promise<void> {
    await this.saveClipboardHistory();
    this.currentContext = null;
    this.contextHistory = [];
    await super.cleanup();
  }
}