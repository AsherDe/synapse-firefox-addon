import { SynapseEvent } from '../shared/types';

declare var browser: any;
import { 
  AssistantState, 
  OperationSuggestion, 
  AutofillSuggestion, 
  SubtleHint 
} from './types';
import { MessagingService } from './MessagingService';
import { StyleInjector } from './StyleInjector';
import { ExecutionEngine } from './ExecutionEngine';
import { FeedbackCollector } from './FeedbackCollector';
import { UnifiedHighlightSystem, HighlightTarget } from './UnifiedHighlightSystem';

/**
 * SmartAssistant - Main controller for smart assistant functionality
 */
export class SmartAssistant {
  private state: AssistantState;
  private messagingService: MessagingService;
  private styleInjector: StyleInjector;
  private executionEngine: ExecutionEngine;
  private feedbackCollector: FeedbackCollector;
  private highlightSystem: UnifiedHighlightSystem;
  
  // UI elements
  private assistantElement: HTMLElement | null = null;
  private clipboardSuggestionElement: HTMLElement | null = null;
  private currentClipboardContext: any = null;
  private focusedInput: HTMLElement | null = null;

  constructor() {
    this.state = {
      isVisible: false,
      isEnabled: true,
      currentSuggestion: null,
      executionState: 'idle',
      executedActions: [],
      userFeedback: null,
      uiMode: 'high_confidence',
      pendingAutofill: null,
      subtleHints: [],
      lastRecommendationTime: 0
    };
    
    this.messagingService = new MessagingService();
    this.styleInjector = new StyleInjector();
    this.executionEngine = new ExecutionEngine(this.messagingService);
    this.feedbackCollector = new FeedbackCollector(this.messagingService);
    this.highlightSystem = new UnifiedHighlightSystem();
    
    this.initialize();
  }

  private initialize(): void {
    this.styleInjector.injectStyles();
    this.createAssistantUI();
    this.loadSettings();
    this.setupMessageHandlers();
    this.startPatternMonitoring();
  }

  private setupMessageHandlers(): void {
    this.messagingService.onMessage('patternDetected', (message) => {
      if (this.canShowRecommendation()) {
        this.onPatternDetected(message.data);
        this.recordRecommendationShown();
      }
    });
    
    this.messagingService.onMessage('learnedSkills', (message) => {
      this.updateLearnedPatterns(message.data);
    });
    
    this.messagingService.onMessage('intelligentFocusSuggestion', (message) => {
      if (this.state.isEnabled && message.data?.suggestions?.length > 0) {
        this.showIntelligentFocus(message.data.suggestions);
      }
    });
    
    // Unified prediction update handler - single entry point for all UI updates
    this.messagingService.onMessage('PREDICTION_UPDATE', (message) => {
      if (!this.state.isEnabled) return;
      
      this.handlePredictionUpdate(message.data);
    });

    // Clipboard enhancement handler
    this.messagingService.onMessage('clipboardContextAvailable', (message) => {
      if (this.state.isEnabled && message.data) {
        this.handleClipboardContext(message.data);
      }
    });

    // Input focus handler for clipboard suggestions
    document.addEventListener('focusin', (event) => {
      if (this.isInputElement(event.target)) {
        this.handleInputFocus(event.target as HTMLElement);
      }
    });

    document.addEventListener('focusout', () => {
      this.hideClipboardSuggestions();
    });
  }

  private async loadSettings(): Promise<void> {
    const settings = await this.messagingService.loadSettings(['assistantEnabled']);
    if (settings.assistantEnabled !== undefined) {
      this.state.isEnabled = settings.assistantEnabled;
    }
  }

  private async saveSettings(): Promise<void> {
    await this.messagingService.saveSettings({ 
      assistantEnabled: this.state.isEnabled 
    });
  }

  public toggleGuidance(): void {
    this.state.isEnabled = !this.state.isEnabled;
    this.saveSettings();
    
    if (!this.state.isEnabled) {
      this.hideAssistant();
      this.highlightSystem.clearHighlights();
    }
    
    this.messagingService.sendToContentScript({
      type: 'guidanceToggled',
      data: { enabled: this.state.isEnabled }
    });
  }

  private canShowRecommendation(): boolean {
    const COOLDOWN_MS = 30000;
    const now = Date.now();
    return (now - this.state.lastRecommendationTime) >= COOLDOWN_MS;
  }

  private recordRecommendationShown(): void {
    this.state.lastRecommendationTime = Date.now();
  }

  private onPatternDetected(patternData: any): void {
    if (!this.state.isEnabled) return;
    
    const suggestion: OperationSuggestion = {
      id: `suggestion_${Date.now()}`,
      title: patternData.title || 'Smart Operation Suggestion',
      description: patternData.description || 'Based on your usage patterns',
      confidence: patternData.confidence || 0.8,
      actions: patternData.actions || [],
      learnedFrom: patternData.source || 'Pattern Analysis',
      frequency: patternData.frequency || 1
    };
    
    this.determineUIMode(suggestion);
    this.showSuggestion(suggestion);
  }

  private determineUIMode(suggestion: OperationSuggestion): void {
    if (suggestion.confidence >= 0.7) {
      this.state.uiMode = 'high_confidence';
    } else if (suggestion.confidence >= 0.5) {
      this.state.uiMode = 'medium_confidence';  
    } else if (this.isAutofillSuggestion(suggestion)) {
      this.state.uiMode = 'autofill';
    } else {
      this.state.uiMode = 'subtle_hint';
    }
  }

  private isAutofillSuggestion(suggestion: OperationSuggestion): boolean {
    return suggestion.actions.some(action => 
      action.type === 'text_input' && action.isPrivacySafe
    );
  }

  private createAssistantUI(): void {
    this.assistantElement = document.createElement('div');
    this.assistantElement.id = 'synapse-smart-assistant';
    this.assistantElement.className = 'synapse-assistant';
    this.assistantElement.style.display = 'none';
    
    if (document.body) {
      document.body.appendChild(this.assistantElement);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body && this.assistantElement) {
          document.body.appendChild(this.assistantElement);
        }
      });
    }
  }

  private showSuggestion(suggestion: OperationSuggestion): void {
    this.state.currentSuggestion = suggestion;
    this.state.executionState = 'idle';
    
    switch (this.state.uiMode) {
      case 'high_confidence':
      case 'medium_confidence':
        this.renderSuggestion();
        this.showAssistant();
        break;
      case 'autofill':
        this.showAutofillUI(suggestion);
        break;
      case 'subtle_hint':
        this.showSubtleHints(suggestion);
        break;
    }
  }

  private renderSuggestion(): void {
    // Simplified rendering for main controller
    if (!this.assistantElement || !this.state.currentSuggestion) return;
    
    this.assistantElement.innerHTML = `
      <div class="assistant-header">
        <h3 class="assistant-title">Smart Assistant</h3>
        <button class="close-btn" data-action="close">×</button>
      </div>
      <div class="assistant-content">
        <div class="suggestion-card">
          <div class="suggestion-title">${this.state.currentSuggestion.title}</div>
          <div class="suggestion-description">${this.state.currentSuggestion.description}</div>
          <div class="action-buttons">
            <button class="btn-primary" data-action="execute">Execute</button>
            <button class="btn-secondary" data-action="reject">Not Now</button>
          </div>
        </div>
      </div>
    `;
    
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    if (!this.assistantElement) return;

    this.assistantElement.addEventListener('click', async (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const action = target.getAttribute('data-action');
      
      if (!action) return;
      
      event.preventDefault();
      event.stopPropagation();
      
      switch (action) {
        case 'close':
          this.hideAssistant();
          break;
        case 'execute':
          await this.executeActions();
          break;
        case 'reject':
          await this.rejectSuggestion();
          break;
      }
    });
  }

  private async executeActions(): Promise<void> {
    if (!this.state.currentSuggestion) return;
    
    this.state.executionState = 'executing';
    
    try {
      const executedActions = await this.executionEngine.executeActions(this.state.currentSuggestion);
      this.state.executedActions = executedActions;
      this.state.executionState = 'completed';
    } catch (error) {
      console.error('[SmartAssistant] Execution failed:', error);
      this.state.executionState = 'failed';
    }
  }

  private async rejectSuggestion(): Promise<void> {
    if (this.state.currentSuggestion) {
      await this.feedbackCollector.collectRejectionFeedback(this.state.currentSuggestion);
    }
    this.hideAssistant();
  }

  private showAssistant(): void {
    if (this.assistantElement) {
      this.assistantElement.style.display = 'block';
      setTimeout(() => {
        this.assistantElement?.classList.add('visible');
      }, 10);
    }
    this.state.isVisible = true;
  }

  public hideAssistant(): void {
    if (this.assistantElement) {
      this.assistantElement.classList.remove('visible');
      setTimeout(() => {
        if (this.assistantElement) {
          this.assistantElement.style.display = 'none';
        }
      }, 300);
    }
    this.state.isVisible = false;
  }

  private startPatternMonitoring(): void {
    if (!this.state.isEnabled) return;
    
    document.addEventListener('click', (event) => {
      this.onUserAction('click', event);
    });
    
    document.addEventListener('keydown', (event) => {
      this.onUserAction('keydown', event);
    });
  }

  private onUserAction(type: string, event: Event): void {
    if (!this.state.isEnabled) return;
    
    // Send to background for pattern analysis
    this.messagingService.sendToContentScript({
      timestamp: Date.now(),
      type: type === 'click' ? 'ui.click' : 'ui.keydown',
      context: {
        tabId: null,
        windowId: null, 
        url: window.location.href,
        title: document.title
      },
      payload: {
        targetSelector: (event.target as Element)?.tagName.toLowerCase() || 'unknown'
      }
    });
  }

  private updateLearnedPatterns(skills: any[]): void {
    console.log('[SmartAssistant] Updated learned patterns:', skills);
  }

  private showAutofillUI(suggestion: OperationSuggestion): void {
    const autofillActions = suggestion.actions.filter(action => 
      action.type === 'text_input' && action.isPrivacySafe
    );
    
    if (autofillActions.length > 0) {
      this.state.pendingAutofill = {
        id: suggestion.id,
        value: autofillActions[0].value || '',
        targets: autofillActions.map(action => action.target || ''),
        description: `Auto-fill: ${autofillActions[0].value}`,
        confidence: suggestion.confidence,
        isPrivacySafe: true
      };
      this.showAutofillPopup();
    }
  }

  private showAutofillPopup(): void {
    if (!this.state.pendingAutofill) return;
    
    const autofill = this.state.pendingAutofill;
    const firstTarget = document.querySelector(autofill.targets[0]) as HTMLElement;
    
    if (firstTarget) {
      const popup = document.createElement('div');
      popup.className = 'autofill-popup';
      popup.id = 'synapse-autofill-popup';
      
      const rect = firstTarget.getBoundingClientRect();
      popup.style.position = 'fixed';
      popup.style.top = `${rect.bottom + 5}px`;
      popup.style.left = `${rect.left}px`;
      
      popup.innerHTML = `
        <div><strong>Auto-fill suggestion:</strong></div>
        <div style="margin: 4px 0; font-weight: 500;">${autofill.value}</div>
        <div class="autofill-buttons">
          <button class="autofill-btn" data-action="execute-autofill">Fill All</button>
          <button class="autofill-btn" data-action="dismiss-autofill">Dismiss</button>
        </div>
      `;
      
      popup.addEventListener('click', async (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const action = target.getAttribute('data-action');
        
        if (action === 'execute-autofill') {
          await this.executeAutofill();
        } else if (action === 'dismiss-autofill') {
          this.dismissAutofill();
        }
      });
      
      if (document.body) {
        document.body.appendChild(popup);
      }
      
      setTimeout(() => this.dismissAutofill(), 10000);
    }
  }

  private async executeAutofill(): Promise<void> {
    if (!this.state.pendingAutofill) return;
    
    await this.executionEngine.executeAutofill(
      this.state.pendingAutofill.targets,
      this.state.pendingAutofill.value
    );
    
    this.dismissAutofill();
  }

  private dismissAutofill(): void {
    const popup = document.getElementById('synapse-autofill-popup');
    if (popup) {
      popup.remove();
    }
    this.state.pendingAutofill = null;
  }

  private showSubtleHints(suggestion: OperationSuggestion): void {
    this.createSubtleHints(suggestion);
    this.renderSubtleHints();
  }

  private createSubtleHints(suggestion: OperationSuggestion): void {
    this.state.subtleHints = [];
    
    suggestion.actions.forEach((action, index) => {
      if (action.target) {
        const hint: SubtleHint = {
          id: `hint_${suggestion.id}_${index}`,
          target: action.target,
          type: suggestion.confidence > 0.8 ? 'glow' : 'icon',
          confidence: suggestion.confidence,
          description: suggestion.description
        };
        this.state.subtleHints.push(hint);
      }
    });
  }

  private renderSubtleHints(): void {
    this.clearSubtleHints();
    
    this.state.subtleHints.forEach(hint => {
      const targetElement = document.querySelector(hint.target) as HTMLElement;
      if (targetElement) {
        const hintElement = document.createElement('div');
        hintElement.className = `subtle-hint ${hint.type}`;
        hintElement.id = `synapse-hint-${hint.id}`;
        hintElement.title = hint.description;
        
        const rect = targetElement.getBoundingClientRect();
        hintElement.style.position = 'fixed';
        hintElement.style.top = `${rect.top}px`;
        hintElement.style.left = `${rect.left}px`;
        hintElement.style.width = `${rect.width}px`;
        hintElement.style.height = `${rect.height}px`;
        
        hintElement.addEventListener('click', async () => {
          await this.executeHintAction(hint);
        });
        
        if (document.body) {
          document.body.appendChild(hintElement);
        }
      }
    });
  }

  private clearSubtleHints(): void {
    const existingHints = document.querySelectorAll('.subtle-hint');
    existingHints.forEach(hint => hint.remove());
  }

  private async executeHintAction(hint: SubtleHint): Promise<void> {
    const targetElement = document.querySelector(hint.target) as HTMLElement;
    if (targetElement) {
      targetElement.click();
      this.clearSubtleHints();
      
      await this.feedbackCollector.recordHintInteraction(hint.id, true);
    }
  }

  /**
   * Show intelligent focus suggestions using unified highlight system
   */
  private showIntelligentFocus(suggestions: OperationSuggestion[]): void {
    const targets: HighlightTarget[] = suggestions.slice(0, 9).map((suggestion, index) => {
      const action = suggestion.actions[0];
      return {
        selector: action?.target || '',
        type: 'intelligent_focus' as const,
        keyNumber: index + 1,
        confidence: suggestion.confidence,
        action: action,
        suggestion: suggestion
      };
    }).filter(target => target.selector);
    
    if (targets.length > 0) {
      this.highlightSystem.showIntelligentFocus(targets);
      this.logMessage('info', `Intelligent focus: ${targets.length} suggestions`);
    }
  }
  
  /**
   * Send log message to FloatingControlCenter
   */
  private logMessage(level: 'info' | 'warning' | 'error' | 'success', message: string): void {
    if (typeof browser !== 'undefined' && browser.runtime) {
      browser.runtime.sendMessage({
        type: 'LOG_ENTRY',
        data: { level, message }
      });
    }
  }

  /**
   * Unified prediction update handler - intelligently chooses between task guidance and intelligent focus
   */
  private handlePredictionUpdate(data: any): void {
    // Clear any existing highlights first
    this.highlightSystem.clearHighlights();
    
    // Priority 1: Task guidance (if present and valid)
    if (data.taskGuidance && data.taskGuidance.nextStep?.selector) {
      this.showTaskGuidance(data.taskGuidance);
      this.logMessage('info', 'Showing task guidance UI');
      return;
    }
    
    // Priority 2: Intelligent focus suggestions (if no task guidance)
    if (data.suggestions && data.suggestions.length > 0) {
      this.showIntelligentFocus(data.suggestions);
      this.logMessage('info', `Showing ${data.suggestions.length} intelligent focus suggestions`);
      return;
    }
    
    // No valid prediction data
    this.logMessage('warning', 'No valid prediction data received');
  }

  /**
   * Show task path guidance using unified highlight system
   */
  private showTaskGuidance(guidanceData: any): void {
    const { taskId, currentStep, totalSteps, nextStep } = guidanceData;
    
    if (!nextStep?.selector) {
      this.logMessage('warning', 'Task guidance missing target selector');
      return;
    }
    
    const target: HighlightTarget = {
      selector: nextStep.selector,
      type: 'task_guidance',
      action: {
        type: nextStep.action || 'click',
        value: nextStep.value
      },
      taskData: {
        taskId,
        currentStep,
        totalSteps,
        nextStep
      }
    };
    
    this.highlightSystem.showTaskGuidance(target);
    this.logMessage('success', `Task guidance: Step ${currentStep + 2}/${totalSteps}`);
  }
  

  public getState(): AssistantState {
    return { ...this.state };
  }

  public destroy(): void {
    this.highlightSystem.destroy();
    this.clearSubtleHints();
    this.hideAssistant();
    this.hideClipboardSuggestions();
    
    if (this.assistantElement && this.assistantElement.parentNode) {
      this.assistantElement.parentNode.removeChild(this.assistantElement);
    }
    
    if (this.clipboardSuggestionElement && this.clipboardSuggestionElement.parentNode) {
      this.clipboardSuggestionElement.parentNode.removeChild(this.clipboardSuggestionElement);
    }
  }

  // Clipboard enhancement methods
  
  /**
   * Handle clipboard context from plugin system
   */
  private handleClipboardContext(contextData: any): void {
    this.currentClipboardContext = contextData;
    console.log('[SmartAssistant] Clipboard context updated:', contextData);
  }

  /**
   * Handle input field focus for clipboard suggestions
   */
  private async handleInputFocus(inputElement: HTMLElement): Promise<void> {
    this.focusedInput = inputElement;
    
    // Check if we have clipboard context available
    if (this.currentClipboardContext) {
      await this.showClipboardSuggestions(inputElement);
    } else {
      // Request clipboard context from background
      try {
        const response = await this.messagingService.sendToContentScript({
          type: 'requestClipboardContext'
        });
        
        if (response?.data?.clipboardContext) {
          this.currentClipboardContext = response.data.clipboardContext;
          await this.showClipboardSuggestions(inputElement);
        }
      } catch (error) {
        console.debug('[SmartAssistant] No clipboard context available');
      }
    }
  }

  /**
   * Show clipboard suggestions near focused input
   */
  private async showClipboardSuggestions(inputElement: HTMLElement): Promise<void> {
    if (!this.currentClipboardContext || !this.isValidClipboardContext()) {
      return;
    }

    const suggestions = this.generateClipboardSuggestions(inputElement);
    if (suggestions.length === 0) {
      return;
    }

    this.hideClipboardSuggestions();
    this.clipboardSuggestionElement = this.createClipboardSuggestionUI(inputElement, suggestions);
    document.body.appendChild(this.clipboardSuggestionElement);
  }

  /**
   * Generate contextual clipboard suggestions based on input field
   */
  private generateClipboardSuggestions(inputElement: HTMLElement): Array<{
    text: string;
    description: string;
    confidence: number;
    action: string;
  }> {
    const suggestions: Array<{
      text: string;
      description: string;
      confidence: number;
      action: string;
    }> = [];

    const clipboardText = this.currentClipboardContext.copiedText || '';
    if (!clipboardText || clipboardText.length === 0) {
      return suggestions;
    }

    const inputType = this.getInputType(inputElement);
    const placeholder = inputElement.getAttribute('placeholder') || '';

    // Basic paste suggestion
    suggestions.push({
      text: this.truncateText(clipboardText, 50),
      description: `Paste from ${this.currentClipboardContext.sourceTitle || 'clipboard'}`,
      confidence: 0.8,
      action: 'paste'
    });

    // Smart suggestions based on input type
    switch (inputType.toLowerCase()) {
      case 'email':
        if (this.isEmail(clipboardText)) {
          suggestions.push({
            text: clipboardText,
            description: 'Paste email address',
            confidence: 0.95,
            action: 'paste_email'
          });
        }
        break;

      case 'tel':
        if (this.isPhoneNumber(clipboardText)) {
          suggestions.push({
            text: this.formatPhoneNumber(clipboardText),
            description: 'Paste formatted phone number',
            confidence: 0.9,
            action: 'paste_phone'
          });
        }
        break;

      case 'url':
        if (this.isURL(clipboardText)) {
          suggestions.push({
            text: clipboardText,
            description: 'Paste URL',
            confidence: 0.95,
            action: 'paste_url'
          });
        }
        break;
    }

    // Text transformations
    if (clipboardText.length > 10) {
      suggestions.push({
        text: this.toTitleCase(clipboardText),
        description: 'Paste as title case',
        confidence: 0.6,
        action: 'paste_title_case'
      });
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  /**
   * Create clipboard suggestion UI element
   */
  private createClipboardSuggestionUI(inputElement: HTMLElement, suggestions: Array<{
    text: string;
    description: string;
    confidence: number;
    action: string;
  }>): HTMLElement {
    const container = document.createElement('div');
    container.className = 'synapse-clipboard-suggestions';
    
    // Position relative to input element
    const rect = inputElement.getBoundingClientRect();
    container.style.cssText = `
      position: fixed;
      top: ${rect.bottom + 5}px;
      left: ${rect.left}px;
      min-width: ${Math.max(200, rect.width)}px;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
    `;

    // Add suggestions
    suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = 'synapse-clipboard-item';
      item.style.cssText = `
        padding: 8px 12px;
        border-bottom: ${index < suggestions.length - 1 ? '1px solid #eee' : 'none'};
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 2px;
      `;

      const textDiv = document.createElement('div');
      textDiv.style.cssText = `
        font-weight: 500;
        color: #333;
        word-break: break-all;
      `;
      textDiv.textContent = suggestion.text;

      const descDiv = document.createElement('div');
      descDiv.style.cssText = `
        font-size: 11px;
        color: #666;
      `;
      descDiv.textContent = suggestion.description;

      item.appendChild(textDiv);
      item.appendChild(descDiv);

      // Hover effects
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#f5f5f5';
      });
      
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'transparent';
      });

      // Click handler
      item.addEventListener('click', () => {
        this.executeClipboardSuggestion(suggestion, inputElement);
        this.hideClipboardSuggestions();
      });

      container.appendChild(item);
    });

    return container;
  }

  /**
   * Execute clipboard suggestion
   */
  private executeClipboardSuggestion(suggestion: { text: string; action: string }, inputElement: HTMLElement): void {
    const input = inputElement as HTMLInputElement;
    
    switch (suggestion.action) {
      case 'paste':
      case 'paste_email':
      case 'paste_phone':
      case 'paste_url':
      case 'paste_title_case':
        input.value = suggestion.text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        break;
    }

    // Update clipboard context usage
    if (this.currentClipboardContext?.id) {
      this.messagingService.sendToContentScript({
        type: 'updateClipboardUsage',
        data: { contextId: this.currentClipboardContext.id }
      });
    }
  }

  /**
   * Hide clipboard suggestions
   */
  private hideClipboardSuggestions(): void {
    if (this.clipboardSuggestionElement) {
      if (this.clipboardSuggestionElement.parentNode) {
        this.clipboardSuggestionElement.parentNode.removeChild(this.clipboardSuggestionElement);
      }
      this.clipboardSuggestionElement = null;
    }
  }

  /**
   * Check if element is an input field
   */
  private isInputElement(element: EventTarget | null): element is HTMLElement {
    if (!element || !(element instanceof HTMLElement)) {
      return false;
    }
    
    const tagName = element.tagName.toLowerCase();
    return tagName === 'input' || 
           tagName === 'textarea' || 
           element.hasAttribute('contenteditable');
  }

  /**
   * Get input field type
   */
  private getInputType(element: HTMLElement): string {
    if (element instanceof HTMLInputElement) {
      return element.type || 'text';
    }
    return 'text';
  }

  /**
   * Check if clipboard context is still valid
   */
  private isValidClipboardContext(): boolean {
    if (!this.currentClipboardContext) {
      return false;
    }
    
    const CONTEXT_EXPIRY = 5 * 60 * 1000; // 5 minutes
    const age = Date.now() - (this.currentClipboardContext.timestamp || 0);
    return age < CONTEXT_EXPIRY;
  }

  // Utility methods
  private isEmail(text: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(text.trim());
  }

  private isPhoneNumber(text: string): boolean {
    const phoneRegex = /^[\+]?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(text.trim());
  }

  private isURL(text: string): boolean {
    try {
      new URL(text.trim());
      return true;
    } catch {
      return /^(https?:\/\/|www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i.test(text.trim());
    }
  }

  private formatPhoneNumber(text: string): string {
    return text.replace(/[^\d+]/g, '');
  }

  private toTitleCase(text: string): string {
    return text.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
    );
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }
}