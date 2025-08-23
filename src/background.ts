/**
 * Background Script - Main entry point with modular architecture
 */

import { SynapseEvent } from './types';
import { MessageRouter } from './core/message-router';
import { StateManager } from './core/state-manager';
import { DataStorage } from './core/data-storage';
import { MLService } from './core/ml-service';

// Browser API compatibility using webextension-polyfill
declare var browser: any; // webextension-polyfill provides this globally
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// Note: types are declared globally in types.ts (no module exports), so we avoid importing them here.


// Global services
let messageRouter: MessageRouter;
let stateManager: StateManager;
let dataStorage: DataStorage;
let mlService: MLService;

// Initialize all services
async function initializeServices(): Promise<void> {
  try {
    console.log('[SYNAPSE BACKGROUND] Initializing services...');
    
    // Initialize core services
    stateManager = new StateManager();
    dataStorage = new DataStorage(stateManager);
    messageRouter = new MessageRouter();
    
    // Set up message handlers
    setupMessageHandlers();
    setupConnectionHandlers();
    
    // Set initial state
    stateManager.markAsPersistent('extensionPaused');
    stateManager.markAsPersistent('globalActionSequence');
    
    // 监听 fullModelInfo 的变化，并向所有弹窗广播
    stateManager.addListener('fullModelInfo', (_, newValue) => {
        console.log(`[Background] Broadcasting updated model info:`, newValue);
        messageRouter.broadcast('popup', {
            type: 'modelInfoUpdate',
            data: newValue // 直接广播整个数据对象
        });
    });

    stateManager.addListener('globalActionSequence', (_, newValue) => {
        // 当事件序列更新时也通知 popup
        messageRouter.broadcast('popup', {
            type: 'sequenceUpdate',
            data: { sequence: newValue }
        });
    });
    
    // MLService放在最后创建，确保状态监听器已经设置好
    mlService = new MLService(stateManager, dataStorage);
    
    console.log('[SYNAPSE BACKGROUND] ===== SERVICES INITIALIZED SUCCESSFULLY =====');
    
  } catch (error) {
    console.error('[SYNAPSE BACKGROUND] Failed to initialize services:', error);
    throw error;
  }
}

function setupMessageHandlers(): void {
  // Register handlers for different event types
  // New namespaced events from updated content.ts
  messageRouter.registerMessageHandlers({
    // New SynapseEvent types (namespaced)
    'ui.click': handleSynapseEvent,
    'ui.keydown': handleSynapseEvent, 
    'ui.text_input': handleSynapseEvent,
    'user.scroll': handleSynapseEvent,
    'form.submit': handleSynapseEvent,
    'browser.tab.created': handleSynapseEvent,
    'browser.tab.activated': handleSynapseEvent,
    'browser.tab.updated': handleSynapseEvent,
    'browser.tab.removed': handleSynapseEvent,
    
    // Legacy event types (for backward compatibility)
    'user_action_click': handleUserActionEvent,
    'user_action_keydown': handleUserActionEvent,
    'user_action_text_input': handleUserActionEvent,
    'user_action_scroll': handleUserActionEvent,
    'user_action_mouse_pattern': handleUserActionEvent,
    'user_action_form_submit': handleUserActionEvent,
    'user_action_focus_change': handleUserActionEvent,
    'user_action_page_visibility': handleUserActionEvent,
    'user_action_mouse_hover': handleUserActionEvent,
    'user_action_clipboard': handleUserActionEvent,
    'userAction': handleUserActionEvent,
    'browser_action_tab_activated': handleBrowserActionEvent,
    'browser_action_tab_created': handleBrowserActionEvent,
    'browser_action_tab_removed': handleBrowserActionEvent,
    'browser_action_tab_updated': handleBrowserActionEvent,
    
    // Control messages
    'pause': handlePauseMessage,
    'resume': handleResumeMessage,
    'togglePause': handleTogglePauseMessage,
    'clearSequence': handleClearSequenceMessage,
    'reset': handleResetMessage,
    'clearData': handleClearDataMessage,
    
    // ML-related messages
    'getPrediction': handleGetPredictionMessage,
    'getModelInfo': handleGetModelInfoMessage,
    'trainModel': handleTrainModelMessage,
    'getSkills': handleGetSkillsMessage,
    'getLearnedSkills': handleGetLearnedSkillsMessage,
    
    // State queries
    'getPauseState': handleGetPauseStateMessage,
    'getStorageStats': handleGetStorageStatsMessage,
    'getSequence': handleGetSequenceMessage,
    'guidanceToggled': handleGuidanceToggledMessage,
    'exportData': handleExportDataMessage,
    'importData': handleImportDataMessage,
  'getGuidanceState': handleGetGuidanceStateMessage,
  'setGuidanceState': handleSetGuidanceStateMessage,
  'getStorageOverview': handleGetStorageOverviewMessage,
    
    // Codebook and vocabulary
    'getCodebookInfo': handleGetCodebookInfoMessage,
  'getVocabulary': handleGetVocabularyMessage,
  'getState': handleGetStateMessage,
  });
}

function setupConnectionHandlers(): void {
  // Popup connection handler
  messageRouter.registerConnectionHandler('popup', (port: any) => {
    port.onMessage.addListener(async (message: any) => {
      await handlePopupMessage(port, message);
    });
    
    // Send initial data to popup
    sendInitialDataToPopup(port);
  });
  
  // Smart assistant connection handler
  messageRouter.registerConnectionHandler('smart-assistant', (port: any) => {
    port.onMessage.addListener(async (message: any) => {
      await handleAssistantMessage(port, message);
    });
  });
}

// Event handlers
async function handleSynapseEvent(message: any, sender: any): Promise<void> {
  try {
    if (stateManager.get('extensionPaused')) {
      return;
    }

    // Check if message is already a SynapseEvent (from new content.ts)
    if (message.timestamp && message.type && message.context && message.payload) {
      console.log('[Background] Processing SynapseEvent:', message.type);
      
      // Store the clean event directly
      await dataStorage.addToSequence('globalActionSequence', message);
      
      // Forward to ML service
      mlService.processEvent(message);
      
      return;
    }
    
    // Not a SynapseEvent - might be legacy format or control message
    // Fall back to old handling logic
  } catch (error) {
    console.error('[Background] Error handling SynapseEvent:', error);
  }
}

async function handleUserActionEvent(message: any, sender: any): Promise<void> {
  try {
    if (stateManager.get('extensionPaused')) {
      return;
    }

    // Build event with required context structure
    const tabId: number | null = sender.tab?.id ?? null;
    const windowId: number | null = sender.tab?.windowId ?? null;
    let tabInfo: chrome.tabs.Tab | undefined = sender.tab;
    if (!tabInfo && tabId !== null) {
      try {
        tabInfo = await browser.tabs.get(tabId);
      } catch {
        // ignore
      }
    }

    const event: any = {
      type: message.type,
      payload: message.payload,
      timestamp: Date.now(),
      context: {
        tabId,
        windowId,
        tabInfo
      }
    };

    // Add to sequence
    await dataStorage.addToSequence('globalActionSequence', event);
    
    // Process with ML service
    try {
      await mlService.processEvent(event);
    } catch (error) {
      console.error('[Background] ML processing failed:', error);
    }
    
    // Broadcast to connected clients
    messageRouter.broadcast('popup', {
      type: 'eventAdded',
      data: event
    });

    // 获取最新预测并广播（打通事件->预测->UI 链路）
    try {
      const prediction = await mlService.getPrediction();
      messageRouter.broadcast('popup', {
        type: 'predictionUpdate',
        data: prediction
      });
    } catch (predErr) {
      console.warn('[Background] Prediction attempt failed (will continue):', predErr);
    }
    
    // Check if training is needed
    const sequence = await dataStorage.getSequence('globalActionSequence');
    if (sequence.length % 50 === 0 && sequence.length >= 20) {
      try {
        await mlService.trainModel();
        console.log('[Background] Model training completed');
        // 训练完成后再触发一次预测更新（模型可能改善）
        try {
          const postTrainPrediction = await mlService.getPrediction();
          messageRouter.broadcast('popup', {
            type: 'predictionUpdate',
            data: postTrainPrediction
          });
        } catch (e) {
          console.warn('[Background] Post-train prediction failed:', e);
        }
      } catch (error) {
        console.error('[Background] Training failed:', error);
      }
    }
    
  } catch (error) {
    console.error('[Background] Error handling user action:', error);
  }
}

async function handleBrowserActionEvent(message: any, sender: any): Promise<void> {
  try {
    if (stateManager.get('extensionPaused')) {
      return;
    }

    const tabId: number | null = sender.tab?.id ?? null;
    const windowId: number | null = sender.tab?.windowId ?? null;
    let tabInfo: chrome.tabs.Tab | undefined = sender.tab;
    if (!tabInfo && tabId !== null) {
      try {
        tabInfo = await browser.tabs.get(tabId);
      } catch {
        // ignore
      }
    }

    const event: any = {
      type: message.type,
      payload: message.payload,
      timestamp: Date.now(),
      context: {
        tabId,
        windowId,
        tabInfo
      }
    };

    await dataStorage.addToSequence('globalActionSequence', event);
    
    messageRouter.broadcast('popup', {
      type: 'eventAdded',
      data: event
    });
    
  } catch (error) {
    console.error('[Background] Error handling browser action:', error);
  }
}

async function handlePauseMessage(): Promise<any> {
  stateManager.set('extensionPaused', true);
  messageRouter.broadcast('popup', { type: 'pauseStateChanged', data: true });
  return { success: true };
}

async function handleResumeMessage(): Promise<any> {
  stateManager.set('extensionPaused', false);
  messageRouter.broadcast('popup', { type: 'pauseStateChanged', data: false });
  return { success: true };
}

async function handleTogglePauseMessage(): Promise<any> {
  const currentState = stateManager.get('extensionPaused') || false;
  const newState = !currentState;
  
  stateManager.set('extensionPaused', newState);
  messageRouter.broadcast('popup', { type: 'pauseStateChanged', data: newState });
  
  return { success: true, isPaused: newState };
}

async function handleClearSequenceMessage(): Promise<any> {
  try {
    await dataStorage.setSequence('globalActionSequence', []);
    
    messageRouter.broadcast('popup', { 
      type: 'sequenceCleared',
      data: { totalEvents: 0 }
    });
    
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleResetMessage(): Promise<any> {
  try {
    await mlService.resetModel();
    await dataStorage.deleteSequence('globalActionSequence');
    
    messageRouter.broadcast('popup', { type: 'dataReset' });
    return { success: true };
    
  } catch (error) {
    console.error('[Background] Reset failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleClearDataMessage(): Promise<any> {
  try {
    await dataStorage.clearAll();
    messageRouter.broadcast('popup', { type: 'dataCleared' });
    return { success: true };
    
  } catch (error) {
    console.error('[Background] Clear data failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleGetPredictionMessage(): Promise<any> {
  try {
    const prediction = await mlService.getPrediction();
    return { success: true, data: prediction };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleGetModelInfoMessage(): Promise<any> {
  try {
    const modelInfo = await mlService.getModelInfo();
    return { success: true, data: modelInfo };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleTrainModelMessage(): Promise<any> {
  try {
    await mlService.trainModel();
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleGetSkillsMessage(): Promise<any> {
  try {
    const skills = await mlService.getSkills();
    return { success: true, data: skills };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleGetLearnedSkillsMessage(): Promise<any> {
  try {
    const skills = await mlService.getSkills();
    return { success: true, data: skills };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleGetPauseStateMessage(): Promise<any> {
  const paused = stateManager.get('extensionPaused') || false;
  return { success: true, data: paused };
}

async function handleGetSequenceMessage(): Promise<any> {
  try {
    const sequence = await dataStorage.getSequence('globalActionSequence');
    return { success: true, sequence };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleGuidanceToggledMessage(message: any): Promise<any> {
  try {
    // Store guidance toggle state
    stateManager.set('assistantEnabled', message.enabled);
    stateManager.markAsPersistent('assistantEnabled');
    
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleGetStorageStatsMessage(): Promise<any> {
  try {
    const stats = await dataStorage.getStorageStats();
    return { success: true, data: stats };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleExportDataMessage(): Promise<any> {
  try {
    const data = await dataStorage.exportData();
    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleImportDataMessage(message: any): Promise<any> {
  try {
    await dataStorage.importData(message.data);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleGetCodebookInfoMessage(): Promise<any> {
  try {
    const sequence = await dataStorage.getSequence('globalActionSequence');
    return { 
      success: true, 
      data: { 
        totalEvents: sequence.length,
        latestEvents: sequence.slice(-10)
      } 
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleGetVocabularyMessage(): Promise<any> {
  try {
    const modelInfo = await mlService.getModelInfo();
    return { success: true, data: modelInfo?.vocabulary || {} };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleGetGuidanceStateMessage(): Promise<any> {
  try {
    const enabled = stateManager.get('assistantEnabled');
    return { success: true, data: enabled !== false };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function handleSetGuidanceStateMessage(message: any): Promise<any> {
  try {
    const enabled = !!message.enabled;
    stateManager.set('assistantEnabled', enabled);
    stateManager.markAsPersistent('assistantEnabled');
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function handleGetStorageOverviewMessage(): Promise<any> {
  try {
    const stats = await dataStorage.getStorageStats();
    return { success: true, data: stats };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function handleGetStateMessage(): Promise<any> {
  try {
    // Export a safe snapshot (avoid huge sequences)
    const snapshotKeys = [
      'modelLastTrained',
      'modelTrainingStatus',
      'trainingInProgress',
      'modelTrainingSessions',
      'lastPrediction',
      'mlWorkerStatus',
      'fullModelInfo',
      'learningMetrics'
    ];
    const state: Record<string, any> = {};
    snapshotKeys.forEach(k => state[k] = stateManager.get(k));

    // Derive convenience booleans
    const modelInfo = state.fullModelInfo;
    const modelReady = !!(modelInfo && (modelInfo.isReady || modelInfo.workerReady));

    return {
      success: true,
      data: {
        ...state,
        modelReady
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// Connection message handlers
async function handlePopupMessage(port: any, message: any): Promise<void> {
  try {
    if (message.type === 'requestInitialData') {
      await sendInitialDataToPopup(port);
    } else if (message.messageId) {
      // Handle request-response pattern
      // Get the handler from the message router
      const handler = messageRouter.messageHandlers.get(message.type);
      const response = await handler?.(message, null, null);
      port.postMessage({ messageId: message.messageId, data: response });
    }
  } catch (error) {
    console.error('[Background] Error handling popup message:', error);
    if (message.messageId) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      port.postMessage({ messageId: message.messageId, error: errorMessage });
    }
  }
}

async function handleAssistantMessage(port: any, message: any): Promise<void> {
  try {
    // Forward assistant messages to content script or handle directly
    if (message.type === 'getState') {
      const state = stateManager.exportState();
      port.postMessage({ type: 'stateUpdate', data: state });
    }
  } catch (error) {
    console.error('[Background] Error handling assistant message:', error);
  }
}

async function sendInitialDataToPopup(port: any): Promise<void> {
  try {
    const sequence = await dataStorage.getSequence('globalActionSequence');
    const pauseState = stateManager.get('extensionPaused') || false;
    // [关键修改] 直接从状态管理器获取缓存好的完整模型信息
    let modelInfo = stateManager.get('fullModelInfo');

    // If model info is not cached yet, try to get it from MLService
    if (!modelInfo && mlService) {
      console.log('[Background] Model info not cached, attempting to retrieve...');
      try {
        const freshModelInfo = await mlService.getModelInfo();
        if (freshModelInfo && freshModelInfo.info) {
          modelInfo = {
            info: freshModelInfo.info,
            isReady: true,
            workerReady: true,
            workerStatus: 'ready'
          };
          // Cache it for future requests
          stateManager.set('fullModelInfo', modelInfo);
          console.log('[Background] Fresh model info retrieved and cached:', modelInfo);
        }
      } catch (error) {
        console.warn('[Background] Failed to retrieve fresh model info:', error);
      }
    }

    port.postMessage({
      type: 'initialData',
      data: {
        sequence: sequence.slice(-100),
        paused: pauseState,
        // 如果 modelInfo 存在，则直接发送；否则发送一个 loading 状态
        modelInfo: modelInfo || { workerStatus: 'loading', isReady: false },
        timestamp: Date.now()
      }
    });
  } catch (error) {
    console.error('[Background] Error sending initial data:', error);
  }
}

// Initialize everything when the background script loads

initializeServices().catch(error => {
  console.error('[SYNAPSE BACKGROUND] Critical initialization error:', error);
});


// Cleanup on extension unload
self.addEventListener('beforeunload', () => {
  mlService?.cleanup();
  dataStorage?.flushAllPendingWrites();
});