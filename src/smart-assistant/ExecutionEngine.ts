import { SuggestedAction, OperationSuggestion, AssistantState } from './types';
import { MessagingService } from './MessagingService';

/**
 * ExecutionEngine - Handles action execution and rollback
 */
export class ExecutionEngine {
  private messagingService: MessagingService;
  
  constructor(messagingService: MessagingService) {
    this.messagingService = messagingService;
  }

  /**
   * Execute suggested actions
   */
  public async executeActions(suggestion: OperationSuggestion): Promise<SuggestedAction[]> {
    const executedActions: SuggestedAction[] = [];
    
    try {
      const actions = suggestion.actions;
      
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        await this.executeAction(action);
        executedActions.push(action);
        
        // Brief delay for user observation
        await this.delay(500);
      }
      
      // Record execution history
      await this.messagingService.sendToContentScript({
        type: 'suggestionExecuted',
        data: {
          suggestion: suggestion,
          executedActions: executedActions,
          timestamp: Date.now()
        }
      });
      
      return executedActions;
      
    } catch (error) {
      console.error('[ExecutionEngine] Execution failed:', error);
      throw error;
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
   * Execute autofill
   */
  public async executeAutofill(targets: string[], value: string): Promise<void> {
    targets.forEach(target => {
      const element = document.querySelector(target) as HTMLInputElement;
      if (element && element.type !== 'password') {
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    
    await this.messagingService.sendToContentScript({
      type: 'autofillExecuted',
      data: {
        targets,
        value,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Rollback executed actions
   */
  public async rollbackActions(executedActions: SuggestedAction[], suggestion: OperationSuggestion): Promise<void> {
    try {
      const confirmed = confirm('This will undo the actions and help me learn from your preferences. Continue?');
      if (!confirmed) return;
      
      for (let i = executedActions.length - 1; i >= 0; i--) {
        const action = executedActions[i];
        await this.rollbackAction(action);
      }
      
      await this.messagingService.sendToContentScript({
        type: 'actionsRolledBack',
        data: {
          suggestion: suggestion,
          rolledBackActions: executedActions,
          timestamp: Date.now()
        }
      });
      
    } catch (error) {
      console.error('[ExecutionEngine] Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Rollback a single action
   */
  private async rollbackAction(action: SuggestedAction): Promise<void> {
    switch (action.type) {
      case 'text_input':
        if (action.target) {
          const element = document.querySelector(action.target) as HTMLInputElement;
          if (element) {
            element.value = '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        break;
      case 'scroll':
        window.scrollTo(0, 0);
        break;
      default:
        console.warn(`Cannot rollback action type: ${action.type}`);
    }
  }

  /**
   * Delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}