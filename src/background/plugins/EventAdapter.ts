/**
 * Event Adapter - Bridge between SynapseEvent and plugin expectations
 * Linus: "Adapters are ugly, but necessary for compatibility"
 */

import { SynapseEvent } from '../../shared/types';

export interface AdaptedEvent extends SynapseEvent {
  // Legacy compatibility fields
  target?: string;
  value?: string | number | boolean;
  url?: string;
  pageTitle?: string;
  targetType?: string;
  targetAttributes?: Record<string, string>;
  tabId?: number;
}

export function adaptSynapseEvent(event: SynapseEvent): AdaptedEvent {
  const adapted: AdaptedEvent = { ...event };
  
  // Map new structure to legacy fields for plugin compatibility
  adapted.target = event.payload.targetSelector;
  adapted.value = event.payload.value;
  adapted.url = event.context.url;
  adapted.pageTitle = event.context.title;
  adapted.tabId = event.context.tabId || undefined;
  
  // Extract additional metadata from features
  if (event.payload.features) {
    adapted.targetType = event.payload.features.elementType;
    adapted.targetAttributes = event.payload.features.attributes;
  }
  
  return adapted;
}