/**
 * This file contains the shared type definitions for the Synapse extension.
 * These types are used for communication between content scripts, the background script,
 * and the popup UI.
 * 
 * Licensed under the Apache License, Version 2.0
 */

// The core structure for any event message sent from a content script
interface RawUserAction {
  type: 'user_action_click' | 'user_action_keydown';
  payload: UserActionClickPayload | UserActionKeydownPayload;
}

interface UserActionClickPayload {
  selector: string;
  x: number;
  y: number;
  url: string;
}

interface UserActionKeydownPayload {
  key: string;
  code: string;
  url: string;
}

// The core structure for any browser-level event captured by the background script
interface BrowserAction {
  type: 'browser_action_tab_created' | 'browser_action_tab_activated' | 'browser_action_tab_updated' | 'browser_action_tab_removed';
  payload: TabCreatedPayload | TabActivatedPayload | TabUpdatedPayload | TabRemovedPayload;
}

interface TabCreatedPayload {
  tabId: number;
  windowId: number;
  url?: string;
}

interface TabActivatedPayload {
  tabId: number;
  windowId: number;
}

interface TabUpdatedPayload {
  tabId: number;
  url: string;
  title?: string;
}

interface TabRemovedPayload {
  tabId: number;
  windowId: number;
}

// The final, enriched event structure that is stored in the global sequence.
// This is a discriminated union based on the `type` property.

interface EventContext {
  tabId: number | null;
  windowId: number | null;
  tabInfo?: chrome.tabs.Tab; // Contains URL, title, etc. at the time of the event
}

interface BaseEvent {
  timestamp: number;
  context: EventContext;
}

// Define each event type as a distinct object in the union
type UserActionClickEvent = BaseEvent & {
  type: 'user_action_click';
  payload: UserActionClickPayload;
};

type UserActionKeydownEvent = BaseEvent & {
  type: 'user_action_keydown';
  payload: UserActionKeydownPayload;
};

type BrowserActionTabCreatedEvent = BaseEvent & {
  type: 'browser_action_tab_created';
  payload: TabCreatedPayload;
};

type BrowserActionTabActivatedEvent = BaseEvent & {
  type: 'browser_action_tab_activated';
  payload: TabActivatedPayload;
};

type BrowserActionTabUpdatedEvent = BaseEvent & {
  type: 'browser_action_tab_updated';
  payload: TabUpdatedPayload;
};

type BrowserActionTabRemovedEvent = BaseEvent & {
  type: 'browser_action_tab_removed';
  payload: TabRemovedPayload;
};

// The EnrichedEvent is a union of all possible specific event types
type EnrichedEvent =
  | UserActionClickEvent
  | UserActionKeydownEvent
  | BrowserActionTabCreatedEvent
  | BrowserActionTabActivatedEvent
  | BrowserActionTabUpdatedEvent
  | BrowserActionTabRemovedEvent;

// Token-related types
interface TokenizedEvent {
  tokenId: number;
  timestamp: number;
  originalEvent: EnrichedEvent;
}

type TokenSequence = TokenizedEvent[];

// Type for the global sequence stored in chrome.storage.session
type GlobalActionSequence = EnrichedEvent[];
