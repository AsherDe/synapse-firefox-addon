/**
 * This file contains the shared type definitions for the Synapse extension.
 * These types are used for communication between content scripts, the background script,
 * and the popup UI.
 * 
 * Licensed under the Apache License, Version 2.0
 */

// The core structure for any event message sent from a content script
interface RawUserAction {
  type: 'user_action_click' | 'user_action_keydown' | 'user_action_text_input' | 'user_action_scroll' | 'user_action_mouse_pattern' | 'user_action_form_submit' | 'user_action_focus_change' | 'user_action_page_visibility' | 'user_action_mouse_hover' | 'user_action_clipboard';
  payload: UserActionClickPayload | UserActionKeydownPayload | UserActionTextInputPayload | ExtendedUserActionClickPayload | ExtendedUserActionKeydownPayload | UserActionScrollPayload | UserActionMousePatternPayload | UserActionFormSubmitPayload | UserActionFocusChangePayload | UserActionPageVisibilityPayload | UserActionMouseHoverPayload | UserActionClipboardPayload;
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

interface UserActionTextInputPayload {
  text: string;
  selector: string;
  url: string;
  input_method?: string; // 'keyboard', 'ime', 'paste', etc.
  features: GeneralizedEventFeatures;
  duration?: number; // 输入持续时间(毫秒)
}

interface UserActionScrollPayload {
  url: string;
  features: {
    scroll_direction: string;
    scroll_position: number;
    page_height: number;
    viewport_height: number;
    scroll_percentage: number;
    domain: string;
    page_type: string;
  };
  timestamp: number;
}

interface UserActionMousePatternPayload {
  url: string;
  features: {
    pattern_type: string;
    movement_speed: number;
    direction_changes: number;
    total_distance: number;
    significance: number;
    domain: string;
    page_type: string;
  };
  trail: {x: number, y: number, timestamp: number}[];
  timestamp: number;
}

interface UserActionFormSubmitPayload {
  form_selector: string;
  url: string;
  features: GeneralizedEventFeatures;
  field_count?: number;
  has_required_fields?: boolean;
  submit_method?: string;
}

interface UserActionFocusChangePayload {
  from_selector?: string;
  to_selector?: string;
  url: string;
  features: GeneralizedEventFeatures;
  focus_type: 'gained' | 'lost' | 'switched';
}

interface UserActionPageVisibilityPayload {
  url: string;
  visibility_state: 'visible' | 'hidden';
  previous_state?: string;
  features: {
    domain: string;
    page_type: string;
    time_on_page?: number;
  };
}

interface UserActionMouseHoverPayload {
  selector: string;
  url: string;
  features: GeneralizedEventFeatures;
  hover_duration?: number;
  x: number;
  y: number;
}

interface UserActionClipboardPayload {
  operation: 'copy' | 'cut' | 'paste';
  url: string;
  features: GeneralizedEventFeatures;
  text_length?: number;
  has_formatting?: boolean;
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

type UserActionTextInputEvent = BaseEvent & {
  type: 'user_action_text_input';
  payload: UserActionTextInputPayload;
};

type UserActionScrollEvent = BaseEvent & {
  type: 'user_action_scroll';
  payload: UserActionScrollPayload;
};

type UserActionMousePatternEvent = BaseEvent & {
  type: 'user_action_mouse_pattern';
  payload: UserActionMousePatternPayload;
};

type UserActionFormSubmitEvent = BaseEvent & {
  type: 'user_action_form_submit';
  payload: UserActionFormSubmitPayload;
};

type UserActionFocusChangeEvent = BaseEvent & {
  type: 'user_action_focus_change';
  payload: UserActionFocusChangePayload;
};

type UserActionPageVisibilityEvent = BaseEvent & {
  type: 'user_action_page_visibility';
  payload: UserActionPageVisibilityPayload;
};

type UserActionMouseHoverEvent = BaseEvent & {
  type: 'user_action_mouse_hover';
  payload: UserActionMouseHoverPayload;
};

type UserActionClipboardEvent = BaseEvent & {
  type: 'user_action_clipboard';
  payload: UserActionClipboardPayload;
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
  | UserActionTextInputEvent
  | UserActionScrollEvent
  | UserActionMousePatternEvent
  | UserActionFormSubmitEvent
  | UserActionFocusChangeEvent
  | UserActionPageVisibilityEvent
  | UserActionMouseHoverEvent
  | UserActionClipboardEvent
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

// 泛化事件特征类型
interface GeneralizedEventFeatures {
  element_role?: string;    // HTML5 role或语义化标识
  element_text?: string;    // 按钮或元素文本(归一化)
  is_nav_link?: boolean;    // 是否为导航链接
  is_input_field?: boolean; // 是否为输入字段
  domain?: string;          // 页面域名
  path_depth?: number;      // URL路径深度
  page_type?: string;       // 页面类型(启发式判断)
}

// 扩展的点击事件载荷
interface ExtendedUserActionClickPayload extends UserActionClickPayload {
  features: GeneralizedEventFeatures;
}

// 扩展的按键事件载荷  
interface ExtendedUserActionKeydownPayload extends UserActionKeydownPayload {
  features: GeneralizedEventFeatures;
  modifier_keys?: string[]; // 修饰键组合
}

// 技能/行为模式类型
interface ActionSkill {
  id: string;
  name: string;
  description: string;
  token_sequence: number[];  // 构成该技能的token序列
  frequency: number;         // 该技能的使用频率
  confidence: number;        // 技能识别的置信度
}

// 高层次技能事件
interface SkillEvent extends BaseEvent {
  type: 'skill_action';
  payload: {
    skill: ActionSkill;
    original_events: EnrichedEvent[]; // 构成该技能的原始事件
  };
}
