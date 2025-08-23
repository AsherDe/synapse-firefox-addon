import { UserFeedback, OperationSuggestion, SuggestedAction } from './types';
import { MessagingService } from './MessagingService';

/**
 * FeedbackCollector - Handles user feedback collection and submission
 */
export class FeedbackCollector {
  private messagingService: MessagingService;
  private currentFeedback: UserFeedback | null = null;

  constructor(messagingService: MessagingService) {
    this.messagingService = messagingService;
  }

  /**
   * Set user rating
   */
  public setRating(rating: number): void {
    if (!this.currentFeedback) {
      this.currentFeedback = { type: 'accept' };
    }
    this.currentFeedback.rating = rating;
  }

  /**
   * Set user comment
   */
  public setComment(comment: string): void {
    if (!this.currentFeedback) {
      this.currentFeedback = { type: 'accept' };
    }
    this.currentFeedback.comment = comment;
  }

  /**
   * Submit feedback
   */
  public async submitFeedback(
    suggestion: OperationSuggestion, 
    executedActions: SuggestedAction[], 
    uiMode: string
  ): Promise<void> {
    if (!this.currentFeedback) return;

    const enhancedFeedback = {
      ...this.currentFeedback,
      suggestionId: suggestion.id,
      uiMode: uiMode,
      executionSuccess: true,
      timestamp: Date.now()
    };
    
    await this.messagingService.sendToContentScript({
      type: 'feedbackSubmitted',
      data: {
        suggestion: suggestion,
        feedback: enhancedFeedback,
        executedActions: executedActions,
        timestamp: Date.now()
      }
    });
    
    this.currentFeedback = null;
  }

  /**
   * Collect rejection feedback
   */
  public async collectRejectionFeedback(suggestion: OperationSuggestion): Promise<void> {
    this.currentFeedback = { type: 'reject' };
    
    const reason = prompt('Quick feedback: Why didn\'t this suggestion help? (optional)');
    if (reason) {
      this.currentFeedback.comment = reason;
      await this.messagingService.sendToContentScript({
        type: 'feedbackSubmitted',
        data: {
          suggestion: suggestion,
          feedback: this.currentFeedback,
          timestamp: Date.now()
        }
      });
    }
    
    this.currentFeedback = null;
  }

  /**
   * Collect rollback feedback
   */
  public collectRollbackFeedback(): UserFeedback | null {
    const reason = prompt('What went wrong with the suggestion? This helps me improve:');
    if (reason) {
      return {
        type: 'reject',
        comment: `Rollback reason: ${reason}`,
        rating: 1
      };
    }
    return null;
  }

  /**
   * Record hint interaction
   */
  public async recordHintInteraction(hintId: string, executed: boolean): Promise<void> {
    await this.messagingService.sendToContentScript({
      type: 'hintInteraction',
      data: {
        hintId: hintId,
        executed: executed,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Record suggestion rejection
   */
  public async recordSuggestionRejection(suggestion: OperationSuggestion): Promise<void> {
    await this.messagingService.sendToContentScript({
      type: 'suggestionRejected',
      data: {
        suggestion: suggestion,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Get current feedback
   */
  public getCurrentFeedback(): UserFeedback | null {
    return this.currentFeedback;
  }
}