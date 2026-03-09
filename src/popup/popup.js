// src/popup/popup.js

document.addEventListener('DOMContentLoaded', async () => {
    const isMac = /Mac/.test(navigator.platform);
    const shortcuts = {
        toggle_inspect: isMac ? '⌃⇧O' : 'Alt+O',
        open_side_panel: isMac ? '⌃⇧L' : 'Alt+L',
        network_capture: isMac ? '⌥N' : 'Alt+N',
        copy_prompt: isMac ? '⌥C' : 'Alt+C',
        clear_annotations: isMac ? '⌃⇧X' : 'Alt+X',
    };
    document.querySelectorAll('[data-shortcut]').forEach(el => {
        const key = el.dataset.shortcut;
        if (shortcuts[key]) el.textContent = `(${shortcuts[key]})`;
    });

    const toggleBtn = document.getElementById('toggleInspect');
    const inspectText = document.getElementById('inspectText');
    const panelBtn = document.getElementById('openSidePanel');
    // Use the existing container instead of creating a new one
    const statusDiv = document.getElementById('status-container');

    // Helper function to show status with color and auto-hide logic
    function setStatus(text, color = 'red', autoClear = false) {
        statusDiv.textContent = text;
        statusDiv.style.color = color;
        statusDiv.style.display = text ? 'block' : 'none';
        statusDiv.style.marginTop = text ? '10px' : '0'; // Add margin only when visible

        if (autoClear) {
            setTimeout(() => {
                statusDiv.textContent = '';
                statusDiv.style.display = 'none';
                statusDiv.style.marginTop = '0';
            }, 2000);
        }
    }

    if (!toggleBtn || !panelBtn) {
        console.error('Buttons not found!');
        return;
    }

    async function updateButtonState() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab) {
                setStatus('No active tab.');
                return;
            }

            if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
                setStatus('Cannot run on this page.');
                toggleBtn.disabled = true;
                return;
            }

            chrome.tabs.sendMessage(tab.id, { action: 'getInspectStatus' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('Content script not ready or error:', chrome.runtime.lastError.message);
                    // It's possible the content script isn't loaded yet on a fresh install affecting open tabs
                    setStatus('Please refresh the page.');
                } else if (response) {
                    if (inspectText) {
                        inspectText.textContent = response.inspectMode ? 'Stop Inspect' : 'Start Inspect';
                    }
                    if (response.inspectMode) {
                        toggleBtn.classList.add('active');
                    } else {
                        toggleBtn.classList.remove('active');
                    }
                    setStatus(''); // Clear status
                }
            });
        } catch (err) {
            console.error('Error updating state:', err);
            setStatus('Error: ' + err.message);
        }
    }

    toggleBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            chrome.tabs.sendMessage(tab.id, { action: 'toggleInspect' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Toggle failed:', chrome.runtime.lastError);
                    setStatus('Failed to toggle. Refresh page?');
                } else {
                    console.log('Toggle response:', response);
                    updateButtonState();
                    // window.close(); // Keep open to see status change
                }
            });
        } catch (err) {
            console.error('Error toggling:', err);
        }
    });

    panelBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            // Delegate to background.js command handler which already has toggle logic
            chrome.runtime.sendMessage({ command: 'open_side_panel', tabId: tab.id, windowId: tab.windowId });
            window.close();
        } catch (error) {
            console.error('Side panel toggle error:', error);
        }
    });

    // Network Capture button
    const networkBtn = document.getElementById('networkCapture');
    const networkText = document.getElementById('networkText');
    if (networkBtn) {
        networkBtn.addEventListener('click', async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) return;
                chrome.tabs.sendMessage(tab.id, { action: 'toggleNetworkCapture' }, (response) => {
                    if (chrome.runtime.lastError) {
                        setStatus('Failed. Refresh page?');
                        return;
                    }
                    const capturing = response && response.capturing;
                    networkBtn.classList.toggle('active', capturing);
                    if (networkText) networkText.textContent = capturing ? 'Stop Capture' : 'Network Capture';
                });
            } catch (err) {
                console.error('Error toggling network capture:', err);
            }
        });

        // Sync initial state
        (async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) return;
                chrome.tabs.sendMessage(tab.id, { action: 'getNetworkCaptureStatus' }, (response) => {
                    if (chrome.runtime.lastError) return;
                    const capturing = response && response.capturing;
                    networkBtn.classList.toggle('active', capturing);
                    if (networkText) networkText.textContent = capturing ? 'Stop Capture' : 'Network Capture';
                });
            } catch {}
        })();
    }

    // Copy Prompt button
    const copyBtn = document.getElementById('copyPrompt');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) return;

                chrome.tabs.sendMessage(tab.id, { action: 'getPrompt' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Get prompt failed:', chrome.runtime.lastError);
                        setStatus('Failed to get prompt. Refresh page?');
                    } else if (response && response.prompt) {
                        navigator.clipboard.writeText(response.prompt).then(() => {
                            setStatus('Prompt copied!', 'green', true);
                        }).catch(err => {
                            console.error('Copy failed:', err);
                            setStatus('Copy failed.');
                        });
                    } else {
                        setStatus('No annotations to copy.', 'red', true);
                    }
                });
            } catch (err) {
                console.error('Error copying prompt:', err);
            }
        });
    }

    // Clear Annotations button
    const clearBtn = document.getElementById('clearAnnotations');
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) return;

                if (confirm('Clear all annotations on this page? (Context will be preserved)')) {
                    chrome.tabs.sendMessage(tab.id, { action: 'clearAnnotations' }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('Clear failed:', chrome.runtime.lastError);
                            setStatus('Failed to clear. Refresh page?');
                        } else {
                            console.log('Clear response:', response);
                            setStatus('Annotations cleared!', 'green', true);
                        }
                    });
                }
            } catch (err) {
                console.error('Error clearing:', err);
            }
        });
    }

    // Initialize button state
    updateButtonState();
});
