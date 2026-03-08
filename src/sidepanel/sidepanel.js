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
        div.className = 'card';
        div.draggable = true;
        div.dataset.index = index;
        div.style.cursor = 'pointer';

        const safeContent = (ant.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        div.innerHTML = `
            <div class="card-header">
                <span class="code-badge">${ant.tagName || 'ELEMENT'}</span>
                ${safeContent ? `<span class="text-xs text-muted inner-content" title="${safeContent}">${safeContent}</span>` : ''}
                <span class="text-xs text-muted card-index">#${index + 1}</span>
            </div>
            <div class="card-feedback">${ant.feedback}</div>
        `;

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
        chrome.storage.local.get(['annotations_' + url], (result) => {
            const annotations = result['annotations_' + url] || [];
            const prompt = generatePrompt(url, annotations);
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
        chrome.storage.local.remove(['annotations_' + url], () => {
            loadAnnotations();
            // Notify content script to remove visuals
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

function generatePrompt(url, annotations) {
    let output = `# Webpage Context\nURL: ${url}\n\n# Annotations\n`;
    annotations.forEach((ant, index) => {
        output += `\n## Annotation ${index + 1}\n`;
        output += `**Target**: \`${ant.selector}\`\n`;
        output += `**Feedback**: ${ant.feedback}\n`;
        output += `**TagName**: ${ant.tagName}\n`;
        if (ant.content) output += `**Inner Content**: ${ant.content}\n`;
    });
    return output;
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'annotationsUpdated') {
        loadAnnotations();
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

// Initial load
loadAnnotations();
updateInspectBtnState();

// Connect to background script to signal that the side panel is open
// We include the windowId in the name to track which window has the side panel open
chrome.windows.getCurrent((window) => {
    chrome.runtime.connect({ name: `sidepanel-${window.id}` });
});
