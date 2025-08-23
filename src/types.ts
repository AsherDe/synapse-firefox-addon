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
  payload: UserActionClickPayload | UserActionKeydownPayload | UserActionTextInputPayload | UserActionScrollPayload | UserActionMousePatternPayload | UserActionFormSubmitPayload | UserActionFocusChangePayload | UserActionPageVisibilityPayload | UserActionMouseHoverPayload | UserActionClipboardPayload;
}

interface UserActionClickPayload {
  selector: string;
  x: number;
  y: number;
  url: string;
  features: GeneralizedEventFeatures;
}

interface UserActionKeydownPayload {
  key: string;
  code: string;
  url: string;
  features: KeydownFeatures;
}

interface KeydownFeatures extends GeneralizedEventFeatures {
  modifier_keys?: string[];
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
  features: ScrollFeatures;
  timestamp: number;
}

interface ScrollFeatures extends GeneralizedEventFeatures {
  scroll_direction: string;
  scroll_position: number;
  page_height: number;
  viewport_height: number;
  scroll_percentage: number;
  // Enhanced scroll analysis
  scroll_velocity?: number;
  scroll_pause_duration?: number;
  scroll_pattern?: 'scanning' | 'reading' | 'unknown';
}

interface UserActionMousePatternPayload {
  url: string;
  features: MousePatternFeatures;
  trail: {x: number, y: number, timestamp: number}[];
  timestamp: number;
}

interface MousePatternFeatures extends GeneralizedEventFeatures {
  pattern_type: string;
  movement_speed: number;
  direction_changes: number;
  total_distance: number;
  significance: number;
  // Enhanced mouse trajectory analysis
  dct_x_coefficients?: number[];
  dct_y_coefficients?: number[];
  original_length?: number;
  duration?: number;
}

interface UserActionFormSubmitPayload {
  form_selector: string;
  url: string;
  features: FormSubmitFeatures;
  field_count?: number;
  has_required_fields?: boolean;
  submit_method?: string;
}

interface FormSubmitFeatures extends GeneralizedEventFeatures {
  // Enhanced form completion analysis
  form_completion_pattern?: FormCompletionPattern;
}

interface UserActionFocusChangePayload {
  from_selector?: string;
  to_selector?: string;
  url: string;
  features: FocusChangeFeatures;
  focus_type: 'gained' | 'lost' | 'switched';
}

interface FocusChangeFeatures extends GeneralizedEventFeatures {
  // Enhanced focus tracking
  focus_duration?: number;
  focus_history?: FocusHistoryEntry[];
  task_context?: TaskContext;
}

interface UserActionPageVisibilityPayload {
  url: string;
  visibility_state: 'visible' | 'hidden';
  previous_state?: string;
  features: VisibilityFeatures;
}

interface VisibilityFeatures extends GeneralizedEventFeatures {
  time_on_page?: number;
  // Enhanced interruption/resumption tracking
  interruption_context?: InterruptionContext;
  resumption_context?: ResumptionContext;
  interruption_duration?: number;
  pre_interruption_sequence?: EnrichedEvent[];
}

interface UserActionMouseHoverPayload {
  selector: string;
  url: string;
  features: MouseHoverFeatures;
  hover_duration?: number;
  x: number;
  y: number;
}

interface MouseHoverFeatures extends GeneralizedEventFeatures {
  // Enhanced hover analysis
  hover_intent_confidence?: number;
  element_visibility_ratio?: number;
  is_deliberate_hover?: boolean;
}

interface UserActionClipboardPayload {
  operation: 'copy' | 'cut' | 'paste';
  selector: string;
  url: string;
  features: ClipboardFeatures;
  text_length?: number;
  has_formatting?: boolean;
}

interface ClipboardFeatures extends GeneralizedEventFeatures {
  // Enhanced cross-page information flow tracking
  source_context?: ClipboardSourceContext;
  target_context?: ClipboardTargetContext;
  cross_page_flow?: CrossPageFlowInfo;
  clipboard_state_id?: string;
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
  features?: TabFeatures;
}

interface TabActivatedPayload {
  tabId: number;
  windowId: number;
  features?: TabFeatures;
}

interface TabUpdatedPayload {
  tabId: number;
  url: string;
  title?: string;
  features?: TabFeatures;
}

interface TabRemovedPayload {
  tabId: number;
  windowId: number;
  features?: TabFeatures;
}

interface TabFeatures {
  // Cross-tab task flow analysis
  openerTabId?: number;
  task_context?: 'reference' | 'comparison' | 'workflow' | 'unknown';
  tab_relationship?: 'parent' | 'child' | 'sibling' | 'independent';
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
  is_password_field?: boolean; // 是否为密码字段 (PRIVACY)
  domain?: string;          // 页面域名
  path_depth?: number;      // URL路径深度
  page_type?: string;       // 页面类型(启发式判断)
  text_length?: number;     // 文本长度 (仅元数据，不记录内容)
  
  // Enhanced URL generalization features (based on CLAUDE.md specifications)
  domain_hash?: number;              // 域名哈希 (隐私保护)
  page_type_confidence?: number;     // 页面类型识别置信度
  path_component_types?: string[];   // 路径组件类型分析
  path_keywords?: string[];          // 路径中的关键词
  query_param_count?: number;        // 查询参数数量
  query_param_keys?: string[];       // 查询参数键列表 (不包含值)
  query_param_key_hash?: number;     // 查询参数键哈希
  has_fragment?: boolean;            // 是否包含片段标识符
}

// DEPRECATED: Extended payloads no longer needed - all base payloads now have features
// Kept for backward compatibility but should not be used in new code
interface ExtendedUserActionClickPayload extends UserActionClickPayload {}
interface ExtendedUserActionKeydownPayload extends UserActionKeydownPayload {}

// 技能/行为模式类型
interface ActionSkill {
  id: string;
  name: string;
  description: string;
  token_sequence: number[];  // 构成该技能的token序列
  frequency: number;         // 该技能的使用频率
  confidence: number;        // 技能识别的置信度
}

// High-level skill events
interface SkillEvent extends BaseEvent {
  type: 'skill_action';
  payload: {
    skill: ActionSkill;
    original_events: EnrichedEvent[]; // Original events that compose this skill
  };
}

// Focus change task context types
interface FocusHistoryEntry {
  element_role: string;
  element_type: string;
  focus_duration: number;
  timestamp: number;
  page_context: string;
}

interface TaskContext {
  current_task_type: string; // 'iterative_search' | 'form_filling' | 'reading' | 'unknown'
  task_confidence: number; // Confidence level in task identification
  focus_pattern: string; // 'sequential' | 'alternating' | 'scattered'
  interaction_intensity: 'low' | 'medium' | 'high';
}

// Page visibility interruption/resumption types
interface InterruptionContext {
  interruption_trigger: 'user_switch' | 'system_switch' | 'unknown';
  last_interaction_type: string;
  active_element_type?: string;
  page_engagement_level: 'high' | 'medium' | 'low';
  scroll_position?: number;
}

interface ResumptionContext {
  resumption_trigger: 'user_return' | 'tab_focus' | 'unknown';
  time_away: number; // Time away from page (ms)
  context_similarity: number; // Similarity to pre-interruption context
  likely_task_continuation: boolean; // Whether user likely continues previous task
}

// Clipboard cross-page information flow types
interface ClipboardSourceContext {
  source_page_type: string;
  source_element_role: string;
  content_category: 'code' | 'text' | 'url' | 'data' | 'unknown';
  source_domain: string;
  extraction_method: 'selection' | 'field_value' | 'element_text';
}

interface ClipboardTargetContext {
  target_page_type: string;
  target_element_role: string;
  target_domain: string;
  paste_context: 'form_field' | 'editor' | 'search_box' | 'unknown';
  target_compatibility: 'high' | 'medium' | 'low'; // Compatibility with source content
}

interface CrossPageFlowInfo {
  flow_type: 'same_domain' | 'cross_domain' | 'cross_site';
  flow_pattern: 'code_to_editor' | 'search_to_form' | 'data_transfer' | 'unknown';
  flow_confidence: number; // Confidence in information flow identification
  semantic_relationship: 'related' | 'continuation' | 'independent';
}

// Form filling behavior analysis types
interface FormCompletionPattern {
  avg_time_per_field: number; // Average time spent per field (ms)
  revisit_count: number; // Number of times fields were revisited
  completion_efficiency: 'smooth' | 'hesitant' | 'struggling';
  field_skip_count: number; // Number of fields skipped then returned to
  error_correction_events: number; // Number of corrections made
}
