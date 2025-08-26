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
      isVisible: true,
      isMinimized: false,
      position: { x: window.innerWidth - 250, y: 50 },
      isDragging: false,
      confidence: 0
    };
    
    this.initializeDOM();
    this.loadState();
    this.attachEventListeners();
    this.setupMessageListener();
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
        <button class="synapse-btn" data-action="toggle-monitoring">
          <span>📊</span>
          <span>Monitoring</span>
        </button>
        <button class="synapse-btn" data-action="export-data">
          <span>📤</span>
          <span>Export</span>
        </button>
      </div>
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
        <button class="synapse-btn" data-action="debug-tools">
          <span>🔧</span>
          <span>Debug</span>
        </button>
        <button class="synapse-btn" data-action="exit-task">
          <span>✋</span>
          <span>Exit Task</span>
        </button>
      </div>
      <div class="synapse-log-panel">
        <div class="synapse-log-header">
          <span>System Log</span>
          <button class="synapse-log-clear" data-action="clear-log">Clear</button>
        </div>
        <div class="synapse-log-content" id="synapse-log-content"></div>
      </div>
      <div class="synapse-control-group">
        <button class="synapse-btn" data-action="settings">
          <span>⚙️</span>
          <span>Settings</span>
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
    
    // Initially hidden
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
        background: #ffffff;
        border-radius: 12px;
        border: 1px solid #e9e9e7;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
        z-index: 2147483647;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #37352f;
        user-select: none;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        max-width: 280px;
        min-width: 240px;
      }

      .synapse-drag-handle {
        padding: 16px 20px 12px;
        cursor: move;
        display: flex;
        align-items: center;
        gap: 12px;
        background: #ffffff;
        border-radius: 12px 12px 0 0;
        border-bottom: 1px solid #f1f1ef;
      }

      .synapse-handle-icon {
        font-size: 18px;
        filter: none;
      }

      .synapse-handle-title {
        font-weight: 700;
        color: #2d2d2d;
        font-size: 16px;
        letter-spacing: -0.3px;
      }

      .synapse-confidence-display {
        flex: 1;
        text-align: center;
        font-weight: 600;
        font-size: 13px;
        background: #e6f3ff;
        color: #2383e2;
        border-radius: 20px;
        padding: 4px 12px;
        margin: 0 8px;
        min-width: 45px;
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
        width: 28px;
        height: 28px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #787774;
        font-weight: 600;
        font-size: 16px;
        transition: all 0.15s ease;
        background: #f7f7f5;
        border: 1px solid #e9e9e7;
      }

      .synapse-toggle-btn:hover {
        background: #f1f1ef;
        border-color: #d3d3d1;
        color: #37352f;
      }

      .synapse-content-panel {
        padding: 16px 20px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #ffffff;
        border-radius: 0 0 12px 12px;
      }

      .synapse-content-panel.minimized {
        display: none;
      }

      .synapse-control-group {
        display: flex;
        gap: 8px;
      }

      .synapse-btn {
        flex: 1;
        padding: 12px 8px;
        border: 1px solid #e9e9e7;
        border-radius: 8px;
        background: #ffffff;
        color: #37352f;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.15s ease;
        line-height: 1.2;
      }

      .synapse-btn:hover {
        background: #f7f7f5;
        border-color: #d3d3d1;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      }

      .synapse-btn span:first-child {
        font-size: 16px;
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
        background: #2383e2;
        color: white;
        border-color: #2383e2;
      }

      .synapse-btn-primary:hover {
        background: #1e73cc;
        border-color: #1e73cc;
      }

      .synapse-btn-success {
        background: #f0f9f0;
        color: #00b04f;
        border-color: #d4e6d4;
      }

      .synapse-btn-success:hover {
        background: #e8f5e8;
        border-color: #c1d9c1;
      }

      .synapse-btn-warning {
        background: #fef8e7;
        color: #f39c12;
        border-color: #f4e4a6;
      }

      .synapse-btn-warning:hover {
        background: #fdf2d4;
        border-color: #f0d98e;
      }

      .synapse-btn-close {
        background: #fdf2f0;
        color: #e74c3c;
        border-color: #f4c4c4;
      }

      .synapse-btn-close:hover {
        background: #fce8e6;
        border-color: #f1aeae;
      }

      .synapse-log-panel {
        margin-top: 12px;
        border-top: 1px solid #f1f1ef;
        padding-top: 12px;
      }

      .synapse-log-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        font-weight: 600;
        color: #787774;
        margin-bottom: 8px;
      }

      .synapse-log-clear {
        background: none;
        border: none;
        color: #e74c3c;
        cursor: pointer;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        transition: background 0.15s ease;
      }

      .synapse-log-clear:hover {
        background: #fdf2f0;
      }

      .synapse-log-content {
        background: #f9f9f9;
        border-radius: 6px;
        padding: 8px;
        max-height: 120px;
        overflow-y: auto;
        font-size: 11px;
        font-family: 'Monaco', 'Courier New', monospace;
        line-height: 1.4;
      }

      .synapse-log-entry {
        margin-bottom: 4px;
        padding: 2px 0;
      }

      .synapse-log-entry.error {
        color: #e74c3c;
      }

      .synapse-log-entry.success {
        color: #00b04f;
      }

      .synapse-log-entry.info {
        color: #2383e2;
      }

      .synapse-log-entry.warning {
        color: #f39c12;
      }

      .synapse-log-timestamp {
        color: #999;
        font-size: 10px;
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
      case 'toggle-monitoring':
        this.sendMessage('TOGGLE_MONITORING');
        break;
      case 'export-data':
        this.sendMessage('EXPORT_DATA');
        break;
      case 'smart-assistant':
        this.sendMessage('TOGGLE_SMART_ASSISTANT');
        break;
      case 'debug-tools':
        this.sendMessage('OPEN_DEBUG_TOOLS');
        break;
      case 'settings':
        this.sendMessage('OPEN_SETTINGS');
        break;
      case 'clear-log':
        this.clearLog();
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
    if (!this.state.isVisible) {
      this.state.isVisible = true;
      if (!document.body.contains(this.container)) {
        document.body.appendChild(this.container);
      }
      this.updatePosition();
      this.updateVisibility();
      this.saveState();
    }
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
          case 'MONITORING_STATE_CHANGED':
            this.updateMonitoringButton(message.data.monitoring);
            break;
          case 'ASSISTANT_STATE_CHANGED':
            this.updateAssistantButton(message.data.enabled);
            break;
          case 'SHOW_NOTIFICATION':
            this.showNotification(message.data.message, message.data.type);
            break;
          case 'PREDICTION_UPDATE':
            this.updateConfidence(message.data.confidence || 0);
            break;
          case 'LOG_ENTRY':
            this.addLogEntry(message.data.level || 'info', message.data.message || 'Unknown event');
            break;
          case 'TASK_GUIDANCE_STATE_CHANGED':
            this.updateTaskGuidanceButton(message.data.enabled);
            break;
        }
      });
    }
  }

  private updateMonitoringButton(monitoring: boolean): void {
    const button = this.container.querySelector('[data-action="toggle-monitoring"]') as HTMLElement;
    if (button) {
      // Remove existing status classes
      button.classList.remove('synapse-btn-success', 'synapse-btn-warning', 'synapse-status-active', 'synapse-status-paused');
      
      if (monitoring) {
        button.classList.add('synapse-btn-success', 'synapse-status-active');
      } else {
        button.classList.add('synapse-btn-warning', 'synapse-status-paused');
      }
      
      const span = button.querySelector('span:last-child');
      if (span) {
        span.textContent = monitoring ? 'Active' : 'Paused';
      }
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

  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    // Create temporary notification
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      z-index: 2147483648;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      transform: translateX(100%);
      transition: transform 0.3s ease;
    `;

    document.body.appendChild(notification);

    // Animate in
    requestAnimationFrame(() => {
      notification.style.transform = 'translateX(0)';
    });

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  private clearLog(): void {
    const logContent = document.getElementById('synapse-log-content');
    if (logContent) {
      logContent.innerHTML = '';
    }
  }

  private addLogEntry(level: 'info' | 'warning' | 'error' | 'success', message: string): void {
    const logContent = document.getElementById('synapse-log-content');
    if (!logContent) return;

    const timestamp = new Date().toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const entry = document.createElement('div');
    entry.className = `synapse-log-entry ${level}`;
    entry.innerHTML = `
      <span class="synapse-log-timestamp">${timestamp}</span>
      ${message}
    `;

    logContent.appendChild(entry);
    
    // Auto-scroll to bottom
    logContent.scrollTop = logContent.scrollHeight;
    
    // Keep only the last 50 entries to avoid memory issues
    const entries = logContent.querySelectorAll('.synapse-log-entry');
    if (entries.length > 50) {
      entries[0].remove();
    }
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