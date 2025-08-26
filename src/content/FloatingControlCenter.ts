/**
 * Floating Control Center for Synapse Extension
 * A draggable overlay providing quick access to plugin functionality
 */

declare var browser: any;

interface Position {
  x: number;
  y: number;
}

interface ControlCenterState {
  isVisible: boolean;
  isMinimized: boolean;
  position: Position;
  isDragging: boolean;
  confidence: number;
}

export class FloatingControlCenter {
  private container!: HTMLElement;
  private dragHandle!: HTMLElement;
  private contentPanel!: HTMLElement;
  private state: ControlCenterState;
  private dragOffset: Position = { x: 0, y: 0 };
  private readonly STORAGE_KEY = 'synapse-floating-control-center-state';

  constructor() {
    this.state = {
      isVisible: true,  // Ensure visible by default
      isMinimized: false,
      position: { x: window.innerWidth - 250, y: 50 },
      isDragging: false,
      confidence: 0
    };
    
    this.initializeDOM();
    this.loadState();
    this.attachEventListeners();
    this.setupMessageListener();
    this.ensureVisible();
  }

  private initializeDOM(): void {
    this.container = document.createElement('div');
    this.container.className = 'synapse-floating-control-center';
    
    this.dragHandle = document.createElement('div');
    this.dragHandle.className = 'synapse-drag-handle';
    this.dragHandle.innerHTML = `
      <div class="synapse-handle-icon">⚡</div>
      <div class="synapse-handle-title">Synapse</div>
      <div class="synapse-confidence-display">0%</div>
      <div class="synapse-toggle-btn" data-action="toggle">−</div>
    `;
    
    this.contentPanel = document.createElement('div');
    this.contentPanel.className = 'synapse-content-panel';
    this.contentPanel.innerHTML = `
      <div class="synapse-control-group">
        <button class="synapse-btn" data-action="smart-assistant">
          <span>🤖</span>
          <span>Assistant</span>
        </button>
        <button class="synapse-btn" data-action="toggle-task-guidance">
          <span>🧭</span>
          <span>Task Guide</span>
        </button>
      </div>
      <div class="synapse-control-group">
        <button class="synapse-btn" data-action="exit-task">
          <span>✋</span>
          <span>Exit Task</span>
        </button>
        <button class="synapse-btn synapse-btn-close" data-action="hide">
          <span>✕</span>
          <span>Hide</span>
        </button>
      </div>
    `;

    this.container.appendChild(this.dragHandle);
    this.container.appendChild(this.contentPanel);
    
    // Inject styles
    this.injectStyles();
    
    // Ensure DOM is ready and add to page
    this.addToPage();
    
    // Update visibility based on state
    this.updateVisibility();
  }

  private injectStyles(): void {
    const styleId = 'synapse-floating-control-center-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .synapse-floating-control-center {
        position: fixed;
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        z-index: 2147483647;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #37352f;
        user-select: none;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        max-width: 200px;
        min-width: 160px;
      }

      .synapse-drag-handle {
        padding: 12px 16px 10px;
        cursor: move;
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 16px 16px 0 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      }

      .synapse-handle-icon {
        font-size: 16px;
        filter: none;
      }

      .synapse-handle-title {
        font-weight: 600;
        color: #2d2d2d;
        font-size: 14px;
        letter-spacing: -0.2px;
      }

      .synapse-confidence-display {
        flex: 1;
        text-align: center;
        font-weight: 600;
        font-size: 11px;
        background: rgba(35, 131, 226, 0.2);
        color: #2383e2;
        border-radius: 12px;
        padding: 3px 8px;
        margin: 0 4px;
        min-width: 35px;
        transition: all 0.15s ease;
      }

      .synapse-confidence-display.high {
        background: #f0f9f0;
        color: #00b04f;
      }

      .synapse-confidence-display.medium {
        background: #fef8e7;
        color: #f39c12;
      }

      .synapse-confidence-display.low {
        background: #fdf2f0;
        color: #e74c3c;
      }

      .synapse-toggle-btn {
        width: 24px;
        height: 24px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #787774;
        font-weight: 600;
        font-size: 14px;
        transition: all 0.15s ease;
        background: rgba(247, 247, 245, 0.6);
        border: 1px solid rgba(233, 233, 231, 0.5);
      }

      .synapse-toggle-btn:hover {
        background: rgba(241, 241, 239, 0.8);
        border-color: rgba(211, 211, 209, 0.7);
        color: #37352f;
      }

      .synapse-content-panel {
        padding: 12px 16px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 0 0 16px 16px;
      }

      .synapse-content-panel.minimized {
        display: none;
      }

      .synapse-control-group {
        display: flex;
        gap: 6px;
      }

      .synapse-btn {
        flex: 1;
        padding: 10px 6px;
        border: 1px solid rgba(233, 233, 231, 0.4);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.6);
        color: #37352f;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 500;
        transition: all 0.15s ease;
        line-height: 1.1;
        backdrop-filter: blur(10px);
      }

      .synapse-btn:hover {
        background: rgba(255, 255, 255, 0.8);
        border-color: rgba(211, 211, 209, 0.6);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      }

      .synapse-btn span:first-child {
        font-size: 14px;
        line-height: 1;
      }

      .synapse-btn span:last-child {
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .synapse-btn-primary {
        background: rgba(35, 131, 226, 0.8);
        color: white;
        border-color: rgba(35, 131, 226, 0.6);
      }

      .synapse-btn-primary:hover {
        background: rgba(30, 115, 204, 0.9);
        border-color: rgba(30, 115, 204, 0.7);
      }

      .synapse-btn-success {
        background: rgba(240, 249, 240, 0.8);
        color: #00b04f;
        border-color: rgba(212, 230, 212, 0.6);
      }

      .synapse-btn-success:hover {
        background: rgba(232, 245, 232, 0.9);
        border-color: rgba(193, 217, 193, 0.7);
      }

      .synapse-btn-warning {
        background: rgba(254, 248, 231, 0.8);
        color: #f39c12;
        border-color: rgba(244, 228, 166, 0.6);
      }

      .synapse-btn-warning:hover {
        background: rgba(253, 242, 212, 0.9);
        border-color: rgba(240, 217, 142, 0.7);
      }

      .synapse-btn-close {
        background: rgba(253, 242, 240, 0.8);
        color: #e74c3c;
        border-color: rgba(244, 196, 196, 0.6);
      }

      .synapse-btn-close:hover {
        background: rgba(252, 232, 230, 0.9);
        border-color: rgba(241, 174, 174, 0.7);
      }


      .synapse-floating-control-center.dragging {
        transition: none;
        box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
      }

      .synapse-floating-control-center.hidden {
        opacity: 0;
        pointer-events: none;
        transform: scale(0.9) translateY(-8px);
      }

      /* Status indicator animations */
      @keyframes pulse-dot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(1.1); }
      }

      .synapse-status-active::before {
        content: "";
        position: absolute;
        top: 4px;
        right: 4px;
        width: 8px;
        height: 8px;
        background: #00b04f;
        border-radius: 50%;
        animation: pulse-dot 2s infinite;
      }

      .synapse-status-paused::before {
        content: "";
        position: absolute;
        top: 4px;
        right: 4px;
        width: 8px;
        height: 8px;
        background: #e74c3c;
        border-radius: 50%;
        animation: pulse-dot 2s infinite;
      }

      /* Responsive adjustments */
      @media (max-width: 768px) {
        .synapse-floating-control-center {
          max-width: calc(100vw - 32px);
          min-width: 200px;
        }
        
        .synapse-drag-handle {
          padding: 12px 16px 8px;
        }
        
        .synapse-content-panel {
          padding: 12px 16px 16px;
        }
        
        .synapse-btn {
          font-size: 11px;
          padding: 10px 6px;
        }

        .synapse-btn span:first-child {
          font-size: 14px;
        }
      }
    `;
    
    document.head.appendChild(style);
  }

  private attachEventListeners(): void {
    // Drag functionality
    this.dragHandle.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));

    // Button actions
    this.container.addEventListener('click', this.handleButtonClick.bind(this));

    // Keyboard shortcuts
    document.addEventListener('keydown', this.handleKeydown.bind(this));

    // Save state on page unload
    window.addEventListener('beforeunload', this.saveState.bind(this));
  }

  private handleMouseDown(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('.synapse-toggle-btn')) return;
    
    this.state.isDragging = true;
    this.container.classList.add('dragging');
    
    const rect = this.container.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    e.preventDefault();
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.state.isDragging) return;
    
    const newX = Math.max(0, Math.min(window.innerWidth - this.container.offsetWidth, e.clientX - this.dragOffset.x));
    const newY = Math.max(0, Math.min(window.innerHeight - this.container.offsetHeight, e.clientY - this.dragOffset.y));
    
    this.state.position = { x: newX, y: newY };
    this.updatePosition();
  }

  private handleMouseUp(): void {
    if (this.state.isDragging) {
      this.state.isDragging = false;
      this.container.classList.remove('dragging');
      this.saveState();
    }
  }

  private handleButtonClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const button = target.closest('[data-action]') as HTMLElement;
    if (!button) return;

    const action = button.dataset.action;
    e.preventDefault();
    e.stopPropagation();

    switch (action) {
      case 'toggle':
        this.toggleMinimize();
        break;
      case 'hide':
        this.hide();
        break;
      case 'smart-assistant':
        this.sendMessage('TOGGLE_SMART_ASSISTANT');
        break;
      case 'toggle-task-guidance':
        this.sendMessage('TOGGLE_TASK_GUIDANCE');
        break;
      case 'exit-task':
        this.sendMessage('EXIT_CURRENT_TASK');
        break;
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    // Ctrl+Shift+S to toggle visibility
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyS') {
      e.preventDefault();
      this.toggle();
    }
  }

  private sendMessage(type: string, data?: any): void {
    // Use existing messaging system
    if (typeof browser !== 'undefined' && browser.runtime) {
      browser.runtime.sendMessage({
        type: `FLOATING_CONTROL_${type}`,
        data
      });
    }
  }

  private updatePosition(): void {
    this.container.style.left = `${this.state.position.x}px`;
    this.container.style.top = `${this.state.position.y}px`;
  }

  private addToPage(): void {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.appendToBody();
      });
    } else {
      this.appendToBody();
    }
  }

  private appendToBody(): void {
    if (document.body && !document.body.contains(this.container)) {
      document.body.appendChild(this.container);
      this.updatePosition();
    }
  }

  private ensureVisible(): void {
    // Force visibility on startup
    if (this.state.isVisible) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        this.appendToBody();
        this.updateVisibility();
      }, 100);
    }
  }

  private updateVisibility(): void {
    this.container.classList.toggle('hidden', !this.state.isVisible);
    this.contentPanel.classList.toggle('minimized', this.state.isMinimized);
    
    const toggleBtn = this.container.querySelector('.synapse-toggle-btn');
    if (toggleBtn) {
      toggleBtn.textContent = this.state.isMinimized ? '+' : '−';
    }
  }

  private toggleMinimize(): void {
    this.state.isMinimized = !this.state.isMinimized;
    this.updateVisibility();
    this.saveState();
  }

  public show(): void {
    this.state.isVisible = true;
    this.appendToBody();
    this.updatePosition();
    this.updateVisibility();
    this.saveState();
  }

  public hide(): void {
    this.state.isVisible = false;
    this.updateVisibility();
    this.saveState();
  }

  public toggle(): void {
    if (this.state.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  private loadState(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const savedState = JSON.parse(saved);
        this.state = { ...this.state, ...savedState };
        
        // Ensure position is within bounds
        this.state.position.x = Math.max(0, Math.min(window.innerWidth - 200, this.state.position.x));
        this.state.position.y = Math.max(0, Math.min(window.innerHeight - 100, this.state.position.y));
      }
    } catch (e) {
      console.warn('[Synapse] Failed to load floating control center state:', e);
    }
  }

  private saveState(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[Synapse] Failed to save floating control center state:', e);
    }
  }

  private setupMessageListener(): void {
    // Listen for messages from background script
    if (typeof browser !== 'undefined' && browser.runtime) {
      browser.runtime.onMessage.addListener((message: any) => {
        switch (message.type) {
          case 'ASSISTANT_STATE_CHANGED':
            this.updateAssistantButton(message.data.enabled);
            break;
          case 'PREDICTION_UPDATE':
            this.updateConfidence(message.data.confidence || 0);
            break;
          case 'TASK_GUIDANCE_STATE_CHANGED':
            this.updateTaskGuidanceButton(message.data.enabled);
            break;
        }
      });
    }
  }


  private updateAssistantButton(enabled: boolean): void {
    const button = this.container.querySelector('[data-action="smart-assistant"]') as HTMLElement;
    if (button) {
      // Remove existing status classes
      button.classList.remove('synapse-btn-primary', 'synapse-btn-secondary');
      
      if (enabled) {
        button.classList.add('synapse-btn-primary');
      } else {
        // Keep default style for disabled state
      }
      
      const span = button.querySelector('span:last-child');
      if (span) {
        span.textContent = enabled ? 'Enabled' : 'Disabled';
      }
    }
  }

  private updateConfidence(confidence: number): void {
    this.state.confidence = Math.max(0, Math.min(100, confidence));
    
    const confidenceDisplay = this.container.querySelector('.synapse-confidence-display') as HTMLElement;
    if (confidenceDisplay) {
      confidenceDisplay.textContent = `${Math.round(this.state.confidence)}%`;
      
      // Remove existing confidence classes
      confidenceDisplay.classList.remove('high', 'medium', 'low');
      
      // Add appropriate class based on confidence level
      if (this.state.confidence >= 70) {
        confidenceDisplay.classList.add('high');
      } else if (this.state.confidence >= 40) {
        confidenceDisplay.classList.add('medium');
      } else {
        confidenceDisplay.classList.add('low');
      }
    }
    
    this.saveState();
  }


  private updateTaskGuidanceButton(enabled: boolean): void {
    const button = this.container.querySelector('[data-action="toggle-task-guidance"]') as HTMLElement;
    if (button) {
      // Remove existing status classes
      button.classList.remove('synapse-btn-primary', 'synapse-btn-secondary');
      
      if (enabled) {
        button.classList.add('synapse-btn-primary');
      } else {
        // Keep default style for disabled state
      }
      
      const span = button.querySelector('span:last-child');
      if (span) {
        span.textContent = enabled ? 'Enabled' : 'Disabled';
      }
    }
  }

  public destroy(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    const style = document.getElementById('synapse-floating-control-center-styles');
    if (style) {
      style.remove();
    }
  }
}