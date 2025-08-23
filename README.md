# Synapse

Synapse is a browser extension that learns your browsing patterns and predicts your next actions using frequency-space analysis of user behavior sequences.

## Technical Architecture

**Core Technology:**
- FAST (Frequency-space Action Sequence Tokenization) for behavior pattern analysis
- Custom ML worker implementation for local prediction
- Real-time event monitoring and feature extraction
- IndexedDB for local data persistence

**Components:**
- **Background Script**: Event processing, ML service, and data management
- **Content Scripts**: DOM event monitoring with smart feature extraction
- **ML Worker**: Isolated prediction engine using simplified neural networks
- **Popup Interface**: Real-time monitoring with developer debug tools

## Features

- **Pattern Learning**: Tracks clicks, navigation, forms, scrolling, and focus changes
- **Predictive Suggestions**: Anticipates user actions based on learned patterns
- **Privacy-First**: All processing happens locally, no data transmission
- **Developer Tools**: Comprehensive debugging interface with JSON syntax highlighting
- **Real-time Monitoring**: Live event sequence display with performance metrics

## Installation

### From Source
```bash
# Clone repository
git clone https://github.com/your-org/synapse
cd synapse

# Install dependencies
npm install

# Build extension
npm run build

# Load in Firefox
# Navigate to about:debugging -> This Firefox -> Load Temporary Add-on
# Select dist/manifest.json
```

### Development
```bash
# Development build with watch
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint
```

## Usage

1. **Install** the extension in Firefox
2. **Browse normally** - Synapse learns from your behavior patterns
3. **View predictions** in the popup (click extension icon)
4. **Debug mode** provides detailed technical insights for developers

## Architecture Details

### Data Flow
```
User Actions → Content Scripts → Background → ML Worker → Predictions → UI
```

### Event Processing Pipeline
1. **Monitor**: Content scripts capture DOM events
2. **Extract**: Feature extraction with context preservation
3. **Tokenize**: FAST algorithm converts sequences to frequency-space tokens
4. **Predict**: ML worker generates next-action predictions
5. **Display**: Real-time updates in popup interface

### ML Implementation
- **Model**: Simplified neural network in Web Worker
- **Training**: Continuous learning from user sequences
- **Features**: 20-dimensional feature vectors from user actions
- **Compression**: DCT-based sequence compression for efficiency

## Debug Interface

Access via popup → Dev Mode button:

- **Events Tab**: Raw event data with syntax highlighting
- **Tokens Tab**: Tokenization statistics and codebook status
- **Model Tab**: Architecture details and training history
- **Debug Tab**: System info, storage usage, connection status

## Development

### Project Structure
```
src/
├── background/         # Background script and services
│   ├── services/      # MLService, DataStorage, MessageRouter, StateManager
│   └── index.ts
├── content/           # Content scripts
│   ├── monitors/      # Event monitoring modules
│   └── index.ts
├── popup/             # Extension popup
├── workers/           # ML worker implementation
└── shared/            # Common types and utilities
```

### Key APIs

**MLService**
```typescript
await mlService.processEvents(events: SynapseEvent[])
const prediction = await mlService.predict()
const modelInfo = await mlService.getModelInfo()
```

**DataStorage**
```typescript
await dataStorage.addToSequence(event: SynapseEvent)
const sequence = await dataStorage.getSequence()
await dataStorage.clearSequence()
```

### Testing & Research

The `scripts/` directory contains Python analysis tools for research:
- DCT feasibility analysis
- Prediction accuracy benchmarking  
- User study data processing

## Privacy & Security

- **Local Processing**: All ML computation happens in browser
- **No Network**: Extension never sends data externally
- **Sandboxed ML**: Worker isolation prevents data leakage
- **Minimal Permissions**: Only activeTab and storage permissions

## Performance

- **Memory Usage**: ~10-50MB depending on sequence length
- **CPU Impact**: Minimal, processing happens in Web Worker
- **Storage**: ~1-10MB for learned patterns and event history
- **Real-time**: <100ms prediction latency

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/name`)
3. Make changes following existing code style
4. Test thoroughly with dev build
5. Submit pull request

## License

Apache License 2.0 - see LICENSE file for details.

## Research

This extension implements research from our paper on frequency-space user behavior modeling. See `scripts/README.md` for experiment replication instructions.