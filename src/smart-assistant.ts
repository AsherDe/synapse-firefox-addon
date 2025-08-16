/**
 * Smart Assistant Component
 * 
 * Provides intelligent operation suggestions based on learned user patterns
 * Licensed under the Apache License, Version 2.0
 */

/// <reference path="./types.ts" />

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
}

interface AssistantState {
  isVisible: boolean;
  isEnabled: boolean;  // Toggle for guidance feature
  currentSuggestion: OperationSuggestion | null;
  executionState: 'idle' | 'executing' | 'completed' | 'failed';
  executedActions: SuggestedAction[];
  userFeedback: UserFeedback | null;
}

interface UserFeedback {
  type: 'accept' | 'reject' | 'modify';
  rating?: number;     // 1-5 stars
  comment?: string;
  actualActions?: EnrichedEvent[]; // User's actual actions performed
}

class SmartAssistant {
  private state: AssistantState;
  private assistantElement: HTMLElement | null = null;
  private backgroundPort: chrome.runtime.Port | null = null;
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
      userFeedback: null
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
      this.backgroundPort = chrome.runtime.connect({ name: 'smart-assistant' });
      
      this.backgroundPort.onMessage.addListener((message) => {
        this.handleBackgroundMessage(message);
      });
      
      this.backgroundPort.onDisconnect.addListener(() => {
        console.log('[SmartAssistant] Background connection lost, reconnecting...');
        setTimeout(() => this.initializeConnection(), 1000);
      });
      
      // Request current learned skill patterns
      this.backgroundPort.postMessage({ type: 'getLearnedSkills' });
      
    } catch (error) {
      console.error('[SmartAssistant] Failed to connect to background:', error);
    }
  }

  /**
   * Load assistant settings
   */
  private loadSettings(): void {
    chrome.storage.local.get(['assistantEnabled'], (result) => {
      if (result.assistantEnabled !== undefined) {
        this.state.isEnabled = result.assistantEnabled;
      }
    });
  }

  /**
   * Save assistant settings
   */
  private saveSettings(): void {
    chrome.storage.local.set({ 
      assistantEnabled: this.state.isEnabled 
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
    this.backgroundPort?.postMessage({
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
        this.onPatternDetected(message.data);
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
    
    // Insert into page
    document.body.appendChild(this.assistantElement);
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
        width: 320px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: white;
        backdrop-filter: blur(10px);
        transform: translateX(350px);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      .synapse-assistant.visible {
        transform: translateX(0);
      }
      
      .assistant-header {
        padding: 16px 20px 12px;
        border-bottom: 1px solid rgba(255,255,255,0.2);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .assistant-title {
        font-weight: 600;
        font-size: 16px;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .assistant-icon {
        width: 20px;
        height: 20px;
        background: rgba(255,255,255,0.3);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
      }
      
      .close-btn {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 18px;
        padding: 4px;
        border-radius: 4px;
        opacity: 0.7;
        transition: opacity 0.2s;
      }
      
      .close-btn:hover {
        opacity: 1;
      }
      
      .assistant-content {
        padding: 16px 20px;
      }
      
      .suggestion-card {
        background: rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 12px;
      }
      
      .suggestion-title {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 8px;
      }
      
      .suggestion-description {
        font-size: 13px;
        opacity: 0.9;
        margin-bottom: 12px;
        line-height: 1.4;
      }
      
      .suggestion-meta {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        opacity: 0.7;
        margin-bottom: 16px;
      }
      
      .confidence-badge {
        background: rgba(255,255,255,0.2);
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 500;
      }
      
      .action-buttons {
        display: flex;
        gap: 8px;
      }
      
      .btn-primary {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s;
        flex: 1;
      }
      
      .btn-primary:hover {
        background: rgba(255,255,255,0.3);
        transform: translateY(-1px);
      }
      
      .btn-secondary {
        background: transparent;
        border: 1px solid rgba(255,255,255,0.3);
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s;
      }
      
      .btn-secondary:hover {
        background: rgba(255,255,255,0.1);
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
    
    // Send to background for pattern analysis
    this.backgroundPort?.postMessage({
      type: 'userAction',
      data: {
        type,
        timestamp: Date.now(),
        target: (event.target as Element)?.tagName,
        // Can add more context information
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
    
    this.showSuggestion(suggestion);
  }

  /**
   * Show operation suggestion
   */
  private showSuggestion(suggestion: OperationSuggestion): void {
    this.state.currentSuggestion = suggestion;
    this.state.isVisible = true;
    this.state.executionState = 'idle';
    
    this.renderSuggestion();
    this.showAssistant();
  }

  /**
   * Render suggestion content
   */
  private renderSuggestion(): void {
    if (!this.assistantElement || !this.state.currentSuggestion) return;
    
    const suggestion = this.state.currentSuggestion;
    
    this.assistantElement.innerHTML = `
      <div class="assistant-header">
        <h3 class="assistant-title">
          <span class="assistant-icon">🤖</span>
          Smart Assistant
        </h3>
        <button class="close-btn" onclick="synapseAssistant.hideAssistant()">×</button>
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
            <button class="btn-primary" onclick="synapseAssistant.executeActions()">
              Execute
            </button>
            <button class="btn-secondary" onclick="synapseAssistant.rejectSuggestion()">
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
        <div class="feedback-title">Please rate this suggestion:</div>
        <div class="rating-stars">
          ${[1,2,3,4,5].map(rating => 
            `<span class="star" onclick="synapseAssistant.setRating(${rating})">⭐</span>`
          ).join('')}
        </div>
        <textarea 
          class="feedback-comment" 
          placeholder="Tell me how this suggestion could be improved..."
          onchange="synapseAssistant.setComment(this.value)"
        ></textarea>
        <div class="action-buttons" style="margin-top: 8px;">
          <button class="btn-primary" onclick="synapseAssistant.submitFeedback()">Submit Feedback</button>
          <button class="btn-secondary" onclick="synapseAssistant.rollbackActions()">Rollback</button>
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
          <button class="btn-secondary" onclick="synapseAssistant.rollbackActions()">Rollback & Learn</button>
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
      this.backgroundPort?.postMessage({
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
      this.backgroundPort?.postMessage({
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
   * Rollback executed actions and learn from differences
   */
  public async rollbackActions(): Promise<void> {
    if (!this.state.executedActions.length) return;
    
    try {
      // Attempt to rollback actions in reverse order
      for (let i = this.state.executedActions.length - 1; i >= 0; i--) {
        const action = this.state.executedActions[i];
        await this.rollbackAction(action);
      }
      
      // Start monitoring user's actual actions for learning
      this.startLearningMode();
      
      this.backgroundPort?.postMessage({
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
   * Set rating
   */
  public setRating(rating: number): void {
    if (!this.state.userFeedback) {
      this.state.userFeedback = { type: 'accept' };
    }
    this.state.userFeedback.rating = rating;
    
    // Update star display
    const stars = document.querySelectorAll('.star');
    stars.forEach((star, index) => {
      if (index < rating) {
        star.classList.add('active');
      } else {
        star.classList.remove('active');
      }
    });
  }

  /**
   * Set comment
   */
  public setComment(comment: string): void {
    if (!this.state.userFeedback) {
      this.state.userFeedback = { type: 'accept' };
    }
    this.state.userFeedback.comment = comment;
  }

  /**
   * Submit feedback
   */
  public submitFeedback(): void {
    if (this.state.userFeedback && this.state.currentSuggestion) {
      this.backgroundPort?.postMessage({
        type: 'feedbackSubmitted',
        data: {
          suggestion: this.state.currentSuggestion,
          feedback: this.state.userFeedback,
          executedActions: this.state.executedActions,
          timestamp: Date.now()
        }
      });
    }
    this.hideAssistant();
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