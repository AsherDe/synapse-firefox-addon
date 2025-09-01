/**
 * Background Script - Main entry point with modular architecture
 */

import { SynapseEvent, TaskState, TaskStep } from '../shared/types';
import { MessageRouter } from './services/MessageRouter';
import { StateManager } from './services/StateManager';
import { DataStorage } from './services/DataStorage';
import { MLService } from './services/MLService';
import { PluginSystemAdapter } from './PluginSystemAdapter';

// Browser API compatibility using webextension-polyfill
declare var browser: any; // webextension-polyfill provides this globally
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// Note: types are declared globally in types.ts (no module exports), so we avoid importing them here.


// Global services
let messageRouter: MessageRouter;
let stateManager: StateManager;
let dataStorage: DataStorage;
let mlService: MLService;
let pluginSystem: PluginSystemAdapter;

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
    
    // Initialize plugin system after all core services are ready
    pluginSystem = new PluginSystemAdapter();
    await pluginSystem.initialize(messageRouter, stateManager, dataStorage, mlService);
    
    // Initialize floating control center on all tabs
    setTimeout(async () => {
      try {
        const tabs = await browser.tabs.query({});
        tabs.forEach((tab: any) => {
          if (tab.id) {
            browser.tabs.sendMessage(tab.id, { 
              type: 'SHOW_FLOATING_CONTROL' 
            }).catch(() => {
              // Tab might not have content script, ignore
            });
          }
        });
      } catch (error) {
        console.warn('[Background] Failed to show floating control centers:', error);
      }
    }, 2000);
    
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
    'ui.focus_change': handleSynapseEvent,
    'ui.mouse_hover': handleSynapseEvent,
    'ui.mouse_pattern': handleSynapseEvent,
    'ui.clipboard': handleSynapseEvent,
    'user.scroll': handleSynapseEvent,
    'form.submit': handleSynapseEvent,
    'browser.tab.created': handleSynapseEvent,
    'browser.tab.activated': handleSynapseEvent,
    'browser.tab.updated': handleSynapseEvent,
    'browser.tab.removed': handleSynapseEvent,
    'browser.page_visibility': handleSynapseEvent,
    
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
    
    // Floating control center messages
    'FLOATING_CONTROL_TOGGLE_MONITORING': handleFloatingControlToggleMonitoring,
    'FLOATING_CONTROL_EXPORT_DATA': handleFloatingControlExportData,
    'FLOATING_CONTROL_TOGGLE_SMART_ASSISTANT': handleFloatingControlToggleSmartAssistant,
    'FLOATING_CONTROL_OPEN_DEBUG_TOOLS': handleFloatingControlOpenDebugTools,
    'FLOATING_CONTROL_OPEN_SETTINGS': handleFloatingControlOpenSettings,
    'FLOATING_CONTROL_TOGGLE_TASK_GUIDANCE': handleFloatingControlToggleTaskGuidance,
    'FLOATING_CONTROL_EXIT_CURRENT_TASK': handleFloatingControlExitCurrentTask,
  });
}

function setupConnectionHandlers(): void {
  // Popup connection handler
  messageRouter.registerConnectionHandler('popup', (port: any) => {
    port.onMessage.addListener(async (message: any) => {
      await handlePopupMessage(port, message);
    });
    
    // Send initial data immediately when popup connects
    broadcastCompleteDataSnapshot(port);
  });
  
  // Smart assistant connection handler
  messageRouter.registerConnectionHandler('smart-assistant', (port: any) => {
    port.onMessage.addListener(async (message: any) => {
      await handleAssistantMessage(port, message);
    });
  });
}

// Broadcast complete data snapshot to popup
async function broadcastCompleteDataSnapshot(port?: any): Promise<void> {
  try {
    const sequence = await dataStorage.getSequence('globalActionSequence');
    const pauseState = stateManager.get('extensionPaused') || false;
    const guidanceEnabled = stateManager.get('assistantEnabled') !== false;
    let modelInfo = stateManager.get('fullModelInfo');

    // If model info is not cached yet, try to get it from MLService
    if (!modelInfo && mlService) {
      try {
        const freshModelInfo = await mlService.getModelInfo();
        if (freshModelInfo && freshModelInfo.status === 'ready') {
          modelInfo = freshModelInfo;
          // Cache it for future requests
          stateManager.set('fullModelInfo', modelInfo);
        }
      } catch (error) {
        console.warn('[Background] Failed to retrieve fresh model info:', error);
      }
    }

    const data = {
      type: 'initialData',
      data: {
        sequence: sequence.slice(-100),
        paused: pauseState,
        guidanceEnabled: guidanceEnabled,
        modelInfo: modelInfo || { status: 'loading' },
        timestamp: Date.now()
      }
    };

    if (port) {
      // Send to specific port
      port.postMessage(data);
    } else {
      // Broadcast to all popup connections
      messageRouter.broadcast('popup', data);
    }
  } catch (error) {
    console.error('[Background] Error broadcasting complete data snapshot:', error);
  }
}

// Event handlers
async function handleSynapseEvent(message: any, _sender: any): Promise<void> {
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
      await mlService.processEvent(message);
      
      // Process through plugin system (non-blocking)
      if (pluginSystem && pluginSystem.isInitialized()) {
        pluginSystem.processEvent(message).catch(error => {
          console.warn('[Background] Plugin system processing error:', error);
        });
      }
      
      // Broadcast to connected clients
      messageRouter.broadcast('popup', {
        type: 'eventAdded',
        data: message
      });

      // Get latest prediction and send unified update
      try {
        const prediction = await mlService.getPrediction();
        
        // Send unified prediction update (handles both task guidance and intelligent focus)
        await handlePredictionUpdate(message, prediction);
        
        messageRouter.broadcast('popup', {
          type: 'predictionUpdate',
          data: prediction
        });
        
      } catch (predErr) {
        console.warn('[Background] Prediction attempt failed (will continue):', predErr);
      }
      
      // Check if training is needed
      const sequence = await dataStorage.getSequence('globalActionSequence');
      if (sequence.length % 20 === 0 && sequence.length >= 20) {
        try {
          await mlService.trainModel();
          console.log('[Background] Model training completed');
          // Post-train prediction update
          try {
            const postTrainPrediction = await mlService.getPrediction();
            messageRouter.broadcast('popup', {
              type: 'predictionUpdate',
              data: postTrainPrediction
            });
            
            // Send to all content scripts for confidence display
            const tabs = await browser.tabs.query({});
            tabs.forEach((tab: any) => {
              if (tab.id) {
                browser.tabs.sendMessage(tab.id, { 
                  type: 'PREDICTION_UPDATE', 
                  data: { confidence: postTrainPrediction.confidence * 100 } // Convert to percentage
                }).catch(() => {
                  // Tab might not have content script, ignore
                });
              }
            });
          } catch (e) {
            console.warn('[Background] Post-train prediction failed:', e);
          }
        } catch (error) {
          console.error('[Background] Training failed:', error);
        }
      }
      
      return;
    }
    
    console.warn('[Background] Received malformed event:', message);
  } catch (error) {
    console.error('[Background] Error handling SynapseEvent:', error);
  }
}

// Unified prediction handling - sends single PREDICTION_UPDATE message
async function handlePredictionUpdate(
  _currentEvent: SynapseEvent, 
  prediction: any
): Promise<void> {
  try {
    // Clean up timed out tasks
    if (stateManager.isTaskTimedOut()) {
      stateManager.completeActiveTask();
      console.log('[Background] Task timed out and completed');
    }

    // If we have task guidance, handle task state management
    if (prediction.taskGuidance) {
      const taskGuidance = prediction.taskGuidance;
      const activeTask = stateManager.getActiveTask();
      
      if (!activeTask || activeTask.taskId !== taskGuidance.taskId) {
        // Start new task
        const newTask: TaskState = {
          taskId: taskGuidance.taskId,
          taskName: `Task Sequence ${taskGuidance.totalSteps} steps`,
          currentStep: taskGuidance.currentStep,
          totalSteps: taskGuidance.totalSteps,
          steps: [taskGuidance.nextStep], // We only have next step info
          startedAt: Date.now(),
          lastActionAt: Date.now(),
          isActive: true
        };
        
        stateManager.setActiveTask(newTask);
        console.log('[Background] Started new task:', taskGuidance.taskId);
      } else {
        // Update existing task
        stateManager.updateTaskStep(taskGuidance.currentStep);
        console.log('[Background] Updated task step:', taskGuidance.currentStep);
      }
    }

    // Send unified prediction update to content scripts
    const tabs = await browser.tabs.query({});
    tabs.forEach((tab: any) => {
      if (tab.id) {
        browser.tabs.sendMessage(tab.id, { 
          type: 'PREDICTION_UPDATE',
          data: prediction
        }).catch(() => {
          // Tab might not have content script, ignore
        });
      }
    });

    console.log('[Background] Sent unified prediction update:', prediction.taskGuidance ? 'task guidance' : 'intelligent focus');

  } catch (error) {
    console.error('[Background] Error handling prediction update:', error);
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

// Floating Control Center handlers
async function handleFloatingControlToggleMonitoring(): Promise<any> {
  try {
    const currentState = stateManager.get('extensionPaused') || false;
    const newState = !currentState;
    
    stateManager.set('extensionPaused', newState);
    messageRouter.broadcast('popup', { type: 'pauseStateChanged', data: newState });
    
    // Send to all content scripts to show/hide the control center feedback
    const tabs = await browser.tabs.query({});
    tabs.forEach((tab: any) => {
      if (tab.id) {
        browser.tabs.sendMessage(tab.id, { 
          type: 'MONITORING_STATE_CHANGED', 
          data: { monitoring: !newState } 
        }).catch(() => {
          // Tab might not have content script, ignore
        });
      }
    });
    
    return { success: true, monitoring: !newState };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleFloatingControlExportData(): Promise<any> {
  try {
    const data = await dataStorage.exportData();
    
    // Send to all content scripts to show export success
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      browser.tabs.sendMessage(tabs[0].id, { 
        type: 'SHOW_NOTIFICATION', 
        data: { message: 'Data exported successfully', type: 'success' } 
      }).catch(() => {
        // Tab might not have content script, ignore
      });
    }
    
    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleFloatingControlToggleSmartAssistant(): Promise<any> {
  try {
    const currentState = stateManager.get('assistantEnabled') !== false;
    const newState = !currentState;
    
    stateManager.set('assistantEnabled', newState);
    stateManager.markAsPersistent('assistantEnabled');
    
    // Send to all content scripts
    const tabs = await browser.tabs.query({});
    tabs.forEach((tab: any) => {
      if (tab.id) {
        browser.tabs.sendMessage(tab.id, { 
          type: 'ASSISTANT_STATE_CHANGED', 
          data: { enabled: newState } 
        }).catch(() => {
          // Tab might not have content script, ignore
        });
      }
    });
    
    return { success: true, enabled: newState };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleFloatingControlOpenDebugTools(): Promise<any> {
  try {
    // Open popup in new tab for debug tools access
    const popupUrl = browser.runtime.getURL('popup.html');
    await browser.tabs.create({ url: popupUrl });
    
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleFloatingControlOpenSettings(): Promise<any> {
  try {
    // Open extension options page or popup
    const optionsUrl = browser.runtime.getURL('popup.html');
    await browser.tabs.create({ url: optionsUrl });
    
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleFloatingControlToggleTaskGuidance(): Promise<any> {
  try {
    const currentState = stateManager.get('taskGuidanceEnabled') !== false;
    const newState = !currentState;
    
    stateManager.set('taskGuidanceEnabled', newState);
    stateManager.markAsPersistent('taskGuidanceEnabled');
    
    // Send to all content scripts
    const tabs = await browser.tabs.query({});
    tabs.forEach((tab: any) => {
      if (tab.id) {
        browser.tabs.sendMessage(tab.id, { 
          type: 'TASK_GUIDANCE_STATE_CHANGED', 
          data: { enabled: newState } 
        }).catch(() => {
          // Tab might not have content script, ignore
        });
      }
    });
    
    return { success: true, enabled: newState };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

async function handleFloatingControlExitCurrentTask(): Promise<any> {
  try {
    // Complete active task if any
    const activeTask = stateManager.getActiveTask();
    if (activeTask) {
      stateManager.completeActiveTask();
      
      // Notify all content scripts to clear task guidance
      const tabs = await browser.tabs.query({});
      tabs.forEach((tab: any) => {
        if (tab.id) {
          browser.tabs.sendMessage(tab.id, { 
            type: 'TASK_EXITED',
            data: { taskId: activeTask.taskId }
          }).catch(() => {
            // Tab might not have content script, ignore
          });
        }
      });
    }
    
    return { success: true, taskExited: !!activeTask };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// Connection message handlers
async function handlePopupMessage(port: any, message: any): Promise<void> {
  try {
    if (message.type === 'requestInitialData') {
      await broadcastCompleteDataSnapshot(port);
    } else {
      // Handle simple messages without response
      const handler = messageRouter.messageHandlers.get(message.type);
      if (handler) {
        await handler(message, null, null);
      }
    }
  } catch (error) {
    console.error('[Background] Error handling popup message:', error);
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


// Initialize everything when the background script loads

initializeServices().catch(error => {
  console.error('[SYNAPSE BACKGROUND] Critical initialization error:', error);
});


// Cleanup on extension unload
self.addEventListener('beforeunload', () => {
  mlService?.cleanup();
  dataStorage?.flushAllPendingWrites();
});