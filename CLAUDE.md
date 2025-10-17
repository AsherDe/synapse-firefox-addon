# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Synapse is a browser extension that learns user browsing patterns and predicts next actions using frequency-space analysis of user behavior sequences. It implements FAST (Frequency-space Action Sequence Tokenization) technology with a custom ML worker for local prediction.

## Development Commands

### Core Development Commands
```bash
# Development build with hot reload and Firefox debugging
npm run dev

# Production build
npm run build

# Build and package extension
npm run build && web-ext build --overwrite-dest

# Start development server for Firefox
npm run start

# Watch mode for development
npm run watch
```

### Testing and Data Analysis
```bash
# Clean exported debug data
python scripts/clean_debug_data.py synapse-debug-data.json

# Run all research experiments
python scripts/run_all_experiments.py cleaned_data.csv --user-group test

# Individual experiments
python scripts/experiment_1_feasibility.py cleaned_data.csv
python scripts/experiment_2_prediction.py cleaned_data.csv
python scripts/experiment_3_user_study.py cleaned_data.csv --group test
python scripts/experiment_4_workflow_analysis.py cleaned_data.csv
```

## Architecture Overview

### Core Components

**Background Script** (`src/background/index.ts`)
- Event processing and ML service coordination
- State management and data persistence
- Message routing between components
- Plugin system integration

**Content Scripts** (`src/content/index.ts`)
- DOM event monitoring and feature extraction
- Smart assistant bridge for UI interactions
- Floating control center for user controls

**ML Worker** (`src/workers/ml-worker.ts`)
- Isolated prediction engine using TensorFlow.js
- Simplified neural network implementation
- FAST tokenization processing

**Popup Interface** (`src/popup/index.ts`)
- Real-time monitoring dashboard
- Developer debug tools with JSON highlighting
- Data export/import functionality

### Service Architecture

**MLService** (`src/background/services/MLService.ts`)
- Centralized ML operations with Web Worker communication
- Training and prediction coordination
- Model state management

**StateManager** (`src/background/services/StateManager.ts`)
- Global state management with persistence
- Event broadcasting to connected clients
- Task state tracking for guidance features

**DataStorage** (`src/background/services/DataStorage.ts`)
- IndexedDB abstraction for event sequences
- Storage statistics and cleanup utilities
- Import/export functionality

**MessageRouter** (`src/background/services/MessageRouter.ts`)
- Centralized message handling between components
- Long-lived connection management for popup
- Request-response pattern implementation

### Event System

All user interactions are normalized into `SynapseEvent` objects:
- Namespaced event types (e.g., `ui.click`, `browser.tab.created`)
- Standardized context (tabId, URL, title)
- Feature extraction in payload.features
- Cross-tab relationship tracking
- Clipboard context for enhanced suggestions

### Plugin System

**Plugin Base** (`src/background/plugins/base.ts`)
- Event processing with priority levels
- Non-blocking execution model
- Plugin lifecycle management

**Built-in Plugins:**
- `ClipboardEnhancerPlugin`: Cross-tab clipboard suggestions
- `WorkflowClonerPlugin`: Cross-tab workflow automation
- `WorkflowPlugin`: Pattern recognition and automation

## Communication Standards

The project follows a standardized communication protocol defined in `COMMUNICATION_STANDARDS.md`:

### ML Worker Communication
- Request-response pattern with `requestId` tracking
- Standardized error handling with retry mechanisms
- Performance monitoring and timeout handling

### Background-Popup Communication
- Long-lived connections for real-time updates
- Initial data broadcast on connection
- State synchronization with broadcasting

### Event Flow
```
User Actions → Content Scripts → Background → ML Worker → Predictions → UI
```

## Development Workflow

### Adding New Event Types
1. Define in `src/shared/types.ts` under SynapseEvent
2. Add handler in `src/background/index.ts` message routing
3. Implement monitoring in appropriate content script monitor
4. Update feature extraction in `src/content/feature-extractor.ts`

### Plugin Development
1. Extend `PluginBase` from `src/background/plugins/base.ts`
2. Implement `processEvent()` method with priority handling
3. Register in `PluginSystemAdapter`
4. Add configuration options to StateManager

### ML Model Updates
1. Modify worker implementation in `src/workers/ml-worker.ts`
2. Update communication protocol in MLService
3. Add new message types to COMMUNICATION_STANDARDS.md
4. Test with experiment scripts in `scripts/`

## Key Data Structures

### SynapseEvent
Core event structure for all user interactions with namespaced types, standardized context, and feature extraction payload.

### ActionSkill
ML model representation for learned user patterns, including task sequences and confidence metrics.

### TaskState
Task execution tracking for guided workflows with step progression and timing.

## Build Configuration

- **Webpack** entry points for all major components
- **TypeScript** strict mode with path aliases (@core, @shared)
- **Web Extension Polyfill** for cross-browser compatibility
- **Development mode** with readable output for debugging

## Research Integration

The `scripts/` directory contains Python analysis tools for validating the FAST algorithm and user behavior research:
- DCT feasibility analysis
- Prediction accuracy benchmarking
- User study data processing
- Cross-tab workflow analysis

Results feed back into ML model improvements and feature development.

when commit/pr do not include claude information