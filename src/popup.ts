import { EnrichedEvent, GlobalActionSequence } from './types';

class PopupController {
  private sequence: GlobalActionSequence = [];

  constructor() {
    this.loadSequence();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
    const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;

    clearBtn.addEventListener('click', () => {
      this.clearSequence();
    });

    refreshBtn.addEventListener('click', () => {
      this.loadSequence();
    });
  }

  private clearSequence(): void {
    chrome.runtime.sendMessage({ type: 'clearSequence' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to clear sequence:', chrome.runtime.lastError.message);
        return;
      }
      if (response && response.success) {
        this.sequence = [];
        this.updateSequenceDisplay();
        console.log('Sequence cleared and UI updated.');
      }
    });
  }

  private loadSequence(): void {
    chrome.runtime.sendMessage({ type: 'getSequence' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to load sequence:', chrome.runtime.lastError.message);
        return;
      }
      if (response && response.sequence) {
        this.sequence = response.sequence;
        this.updateSequenceDisplay();
      }
    });
  }

  private updateSequenceDisplay(): void {
    const eventCount = document.getElementById('eventCount')!;
    const eventList = document.getElementById('eventList')!;

    eventCount.textContent = this.sequence.length.toString();

    if (this.sequence.length === 0) {
      eventList.innerHTML = '<div class="empty-state">No events recorded yet. Start interacting with web pages.</div>';
    } else {
      // Display recent events (last 20)
      const recentEvents = this.sequence.slice(-20).reverse();
      eventList.innerHTML = recentEvents.map(event => this.createEventItemHtml(event)).join('');
    }
  }

  private createEventItemHtml(event: EnrichedEvent): string {
    let details = '';
    switch(event.type) {
      case 'user_action_click':
        details = `Clicked <code>${event.payload.selector}</code>`;
        break;
      case 'user_action_keydown':
        details = `Pressed <code>${event.payload.key}</code>`;
        break;
      case 'browser_action_tab_activated':
        details = `Switched to tab <code>${event.payload.tabId}</code>`;
        break;
      case 'browser_action_tab_created':
        details = `Created tab <code>${event.payload.tabId}</code>`;
        break;
      case 'browser_action_tab_updated':
        details = `Tab <code>${event.payload.tabId}</code> navigated to new URL`;
        break;
      case 'browser_action_tab_removed':
        details = `Closed tab <code>${event.payload.tabId}</code>`;
        break;
      default:
        details = 'Unknown event';
    }

    return `
      <div class="event-item">
        <div class="event-info">
          <div class="event-type">${event.type.replace(/_/g, ' ')}</div>
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
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});