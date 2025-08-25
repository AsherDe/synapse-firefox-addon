import { SynapseEvent } from '../shared/types';

export class UIManager {
  private sequence: SynapseEvent[] = [];

  constructor() {
    // UI Manager handles visual updates only
  }

  public updateSequence(newSequence: SynapseEvent[]): void {
    this.sequence = newSequence;
    this.updateSequenceDisplay();
  }

  public updatePauseUI(isPaused: boolean): void {
    const toggleBtn = document.getElementById('toggleBtn') as HTMLButtonElement;
    const statusElement = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    const statusDot = statusElement?.querySelector('.status-dot');

    if (toggleBtn) {
      toggleBtn.textContent = isPaused ? 'Resume' : 'Pause';
      toggleBtn.className = isPaused ? 'btn btn-primary' : 'btn btn-secondary';
    }

    if (statusElement) {
      statusElement.className = isPaused ? 'status paused' : 'status capturing';
    }

    if (statusText) {
      statusText.textContent = isPaused ? 'Extension paused' : 'Capturing events...';
    }

    if (statusDot) {
      statusDot.className = isPaused ? 'status-dot paused' : 'status-dot';
    }
  }

  public updateGuidanceUI(enabled: boolean): void {
    const guidanceToggle = document.getElementById('guidanceToggle') as HTMLInputElement;
    if (guidanceToggle) {
      guidanceToggle.checked = enabled;
    }
  }

  public updatePredictionDisplay(prediction: any): void {
    const predictionElement = document.getElementById('predictionInfo');
    if (!predictionElement) return;

    if (!prediction || (prediction.suggestions && prediction.suggestions.length === 0)) {
      let message = 'No prediction available yet.';
      if (prediction?.reason === 'insufficient_context') {
        message = 'Not enough interaction context to make predictions.';
      } else if (prediction?.reason === 'low_confidence') {
        message = 'Prediction confidence too low to show suggestions.';
      } else if (prediction?.reason === 'no_input_sequence') {
        message = 'No recent interactions to analyze.';
      } else if (prediction?.reason === 'prediction_error') {
        message = 'Prediction model encountered an error.';
      }
      predictionElement.innerHTML = `<div class="empty-state">${message}</div>`;
      return;
    }

    // Handle successful predictions
    const suggestions = prediction.suggestions || [];
    const ts = prediction.timestamp || Date.now();
    const isRecent = (Date.now() - ts) < 30000;

    if (suggestions.length === 0) {
      predictionElement.innerHTML = '<div class="empty-state">No actionable suggestions available.</div>';
      return;
    }

    const topSuggestion = suggestions[0];
    const confidence = topSuggestion.confidence || 0;
    
    predictionElement.innerHTML = `
      <div class="prediction-item ${isRecent ? 'recent' : 'stale'}">
        <div class="prediction-header">
          <strong>Smart Focus Suggestion</strong>
          <span class="prediction-time">${this.formatTime(ts)}</span>
        </div>
        <div class="prediction-details">
          <div class="suggestion-title">${topSuggestion.title || 'Next action'}</div>
          <div class="confidence">Confidence: <span class="confidence-bar" style="width: ${confidence * 100}%">${(confidence * 100).toFixed(1)}%</span></div>
          ${suggestions.length > 1 ? `<div class="suggestion-count">+${suggestions.length - 1} more suggestions</div>` : ''}
        </div>
      </div>`;
  }

  public updateModelInfoDisplay(modelInfo: any, isReady: boolean): void {
    const modelElement = document.getElementById('modelInfo');
    if (!modelElement) return;

    if (!isReady) {
      modelElement.innerHTML = `
        <div class="model-status">
          <div class="status-indicator loading"></div>
          <span>Loading model information...</span>
        </div>
      `;
      return;
    }

    modelElement.innerHTML = `
      <div class="model-status">
        <div class="status-indicator ready"></div>
        <span>Model Ready</span>
      </div>
      <div class="model-details">
        <div class="model-param">Type: ${modelInfo.modelType || 'N/A'}</div>
        <div class="model-param">Version: ${modelInfo.version || 'N/A'}</div>
        <div class="model-param">Features: ${modelInfo.featuresCount || 'N/A'}</div>
      </div>
    `;
  }

  private updateSequenceDisplay(): void {
    const eventCount = document.getElementById('tokenCount')!;
    const eventList = document.getElementById('tokenList')!;

    eventCount.textContent = this.sequence.length.toString();

    if (this.sequence.length === 0) {
      eventList.innerHTML = '<div class="empty-state">No events recorded yet. Start interacting with web pages.</div>';
    } else {
      const recentEvents = this.sequence.slice(-20).reverse();
      eventList.innerHTML = recentEvents.map(event => this.createEventItemHtml(event)).join('');
    }
  }

  private createEventItemHtml(event: SynapseEvent): string {
    let details = '';
    const eventType = event.type;

    switch(eventType) {
      case 'ui.click':
        details = `Clicked <code>${event.payload.targetSelector || 'unknown'}</code>`;
        break;
      case 'ui.keydown':
        details = `Pressed <code>${event.payload.value || 'unknown'}</code>`;
        break;
      case 'ui.text_input':
        details = `Text input in <code>${event.payload.targetSelector || 'unknown'}</code> (${event.payload.features?.text_length || 0} chars)`;
        break;
      case 'user.scroll':
        details = `Scrolled ${event.payload.features?.scroll_direction || 'unknown'} to ${(event.payload.features?.scroll_percentage || 0).toFixed(1)}%`;
        break;
      case 'ui.mouse_pattern':
        details = `Mouse ${event.payload.features?.pattern_type || 'unknown'} pattern`;
        break;
      case 'form.submit':
        details = `Submitted form <code>${event.payload.targetSelector || 'unknown'}</code>`;
        break;
      case 'ui.focus_change':
        details = `Focus ${event.payload.features?.focus_type || 'unknown'}: <code>${event.payload.features?.to_selector || 'unknown'}</code>`;
        break;
      case 'browser.page_visibility':
        details = `Page visibility: ${event.payload.features?.visibility_state || 'unknown'}`;
        break;
      case 'ui.mouse_hover':
        details = `Hovered over <code>${event.payload.targetSelector || 'unknown'}</code> for ${event.payload.features?.hover_duration || 0}ms`;
        break;
      case 'ui.clipboard':
        details = `Clipboard ${event.payload.features?.operation || 'unknown'} (${event.payload.features?.text_length || 0} chars)`;
        break;
      case 'browser.tab.activated':
        details = `Switched to tab <code>${event.context.tabId || 'unknown'}</code>`;
        break;
      case 'browser.tab.created':
        details = `Created tab <code>${event.context.tabId || 'unknown'}</code>`;
        break;
      case 'browser.tab.updated':
        details = `Tab <code>${event.context.tabId || 'unknown'}</code> navigated to new URL`;
        break;
      case 'browser.tab.removed':
        details = `Closed tab <code>${event.context.tabId || 'unknown'}</code>`;
        break;
      default:
        details = 'Unknown event';
    }

    return `
      <div class="event-item">
        <div class="event-info">
          <div class="event-type">${event.type.replace(/[._]/g, ' ')}</div>
          <div class="event-details">${details}</div>
        </div>
        <div class="event-time">${this.formatTime(event.timestamp)}</div>
      </div>
    `;
  }

  private formatTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 1000) return 'just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  public showExportMessage(message: string, type: 'success' | 'error'): void {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
      ${type === 'success' 
        ? 'background: #e8f5e8; color: #2d5016; border: 1px solid #34a853;' 
        : 'background: #fce8e6; color: #d93025; border: 1px solid #ea4335;'
      }
    `;
    messageDiv.textContent = message;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(messageDiv);

    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    }, 3000);
  }
}