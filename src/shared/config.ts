/**
 * Centralized configuration for all plugins and services
 * Contains constants and configuration values used across the system
 */

export const Config = {
  // WorkflowClonerPlugin configuration
  WorkflowCloner: {
    MAX_SEQUENCE_LENGTH: 200,
    MIN_PATTERN_FREQUENCY: 3,
    MIN_PATTERN_LENGTH: 4,
    CROSS_TAB_CORRELATION_WINDOW: 5000, // 5 seconds
    WORKFLOW_TIMEOUT: 30000, // 30 seconds
    RELATION_EXPIRY: 30 * 60 * 1000, // 30 minutes
    CLEANUP_INTERVAL: 10 * 60 * 1000, // 10 minutes
    PATTERN_MINING_FREQUENCY: 15, // Mine patterns every N events
    MAX_PATTERN_SEQUENCE_LENGTH: 15, // Maximum pattern sequence length
    DEFAULT_EXPECTED_DELAY: 1000, // Default delay between workflow steps (ms)
    CONFIDENCE_INCREASE: 0.05,
    MAX_CONFIDENCE: 0.95,
    CONTINUATION_CONFIDENCE: 0.85,
    HASH_BASE: 36,
  },

  // ClipboardEnhancerPlugin configuration
  ClipboardEnhancer: {
    MAX_HISTORY_SIZE: 50,
    CONTEXT_EXPIRY: 5 * 60 * 1000, // 5 minutes
    HISTORY_EXPIRY_MULTIPLIER: 2, // Double expiry for history cleanup
    CLIPBOARD_ID_RANDOM_LENGTH: 8,
    TRUNCATE_LENGTH: 50,
    MIN_SEARCH_LENGTH: 3,
    MAX_SEARCH_LENGTH: 100,
    SEARCH_PREVIEW_LENGTH: 30,
    HIGH_CONFIDENCE: 0.95,
    MIN_TEXT_FOR_TRANSFORM: 10,
    PHONE_MIN_LENGTH: 10,
  },

  // WorkflowPlugin configuration
  Workflow: {
    MAX_RECENT_EVENTS: 50,
    MIN_PATTERN_FREQUENCY: 2,
    MIN_PATTERN_LENGTH: 3,
    PATTERN_MINING_INTERVAL: 10, // Mine patterns every N events
    MAX_SEQUENCE_LENGTH: 10, // Maximum length for sequence extraction
    HASH_MASK: 32, // 32-bit integer mask
    HASH_BASE: 36,
  },

  // ClipboardPlugin configuration
  ClipboardPlugin: {
    MAX_HISTORY: 20,
    CONTENT_TRUNCATE_LENGTH: 200,
    RECENT_TIME_WINDOW: 2 * 60 * 1000, // 2 minutes
    COMPLEX_CONTENT_LENGTH: 100,
    SHORT_CONTENT_LENGTH: 50,
    SUMMARY_LENGTH: 25,
    ID_RANDOM_LENGTH: 11,
  },

  // ML Worker configuration
  MLWorker: {
    MAX_ITERATIONS: 100,
    MAX_FEATURES_FOR_KMEANS: 16,
    SEQUENCE_LENGTH: 10,
    HIDDEN_SIZE: 32,
    INITIAL_VOCAB_SIZE: 1000,
    MAX_TASK_LENGTH: 10,
    OUTPUT_DIM: 64,
    TYPE_HASH_RANGE: 100,
    SCREEN_WIDTH_NORMALIZE: 1920,
    SCREEN_HEIGHT_NORMALIZE: 1080,
    ELEMENT_ROLE_RANGE: 50,
    TARGET_SIZE: 20,
    LONG_SEQUENCE_LENGTH: 20,
    CONFIDENCE_FREQUENCY_DIVISOR: 10,
    RECENT_EVENTS_LIMIT: 10,
    DEFAULT_BATCH_SIZE: 32,
    FEATURES_COUNT: 20,
  },

  // Smart Assistant configuration
  SmartAssistant: {
    COOLDOWN_MS: 30000,
    AUTO_DISMISS_DELAY: 10000,
    CLIPBOARD_TRUNCATE_LENGTH: 50,
    HIGH_CONFIDENCE: 0.95,
    MIN_CLIPBOARD_LENGTH: 10,
    MIN_RECT_WIDTH: 200,
    CONTEXT_EXPIRY: 5 * 60 * 1000, // 5 minutes
    PHONE_MIN_LENGTH: 10,
  },

  // Execution Engine configuration
  ExecutionEngine: {
    DEFAULT_DELAY: 500,
    TAB_SWITCH_DELAY: 500,
    TAB_CREATE_DELAY: 1000,
    STEP_DELAY: 800,
  },

  // Data Storage configuration
  DataStorage: {
    BATCH_WRITE_DELAY: 5000,
    BATCH_WRITE_MAX_SIZE: 20,
    MAX_SEQUENCE_SIZE: 5000,
    MAX_EVENTS: 5000,
    DEFAULT_RECENT_EVENTS_LIMIT: 1000,
  },

  // Content Script configuration
  Content: {
    CONTEXT_UPDATE_INTERVAL: 1000,
    DEBOUNCE_DELAY: 100,
  },

  // Feature Extractor configuration
  FeatureExtractor: {
    MAX_ARIA_LABEL_LENGTH: 30,
    MAX_NAME_LENGTH: 20,
    MAX_CLASS_LENGTH: 20,
    MAX_TEXT_LENGTH: 50,
  },

  // Unified Highlight System configuration
  UnifiedHighlightSystem: {
    HIGHLIGHT_Z_INDEX: 10001,
    AUTO_CLEAR_DELAY: 30000, // 30 seconds
    TASK_AUTO_CLEAR_DELAY: 60000, // 60 seconds
    STEP_NUMBER_OFFSET: 15,
    TASK_INFO_OFFSET: 60,
  },

  // Floating Control Center configuration
  FloatingControlCenter: {
    DEFAULT_X: 250, // offset from right edge
    DEFAULT_Y: 50,
    Z_INDEX: 2147483647,
  },

  // Messaging Service configuration
  MessagingService: {
    CONNECTION_TIMEOUT: 5000,
  },

  // Intent Scheduler configuration
  IntentScheduler: {
    DECISION_COOLDOWN: 1000, // 1 second between decisions
  },

  // ML Service configuration
  MLService: {
    PREDICTION_TIMEOUT: 180000, // 3 minutes
    RECENT_EVENTS_LIMIT: 10,
    DEFAULT_MAX_RETRIES: 3,
    DEFAULT_RETRY_DELAY: 1000,
  },

  // Utils configuration
  Utils: {
    MAX_SEGMENT_LENGTH: 15,
    HASH_REGEX_LENGTH: 32,
    MIN_EVENT_INTERVAL: 100,
    MAX_QUEUE_SIZE: 30,
  },
} as const;

// Backward compatibility
export const PluginConfig = Config;