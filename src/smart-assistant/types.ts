/**
 * Types for Smart Assistant
 */

export interface OperationSuggestion {
  id: string;
  title: string;
  description: string;
  confidence: number;
  actions: SuggestedAction[];
  learnedFrom: string;
  frequency: number;
}

export interface SuggestedAction {
  type: 'click' | 'keydown' | 'text_input' | 'scroll';
  target?: string;
  value?: string;
  sequence?: number;
  isPrivacySafe?: boolean;
}

export interface AutofillSuggestion {
  id: string;
  value: string;
  targets: string[];
  description: string;
  confidence: number;
  isPrivacySafe: boolean;
}

export interface SubtleHint {
  id: string;
  target: string;
  type: 'glow' | 'icon' | 'pulse';
  confidence: number;
  description: string;
}

export interface AssistantState {
  isVisible: boolean;
  isEnabled: boolean;
  currentSuggestion: OperationSuggestion | null;
  executionState: 'idle' | 'executing' | 'completed' | 'failed';
  executedActions: SuggestedAction[];
  userFeedback: UserFeedback | null;
  uiMode: 'high_confidence' | 'medium_confidence' | 'autofill' | 'subtle_hint';
  pendingAutofill: AutofillSuggestion | null;
  subtleHints: SubtleHint[];
  lastRecommendationTime: number;
}

export interface UserFeedback {
  type: 'accept' | 'reject' | 'modify';
  rating?: number;
  comment?: string;
  actualActions?: any[];
  confirmationRequired?: boolean;
  rollbackAvailable?: boolean;
}