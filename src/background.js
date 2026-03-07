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

chrome.commands.onCommand.addListener((command, tab) => {
  console.log(`Command: ${command}`, tab);

  if (command === 'open_side_panel') {
    // 取得當前視窗 ID
    const windowId = tab.windowId;
    
    // 同步判斷是否已開啟，避免 await 導致 User Gesture 遺失
    const isOpen = openSidePanels.has(windowId);

    if (isOpen) {
      // 關閉 side panel (透過先停用再啟用的技巧)
      chrome.sidePanel.setOptions({
        tabId: tab.id,
        enabled: false
      }).then(() => {
        // 重新啟用，以便下次可以再次開啟
        chrome.sidePanel.setOptions({
          tabId: tab.id,
          enabled: true,
          path: 'src/sidepanel/sidepanel.html'
        });
      }).catch(err => {
        console.error('Error closing side panel:', err);
      });
    } else {
      // 開啟 side panel - 必須在事件處理函式的同步區塊中呼叫以保留 User Gesture
      chrome.sidePanel.open({ windowId: windowId }).catch((error) => {
        console.error('Error opening side panel:', error);
      });
    }
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
