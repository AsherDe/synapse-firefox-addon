/**
 * Unified Highlight System for Synapse Smart Assistant
 * Eliminates UI conflicts between intelligent focus and task path guidance
 */

declare var browser: any;

export interface HighlightTarget {
  selector: string;
  type: 'intelligent_focus' | 'task_guidance';
  keyNumber?: number;
  confidence?: number;
  action?: any;
  suggestion?: any;
  taskData?: any;
}

export class UnifiedHighlightSystem {
  private activeHighlights: Map<string, HTMLElement> = new Map();
  private keyboardHandler: ((event: KeyboardEvent) => void) | null = null;
  private static readonly HIGHLIGHT_Z_INDEX = 10001;
  
  constructor() {
    this.injectStyles();
  }

  private injectStyles(): void {
    const styleId = 'synapse-unified-highlight-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .synapse-unified-highlight {
        position: fixed;
        pointer-events: none;
        z-index: ${UnifiedHighlightSystem.HIGHLIGHT_Z_INDEX};
        border-radius: 4px;
        transition: all 0.3s ease;
      }

      .synapse-unified-highlight.intelligent-focus {
        border: 2px solid #2196F3;
        background: rgba(33, 150, 243, 0.1);
        box-shadow: 0 0 0 1px rgba(33, 150, 243, 0.3);
      }

      .synapse-unified-highlight.task-guidance {
        border: 3px solid #FF6B35;
        background: rgba(255, 107, 53, 0.15);
        box-shadow: 0 0 0 2px rgba(255, 107, 53, 0.4);
        animation: synapse-pulse 2s infinite;
      }

      .synapse-unified-highlight.task-guidance::before {
        content: "";
        position: absolute;
        top: -3px;
        left: -3px;
        right: -3px;
        bottom: -3px;
        border: 1px solid #FF6B35;
        border-radius: 4px;
        animation: synapse-pulse-border 2s infinite;
      }

      @keyframes synapse-pulse {
        0%, 100% { 
          box-shadow: 0 0 0 2px rgba(255, 107, 53, 0.4);
          background: rgba(255, 107, 53, 0.15);
        }
        50% { 
          box-shadow: 0 0 0 4px rgba(255, 107, 53, 0.6);
          background: rgba(255, 107, 53, 0.25);
        }
      }

      @keyframes synapse-pulse-border {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }

      .synapse-focus-number {
        position: fixed;
        width: 24px;
        height: 24px;
        background: #2196F3;
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: bold;
        z-index: ${UnifiedHighlightSystem.HIGHLIGHT_Z_INDEX + 1};
        cursor: pointer;
        pointer-events: auto;
        border: 2px solid #1976D2;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      }

      .synapse-focus-number:hover {
        background: #1976D2;
        transform: scale(1.1);
      }

      .synapse-task-info {
        position: fixed;
        background: #FF6B35;
        color: white;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        z-index: ${UnifiedHighlightSystem.HIGHLIGHT_Z_INDEX + 1};
        box-shadow: 0 4px 12px rgba(255, 107, 53, 0.4);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        max-width: 250px;
      }

      .synapse-task-exit-btn {
        position: absolute;
        top: -8px;
        right: -8px;
        width: 20px;
        height: 20px;
        background: #e74c3c;
        color: white;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        pointer-events: auto;
        transition: background 0.15s ease, transform 0.15s ease;
      }

      .synapse-task-exit-btn:hover {
        background: #c0392b;
        transform: scale(1.1);
      }

      .synapse-task-progress {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
        font-size: 11px;
      }

      .synapse-progress-bar {
        flex: 1;
        height: 3px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 2px;
        overflow: hidden;
      }

      .synapse-progress-fill {
        height: 100%;
        background: white;
        border-radius: 2px;
        transition: width 0.3s ease;
      }
    `;
    
    document.head.appendChild(style);
  }

  public showIntelligentFocus(targets: HighlightTarget[]): void {
    // Clear existing highlights
    this.clearHighlights();
    
    targets.slice(0, 9).forEach((target, index) => {
      const keyNumber = index + 1;
      const targetElement = document.querySelector(target.selector) as HTMLElement;
      if (!targetElement) return;

      // Create highlight overlay
      const highlight = this.createHighlightElement(targetElement, 'intelligent-focus');
      const highlightId = `focus-${keyNumber}`;
      this.activeHighlights.set(highlightId, highlight);

      // Create number indicator
      const numberElement = this.createNumberElement(targetElement, keyNumber);
      const numberId = `number-${keyNumber}`;
      this.activeHighlights.set(numberId, numberElement);

      // Add click handler to number
      numberElement.addEventListener('click', () => {
        this.executeAction(target);
      });

      document.body.appendChild(highlight);
      document.body.appendChild(numberElement);
    });

    // Set up keyboard listener
    this.setupKeyboardHandler(targets);
    
    // Auto-clear after 30 seconds
    setTimeout(() => this.clearHighlights(), 30000);
  }

  public showTaskGuidance(target: HighlightTarget): void {
    // Clear existing highlights (both types)
    this.clearHighlights();
    
    const targetElement = document.querySelector(target.selector) as HTMLElement;
    if (!targetElement) return;

    // Create task guidance highlight
    const highlight = this.createHighlightElement(targetElement, 'task-guidance');
    const highlightId = 'task-guidance';
    this.activeHighlights.set(highlightId, highlight);

    // Create task info overlay
    const taskInfo = this.createTaskInfoElement(targetElement, target.taskData);
    const taskInfoId = 'task-info';
    this.activeHighlights.set(taskInfoId, taskInfo);

    // Add click handler to target element
    const clickHandler = () => {
      this.executeAction(target);
    };
    
    targetElement.addEventListener('click', clickHandler, { once: true });

    document.body.appendChild(highlight);
    document.body.appendChild(taskInfo);

    // Set up ESC key to clear guidance
    this.setupTaskKeyboardHandler();

    // Auto-clear after 60 seconds (tasks are longer-lived)
    setTimeout(() => this.clearHighlights(), 60000);
  }

  private createHighlightElement(targetElement: HTMLElement, type: string): HTMLElement {
    const highlight = document.createElement('div');
    highlight.className = `synapse-unified-highlight ${type}`;
    
    const rect = targetElement.getBoundingClientRect();
    highlight.style.top = `${rect.top - 4}px`;
    highlight.style.left = `${rect.left - 4}px`;
    highlight.style.width = `${rect.width + 8}px`;
    highlight.style.height = `${rect.height + 8}px`;
    
    return highlight;
  }

  private createNumberElement(targetElement: HTMLElement, keyNumber: number): HTMLElement {
    const numberElement = document.createElement('div');
    numberElement.className = 'synapse-focus-number';
    numberElement.textContent = keyNumber.toString();
    
    const rect = targetElement.getBoundingClientRect();
    numberElement.style.top = `${rect.top - 15}px`;
    numberElement.style.left = `${rect.right - 15}px`;
    
    return numberElement;
  }

  private createTaskInfoElement(targetElement: HTMLElement, taskData: any): HTMLElement {
    const taskInfo = document.createElement('div');
    taskInfo.className = 'synapse-task-info';
    
    const progressPercent = taskData ? ((taskData.currentStep + 1) / taskData.totalSteps) * 100 : 0;
    const stepText = taskData ? `Step ${taskData.currentStep + 2}/${taskData.totalSteps}` : 'Task Guidance';
    const actionText = taskData?.nextStep?.action || 'Click to continue';
    
    taskInfo.innerHTML = `
      <button class="synapse-task-exit-btn" title="Exit current task">×</button>
      <div class="synapse-task-progress">
        <div class="synapse-progress-bar">
          <div class="synapse-progress-fill" style="width: ${progressPercent}%"></div>
        </div>
        <span>${stepText}</span>
      </div>
      <div>${actionText}</div>
    `;
    
    // Add exit button click handler
    const exitBtn = taskInfo.querySelector('.synapse-task-exit-btn') as HTMLButtonElement;
    if (exitBtn) {
      exitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.exitCurrentTask();
      });
    }
    
    const rect = targetElement.getBoundingClientRect();
    taskInfo.style.top = `${rect.top - 60}px`;
    taskInfo.style.left = `${rect.left}px`;
    
    return taskInfo;
  }

  private setupKeyboardHandler(targets: HighlightTarget[]): void {
    this.keyboardHandler = (event: KeyboardEvent) => {
      const key = event.key;
      if (/^[1-9]$/.test(key)) {
        const index = parseInt(key) - 1;
        if (index < targets.length) {
          event.preventDefault();
          this.executeAction(targets[index]);
        }
      } else if (key === 'Escape') {
        event.preventDefault();
        this.clearHighlights();
      }
    };
    
    document.addEventListener('keydown', this.keyboardHandler, true);
  }

  private setupTaskKeyboardHandler(): void {
    this.keyboardHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.clearHighlights();
      }
    };
    
    document.addEventListener('keydown', this.keyboardHandler, true);
  }

  private async executeAction(target: HighlightTarget): Promise<void> {
    try {
      const targetElement = document.querySelector(target.selector) as HTMLElement;
      if (!targetElement) return;
      
      // Clear highlights first
      this.clearHighlights();
      
      // Execute the action based on type
      const action = target.action;
      if (action) {
        switch (action.type) {
          case 'click':
            targetElement.click();
            break;
          case 'text_input':
            if (action.value && targetElement instanceof HTMLInputElement) {
              targetElement.focus();
              targetElement.value = action.value;
              targetElement.dispatchEvent(new Event('input', { bubbles: true }));
            }
            break;
          case 'scroll':
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            break;
          default:
            targetElement.click();
            break;
        }
      } else {
        // Default action is click
        targetElement.click();
      }
      
      // Send feedback
      this.sendFeedback(target);
      
    } catch (error) {
      console.error('[UnifiedHighlightSystem] Failed to execute action:', error);
    }
  }

  private sendFeedback(target: HighlightTarget): void {
    // Send feedback to background script
    if (typeof browser !== 'undefined' && browser.runtime) {
      browser.runtime.sendMessage({
        type: 'HIGHLIGHT_ACTION_EXECUTED',
        data: {
          type: target.type,
          selector: target.selector,
          keyNumber: target.keyNumber,
          timestamp: Date.now()
        }
      });
    }
  }

  private exitCurrentTask(): void {
    // Clear highlights
    this.clearHighlights();
    
    // Send exit task message to background
    if (typeof browser !== 'undefined' && browser.runtime) {
      browser.runtime.sendMessage({
        type: 'EXIT_CURRENT_TASK',
        data: { source: 'user_exit_button' }
      });
    }
  }

  public clearHighlights(): void {
    // Remove all highlight elements
    this.activeHighlights.forEach(element => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    this.activeHighlights.clear();
    
    // Remove keyboard handler
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler, true);
      this.keyboardHandler = null;
    }
  }

  public hasActiveHighlights(): boolean {
    return this.activeHighlights.size > 0;
  }

  public getActiveHighlightType(): 'intelligent_focus' | 'task_guidance' | null {
    for (const [, element] of this.activeHighlights) {
      if (element.classList.contains('intelligent-focus')) {
        return 'intelligent_focus';
      }
      if (element.classList.contains('task-guidance')) {
        return 'task_guidance';
      }
    }
    return null;
  }

  public destroy(): void {
    this.clearHighlights();
    
    const style = document.getElementById('synapse-unified-highlight-styles');
    if (style) {
      style.remove();
    }
  }
}