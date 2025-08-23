/**
 * Message Router - Centralized message handling for the background script
 */

// Browser API compatibility using webextension-polyfill
declare var browser: any; // webextension-polyfill provides this globally

interface MessageHandler {
  (message: any, sender?: any, sendResponse?: any): Promise<any> | any;
}

interface ConnectionHandler {
  (port: any): void;
}

export class MessageRouter {
  public messageHandlers: Map<string, MessageHandler> = new Map();
  private connectionHandlers: Map<string, ConnectionHandler> = new Map();
  private connections: Map<string, Set<any>> = new Map();

  constructor() {
    this.initializeListeners();
  }

  private initializeListeners() {
    // Single message listener
    browser.runtime.onMessage.addListener(async (message: any, sender: any, sendResponse: any) => {
      try {
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
          const result = await handler(message, sender, sendResponse);
          if (result !== undefined) {
            sendResponse(result);
          }
          return true; // Keep the message channel open for async responses
        } else {
          console.warn(`[MessageRouter] No handler found for message type: ${message.type}`);
          sendResponse({ error: `Unknown message type: ${message.type}` });
        }
      } catch (error) {
        console.error(`[MessageRouter] Error handling message:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({ error: errorMessage });
      }
      return true;
    });

    // Connection listener
    browser.runtime.onConnect.addListener((port: any) => {
      const connectionType = port.name;
      const handler = this.connectionHandlers.get(connectionType);
      
      if (handler) {
        // Add to connections tracking
        if (!this.connections.has(connectionType)) {
          this.connections.set(connectionType, new Set());
        }
        this.connections.get(connectionType)!.add(port);

        // Set up disconnect cleanup
        port.onDisconnect.addListener(() => {
          this.connections.get(connectionType)?.delete(port);
          console.log(`[MessageRouter] ${connectionType} disconnected`);
        });

        // Call the handler
        handler(port);
        console.log(`[MessageRouter] ${connectionType} connected`);
      } else {
        console.warn(`[MessageRouter] No handler found for connection type: ${connectionType}`);
      }
    });
  }

  /**
   * Register a handler for a specific message type
   */
  registerMessageHandler(messageType: string, handler: MessageHandler): void {
    this.messageHandlers.set(messageType, handler);
  }

  /**
   * Register multiple message handlers at once
   */
  registerMessageHandlers(handlers: Record<string, MessageHandler>): void {
    Object.entries(handlers).forEach(([type, handler]) => {
      this.registerMessageHandler(type, handler);
    });
  }

  /**
   * Register a handler for a specific connection type
   */
  registerConnectionHandler(connectionType: string, handler: ConnectionHandler): void {
    this.connectionHandlers.set(connectionType, handler);
  }

  /**
   * Get all connections of a specific type
   */
  getConnections(connectionType: string): Set<any> | undefined {
    return this.connections.get(connectionType);
  }

  /**
   * Broadcast a message to all connections of a specific type
   */
  broadcast(connectionType: string, message: any): void {
    const connections = this.connections.get(connectionType);
    if (connections) {
      connections.forEach(port => {
        try {
          port.postMessage(message);
        } catch (error) {
          console.error(`[MessageRouter] Error broadcasting to ${connectionType}:`, error);
          // Remove the failed connection
          connections.delete(port);
        }
      });
    }
  }

  /**
   * Remove a message handler
   */
  unregisterMessageHandler(messageType: string): void {
    this.messageHandlers.delete(messageType);
  }

  /**
   * Remove a connection handler
   */
  unregisterConnectionHandler(connectionType: string): void {
    this.connectionHandlers.delete(connectionType);
  }
}