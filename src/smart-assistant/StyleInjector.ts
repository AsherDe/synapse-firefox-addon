/**
 * StyleInjector - Handles all CSS styles for smart assistant UI
 */

export class StyleInjector {
  private static instance: StyleInjector;
  private isInjected: boolean = false;

  constructor() {
    if (StyleInjector.instance) {
      return StyleInjector.instance;
    }
    StyleInjector.instance = this;
  }

  public injectStyles(): void {
    if (this.isInjected) return;

    const styleElement = document.createElement('style');
    styleElement.textContent = this.getStyleContent();
    document.head.appendChild(styleElement);
    this.isInjected = true;
  }

  private getStyleContent(): string {
    return `
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
    `;
  }
}
