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
        list.innerHTML = '<div class="text-center text-muted p-4">No annotations yet.<br><span class="text-xs">Alt+I to start.</span></div>';
        return;
    }

    annotations.forEach((ant, index) => {
        const div = document.createElement('div');
        div.className = 'card mb-3 cursor-pointer';
        // Add mb-3 util if not present or just style in clean css
        // ui.css has no mb-3, but has gap-2 in flex container if used. 
        // I will add inline style or assume style in sidepanel.html handles gap.
        // Actually ui.css has .card with margin-bottom? No.
        // I'll rely on the container being flex-col gap-3.

        div.innerHTML = `
            <div class="card-header">
                <span class="code-badge truncate">${ant.tagName || 'ELEMENT'}</span>
                <span class="text-xs text-muted">#${index + 1}</span>
            </div>
            <div class="text-xs font-mono text-muted truncate mb-2 bg-slate-50 p-1 rounded" title="${ant.selector}">${ant.selector}</div>
            <div class="text-sm text-slate-800">${ant.feedback}</div>
        `;
        div.addEventListener('click', () => {
            // Scroll to element (requires message to content script)
            // Could implement highlighting here later
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


function generatePrompt(url, annotations) {
    let output = `# Webpage Context\nURL: ${url}\n\n# Annotations\n`;
    annotations.forEach((ant, index) => {
        output += `\n## Annotation ${index + 1}\n`;
        output += `**Target**: \`${ant.selector}\`\n`;
        output += `**Feedback**: ${ant.feedback}\n`;
        output += `**TagName**: ${ant.tagName}\n`;
    });
    return output;
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'annotationsUpdated') {
        loadAnnotations();
    }
});

// Initial load
loadAnnotations();

// Connect to background script to signal that the side panel is open
// We include the windowId in the name to track which window has the side panel open
chrome.windows.getCurrent((window) => {
    chrome.runtime.connect({ name: `sidepanel-${window.id}` });
});
