// src/sidepanel/sidepanel.js

function getOrigin(url) {
    try { return new URL(url).origin; } catch { return url; }
}

function safeSendTab(tabId, msg) {
    chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

function loadAnnotations() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const url = tabs[0].url;
        const origin = getOrigin(url);
        const key = 'annotations_' + origin;

        // Migration: check for legacy per-URL keys
        chrome.storage.local.get(null, (all) => {
            const legacyPrefix = 'annotations_' + origin + '/';
            const legacyKeys = Object.keys(all).filter(k =>
                k !== key && k.startsWith(legacyPrefix)
            );
            if (legacyKeys.length > 0) {
                let existing = all[key] || [];
                legacyKeys.forEach(lk => {
                    const legacyAnns = all[lk] || [];
                    legacyAnns.forEach(a => {
                        if (!existing.find(e => e.id === a.id)) {
                            existing.push(a);
                        }
                    });
                });
                chrome.storage.local.set({ [key]: existing }, () => {
                    chrome.storage.local.remove(legacyKeys, () => {
                        console.log('[UISelector2AI] Sidepanel migrated legacy keys:', legacyKeys);
                        renderAnnotations(existing);
                    });
                });
            } else {
                const annotations = all[key] || [];
                renderAnnotations(annotations);
            }
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
    let didDrag = false;
    let lastUrl = null;

    annotations.forEach((ant, index) => {
        // URL group header
        if (ant.url !== lastUrl) {
            const header = document.createElement('div');
            header.className = 'url-group-header';
            try {
                const parsed = new URL(ant.url);
                header.textContent = parsed.pathname + parsed.search;
            } catch { header.textContent = ant.url; }
            header.title = ant.url;
            list.appendChild(header);
            lastUrl = ant.url;
        }

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

        div.addEventListener('dragstart', (e) => {
            didDrag = true;
            dragFromIndex = index;
            div.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
            list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            dragFromIndex = null;
            setTimeout(() => { didDrag = false; }, 0);
        });

        div.addEventListener('click', () => {
            if (didDrag) return;
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length === 0) return;
                safeSendTab(tabs[0].id, {
                    action: 'editAnnotation',
                    annotationId: annotations[index].id,
                    annotationUrl: annotations[index].url
                });
            });
        });

        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            if (parseInt(div.dataset.index) !== dragFromIndex) {
                div.classList.add('drag-over');
            }
        });

        div.addEventListener('dragleave', () => {
            div.classList.remove('drag-over');
        });

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
        const origin = getOrigin(url);
        const annKey = 'annotations_' + origin;
        const ctxKey = 'context_' + origin;

        chrome.storage.local.get([annKey, ctxKey], (result) => {
            const annotations = result[annKey] || [];
            const context = result[ctxKey] || '';
            const prompt = generatePrompt(annotations, context);
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
        const origin = getOrigin(url);
        const tabId = tabs[0].id;
        chrome.storage.local.remove(['annotations_' + origin], () => {
            loadAnnotations();
            safeSendTab(tabId, { action: 'clearAnnotations' });
        });
    });
});


function reorderAnnotations(fromIndex, toIndex) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const url = tabs[0].url;
        const origin = getOrigin(url);
        const tabId = tabs[0].id;
        const key = 'annotations_' + origin;

        chrome.storage.local.get([key], (result) => {
            const annotations = result[key] || [];
            if (fromIndex < 0 || fromIndex >= annotations.length) return;
            const [moved] = annotations.splice(fromIndex, 1);
            annotations.splice(toIndex, 0, moved);

            chrome.storage.local.set({ [key]: annotations }, () => {
                renderAnnotations(annotations);
                safeSendTab(tabId, { action: 'annotationsUpdated' });
            });
        });
    });
}

function summarizeContent(raw, maxLines = 6, maxLen = 300) {
    if (!raw) return '';
    // Collapse runs of whitespace into single lines, trim each
    const lines = raw.split(/\n+/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    // Deduplicate consecutive identical lines
    const unique = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
    const sliced = unique.slice(0, maxLines);
    let result = sliced.join(' | ');
    if (unique.length > maxLines) result += ' ...';
    if (result.length > maxLen) result = result.slice(0, maxLen) + '...';
    return result;
}

function generatePrompt(annotations, context) {
    if (annotations.length === 0) return '';

    let output = `# Webpage Annotations\n`;
    if (context) {
        output += `\n## Context\n${context}\n`;
    }

    // Iterate in storage order, insert page header when URL changes
    let lastUrl = null;
    annotations.forEach((ant, index) => {
        if (ant.url !== lastUrl) {
            output += `\n---\n## Page: ${ant.url}\n`;
            lastUrl = ant.url;
        }
        output += `\n### Annotation ${index + 1}`;
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
            if (ant.content) output += `**Inner Content**: ${summarizeContent(ant.content)}\n`;
        }
    });

    return output;
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'annotationsUpdated') {
        loadAnnotations();
    }
    if (request.action === 'inspectModeChanged') {
        toggleInspectBtn.classList.toggle('active', request.inspectMode);
    }
    if (request.action === 'networkCaptureChanged') {
        networkCaptureBtn.classList.toggle('active', request.capturing);
    }
});

// Toggle Inspect Mode button — state synced via inspectModeChanged broadcast
const toggleInspectBtn = document.getElementById('toggleInspectBtn');
toggleInspectBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleInspect' }).catch(() => {});
    });
});

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
    contextBtn.classList.remove('active');
}

function hideContext() {
    contextArea.classList.remove('open');
    contextDisplay.classList.remove('visible');
    contextBtn.classList.remove('active');
}

contextBtn.addEventListener('click', () => {
    if (contextArea.classList.contains('open')) {
        if (contextInput.value.trim()) {
            saveContext(contextInput.value.trim());
        } else {
            hideContext();
        }
    } else {
        showContextEdit();
    }
});

contextSaveBtn.addEventListener('click', () => {
    const value = contextInput.value.trim();
    if (value) {
        saveContext(value);
    } else {
        clearContext();
    }
});

contextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const value = contextInput.value.trim();
        if (value) {
            saveContext(value);
        } else {
            clearContext();
        }
    }
});

contextText.addEventListener('click', () => {
    showContextEdit();
});

document.getElementById('contextRemoveBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    clearContext();
});

function saveContext(value) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const key = 'context_' + getOrigin(tabs[0].url);
        chrome.storage.local.set({ [key]: value }, () => {
            showContextDisplay(value);
        });
    });
}

function clearContext() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const key = 'context_' + getOrigin(tabs[0].url);
        chrome.storage.local.remove([key], () => {
            contextInput.value = '';
            hideContext();
        });
    });
}

function loadContext() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const key = 'context_' + getOrigin(tabs[0].url);
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

// Network Capture toggle — state synced via networkCaptureChanged broadcast
const networkCaptureBtn = document.getElementById('networkCaptureBtn');
networkCaptureBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleNetworkCapture' }).catch(() => {});
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
chrome.windows.getCurrent((window) => {
    chrome.runtime.connect({ name: `sidepanel-${window.id}` });
});
