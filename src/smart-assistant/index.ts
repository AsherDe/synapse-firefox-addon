/**
 * Smart Assistant Component
 * 
 * Provides intelligent operation suggestions based on learned user patterns
 * Licensed under the Apache License, Version 2.0
 */

/// <reference path="../shared/types.ts" />
import { SynapseEvent, ActionSkill } from '../shared/types';

/**
 * Page context communication with content script via postMessage
 * Since smart-assistant runs in page context, it can't access browser APIs directly
 */

// Message passing helper for communicating with content script
const sendToContentScript = (message: any): Promise<any> => {
  return new Promise((resolve, reject) => {
    const messageId = Date.now() + Math.random();
    const messageWithId = { ...message, _messageId: messageId, _source: 'smart-assistant' };
    
    const responseHandler = (event: MessageEvent) => {
      if (event.source === window && event.data._responseId === messageId) {
        window.removeEventListener('message', responseHandler);
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data.response);
        }
      }
    };
    
    window.addEventListener('message', responseHandler);
    window.postMessage(messageWithId, '*');
    
    // Timeout after 5 seconds
    setTimeout(() => {
      window.removeEventListener('message', responseHandler);
      reject(new Error('Message timeout'));
    }, 5000);
  });
};

interface OperationSuggestion {
  id: string;
  title: string;
  description: string;
  confidence: number;
  actions: SuggestedAction[];
  learnedFrom: string; // Learning source description
  frequency: number;   // Historical frequency
}

interface SuggestedAction {
  type: 'click' | 'keydown' | 'text_input' | 'scroll';
  target?: string;     // CSS selector or description
  value?: string;      // For text input or key
  sequence?: number;   // Action order in sequence
  isPrivacySafe?: boolean; // Whether action involves sensitive data
}

interface AutofillSuggestion {
  id: string;
  value: string;
  targets: string[];   // CSS selectors for form fields
  description: string;
  confidence: number;
  isPrivacySafe: boolean; // Only for non-sensitive data
}

interface SubtleHint {
  id: string;
  target: string;      // CSS selector
  type: 'glow' | 'icon' | 'pulse';
  confidence: number;
  description: string;
}

interface AssistantState {
  isVisible: boolean;
  isEnabled: boolean;  // Toggle for guidance feature
  currentSuggestion: OperationSuggestion | null;
  executionState: 'idle' | 'executing' | 'completed' | 'failed';
  executedActions: SuggestedAction[];
  userFeedback: UserFeedback | null;
  uiMode: 'high_confidence' | 'medium_confidence' | 'autofill' | 'subtle_hint'; // UI rendering mode
  pendingAutofill: AutofillSuggestion | null;
  subtleHints: SubtleHint[];
  lastRecommendationTime: number; // 上次显示推荐的时间戳
}

interface UserFeedback {
  type: 'accept' | 'reject' | 'modify';
  rating?: number;     // 1-5 stars
  comment?: string;
  actualActions?: SynapseEvent[]; // User's actual actions performed
  confirmationRequired?: boolean;  // Whether to show confirmation dialog
  rollbackAvailable?: boolean;     // Whether rollback is possible
}

class SmartAssistant {
  private state: AssistantState;
  private assistantElement: HTMLElement | null = null;
  // Note: Message passing is now handled via sendToContentScript function
  private observedPatterns: Map<string, OperationSuggestion> = new Map();
  private executionHistory: Array<{
    suggestion: OperationSuggestion;
    feedback: UserFeedback;
    timestamp: number;
  }> = [];

  constructor() {
    this.state = {
      isVisible: false,
      isEnabled: true, // Default enabled
      currentSuggestion: null,
      executionState: 'idle',
      executedActions: [],
      userFeedback: null,
      uiMode: 'high_confidence',
      pendingAutofill: null,
      subtleHints: [],
      lastRecommendationTime: 0
    };
    
    this.initializeConnection();
    this.createAssistantUI();
    this.loadSettings();
    this.startPatternMonitoring();
  }

  /**
   * Initialize connection with background script
   */
  private initializeConnection(): void {
    try {
      // Set up message listener for background messages via content script
      window.addEventListener('message', (event: MessageEvent) => {
        if (event.source === window && event.data._target === 'smart-assistant' && event.data._fromBackground) {
          this.handleBackgroundMessage(event.data.message);
        }
      });
      
      // Notify content script that smart assistant is ready and request skills
      sendToContentScript({ type: 'smart-assistant-ready' }).then(() => {
        return sendToContentScript({ type: 'getLearnedSkills' });
      }).catch(error => {
        console.error('[SmartAssistant] Failed to initialize:', error);
      });
      
    } catch (error) {
      console.error('[SmartAssistant] Failed to initialize:', error);
    }
  }

  /**
   * Load assistant settings
   */
  private loadSettings(): void {
    sendToContentScript({ 
      type: 'storage-get', 
      keys: ['assistantEnabled'] 
    }).then(result => {
      if (result.assistantEnabled !== undefined) {
        this.state.isEnabled = result.assistantEnabled;
      }
    }).catch(error => {
      console.error('[SmartAssistant] Failed to load settings:', error);
    });
  }

  /**
   * Save assistant settings
   */
  private saveSettings(): void {
    sendToContentScript({ 
      type: 'storage-set', 
      data: { assistantEnabled: this.state.isEnabled }
    }).catch(error => {
      console.error('[SmartAssistant] Failed to save settings:', error);
    });
  }

  /**
   * Toggle guidance feature on/off
   */
  public toggleGuidance(): void {
    this.state.isEnabled = !this.state.isEnabled;
    this.saveSettings();
    
    if (!this.state.isEnabled) {
      this.hideAssistant();
    }
    
    // Notify background about the change
    sendToContentScript({
      type: 'guidanceToggled',
      data: { enabled: this.state.isEnabled }
    });
    
    console.log(`[SmartAssistant] Guidance ${this.state.isEnabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Handle messages from background script
   */
  private handleBackgroundMessage(message: any): void {
    if (!this.state.isEnabled) return; // Skip if disabled
    
    switch (message.type) {
      case 'patternDetected':
        // 检查冷却时间
        if (this.canShowRecommendation()) {
          this.onPatternDetected(message.data);
          this.recordRecommendationShown();
        } else {
          console.log('[SmartAssistant] Suggestion skipped due to cooldown period');
        }
        break;
      case 'learnedSkills':
        this.updateLearnedPatterns(message.data);
        break;
      case 'suggestionResult':
        this.onSuggestionResult(message.data);
        break;
      default:
        console.log('[SmartAssistant] Unknown message:', message);
    }
  }

  /**
   * 检查是否可以显示新的推荐
   * 实现30秒冷却期机制
   */
  private canShowRecommendation(): boolean {
    const COOLDOWN_MS = 30000; // 30秒冷却期
    const now = Date.now();
    const timeSinceLastRecommendation = now - this.state.lastRecommendationTime;
    return timeSinceLastRecommendation >= COOLDOWN_MS;
  }

  /**
   * 记录推荐显示时间
   */
  private recordRecommendationShown(): void {
    this.state.lastRecommendationTime = Date.now();
  }

  /**
   * Create assistant UI interface
   */
  private createAssistantUI(): void {
    // Create main container
    this.assistantElement = document.createElement('div');
    this.assistantElement.id = 'synapse-smart-assistant';
    this.assistantElement.className = 'synapse-assistant';
    
    // Add styles
    this.injectStyles();
    
    // Initially hidden
    this.assistantElement.style.display = 'none';
    
    // Insert into page (with DOM ready check)
    if (document.body) {
      document.body.appendChild(this.assistantElement);
    } else {
      // Wait for DOM to be ready
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body && this.assistantElement) {
          document.body.appendChild(this.assistantElement);
        }
      });
    }
  }

  /**
   * Inject assistant styles
   */
  private injectStyles(): void {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      .synapse-assistant {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 340px;
        background: #ffffff;
        border: 1px solid #e9e9e7;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #37352f;
        transform: translateX(360px);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      .synapse-assistant.visible {
        transform: translateX(0);
      }
      
      .assistant-header {
        padding: 20px 20px 16px;
        border-bottom: 1px solid #f1f1ef;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .assistant-title {
        font-weight: 600;
        font-size: 18px;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 10px;
        color: #2d2d2d;
      }
      
      .assistant-icon {
        width: 24px;
        height: 24px;
        background: #f7f7f5;
        border: 1px solid #e9e9e7;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      }
      
      .close-btn {
        background: none;
        border: none;
        color: #9b9a97;
        cursor: pointer;
        font-size: 20px;
        padding: 8px;
        border-radius: 6px;
        transition: all 0.15s;
      }
      
      .close-btn:hover {
        color: #37352f;
        background: #f7f7f5;
      }
      
      .assistant-content {
        padding: 20px;
      }
      
      .assistant-header.high-confidence {
        background: #f7f7f5;
        border-bottom: 1px solid #e9e9e7;
      }
      
      .suggestion-card.high-confidence {
        border: 1px solid #e6f3ff;
        background: #f9fcff;
      }
      
      .confidence-badge.high {
        background: #e6f3ff;
        color: #2383e2;
        font-weight: 600;
      }
      
      .btn-primary.one-click {
        background: #2383e2;
        color: white;
        font-weight: 600;
        box-shadow: 0 2px 8px rgba(35, 131, 226, 0.2);
      }
      
      .btn-primary.one-click:hover {
        background: #1e73cc;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(35, 131, 226, 0.3);
      }
      
      .subtle-hint {
        position: absolute;
        z-index: 9999;
        pointer-events: none;
        transition: all 0.3s ease;
      }
      
      .subtle-hint.glow {
        box-shadow: 0 0 10px 3px rgba(103, 126, 234, 0.6);
        border-radius: 4px;
      }
      
      .subtle-hint.icon::after {
        content: '✨';
        position: absolute;
        top: -20px;
        right: -5px;
        background: rgba(103, 126, 234, 0.9);
        color: white;
        padding: 2px 6px;
        border-radius: 8px;
        font-size: 12px;
        animation: bounce 2s infinite;
      }
      
      @keyframes bounce {
        0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-5px); }
        60% { transform: translateY(-3px); }
      }
      
      .autofill-popup {
        position: fixed;
        background: rgba(255, 193, 7, 0.95);
        color: #333;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10001;
        font-size: 13px;
        max-width: 250px;
        backdrop-filter: blur(5px);
      }
      
      .autofill-buttons {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }
      
      .autofill-btn {
        background: rgba(255,255,255,0.8);
        border: none;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.2s;
      }
      
      .autofill-btn:hover {
        background: white;
        transform: translateY(-1px);
      }
      
      .suggestion-card {
        background: #ffffff;
        border: 1px solid #f1f1ef;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 16px;
      }
      
      .suggestion-title {
        font-weight: 600;
        font-size: 16px;
        margin-bottom: 8px;
        color: #2d2d2d;
      }
      
      .suggestion-description {
        font-size: 14px;
        color: #787774;
        margin-bottom: 16px;
        line-height: 1.5;
      }
      
      .suggestion-meta {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: #9b9a97;
        margin-bottom: 20px;
      }
      
      .confidence-badge {
        background: #f7f7f5;
        color: #37352f;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        border: 1px solid #e9e9e7;
      }
      
      .action-buttons {
        display: flex;
        gap: 12px;
      }
      
      .btn-primary {
        background: #2383e2;
        border: none;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        transition: all 0.15s;
        flex: 1;
        box-shadow: 0 2px 4px rgba(35, 131, 226, 0.2);
      }
      
      .btn-primary:hover {
        background: #1e73cc;
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(35, 131, 226, 0.3);
      }
      
      .btn-secondary {
        background: #ffffff;
        border: 1px solid #e9e9e7;
        color: #37352f;
        padding: 12px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.15s;
        flex: 1;
      }
      
      .btn-secondary:hover {
        background: #f7f7f5;
        border-color: #d3d3d1;
        transform: translateY(-1px);
      }
      
      .execution-progress {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        font-size: 12px;
      }
      
      .progress-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top: 2px solid white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      .feedback-panel {
        background: rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 16px;
        margin-top: 12px;
      }
      
      .feedback-title {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      
      .rating-stars {
        display: flex;
        gap: 4px;
        margin-bottom: 8px;
      }
      
      .star {
        cursor: pointer;
        font-size: 16px;
        color: rgba(255,255,255,0.3);
        transition: color 0.2s;
      }
      
      .star.active,
      .star:hover {
        color: #ffd700;
      }
      
      .feedback-comment {
        width: 100%;
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 4px;
        padding: 8px;
        color: white;
        font-size: 12px;
        resize: vertical;
        min-height: 60px;
      }
      
      .feedback-comment::placeholder {
        color: rgba(255,255,255,0.5);
      }
      
      .rollback-panel {
        background: rgba(255,193,7,0.2);
        border-left: 3px solid #ffc107;
        padding: 12px;
        margin-top: 12px;
        border-radius: 4px;
        font-size: 12px;
      }
      
      .rollback-title {
        font-weight: 600;
        margin-bottom: 8px;
      }
    `;
    
    document.head.appendChild(styleElement);
  }

  /**
   * Monitor user action patterns
   */
  private startPatternMonitoring(): void {
    if (!this.state.isEnabled) return;
    
    // Listen for user action events
    document.addEventListener('click', (event) => {
      this.onUserAction('click', event);
    });
    
    document.addEventListener('keydown', (event) => {
      this.onUserAction('keydown', event);
    });
    
    // Listen for form submissions
    document.addEventListener('submit', (event) => {
      this.onUserAction('submit', event);
    });
  }

  /**
   * Handle user action events
   */
  private onUserAction(type: string, event: Event): void {
    if (!this.state.isEnabled) return;
    
    if (this.state.executionState === 'executing') {
      // If executing suggestion, record user's actual actions for comparison
      this.recordActualUserAction(type, event);
    }
    
    // Send to background for pattern analysis using new event format
    // Convert to appropriate SynapseEvent type based on the action
    let eventType = 'ui.click'; // Default
    if (type === 'keydown') eventType = 'ui.keydown';
    else if (type === 'input') eventType = 'ui.text_input';
    else if (type === 'focus') eventType = 'ui.focus_change';
    
    sendToContentScript({
      timestamp: Date.now(),
      type: eventType,
      context: {
        tabId: null,
        windowId: null, 
        url: window.location.href,
        title: document.title
      },
      payload: {
        targetSelector: (event.target as Element)?.tagName.toLowerCase() || 'unknown',
        features: {
          element_role: (event.target as Element)?.tagName.toLowerCase()
          // Can add more context information
        }
      }
    });
  }

  /**
   * Record actual user actions (for comparison with suggestions)
   */
  private recordActualUserAction(type: string, event: Event): void {
    // TODO: Implement actual action recording logic
    console.log('[SmartAssistant] Recording actual user action:', type, event);
  }

  /**
   * Handle detected patterns
   */
  private onPatternDetected(patternData: any): void {
    if (!this.state.isEnabled) return;
    
    const suggestion: OperationSuggestion = {
      id: `suggestion_${Date.now()}`,
      title: patternData.title || 'Smart Operation Suggestion',
      description: patternData.description || 'Based on your usage patterns, I suggest performing the following operations',
      confidence: patternData.confidence || 0.8,
      actions: patternData.actions || [],
      learnedFrom: patternData.source || 'Pattern Analysis',
      frequency: patternData.frequency || 1
    };
    
    this.determineUIMode(suggestion);
    this.showSuggestion(suggestion);
  }

  /**
   * Determine UI mode based on confidence level and suggestion type
   */
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

  /**
   * Check if suggestion is for autofill
   */
  private isAutofillSuggestion(suggestion: OperationSuggestion): boolean {
    return suggestion.actions.some(action => 
      action.type === 'text_input' && action.isPrivacySafe
    );
  }

  /**
   * Show operation suggestion
   */
  private showSuggestion(suggestion: OperationSuggestion): void {
    this.state.currentSuggestion = suggestion;
    this.state.executionState = 'idle';
    
    switch (this.state.uiMode) {
      case 'high_confidence':
        this.showHighConfidenceUI(suggestion);
        break;
      case 'medium_confidence':
        this.showMediumConfidenceUI(suggestion);
        break;
      case 'autofill':
        this.showAutofillUI(suggestion);
        break;
      case 'subtle_hint':
        this.showSubtleHints(suggestion);
        break;
    }
  }

  /**
   * Show high confidence UI (>90%) with one-click execution
   */
  private showHighConfidenceUI(suggestion: OperationSuggestion): void {
    this.state.isVisible = true;
    this.renderSuggestion();
    this.showAssistant();
  }

  /**
   * Show medium confidence UI (>70%) with subtle hints
   */
  private showMediumConfidenceUI(suggestion: OperationSuggestion): void {
    // Show subtle visual cues without full popup
    this.createSubtleHints(suggestion);
    this.renderSubtleHints();
  }

  /**
   * Show autofill suggestions for non-sensitive data
   */
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

  /**
   * Show subtle hints without popup
   */
  private showSubtleHints(suggestion: OperationSuggestion): void {
    this.createSubtleHints(suggestion);
    this.renderSubtleHints();
  }

  /**
   * Render suggestion content
   */
  private renderSuggestion(): void {
    if (!this.assistantElement || !this.state.currentSuggestion) return;
    
    const suggestion = this.state.currentSuggestion;
    
    if (this.state.uiMode === 'high_confidence') {
      this.assistantElement.innerHTML = `
        <div class="assistant-header high-confidence">
          <h3 class="assistant-title">
            <span class="assistant-icon">⚡</span>
            Quick Action
          </h3>
          <button class="close-btn" data-action="close">×</button>
        </div>
        <div class="assistant-content">
          <div class="suggestion-card high-confidence">
            <div class="suggestion-title">${suggestion.title}</div>
            <div class="suggestion-description">${suggestion.description}</div>
            <div class="suggestion-meta">
              <span>High confidence prediction</span>
              <span class="confidence-badge high">${(suggestion.confidence * 100).toFixed(0)}%</span>
            </div>
            <div class="action-buttons">
              <button class="btn-primary one-click" data-action="execute-quick">
                ⚡ Execute Now
              </button>
              <button class="btn-secondary" data-action="reject">
                Not Now
              </button>
            </div>
            ${this.renderExecutionProgress()}
          </div>
          ${this.renderFeedbackPanel()}
          ${this.renderRollbackPanel()}
        </div>
      `;
    } else {
      this.assistantElement.innerHTML = `
        <div class="assistant-header">
          <h3 class="assistant-title">
            <span class="assistant-icon">🤖</span>
            Smart Assistant
          </h3>
          <button class="close-btn" data-action="close">×</button>
        </div>
        <div class="assistant-content">
          <div class="suggestion-card">
            <div class="suggestion-title">${suggestion.title}</div>
            <div class="suggestion-description">${suggestion.description}</div>
            <div class="suggestion-meta">
              <span>Learned from: ${suggestion.learnedFrom}</span>
              <span class="confidence-badge">Confidence: ${(suggestion.confidence * 100).toFixed(0)}%</span>
            </div>
            <div class="action-buttons">
              <button class="btn-primary" data-action="execute">
                Execute
              </button>
              <button class="btn-secondary" data-action="reject">
                Not Now
              </button>
            </div>
            ${this.renderExecutionProgress()}
          </div>
          ${this.renderFeedbackPanel()}
          ${this.renderRollbackPanel()}
        </div>
      `;
    }
    
    // 添加事件监听器
    this.attachEventListeners();
  }

  /**
   * 添加事件监听器到按钮
   */
  private attachEventListeners(): void {
    if (!this.assistantElement) return;

    // 使用事件委托处理所有按钮点击
    this.assistantElement.addEventListener('click', (event: MouseEvent) => {
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
          this.executeActions();
          break;
        case 'execute-quick':
          this.executeActionsWithConfirmation();
          break;
        case 'reject':
          this.rejectSuggestion();
          break;
        case 'submit-feedback':
          this.submitFeedback();
          break;
        case 'rollback':
          this.rollbackActions();
          break;
        case 'execute-autofill':
          this.executeAutofill();
          break;
        case 'dismiss-autofill':
          this.dismissAutofill();
          break;
        default:
          console.log('[SmartAssistant] Unknown action:', action);
      }
    });

    // 处理评分星星点击
    this.assistantElement.addEventListener('click', (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains('star')) {
        const rating = parseInt(target.getAttribute('data-rating') || '0');
        if (rating > 0) {
          this.setRating(rating);
        }
      }
    });

    // 处理评论文本框变化
    const commentTextarea = this.assistantElement.querySelector('.feedback-comment') as HTMLTextAreaElement;
    if (commentTextarea) {
      commentTextarea.addEventListener('change', (event: Event) => {
        const target = event.target as HTMLTextAreaElement;
        this.setComment(target.value);
      });
    }
  }

  /**
   * Render execution progress
   */
  private renderExecutionProgress(): string {
    if (this.state.executionState === 'idle') return '';
    
    const stateText = {
      'executing': 'Executing operations...',
      'completed': '✅ Operations completed',
      'failed': '❌ Operations failed'
    };
    
    return `
      <div class="execution-progress">
        ${this.state.executionState === 'executing' ? '<div class="progress-spinner"></div>' : ''}
        <span>${stateText[this.state.executionState]}</span>
      </div>
    `;
  }

  /**
   * Render feedback panel
   */
  private renderFeedbackPanel(): string {
    if (this.state.executionState !== 'completed') return '';
    
    return `
      <div class="feedback-panel">
        <div class="feedback-title">How was this suggestion?</div>
        <div class="rating-stars">
          ${[1,2,3,4,5].map(rating => 
            `<span class="star" data-rating="${rating}">⭐</span>`
          ).join('')}
        </div>
        <textarea 
          class="feedback-comment" 
          placeholder="Tell me how this suggestion could be improved..."
        ></textarea>
        <div class="action-buttons" style="margin-top: 8px;">
          <button class="btn-primary" data-action="submit-feedback">Confirm & Rate</button>
          <button class="btn-secondary" data-action="rollback">Undo & Improve</button>
        </div>
      </div>
    `;
  }

  /**
   * Render rollback panel
   */
  private renderRollbackPanel(): string {
    if (this.state.executionState !== 'completed') return '';
    
    return `
      <div class="rollback-panel">
        <div class="rollback-title">Need to undo?</div>
        <div>If the suggestion didn't work as expected, you can rollback all actions and help me learn from your actual behavior.</div>
        <div class="action-buttons" style="margin-top: 8px;">
          <button class="btn-secondary" data-action="rollback">Rollback & Learn</button>
        </div>
      </div>
    `;
  }

  /**
   * Show assistant interface
   */
  private showAssistant(): void {
    if (this.assistantElement) {
      this.assistantElement.style.display = 'block';
      setTimeout(() => {
        this.assistantElement?.classList.add('visible');
      }, 10);
    }
  }

  /**
   * Hide assistant interface
   */
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

  /**
   * Execute suggested actions with confirmation for high confidence
   */
  public async executeActionsWithConfirmation(): Promise<void> {
    if (!this.state.currentSuggestion) return;
    
    // For high confidence, execute immediately with feedback collection
    await this.executeActions();
    
    // Automatically show feedback collection after execution
    if (this.state.executionState === 'completed') {
      this.collectFeedbackAfterExecution();
    }
  }

  /**
   * Execute suggested actions
   */
  public async executeActions(): Promise<void> {
    if (!this.state.currentSuggestion) return;
    
    this.state.executionState = 'executing';
    this.state.executedActions = [];
    this.renderSuggestion();
    
    try {
      const actions = this.state.currentSuggestion.actions;
      
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        await this.executeAction(action);
        this.state.executedActions.push(action);
        
        // Brief delay for user observation
        await this.delay(500);
      }
      
      this.state.executionState = 'completed';
      this.renderSuggestion();
      
      // Record execution history
      sendToContentScript({
        type: 'suggestionExecuted',
        data: {
          suggestion: this.state.currentSuggestion,
          executedActions: this.state.executedActions,
          timestamp: Date.now()
        }
      });
      
    } catch (error) {
      console.error('[SmartAssistant] Execution failed:', error);
      this.state.executionState = 'failed';
      this.renderSuggestion();
    }
  }

  /**
   * Collect feedback after execution
   */
  private collectFeedbackAfterExecution(): void {
    // For high confidence suggestions, proactively show rating
    setTimeout(() => {
      if (this.state.executionState === 'completed') {
        this.showFeedbackDialog();
      }
    }, 1000);
  }

  /**
   * Show feedback dialog
   */
  private showFeedbackDialog(): void {
    this.renderSuggestion(); // Re-render to show feedback panel
  }

  /**
   * Execute a single action
   */
  private async executeAction(action: SuggestedAction): Promise<void> {
    switch (action.type) {
      case 'click':
        if (action.target) {
          const element = document.querySelector(action.target) as HTMLElement;
          if (element) {
            element.click();
          } else {
            throw new Error(`Element not found: ${action.target}`);
          }
        }
        break;
        
      case 'text_input':
        if (action.target && action.value) {
          const element = document.querySelector(action.target) as HTMLInputElement;
          if (element) {
            element.value = action.value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            throw new Error(`Input element not found: ${action.target}`);
          }
        }
        break;
        
      case 'keydown':
        if (action.value) {
          const event = new KeyboardEvent('keydown', { key: action.value });
          document.dispatchEvent(event);
        }
        break;
        
      case 'scroll':
        if (action.value) {
          const scrollY = parseInt(action.value);
          window.scrollTo(0, scrollY);
        }
        break;
    }
  }

  /**
   * Delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reject suggestion
   */
  public rejectSuggestion(): void {
    if (this.state.currentSuggestion) {
      // Collect rejection feedback
      this.collectRejectionFeedback();
      
      sendToContentScript({
        type: 'suggestionRejected',
        data: {
          suggestion: this.state.currentSuggestion,
          timestamp: Date.now()
        }
      });
    }
    this.hideAssistant();
  }

  /**
   * Collect rejection feedback
   */
  private collectRejectionFeedback(): void {
    if (!this.state.userFeedback) {
      this.state.userFeedback = { type: 'reject' };
    }
    this.state.userFeedback.type = 'reject';
    
    // Briefly show why they rejected (optional quick feedback)
    const reason = prompt('Quick feedback: Why didn\'t this suggestion help? (optional)');
    if (reason) {
      this.state.userFeedback.comment = reason;
      sendToContentScript({
        type: 'feedbackSubmitted',
        data: {
          suggestion: this.state.currentSuggestion,
          feedback: this.state.userFeedback,
          timestamp: Date.now()
        }
      });
    }
  }


  /**
   * Update learned patterns
   */
  private updateLearnedPatterns(skills: ActionSkill[]): void {
    console.log('[SmartAssistant] Updated learned patterns:', skills);
    // TODO: Handle skill update logic
  }

  /**
   * Handle suggestion result
   */
  private onSuggestionResult(result: any): void {
    console.log('[SmartAssistant] Suggestion result:', result);
    // TODO: Handle suggestion execution result
  }

  /**
   * Create subtle hints for medium confidence suggestions
   */
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

  /**
   * Render subtle hints on page elements
   */
  private renderSubtleHints(): void {
    this.clearSubtleHints();
    
    this.state.subtleHints.forEach(hint => {
      const targetElement = document.querySelector(hint.target) as HTMLElement;
      if (targetElement) {
        const hintElement = document.createElement('div');
        hintElement.className = `subtle-hint ${hint.type}`;
        hintElement.id = `synapse-hint-${hint.id}`;
        hintElement.title = hint.description;
        
        // Position hint overlay
        const rect = targetElement.getBoundingClientRect();
        hintElement.style.position = 'fixed';
        hintElement.style.top = `${rect.top}px`;
        hintElement.style.left = `${rect.left}px`;
        hintElement.style.width = `${rect.width}px`;
        hintElement.style.height = `${rect.height}px`;
        
        // Add click handler to execute action
        hintElement.addEventListener('click', () => {
          this.executeHintAction(hint);
        });
        
        if (document.body) {
          document.body.appendChild(hintElement);
        }
      }
    });
  }

  /**
   * Clear all subtle hints
   */
  private clearSubtleHints(): void {
    const existingHints = document.querySelectorAll('.subtle-hint');
    existingHints.forEach(hint => hint.remove());
  }

  /**
   * Execute action from hint click
   */
  private executeHintAction(hint: SubtleHint): void {
    const targetElement = document.querySelector(hint.target) as HTMLElement;
    if (targetElement) {
      targetElement.click();
      this.clearSubtleHints();
      
      // Record hint interaction
      sendToContentScript({
        type: 'hintInteraction',
        data: {
          hintId: hint.id,
          executed: true,
          timestamp: Date.now()
        }
      });
    }
  }

  /**
   * Show autofill popup
   */
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
      
      if (document.body) {
        document.body.appendChild(popup);
      }
      
      // 添加事件监听器
      popup.addEventListener('click', (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const action = target.getAttribute('data-action');
        
        if (action === 'execute-autofill') {
          this.executeAutofill();
        } else if (action === 'dismiss-autofill') {
          this.dismissAutofill();
        }
      });
      
      // Auto-dismiss after 10 seconds
      setTimeout(() => {
        this.dismissAutofill();
      }, 10000);
    }
  }

  /**
   * Execute autofill
   */
  public executeAutofill(): void {
    if (!this.state.pendingAutofill) return;
    
    const autofill = this.state.pendingAutofill;
    autofill.targets.forEach(target => {
      const element = document.querySelector(target) as HTMLInputElement;
      if (element && element.type !== 'password') { // Safety check
        element.value = autofill.value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    
    // Record autofill usage
    sendToContentScript({
      type: 'autofillExecuted',
      data: {
        autofill: autofill,
        timestamp: Date.now()
      }
    });
    
    this.dismissAutofill();
  }

  /**
   * Dismiss autofill popup
   */
  public dismissAutofill(): void {
    const popup = document.getElementById('synapse-autofill-popup');
    if (popup) {
      popup.remove();
    }
    this.state.pendingAutofill = null;
  }

  /**
   * Set user rating
   */
  public setRating(rating: number): void {
    if (!this.state.userFeedback) {
      this.state.userFeedback = { type: 'accept' };
    }
    this.state.userFeedback.rating = rating;
    
    // Update star display
    const stars = this.assistantElement?.querySelectorAll('.star');
    stars?.forEach((star, index) => {
      if (index < rating) {
        star.classList.add('active');
      } else {
        star.classList.remove('active');
      }
    });
  }

  /**
   * Set user comment
   */
  public setComment(comment: string): void {
    if (!this.state.userFeedback) {
      this.state.userFeedback = { type: 'accept' };
    }
    this.state.userFeedback.comment = comment;
  }

  /**
   * Submit feedback with enhanced collection
   */
  public submitFeedback(): void {
    if (this.state.userFeedback && this.state.currentSuggestion) {
      // Enhanced feedback collection
      const enhancedFeedback = {
        ...this.state.userFeedback,
        suggestionId: this.state.currentSuggestion.id,
        uiMode: this.state.uiMode,
        executionSuccess: this.state.executionState === 'completed',
        timestamp: Date.now()
      };
      
      sendToContentScript({
        type: 'feedbackSubmitted',
        data: {
          suggestion: this.state.currentSuggestion,
          feedback: enhancedFeedback,
          executedActions: this.state.executedActions,
          timestamp: Date.now()
        }
      });
      
      // Show thank you message
      this.showThankYouMessage();
    }
    
    // Hide assistant after brief delay
    setTimeout(() => {
      this.hideAssistant();
    }, 2000);
  }

  /**
   * Show thank you message after feedback
   */
  private showThankYouMessage(): void {
    if (this.assistantElement) {
      this.assistantElement.innerHTML = `
        <div class="assistant-header">
          <h3 class="assistant-title">
            <span class="assistant-icon">❤️</span>
            Thank You!
          </h3>
        </div>
        <div class="assistant-content">
          <div class="suggestion-card" style="text-align: center; padding: 20px;">
            <div style="font-size: 16px; margin-bottom: 8px;">Thanks for your feedback!</div>
            <div style="font-size: 13px; opacity: 0.8;">Your input helps me learn and improve.</div>
          </div>
        </div>
      `;
    }
  }

  /**
   * Enhanced rollback with learning
   */
  public async rollbackActions(): Promise<void> {
    if (!this.state.executedActions.length) return;
    
    try {
      // Show rollback confirmation
      const confirmed = confirm('This will undo the actions and help me learn from your preferences. Continue?');
      if (!confirmed) return;
      
      // Attempt to rollback actions in reverse order
      for (let i = this.state.executedActions.length - 1; i >= 0; i--) {
        const action = this.state.executedActions[i];
        await this.rollbackAction(action);
      }
      
      // Collect feedback about why rollback was needed
      this.collectRollbackFeedback();
      
      // Start monitoring user's actual actions for learning
      this.startLearningMode();
      
      sendToContentScript({
        type: 'actionsRolledBack',
        data: {
          suggestion: this.state.currentSuggestion,
          rolledBackActions: this.state.executedActions,
          timestamp: Date.now()
        }
      });
      
      this.hideAssistant();
      
    } catch (error) {
      console.error('[SmartAssistant] Rollback failed:', error);
      alert('Rollback failed. Please manually undo the actions.');
    }
  }

  /**
   * Rollback a single action
   */
  private async rollbackAction(action: SuggestedAction): Promise<void> {
    // Note: Complete rollback is complex and depends on action type
    // This is a simplified implementation
    switch (action.type) {
      case 'text_input':
        if (action.target) {
          const element = document.querySelector(action.target) as HTMLInputElement;
          if (element) {
            element.value = ''; // Clear the input
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        break;
      case 'scroll':
        // Attempt to scroll back to previous position
        window.scrollTo(0, 0);
        break;
      // Note: Click actions are generally not reversible
      default:
        console.warn(`Cannot rollback action type: ${action.type}`);
    }
  }

  /**
   * Start learning mode to observe user's actual actions
   */
  private startLearningMode(): void {
    console.log('[SmartAssistant] Starting learning mode...');
    // TODO: Implement learning mode logic
    // This would monitor user actions and compare with the rolled-back suggestion
  }

  /**
   * Collect rollback feedback
   */
  private collectRollbackFeedback(): void {
    const reason = prompt('What went wrong with the suggestion? This helps me improve:');
    if (reason) {
      if (!this.state.userFeedback) {
        this.state.userFeedback = { type: 'reject' };
      }
      this.state.userFeedback.comment = `Rollback reason: ${reason}`;
      this.state.userFeedback.rating = 1; // Low rating for rollback
    }
  }

  /**
   * Get current state (for external access)
   */
  public getState(): AssistantState {
    return { ...this.state };
  }
}

// Global instance
interface GlobalWindow {
  synapseAssistant: SmartAssistant;
}

// Initialize smart assistant
if (typeof window !== 'undefined') {
  (window as any).synapseAssistant = new SmartAssistant();
}