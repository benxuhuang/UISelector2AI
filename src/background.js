// src/background.js

// 用於同步追蹤各個視窗 Side Panel 開啟狀態的 Set
const openSidePanels = new Set();

// 初始化：從 storage.session 恢復狀態
async function initializeSidePanelState() {
  try {
    const allStorage = await chrome.storage.session.get(null);
    for (const key in allStorage) {
      if (key.startsWith('sidepanel_open_')) {
        const windowId = parseInt(key.replace('sidepanel_open_', ''));
        if (!isNaN(windowId)) {
          openSidePanels.add(windowId);
        }
      }
    }
  } catch (e) {
    console.error('Failed to initialize side panel state:', e);
  }
}

// 執行初始化
initializeSidePanelState();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name.startsWith('sidepanel-')) {
    const windowIdStr = port.name.split('-')[1];
    const windowId = parseInt(windowIdStr);
    const storageKey = `sidepanel_open_${windowId}`;
    
    openSidePanels.add(windowId);
    chrome.storage.session.set({ [storageKey]: true });
    
    port.onDisconnect.addListener(() => {
      openSidePanels.delete(windowId);
      chrome.storage.session.remove(storageKey);
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("Agentation Clone installed");
});

// Shared toggle logic
function toggleSidePanel(windowId) {
  const isOpen = openSidePanels.has(windowId);
  if (isOpen) {
    chrome.sidePanel.close({ windowId }).catch(err => {
      console.error('Error closing side panel:', err);
    });
  } else {
    chrome.sidePanel.open({ windowId }).catch(err => {
      console.error('Error opening side panel:', err);
    });
  }
}

// Handle messages from popup to reuse toggle logic
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.command === 'open_side_panel') {
    toggleSidePanel(request.windowId);
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  console.log(`Command: ${command}`, tab);

  if (command === 'open_side_panel') {
    toggleSidePanel(tab.windowId);
  } else if (command === 'toggle_inspect' || command === 'clear_annotations') {
    if (tab && tab.id) {
      let action = '';
      if (command === 'toggle_inspect') action = 'toggleInspect';
      if (command === 'clear_annotations') action = 'clearAnnotations';

      if (action) {
        chrome.tabs.sendMessage(tab.id, { action: action }).catch(err => {
          console.log('Error sending message:', err);
        });
      }
    }
  }
});
