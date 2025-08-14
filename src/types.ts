/**
 * This file contains the shared type definitions for the Synapse extension.
 * These types are used for communication between content scripts, the background script,
 * and the popup UI.
 */

// The core structure for any event message sent from a content script
export interface RawUserAction {
  type: 'user_action_click' | 'user_action_keydown';
  payload: UserActionClickPayload | UserActionKeydownPayload;
}

export interface UserActionClickPayload {
  selector: string;
  x: number;
  y: number;
  url: string;
}

export interface UserActionKeydownPayload {
  key: string;
  code: string;
  url: string;
}

// The core structure for any browser-level event captured by the background script
export interface BrowserAction {
  type: 'browser_action_tab_created' | 'browser_action_tab_activated' | 'browser_action_tab_updated' | 'browser_action_tab_removed';
  payload: TabCreatedPayload | TabActivatedPayload | TabUpdatedPayload | TabRemovedPayload;
}

export interface TabCreatedPayload {
  tabId: number;
  windowId: number;
  url?: string;
}

export interface TabActivatedPayload {
  tabId: number;
  windowId: number;
}

export interface TabUpdatedPayload {
  tabId: number;
  url: string;
  title?: string;
}

export interface TabRemovedPayload {
  tabId: number;
  windowId: number;
}


// The final, enriched event structure that is stored in the global sequence.
// This is a discriminated union based on the `type` property.

export interface EventContext {
  tabId: number | null;
  windowId: number | null;
  tabInfo?: chrome.tabs.Tab; // Contains URL, title, etc. at the time of the event
}

interface BaseEvent {
  timestamp: number;
  context: EventContext;
}

// Define each event type as a distinct object in the union
export type UserActionClickEvent = BaseEvent & {
  type: 'user_action_click';
  payload: UserActionClickPayload;
};

export type UserActionKeydownEvent = BaseEvent & {
  type: 'user_action_keydown';
  payload: UserActionKeydownPayload;
};

export type BrowserActionTabCreatedEvent = BaseEvent & {
  type: 'browser_action_tab_created';
  payload: TabCreatedPayload;
};

export type BrowserActionTabActivatedEvent = BaseEvent & {
  type: 'browser_action_tab_activated';
  payload: TabActivatedPayload;
};

export type BrowserActionTabUpdatedEvent = BaseEvent & {
  type: 'browser_action_tab_updated';
  payload: TabUpdatedPayload;
};

export type BrowserActionTabRemovedEvent = BaseEvent & {
  type: 'browser_action_tab_removed';
  payload: TabRemovedPayload;
};

// The EnrichedEvent is a union of all possible specific event types
export type EnrichedEvent =
  | UserActionClickEvent
  | UserActionKeydownEvent
  | BrowserActionTabCreatedEvent
  | BrowserActionTabActivatedEvent
  | BrowserActionTabUpdatedEvent
  | BrowserActionTabRemovedEvent;

// Type for the global sequence stored in chrome.storage.session
export type GlobalActionSequence = EnrichedEvent[];
