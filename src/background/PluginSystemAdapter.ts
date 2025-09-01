/**
 * Plugin System Adapter - Seamless integration without breaking existing code
 * Linus: "The best API is the one that doesn't break existing code"
 */

import { PluginRegistry, PluginContext } from './plugins/base';
import { PluginScheduler } from './services/PluginScheduler';
import { IntentScheduler } from './services/IntentScheduler';
import { WorkflowPlugin } from './plugins/WorkflowPlugin';
import { ClipboardPlugin } from './plugins/ClipboardPlugin';
import { MessageRouter } from './services/MessageRouter';
import { StateManager } from './services/StateManager';
import { DataStorage } from './services/DataStorage';
import { MLService } from './services/MLService';
import { SynapseEvent } from '../shared/types';

export class PluginSystemAdapter {
  private registry: PluginRegistry;
  private pluginScheduler!: PluginScheduler;
  private intentScheduler!: IntentScheduler;
  private initialized = false;
  
  constructor() {
    this.registry = new PluginRegistry();
    // Schedulers will be initialized later with dependencies
  }
  
  async initialize(
    messageRouter: MessageRouter,
    stateManager: StateManager,
    dataStorage: DataStorage,
    mlService: MLService
  ): Promise<void> {
    
    if (this.initialized) {
      console.warn('[PluginSystemAdapter] Already initialized');
      return;
    }
    
    try {
      console.log('[PluginSystemAdapter] Initializing plugin system...');
      
      // Create plugin context
      const context: PluginContext = {
        stateManager,
        dataStorage,
        messageRouter,
        mlWorker: mlService // Use MLService as worker interface
      };
      
      this.registry.setContext(context);
      
      // Initialize schedulers
      this.pluginScheduler = new PluginScheduler(
        this.registry,
        stateManager,
        messageRouter
      );
      
      this.intentScheduler = new IntentScheduler(
        this.pluginScheduler,
        mlService,
        stateManager,
        messageRouter
      );
      
      // Register core plugins
      await this.registerCorePlugins();
      
      // Set up message handlers for plugin management
      this.setupPluginMessageHandlers(messageRouter);
      
      this.initialized = true;
      console.log('[PluginSystemAdapter] Plugin system initialized successfully');
      
    } catch (error) {
      console.error('[PluginSystemAdapter] Failed to initialize:', error);
      throw error;
    }
  }
  
  private async registerCorePlugins(): Promise<void> {
    console.log('[PluginSystemAdapter] Registering core plugins...');
    
    // Register workflow automation plugin
    const workflowPlugin = new WorkflowPlugin();
    await this.registry.register(workflowPlugin);
    
    // Register clipboard plugin
    const clipboardPlugin = new ClipboardPlugin();
    await this.registry.register(clipboardPlugin);
    
    console.log(`[PluginSystemAdapter] Registered ${this.registry.getAllPlugins().length} plugins`);
  }
  
  private setupPluginMessageHandlers(messageRouter: MessageRouter): void {
    // Plugin management messages
    messageRouter.registerMessageHandler('getPluginStatus', async () => {
      return this.getPluginStatus();
    });
    
    messageRouter.registerMessageHandler('getActiveSuggestions', async () => {
      return this.pluginScheduler.getActiveSuggestions();
    });
    
    messageRouter.registerMessageHandler('clearPluginState', async () => {
      this.intentScheduler.clearState();
      return { success: true };
    });
    
    messageRouter.registerMessageHandler('forceMLPrediction', async () => {
      return await this.intentScheduler.forceMLPrediction();
    });
    
    // Enhanced clipboard functionality
    messageRouter.registerMessageHandler('getClipboardHistory', async () => {
      const clipboardPlugin = this.registry.getPlugin('context-clipboard') as ClipboardPlugin;
      return clipboardPlugin ? clipboardPlugin.getClipboardHistory() : [];
    });
    
    messageRouter.registerMessageHandler('executePasteOption', async (message: any) => {
      const clipboardPlugin = this.registry.getPlugin('context-clipboard') as ClipboardPlugin;
      if (clipboardPlugin && message.data) {
        const { optionId, target, context } = message.data;
        return await clipboardPlugin.executePasteOption(optionId, target, context);
      }
      return null;
    });
  }
  
  // Main event processing method - called from background script
  async processEvent(event: SynapseEvent): Promise<void> {
    if (!this.initialized) {
      console.warn('[PluginSystemAdapter] Not initialized, skipping event');
      return;
    }
    
    try {
      // Process through intent scheduler (coordinates plugins and ML service)
      await this.intentScheduler.processEvent(event);
    } catch (error) {
      console.error('[PluginSystemAdapter] Error processing event:', error);
    }
  }
  
  // Get plugin system status for debugging
  getPluginStatus(): any {
    if (!this.initialized) {
      return { initialized: false };
    }
    
    const plugins = this.registry.getAllPlugins().map(plugin => ({
      id: plugin.id,
      name: plugin.name,
      description: plugin.description
    }));
    
    return {
      initialized: true,
      pluginCount: plugins.length,
      plugins,
      schedulerStatus: this.intentScheduler.getStatus(),
      activeSuggestions: this.pluginScheduler.getActiveSuggestions().length
    };
  }
  
  // Get specific plugin for direct access (debugging only)
  getPlugin(pluginId: string): any {
    return this.registry.getPlugin(pluginId);
  }
  
  // Cleanup for shutdown
  async cleanup(): Promise<void> {
    if (this.initialized) {
      await this.registry.cleanup();
      this.initialized = false;
      console.log('[PluginSystemAdapter] Cleanup completed');
    }
  }
  
  // Check if system is ready
  isInitialized(): boolean {
    return this.initialized;
  }
  
  // Manual plugin registration (for development/testing)
  async registerPlugin(plugin: any): Promise<void> {
    if (!this.initialized) {
      throw new Error('Plugin system not initialized');
    }
    
    await this.registry.register(plugin);
    console.log(`[PluginSystemAdapter] Manually registered plugin: ${plugin.name}`);
  }
  
  // Get registry for advanced operations
  getRegistry(): PluginRegistry {
    return this.registry;
  }
}