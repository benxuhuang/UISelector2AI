// src/sidepanel/sidepanel.js

function loadAnnotations() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const tabId = tabs[0].id; // Not used for storage key directly in this simplified version, using URL
        const url = tabs[0].url;

        chrome.storage.local.get(['annotations_' + url], (result) => {
            const annotations = result['annotations_' + url] || [];
            renderAnnotations(annotations);
        });
    });
}

function renderAnnotations(annotations) {
    const list = document.getElementById('annotationList');
    list.innerHTML = '';

    if (annotations.length === 0) {
        const isMac = /Mac/.test(navigator.platform);
        const startShortcut = isMac ? '⌃⇧O' : 'Alt+O';
        list.innerHTML = `<div class="text-center text-muted p-4">No annotations yet.<br><span class="text-xs">${startShortcut} to start.</span></div>`;
        return;
    }

    let dragFromIndex = null;
    let didDrag = false; // Flag to distinguish a drag from a simple click on the card

    annotations.forEach((ant, index) => {
        const div = document.createElement('div');
        div.draggable = true;
        div.dataset.index = index;
        div.style.cursor = 'pointer';

        if (ant.type === 'network') {
            div.className = 'card card-network';
            const method = (ant.method || 'GET').toUpperCase();
            const methodClass = method.toLowerCase();
            const shortUrl = (ant.requestUrl || '').length > 40
                ? '…' + (ant.requestUrl || '').slice(-38)
                : (ant.requestUrl || '');
            const safeUrl = shortUrl.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const statusClass = ant.status >= 200 && ant.status < 300 ? 'status-ok'
                : ant.status >= 400 || ant.status === 0 ? 'status-err' : 'status-warn';

            div.innerHTML = `
                <div class="card-header">
                    <span class="method-badge ${methodClass}">${method}</span>
                    <span class="req-url" title="${(ant.requestUrl || '').replace(/"/g, '&quot;')}">${safeUrl}</span>
                    <span class="req-meta"><span class="${statusClass}">${ant.status || 'ERR'}</span> ${ant.duration}ms</span>
                    <span class="text-xs text-muted card-index">#${index + 1}</span>
                </div>
                <div class="card-feedback">${ant.feedback}</div>
            `;
        } else {
            div.className = 'card';
            const safeContent = (ant.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            div.innerHTML = `
                <div class="card-header">
                    <span class="code-badge">${ant.tagName || 'ELEMENT'}</span>
                    ${safeContent ? `<span class="text-xs text-muted inner-content" title="${safeContent}">${safeContent}</span>` : ''}
                    <span class="text-xs text-muted card-index">#${index + 1}</span>
                </div>
                <div class="card-feedback">${ant.feedback}</div>
            `;
        }

        // Start drag: visually mark the card and record its origin position
        div.addEventListener('dragstart', (e) => {
            didDrag = true;
            dragFromIndex = index;
            div.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        // Clean up styles on drop; reset didDrag on the next tick to avoid blocking the click
        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
            list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            dragFromIndex = null;
            setTimeout(() => { didDrag = false; }, 0);
        });

        // Skip opening edit if the user only dragged; didDrag distinguishes drag from intentional click
        div.addEventListener('click', () => {
            if (didDrag) return;
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length === 0) return;
                chrome.tabs.sendMessage(tabs[0].id, { action: 'editAnnotation', index });
            });
        });

        // Visually indicate a valid drop zone while dragging over it
        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            if (parseInt(div.dataset.index) !== dragFromIndex) {
                div.classList.add('drag-over');
            }
        });

        // Remove the visual indicator when the cursor leaves the card
        div.addEventListener('dragleave', () => {
            div.classList.remove('drag-over');
        });

        // On drop, reorder only if the destination differs from the origin
        div.addEventListener('drop', (e) => {
            e.preventDefault();
            div.classList.remove('drag-over');
            const toIndex = parseInt(div.dataset.index);
            if (dragFromIndex !== null && dragFromIndex !== toIndex) {
                reorderAnnotations(dragFromIndex, toIndex);
            }
        });

        list.appendChild(div);
    });
}

document.getElementById('exportBtn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0].url;
        const contextKey = 'context_' + url;
        chrome.storage.local.get(['annotations_' + url, contextKey], (result) => {
            const annotations = result['annotations_' + url] || [];
            const context = result[contextKey] || '';
            const prompt = generatePrompt(url, annotations, context);
            navigator.clipboard.writeText(prompt).then(() => {
                const toast = document.getElementById('toast');
                toast.classList.add('show');
                setTimeout(() => { toast.classList.remove('show'); }, 3000);
            });
        });
    });
});

document.getElementById('clearBtn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const url = tabs[0].url;
        const tabId = tabs[0].id;
        // Only clear annotations, preserve context
        chrome.storage.local.remove(['annotations_' + url], () => {
            loadAnnotations();
            chrome.tabs.sendMessage(tabId, { action: 'clearAnnotations' });
        });
    });
});


// Reorder using splice to move the element without losing data, and persist so the order survives a reload
function reorderAnnotations(fromIndex, toIndex) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const url = tabs[0].url;
        const tabId = tabs[0].id;
        const key = 'annotations_' + url;

        chrome.storage.local.get([key], (result) => {
            const annotations = result[key] || [];
            if (fromIndex < 0 || fromIndex >= annotations.length) return;
            const [moved] = annotations.splice(fromIndex, 1);
            annotations.splice(toIndex, 0, moved);

            chrome.storage.local.set({ [key]: annotations }, () => {
                renderAnnotations(annotations);
                chrome.tabs.sendMessage(tabId, { action: 'annotationsUpdated' }).catch(() => {});
            });
        });
    });
}

function generatePrompt(url, annotations, context) {
    let output = `# Webpage Context\nURL: ${url}\n`;
    if (context) {
        output += `\n## Initial Context\n${context}\n`;
    }
    output += `\n# Annotations\n`;
    annotations.forEach((ant, index) => {
        output += `\n## Annotation ${index + 1}`;
        if (ant.type === 'network') {
            output += ` (Network Request)\n`;
            output += `**Request**: \`${ant.method} ${ant.requestUrl}\` → ${ant.status} ${ant.statusText || ''} (${ant.duration}ms)\n`;
            if (ant.payload) output += `**Payload**: \`\`\`\n${ant.payload}\n\`\`\`\n`;
            if (ant.response) output += `**Response**: \`\`\`\n${ant.response}\n\`\`\`\n`;
            if (ant.initiator) output += `**Initiator**: ${ant.initiator}\n`;
            output += `**Feedback**: ${ant.feedback}\n`;
        } else {
            output += `\n`;
            output += `**Target**: \`${ant.selector}\`\n`;
            output += `**Feedback**: ${ant.feedback}\n`;
            output += `**TagName**: ${ant.tagName}\n`;
            if (ant.content) output += `**Inner Content**: ${ant.content}\n`;
        }
    });
    return output;
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'annotationsUpdated') {
        loadAnnotations();
    }
    if (request.action === 'networkCaptureChanged') {
        const btn = document.getElementById('networkCaptureBtn');
        btn.classList.toggle('active', request.capturing);
    }
});

// Toggle Inspect Mode button
const toggleInspectBtn = document.getElementById('toggleInspectBtn');
// Delegate the toggle to the content script and sync the button's visual state with the response
toggleInspectBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleInspect' }, (response) => {
            if (chrome.runtime.lastError) return;
            toggleInspectBtn.classList.toggle('active', response && response.inspectMode);
        });
    });
});

// Query the actual state from the content script so the button reflects whether inspect is active (prevents desync)
function updateInspectBtnState() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getInspectStatus' }, (response) => {
            if (chrome.runtime.lastError) return;
            toggleInspectBtn.classList.toggle('active', response && response.inspectMode);
        });
    });
}

// Send message to the background script because only it has permission to close/open the side panel
document.getElementById('closePanelBtn').addEventListener('click', () => {
    chrome.windows.getCurrent((win) => {
        chrome.runtime.sendMessage({ command: 'open_side_panel', windowId: win.id });
    });
});

// Context editor: two modes – edit (textarea) and display (paragraph)
const contextBtn = document.getElementById('contextBtn');
const contextArea = document.getElementById('contextArea');
const contextInput = document.getElementById('contextInput');
const contextDisplay = document.getElementById('contextDisplay');
const contextText = document.getElementById('contextText');
const contextSaveBtn = document.getElementById('contextSaveBtn');

function showContextEdit() {
    contextDisplay.classList.remove('visible');
    contextArea.classList.add('open');
    contextBtn.classList.add('active');
    setTimeout(() => contextInput.focus(), 50);
}

function showContextDisplay(value) {
    contextArea.classList.remove('open');
    contextText.textContent = value;
    contextDisplay.classList.add('visible');
    contextBtn.classList.add('active');
}

function hideContext() {
    contextArea.classList.remove('open');
    contextDisplay.classList.remove('visible');
    contextBtn.classList.remove('active');
}

// Pencil button: if context is saved → open edit with current value; if empty → open edit blank
contextBtn.addEventListener('click', () => {
    if (contextArea.classList.contains('open')) {
        // Already editing, close without saving
        if (contextInput.value.trim()) {
            saveContext(contextInput.value.trim());
        } else {
            hideContext();
        }
    } else {
        showContextEdit();
    }
});

// "Set" button: save and switch to display mode
contextSaveBtn.addEventListener('click', () => {
    const value = contextInput.value.trim();
    if (value) {
        saveContext(value);
    } else {
        clearContext();
    }
});

// Click on the displayed paragraph → go back to edit mode
contextText.addEventListener('click', () => {
    showContextEdit();
});

// X button on context display → remove context
document.getElementById('contextRemoveBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    clearContext();
});

function saveContext(value) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const key = 'context_' + tabs[0].url;
        chrome.storage.local.set({ [key]: value }, () => {
            showContextDisplay(value);
        });
    });
}

function clearContext() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const key = 'context_' + tabs[0].url;
        chrome.storage.local.remove([key], () => {
            contextInput.value = '';
            hideContext();
        });
    });
}

function loadContext() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const key = 'context_' + tabs[0].url;
        chrome.storage.local.get([key], (result) => {
            const value = result[key] || '';
            contextInput.value = value;
            if (value) {
                showContextDisplay(value);
            } else {
                hideContext();
            }
        });
    });
}

// Network Capture toggle
const networkCaptureBtn = document.getElementById('networkCaptureBtn');
networkCaptureBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleNetworkCapture' }, (response) => {
            if (chrome.runtime.lastError) return;
            networkCaptureBtn.classList.toggle('active', response && response.capturing);
        });
    });
});

function updateNetworkCaptureBtnState() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getNetworkCaptureStatus' }, (response) => {
            if (chrome.runtime.lastError) return;
            networkCaptureBtn.classList.toggle('active', response && response.capturing);
        });
    });
}

// Initial load
loadAnnotations();
loadContext();
updateInspectBtnState();
updateNetworkCaptureBtnState();

// Connect to background script to signal that the side panel is open
// We include the windowId in the name to track which window has the side panel open
chrome.windows.getCurrent((window) => {
    chrome.runtime.connect({ name: `sidepanel-${window.id}` });
});
