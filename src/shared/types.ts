/**
 * Shared type definitions for the Synapse extension.
 * Licensed under the Apache License, Version 2.0
 */

// =================================================================================
// UNIFIED EVENT STRUCTURE - One interface to rule them all
// =================================================================================

/**
 * The only event structure you need. Stop creating dozens of variants.
 * 
 * Every user interaction, browser action, and internal event gets normalized
 * into this single, clean structure. Content scripts do the dirty work of
 * feature extraction; everything else just deals with this.
 */
export interface SynapseEvent {
  timestamp: number;
  
  // Use namespaced types instead of union type madness
  // Examples: 'ui.click', 'browser.tab.created', 'user.scroll', 'form.submit'
  type: string; 

  // All contextual information goes here - standardized
  context: {
    tabId: number | null;
    windowId: number | null;
    url: string; // Normalized URL
    title: string;
  };

  // All event payload should fit into this structure
  payload: {
    targetSelector?: string; // CSS selector for the target element
    value?: string | number | boolean; // Key pressed, input length, etc.
    position?: { x: number, y: number }; // Coordinates when relevant
    
    // The universal feature "grab bag" - everything that can't be standardized goes here
    // ML worker only cares about this field
    features: Record<string, any>; 
  };
}

// =================================================================================
// LEGACY SKILL TYPES - Keep these for now until ML pipeline is updated
// =================================================================================

/**
 * Action skill representation for the ML model.
 * Extended to support task path sequences.
 */
export interface ActionSkill {
  id: string;
  name: string;
  description: string;
  token_sequence: number[];
  frequency: number;
  confidence: number;
  
  // Task path guidance extensions
  sequence_length?: number;
  steps?: TaskStep[];
  is_task_sequence?: boolean;
}

/**
 * Individual step in a task sequence
 */
export interface TaskStep {
  selector: string;
  action: string;
  step_number: number;
  confidence: number;
}

/**
 * Task execution state for tracking user progress
 */
export interface TaskState {
  taskId: string;
  taskName: string;
  currentStep: number;
  totalSteps: number;
  steps: TaskStep[];
  startedAt: number;
  lastActionAt: number;
  isActive: boolean;
}
