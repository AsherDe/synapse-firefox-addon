import { SuggestedAction, OperationSuggestion, AssistantState } from './types';
import { MessagingService } from './MessagingService';

// Browser API compatibility
declare var browser: any;

// Cross-tab workflow execution types
interface WorkflowExecution {
  workflowId: string;
  currentStep: number;
  totalSteps: number;
  steps: WorkflowStep[];
  isActive: boolean;
  tabSequence: number[];
}

interface WorkflowStep {
  stepNumber: number;
  tabId: number | null;
  action: string;
  selector: string;
  value?: string;
  isTabSwitch: boolean;
  requiresNewTab?: boolean;
}

/**
 * ExecutionEngine - Enhanced with cross-tab workflow automation capabilities
 */
export class ExecutionEngine {
  private messagingService: MessagingService;
  private activeWorkflow: WorkflowExecution | null = null;
  
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
   * Execute a single action with cross-tab support
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
        
      case 'tab_switch':
        if (action.value) {
          const tabId = parseInt(action.value);
          await this.switchToTab(tabId);
        }
        break;
        
      case 'new_tab':
        if (action.value) {
          await this.openNewTab(action.value);
        }
        break;
    }
  }

  /**
   * Start cross-tab workflow execution
   */
  public async startWorkflowExecution(workflowData: any): Promise<void> {
    try {
      this.activeWorkflow = {
        workflowId: workflowData.workflowId,
        currentStep: 0,
        totalSteps: workflowData.totalSteps,
        steps: workflowData.nextSteps || [],
        isActive: true,
        tabSequence: []
      };
      
      console.log(`[ExecutionEngine] Started workflow execution: ${workflowData.workflowId}`);
      
      // Execute first step
      if (this.activeWorkflow.steps.length > 0) {
        await this.executeWorkflowStep(this.activeWorkflow.steps[0]);
      }
      
    } catch (error) {
      console.error('[ExecutionEngine] Failed to start workflow execution:', error);
      this.activeWorkflow = null;
      throw error;
    }
  }

  /**
   * Continue workflow execution to next step
   */
  public async continueWorkflow(): Promise<void> {
    if (!this.activeWorkflow || !this.activeWorkflow.isActive) {
      return;
    }
    
    this.activeWorkflow.currentStep++;
    
    if (this.activeWorkflow.currentStep >= this.activeWorkflow.totalSteps) {
      // Workflow completed
      console.log(`[ExecutionEngine] Workflow completed: ${this.activeWorkflow.workflowId}`);
      this.activeWorkflow = null;
      return;
    }
    
    // Execute next step if available
    const nextStep = this.activeWorkflow.steps[this.activeWorkflow.currentStep];
    if (nextStep) {
      await this.executeWorkflowStep(nextStep);
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeWorkflowStep(step: WorkflowStep): Promise<void> {
    try {
      // Handle tab switching if needed
      if (step.isTabSwitch && step.tabId) {
        await this.switchToTab(step.tabId);
        await this.delay(500); // Wait for tab switch
      }
      
      // Handle new tab creation
      if (step.requiresNewTab) {
        const newTabId = await this.openNewTab();
        step.tabId = newTabId;
        if (this.activeWorkflow) {
          this.activeWorkflow.tabSequence.push(newTabId);
        }
        await this.delay(1000); // Wait for tab creation
      }
      
      // Execute the action
      switch (step.action) {
        case 'click':
          if (step.selector) {
            await this.executeScriptInTab(step.tabId, `
              const element = document.querySelector('${step.selector}');
              if (element) element.click();
            `);
          }
          break;
          
        case 'input':
          if (step.selector && step.value) {
            await this.executeScriptInTab(step.tabId, `
              const element = document.querySelector('${step.selector}');
              if (element) {
                element.value = '${step.value}';
                element.dispatchEvent(new Event('input', { bubbles: true }));
              }
            `);
          }
          break;
          
        default:
          console.warn(`[ExecutionEngine] Unknown workflow step action: ${step.action}`);
      }
      
      await this.delay(800); // Brief delay between steps
      
    } catch (error) {
      console.error('[ExecutionEngine] Failed to execute workflow step:', error);
      throw error;
    }
  }

  /**
   * Switch to specified tab
   */
  private async switchToTab(tabId: number): Promise<void> {
    try {
      await browser.tabs.update(tabId, { active: true });
      const tab = await browser.tabs.get(tabId);
      await browser.windows.update(tab.windowId, { focused: true });
    } catch (error) {
      console.error('[ExecutionEngine] Failed to switch tab:', error);
      throw error;
    }
  }

  /**
   * Open new tab
   */
  private async openNewTab(url?: string): Promise<number> {
    try {
      const tab = await browser.tabs.create({ url: url || 'about:blank' });
      return tab.id;
    } catch (error) {
      console.error('[ExecutionEngine] Failed to open new tab:', error);
      throw error;
    }
  }

  /**
   * Execute script in specific tab
   */
  private async executeScriptInTab(tabId: number | null, script: string): Promise<void> {
    if (!tabId) {
      // Execute in current tab if no specific tab
      eval(script);
      return;
    }
    
    try {
      await browser.tabs.executeScript(tabId, { code: script });
    } catch (error) {
      console.error('[ExecutionEngine] Failed to execute script in tab:', error);
      throw error;
    }
  }

  /**
   * Stop current workflow execution
   */
  public stopWorkflow(): void {
    if (this.activeWorkflow) {
      console.log(`[ExecutionEngine] Stopping workflow: ${this.activeWorkflow.workflowId}`);
      this.activeWorkflow = null;
    }
  }

  /**
   * Get current workflow status
   */
  public getWorkflowStatus(): WorkflowExecution | null {
    return this.activeWorkflow;
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