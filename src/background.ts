/// <reference path="./types.ts" />

const SEQUENCE_STORAGE_KEY = 'globalActionSequence';

/**
 * Adds a new event to the global sequence in session storage.
 * @param event The enriched event to add.
 */
async function addEventToSequence(event: EnrichedEvent): Promise<void> {
  try {
    const result = await new Promise<{ [key: string]: any }>(resolve => {
      chrome.storage.session.get([SEQUENCE_STORAGE_KEY], resolve);
    });

    const currentSequence = (result[SEQUENCE_STORAGE_KEY] || []) as GlobalActionSequence;
    currentSequence.push(event);

    await new Promise<void>(resolve => {
      chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: currentSequence }, resolve);
    });
    
    // Log for debugging
    console.log(`[Synapse] Event added. Total sequence length: ${currentSequence.length}`);
    console.table(currentSequence.slice(-5)); // Log last 5 events
  } catch (error) {
    console.error('[Synapse] Error adding event to sequence:', error);
  }
}

/**
 * Main message listener for events from content scripts and popups.
 */
chrome.runtime.onMessage.addListener((message: RawUserAction | { type: string }, sender, sendResponse) => {
  const { type } = message;

  const context = {
    tabId: sender.tab?.id ?? null,
    windowId: sender.tab?.windowId ?? null,
    tabInfo: sender.tab,
  };

  if (type === 'user_action_click') {
    const event: UserActionClickEvent = {
      type,
      payload: (message as RawUserAction).payload as UserActionClickPayload,
      timestamp: Date.now(),
      context,
    };
    addEventToSequence(event);
    return;
  }

  if (type === 'user_action_keydown') {
    const event: UserActionKeydownEvent = {
      type,
      payload: (message as RawUserAction).payload as UserActionKeydownPayload,
      timestamp: Date.now(),
      context,
    };
    addEventToSequence(event);
    return;
  }

  // Handle requests from the popup
  if (type === 'getSequence') {
    chrome.storage.session.get([SEQUENCE_STORAGE_KEY], (result) => {
      sendResponse({ sequence: result[SEQUENCE_STORAGE_KEY] || [] });
    });
    return true; // Indicate async response
  }

  if (message.type === 'clearSequence') {
    chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: [] }, () => {
      console.log('[Synapse] Global action sequence cleared.');
      sendResponse({ success: true });
    });
    return true; // Indicate async response
  }

  return false; // No async response
});


/**
 * Listeners for browser-level tab events.
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const payload: TabActivatedPayload = {
    tabId: activeInfo.tabId,
    windowId: activeInfo.windowId,
  };
  const event: BrowserActionTabActivatedEvent = {
    type: 'browser_action_tab_activated',
    payload,
    timestamp: Date.now(),
    context: { tabId: activeInfo.tabId, windowId: activeInfo.windowId },
  };
  await addEventToSequence(event);
});

chrome.tabs.onCreated.addListener(async (tab) => {
  const payload: TabCreatedPayload = {
    tabId: tab.id!,
    windowId: tab.windowId,
    url: tab.pendingUrl || tab.url,
  };
  const event: BrowserActionTabCreatedEvent = {
    type: 'browser_action_tab_created',
    payload,
    timestamp: Date.now(),
    context: { tabId: tab.id!, windowId: tab.windowId, tabInfo: tab },
  };
  await addEventToSequence(event);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && changeInfo.url) {
    const payload: TabUpdatedPayload = {
      tabId: tabId,
      url: changeInfo.url,
      title: tab.title,
    };
    const event: BrowserActionTabUpdatedEvent = {
      type: 'browser_action_tab_updated',
      payload,
      timestamp: Date.now(),
      context: { tabId, windowId: tab.windowId, tabInfo: tab },
    };
    await addEventToSequence(event);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const payload: TabRemovedPayload = {
    tabId,
    windowId: removeInfo.windowId,
  };
  const event: BrowserActionTabRemovedEvent = {
    type: 'browser_action_tab_removed',
    payload,
    timestamp: Date.now(),
    context: { tabId, windowId: removeInfo.windowId },
  };
  await addEventToSequence(event);
});


console.log('[Synapse] Background script loaded and ready.');
// Initialize storage on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: [] });
  console.log('[Synapse] New browser session started. Sequence cleared.');
});

// Initialize storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.set({ [SEQUENCE_STORAGE_KEY]: [] });
  console.log('[Synapse] Extension installed. Sequence storage initialized.');
});