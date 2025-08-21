# Synapse Extension Communication Standards

This document defines the standardized communication formats between all components in the Synapse browser extension.

## Architecture Overview

```
Content Script → MessageRouter → Background Script
                      ↓
                 StateManager
                      ↓
                 MLService ↔ ML Worker
                      ↓
               Popup (via long-lived connection)
```

## 1. ML Worker ↔ MLService Communication

### Request Format (MLService → Worker)
```typescript
interface MLWorkerMessage {
  type: string;
  data?: any;
  requestId: string; // Auto-generated: "req_${counter}"
}
```

### Response Format (Worker → MLService)
```typescript
interface MLWorkerResponse {
  type: string;
  data?: any;           // Standardized data wrapper
  error?: string;       // Error message if failed
  requestId?: string;   // Matches request for promise resolution
  
  // Additional metadata (optional)
  success?: boolean;
  duration?: number;
  performanceStats?: object;
}
```

### Supported Operations

#### 1. Get Model Information
**Request:**
```typescript
{
  type: 'getInfo',
  requestId: 'req_123'
}
```

**Response:**
```typescript
{
  type: 'info_result',
  data: {
    info: {
      vocabSize: number,
      skillsCount: number,
      learningMetrics: LearningMetrics,
      isInitialized: boolean,
      workerReady: boolean,
      features: {
        richContextExtraction: boolean,
        incrementalLearning: boolean,
        enhancedLSTM: boolean,
        performanceMonitoring: boolean
      }
    }
  },
  requestId: 'req_123'
}
```

#### 2. Train Model
**Request:**
```typescript
{
  type: 'train',
  data: { sequence: GlobalActionSequence },
  requestId: 'req_124'
}
```

**Response:**
```typescript
{
  type: 'training_complete',
  success: boolean,
  vocabSize?: number,
  skillsCount?: number,
  trainingDuration?: number,
  learningMetrics?: LearningMetrics,
  performanceStats?: object,
  error?: string,
  requestId: 'req_124'
}
```

#### 3. Get Prediction
**Request:**
```typescript
{
  type: 'predict',
  data: { currentSequence: EnrichedEvent[] },
  requestId: 'req_125'
}
```

**Response:**
```typescript
{
  type: 'prediction_result',
  data: {
    token: string,
    confidence: number
  } | null,
  predictionDuration?: number,
  learningMetrics?: LearningMetrics,
  performanceStats?: object,
  error?: string,
  requestId: 'req_125'
}
```

#### 4. Get Skills
**Request:**
```typescript
{
  type: 'getSkills',
  requestId: 'req_126'
}
```

**Response:**
```typescript
{
  type: 'skills_result',
  data: ActionSkill[],
  requestId: 'req_126'
}
```

#### 5. Worker Ready Signal
**Broadcast (no request):**
```typescript
{
  type: 'worker_ready'
  // No requestId - this is a broadcast message
}
```

## 2. Background Script ↔ Popup Communication

### Connection Setup
```typescript
// Popup establishes long-lived connection
const port = browser.runtime.connect({ name: 'popup' });
```

### Message Formats

#### Initial Data Request
**Popup → Background:**
```typescript
{
  type: 'requestInitialData'
}
```

**Background → Popup:**
```typescript
{
  type: 'initialData',
  data: {
    sequence: EnrichedEvent[],    // Last 100 events
    paused: boolean,
    modelInfo: {
      info?: {
        vocabSize: number,
        skillsCount: number,
        learningMetrics: object,
        workerReady: boolean
      },
      isReady: boolean,
      workerStatus: 'ready' | 'loading' | 'error'
    } | { workerStatus: 'loading', isReady: false },
    timestamp: number
  }
}
```

#### Real-time Updates (Background → Popup)

**Model Information Update:**
```typescript
{
  type: 'modelInfoUpdate',
  data: {
    info: {
      vocabSize: number,
      skillsCount: number,
      learningMetrics: object,
      workerReady: boolean
    },
    isReady: true,
    workerReady: true,
    workerStatus: 'ready'
  }
}
```

**Sequence Updates:**
```typescript
{
  type: 'sequenceUpdate',
  data: { sequence: EnrichedEvent[] }
}

// Or single event addition
{
  type: 'eventAdded',
  data: EnrichedEvent
}
```

**Pause State Changes:**
```typescript
{
  type: 'pauseStateChanged',
  data: boolean  // true = paused, false = active
}
```

#### Request-Response Pattern (Popup ↔ Background)

**Request Format:**
```typescript
{
  type: string,
  messageId: string,  // Timestamp + random for tracking
  // ... other data
}
```

**Response Format:**
```typescript
{
  messageId: string,  // Matches request
  data?: any,        // Success response data
  error?: string     // Error message if failed
}
```

## 3. State Manager Integration

### State Keys and Data Formats

#### Core States
```typescript
{
  'extensionPaused': boolean,
  'mlWorkerStatus': 'initializing' | 'ready' | 'error' | 'failed',
  'fullModelInfo': {
    info: {
      vocabSize: number,
      skillsCount: number,
      learningMetrics: object,
      workerReady: boolean
    },
    isReady: boolean,
    workerReady: boolean,
    workerStatus: string
  },
  'globalActionSequence': EnrichedEvent[],
  'modelLastTrained': number | null,
  'lastPrediction': PredictionResult | null
}
```

#### State Change Broadcasting
```typescript
// StateManager listener format
stateManager.addListener('keyName', (key: string, newValue: any) => {
  // Broadcast to connected clients
  messageRouter.broadcast('popup', {
    type: 'stateUpdate',
    data: { [key]: newValue }
  });
});
```

## 4. Error Handling Standards

### Error Response Format
```typescript
{
  type: string,          // Original message type
  success: false,
  error: string,         // Human-readable error message
  requestId?: string,    // If responding to a request
  timestamp?: number     // When error occurred
}
```

### Timeout Handling
- **MLService → Worker**: 30 second timeout
- **Popup → Background**: 5 second timeout
- **Retry mechanism**: Exponential backoff (1s, 1.5s, 2.25s)

## 5. Data Types Reference

### Core Interfaces
```typescript
interface EnrichedEvent {
  type: string;
  payload: any;
  timestamp: number;
  url?: string;
  tabId?: number;
  context?: {
    tabInfo?: {
      url: string;
      title: string;
    }
  };
}

interface ActionSkill {
  id: string;
  name: string;
  description: string;
  token_sequence: number[];
  frequency: number;
  confidence: number;
}

interface LearningMetrics {
  experienceCount: number;
  bufferUtilization: number;
  readyForIncremental: boolean;
  diversity: number;
}

interface PredictionResult {
  token: string;
  confidence: number;
  timestamp: number;
}
```

## 6. Best Practices

### Message Handling
1. **Always include requestId** for request-response patterns
2. **Use standardized data wrapper** (`data` field) for response payloads
3. **Include success/error flags** for operation results
4. **Add timestamps** for debugging and cache invalidation

### State Management
1. **Cache complete model information** in `fullModelInfo` state
2. **Only broadcast complete, ready data** to popup
3. **Use retry mechanisms** for critical operations
4. **Implement proper cleanup** for pending requests

### Error Recovery
1. **Graceful degradation** when services are unavailable
2. **Meaningful error messages** for user-facing components
3. **Automatic retry** with exponential backoff
4. **Fallback mechanisms** for critical data

## 7. Debugging Support

### Console Logging Standards
```typescript
// Format: [Component] Operation: details
console.log('[MLService] Getting model info (attempt 1/3)');
console.log('[Background] Broadcasting updated model info:', data);
console.error('[MLWorker] Prediction failed:', error);
```

### Message Tracing
- All request-response pairs include `requestId`
- State changes include timestamps
- Performance metrics for long-running operations

---

**Last Updated:** 2024-12-19  
**Version:** 1.0  
**Maintained By:** Synapse Development Team