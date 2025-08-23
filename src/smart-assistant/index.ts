/**
 * Smart Assistant Component - Entry Point
 * 
 * Provides intelligent operation suggestions based on learned user patterns
 * Licensed under the Apache License, Version 2.0
 */

import { SmartAssistant } from './SmartAssistant';

// Initialize smart assistant
if (typeof window !== 'undefined') {
  (window as any).synapseAssistant = new SmartAssistant();
}