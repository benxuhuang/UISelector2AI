// src/content.js
console.log('%c[UISelector2AI] Content script loaded!', 'color: #4285f4; font-weight: bold; font-size: 14px;');
console.log('[UISelector2AI] URL:', window.location.href);

class AgentationContentScript {
    constructor() {
        this.inspectMode = false;
        this.hoveredElement = null;
        this.overlay = null;
        this.annotations = [];
        this.activeModal = null;

        // Network capture state
        this.networkCapture = false;
        this.capturedRequests = [];
        this.networkPanel = null;
        this.MAX_CAPTURED_REQUESTS = 50;

        this.initOverlay();
        this.initEventListeners();
        this.initNetworkCapture();
        this.loadAnnotations();
        this.audioContext = null;
    }

    initAudio() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    playSound(type) {
        try {
            this.initAudio();
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            const now = this.audioContext.currentTime;

            if (type === 'on') {
                // High pitch short blip
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(800, now);
                oscillator.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
                gainNode.gain.setValueAtTime(0.1, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                oscillator.start(now);
                oscillator.stop(now + 0.1);
            } else if (type === 'off') {
                // Low pitch short blip
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(400, now);
                oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.15);
                gainNode.gain.setValueAtTime(0.1, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                oscillator.start(now);
                oscillator.stop(now + 0.15);
            } else if (type === 'success') {
                // Success chime (ascending)
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(500, now);
                oscillator.frequency.linearRampToValueAtTime(1000, now + 0.1);
                gainNode.gain.setValueAtTime(0.1, now);
                gainNode.gain.linearRampToValueAtTime(0.01, now + 0.3);
                oscillator.start(now);
                oscillator.stop(now + 0.3);
            } else if (type === 'clear') {
                // Clear/Trash sound (descending sawtooth)
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(150, now);
                oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.2);
                gainNode.gain.setValueAtTime(0.1, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                oscillator.start(now);
                oscillator.stop(now + 0.2);
            }

        } catch (e) {
            console.error('Audio play failed', e);
        }
    }

    initOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'agentation-overlay';
        // Reset styles for overlay to ensure consistency
        Object.assign(this.overlay.style, {
            position: 'absolute',
            pointerEvents: 'none',
            background: 'rgba(66, 133, 244, 0.1)',
            border: '2px solid #4285f4',
            zIndex: '999999',
            display: 'none',
            borderRadius: '4px',
            transition: 'all 0.1s ease-out'
        });
        document.body.appendChild(this.overlay);
    }

    initEventListeners() {
        document.addEventListener('mouseover', this.handleMouseOver.bind(this));
        document.addEventListener('mouseout', this.handleMouseOut.bind(this));
        document.addEventListener('click', this.handleClick.bind(this), true);

        // Listen for scroll/resize to update positions
        window.addEventListener('scroll', () => this.updatePositions(), { passive: true });
        window.addEventListener('resize', () => this.updatePositions(), { passive: true });

        // Add Esc key handler to cancel inspect mode
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.inspectMode) {
                // If modal is open, let its own handler (or user) deal with it, 
                // but if we want Esc to always quit inspect mode:
                this.inspectMode = false;
                this.hideOverlay();
                if (this.activeModal) {
                    this.activeModal.host.remove();
                    this.activeModal = null;
                }
                this.hoveredElement = null;
                this.playSound('off');
            }

            // Handle Alt+C (Option+C on Mac) for copy prompt
            // Use e.code because on Mac, Option+C produces 'ç' as e.key
            if (e.altKey && e.code === 'KeyC') {
                e.preventDefault();
                this.copyPromptToClipboard();
            }

            // Alt+N to toggle network capture
            if (e.altKey && e.code === 'KeyN') {
                e.preventDefault();
                this.toggleNetworkCapture();
            }
        });

        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'toggleInspect') {
                if (typeof request.value !== 'undefined') {
                    this.inspectMode = request.value;
                } else {
                    this.inspectMode = !this.inspectMode;
                }

                if (!this.inspectMode) {
                    this.hideOverlay();
                    // Close modal if open
                    if (this.activeModal) {
                        this.activeModal.host.remove();
                        this.activeModal = null;
                    }
                    this.hoveredElement = null;
                    this.playSound('off');
                } else {
                    this.playSound('on');
                }
                sendResponse({ status: 'ok', inspectMode: this.inspectMode });
            } else if (request.action === 'getInspectStatus') {
                sendResponse({ status: 'ok', inspectMode: this.inspectMode });
            } else if (request.action === 'clearAnnotations') {
                this.clearAllAnnotations();
                sendResponse({ status: 'ok' });
            } else if (request.action === 'getPrompt') {
                const prompt = this.generatePromptText();
                sendResponse({ status: 'ok', prompt: prompt });
            } else if (request.action === 'annotationsUpdated') {
                this.loadAnnotations();
                sendResponse({ status: 'ok' });
            } else if (request.action === 'toggleNetworkCapture') {
                this.toggleNetworkCapture();
                sendResponse({ status: 'ok', capturing: this.networkCapture });
            } else if (request.action === 'getNetworkCaptureStatus') {
                sendResponse({ status: 'ok', capturing: this.networkCapture });
            } else if (request.action === 'editAnnotation') {
                const index = request.index;
                const ant = this.annotations[index];
                if (ant) {
                    if (ant.type === 'network') {
                        this.openNetworkEditModal(ant, index);
                    } else {
                        const el = document.querySelector(ant.selector);
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setTimeout(() => this.openModal(el, ant, index), 300);
                        }
                    }
                }
                sendResponse({ status: 'ok' });
            }
        });

        // Add MutationObserver to handle dynamic content
        this.mutationObserver = new MutationObserver(this.debounce(() => {
            this.updatePositions();
        }, 100));
        this.mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    copyPromptToClipboard() {
        const output = this.generatePromptText();
        if (!output) {
            this.showToast('No annotations to copy', true);
            return;
        }

        window.focus();

        // 嘗試使用現代 Clipboard API
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(output).then(() => {
                this.showToast('Copy successful');
                this.playSound('success');
            }).catch(err => {
                console.warn('Navigator clipboard failed, trying fallback:', err);
                this.copyToClipboardFallback(output);
            });
        } else {
            // 直接使用 Fallback
            this.copyToClipboardFallback(output);
        }
    }

    copyToClipboardFallback(text) {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            
            // 確保 textarea 不可見但存在於 DOM 中
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            textArea.style.opacity = "0";
            document.body.appendChild(textArea);
            
            textArea.focus();
            textArea.select();

            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);

            if (successful) {
                this.showToast('Copy successful');
                this.playSound('success');
            } else {
                throw new Error('execCommand copy failed');
            }
        } catch (err) {
            console.error('All copy methods failed:', err);
            this.showToast('Copy failed', true);
        }
    }

    generatePromptText() {
        if (this.annotations.length === 0) {
            return null;
        }

        let output = `# Webpage Context\nURL: ${window.location.href}\n\n# Annotations\n`;
        this.annotations.forEach((ant, index) => {
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

    showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${isError ? '#dc3545' : '#333'};
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            z-index: 2147483647;
            font-family: sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            pointer-events: none;
        `;
        document.body.appendChild(toast);

        // Trigger reflow
        toast.offsetHeight;

        toast.style.opacity = '1';

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }

    debounce(func, wait) {
        let timeout;
        return function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    updatePositions() {
        // Update overlay if active
        if (this.inspectMode && this.hoveredElement) {
            this.highlightElement(this.hoveredElement);
        }
        // Update badges
        this.renderBadges();
        // Update active modal if any
        if (this.activeModal && this.activeModal.targetElement && this.activeModal.modal) {
            this.positionModalShadow(this.activeModal.modal, this.activeModal.targetElement);
        }
    }

    handleMouseOver(e) {
        if (!this.inspectMode || this.activeModal) return; // Don't highlight if modal is open
        e.stopPropagation();
        this.hoveredElement = e.target;
        this.highlightElement(e.target);
    }

    handleMouseOut(e) {
        if (!this.inspectMode) return;
        e.stopPropagation();
        // optionally hide overlay or keep it on the last element
    }

    handleClick(e) {
        if (this.activeModal && this.activeModal.host && !this.activeModal.host.contains(e.target)) {
            // Click outside modal - using Shadow DOM so check the host element
        }

        if (!this.inspectMode) {
            // Check if clicking on a badge
            if (e.target.classList.contains('agentation-badge')) {
                const index = parseInt(e.target.dataset.index);
                if (!isNaN(index) && this.annotations[index]) {
                    const ant = this.annotations[index];
                    const el = document.querySelector(ant.selector); // Re-query element
                    if (el) {
                        this.openModal(el, ant, index, e.clientX, e.clientY);
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }
            }
            return;
        }

        window.focus();
        e.preventDefault();
        e.stopPropagation();

        if (this.hoveredElement) {
            this.openModal(this.hoveredElement, null, -1, e.clientX, e.clientY);
        }
    }

    highlightElement(element) {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        this.overlay.style.width = rect.width + 'px';
        this.overlay.style.height = rect.height + 'px';
        this.overlay.style.top = (rect.top + window.scrollY) + 'px';
        this.overlay.style.left = (rect.left + window.scrollX) + 'px';
        this.overlay.style.display = 'block';
    }

    hideOverlay() {
        this.overlay.style.display = 'none';
    }

    getSelector(element) {
        // 1. 優先使用 ID
        if (element.id) {
            return '#' + CSS.escape(element.id);
        }

        // 2. 構建從元素到有 ID 祖先或 body 的路徑
        const path = [];
        let current = element;

        while (current && current.tagName && current.tagName !== 'HTML') {
            if (current.id) {
                path.unshift('#' + CSS.escape(current.id));
                break;
            }

            let segment = current.tagName.toLowerCase();

            // 嘗試加入 data-testid 或 data-id
            const testId = current.getAttribute('data-testid') || current.getAttribute('data-id');
            if (testId) {
                segment += `[data-testid="${CSS.escape(testId)}"]`;
            } else {
                // 加入 class (使用 getAttribute 以支援 SVG)
                const classAttr = current.getAttribute('class');
                if (classAttr) {
                    const classes = classAttr.split(/\s+/)
                        .filter(c => c && !c.startsWith('agentation-'))
                        .slice(0, 2)
                        .map(c => CSS.escape(c))
                        .join('.');
                    if (classes) {
                        segment += '.' + classes;
                    }
                }
            }

            // 加入 nth-of-type 以區分同層級相同元素
            if (current.parentElement) {
                const siblings = Array.from(current.parentElement.children);
                const sameTagSiblings = siblings.filter(s => s.tagName === current.tagName);
                if (sameTagSiblings.length > 1) {
                    const index = sameTagSiblings.indexOf(current) + 1;
                    segment += `:nth-of-type(${index})`;
                }
            }

            path.unshift(segment);

            // 若已有足夠唯一性 (達到一定深度)，可以提前結束
            if (path.length >= 4 || current.tagName === 'BODY') {
                break;
            }

            current = current.parentElement;
        }

        return path.join(' > ');
    }

    // clickX/clickY position the modal next to the cursor, giving better spatial context than anchoring it to the element's bounding box
    openModal(element, existingAnnotation = null, existingIndex = -1, clickX = null, clickY = null) {
        // Close existing
        if (this.activeModal) {
            this.activeModal.host.remove();
            this.activeModal = null;
        }

        // Check if annotation exists if not provided
        if (!existingAnnotation) {
            const antId = element.getAttribute('data-agentation-id');
            if (antId) {
                existingIndex = this.annotations.findIndex(a => a.id === antId);
                if (existingIndex !== -1) {
                    existingAnnotation = this.annotations[existingIndex];
                }
            }
        }

        const selector = existingAnnotation ? existingAnnotation.selector : this.getSelector(element);
        const feedback = existingAnnotation ? existingAnnotation.feedback : '';

        // Create iframe for complete isolation from other extensions
        const iframe = document.createElement('iframe');
        iframe.id = 'agentation-modal-iframe';
        // Detect OS dark mode to adapt the iframe shadow; a black shadow is invisible on dark backgrounds
        const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const modalShadow = darkMode
            ? '0 8px 30px rgba(200,200,200,0.15), 0 0 0 1px rgba(255,255,255,0.08)'
            : '0 8px 30px rgba(0,0,0,0.25)';
        iframe.style.cssText = `position:fixed;width:320px;height:220px;border:none;z-index:2147483647;background:transparent;border-radius:12px;box-shadow:${modalShadow};`;

        document.body.appendChild(iframe);

        // Position iframe at click coordinates, or fallback to element position
        const modalW = 320;
        const modalH = 220;
        const pad = 10;
        let left, top;

        if (clickX != null && clickY != null) {
            left = clickX + pad;
            top = clickY + pad;
            if (left + modalW > window.innerWidth) left = clickX - modalW - pad;
            if (top + modalH > window.innerHeight) top = clickY - modalH - pad;
        } else {
            const rect = element.getBoundingClientRect();
            left = rect.right + pad;
            top = rect.top;
            if (left + modalW > window.innerWidth) left = rect.left - modalW - pad;
            if (left < pad) { left = rect.left; top = rect.bottom + pad; }
        }

        if (top + modalH > window.innerHeight) top = window.innerHeight - modalH - pad;
        if (top < pad) top = pad;
        if (left < pad) left = pad;
        if (left + modalW > window.innerWidth) left = window.innerWidth - modalW - pad;
        iframe.style.top = top + 'px';
        iframe.style.left = left + 'px';

        // Write content to iframe - escaping special chars
        const safeSelector = selector.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const safeFeedback = feedback.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const isDark = darkMode;
        const c = isDark ? {
            bg: '#1e293b', text: '#f1f5f9', muted: '#94a3b8',
            border: '#334155', inputBg: '#0f172a', inputBorder: '#475569',
            codeBg: '#334155', focus: '#3b82f6',
            cancelBg: '#334155', cancelText: '#94a3b8',
            removeBg: 'rgba(248,113,113,0.15)', removeText: '#f87171',
            removeBgHover: 'rgba(248,113,113,0.25)',
        } : {
            bg: 'white', text: '#333', muted: '#666',
            border: '#f0f0f0', inputBg: 'white', inputBorder: '#ddd',
            codeBg: '#f5f5f5', focus: '#4285f4',
            cancelBg: '#f5f5f5', cancelText: '#666',
            removeBg: '#ffebee', removeText: '#d93025',
            removeBgHover: '#ffcdd2',
        };

        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        const removeBtnStyle = existingIndex !== -1 ? '' : 'display:none;';
        iframeDoc.write(`<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',Tahoma,sans-serif;padding:16px;background:${c.bg};color:${c.text};border-radius:12px;}.header{font-size:12px;color:${c.muted};border-bottom:1px solid ${c.border};padding-bottom:8px;margin-bottom:12px;}.code{background:${c.codeBg};color:${c.muted};padding:2px 6px;border-radius:4px;font-family:monospace;font-size:11px;display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}textarea{width:100%;height:80px;padding:8px;border:1px solid ${c.inputBorder};border-radius:6px;resize:none;font-family:inherit;font-size:14px;outline:none;margin-bottom:12px;background:${c.inputBg};color:${c.text};}textarea:focus{border-color:${c.focus};}.footer{display:flex;align-items:center;}.footer-right{display:flex;gap:8px;margin-left:auto;}button{padding:8px 16px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:500;}.cancel-btn{background:${c.cancelBg};color:${c.cancelText};}.cancel-btn:hover{background:${isDark ? '#475569' : '#e0e0e0'};}.add-btn{background:#4285f4;color:white;}.add-btn:hover{background:#3367d6;}.remove-btn{background:${c.removeBg};color:${c.removeText};padding:8px 12px;}.remove-btn:hover{background:${c.removeBgHover};}</style></head><body><div class="header"><span class="code">${safeSelector}</span></div><textarea id="feedback" placeholder="Enter your feedback here...">${safeFeedback}</textarea><div class="footer"><button class="remove-btn" id="removeBtn" style="${removeBtnStyle}">Remove</button><div class="footer-right"><button class="cancel-btn" id="cancelBtn">Cancel</button><button class="add-btn" id="addBtn">Save</button></div></div></body></html>`);
        iframeDoc.close();

        const textarea = iframeDoc.getElementById('feedback');
        const cancelBtn = iframeDoc.getElementById('cancelBtn');
        const addBtn = iframeDoc.getElementById('addBtn');
        const removeBtn = iframeDoc.getElementById('removeBtn');

        const closeModal = () => {
            iframe.remove();
            this.activeModal = null;
        };

        // Centralize save+close to reuse in both the button and keyboard shortcut without duplicating logic
        const saveAndClose = () => {
            const text = textarea.value.trim();
            if (text) {
                this.saveAnnotation(element, text, existingIndex, selector);
            }
            closeModal();
        };

        cancelBtn.addEventListener('click', closeModal);
        addBtn.addEventListener('click', saveAndClose);

        // Enter to save quickly, Escape to cancel; Shift+Enter allows line breaks in the textarea
        iframeDoc.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveAndClose();
            } else if (e.key === 'Escape') {
                closeModal();
            }
        });

        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                console.log('[UISelector2AI] Remove clicked');
                if (existingIndex !== -1) {
                    this.removeAnnotation(existingIndex);
                }
                closeModal();
            });
        }

        this.activeModal = { host: iframe, modal: iframeDoc.body, targetElement: element };
        setTimeout(() => textarea.focus(), 100);
    }

    positionModalShadow(modal, targetElement) {
        if (!targetElement) return;
        const rect = targetElement.getBoundingClientRect();
        const modalWidth = 300;
        const modalHeight = 180;
        const padding = 10;

        let left = rect.right + padding;
        let top = rect.top;

        if (left + modalWidth > window.innerWidth) {
            left = rect.left - modalWidth - padding;
        }
        if (left < 0) {
            left = rect.left;
            top = rect.bottom + padding;
        }
        if (top + modalHeight > window.innerHeight) {
            top = window.innerHeight - modalHeight - padding;
        }
        if (top < padding) top = padding;
        if (left < padding) left = padding;
        if (left + modalWidth > window.innerWidth) {
            left = window.innerWidth - modalWidth - padding;
        }

        modal.style.top = top + 'px';
        modal.style.left = left + 'px';
    }

    positionModal(modal, targetElement) {
        if (!targetElement) return;
        const rect = targetElement.getBoundingClientRect();
        const modalWidth = 300; // Match CSS width
        const modalHeight = 180; // Approximate height
        const padding = 10;

        // Use fixed positioning relative to viewport
        modal.style.position = 'fixed';

        // Default: position to the right of the element
        let left = rect.right + padding;
        let top = rect.top;

        // If no space on right, try left
        if (left + modalWidth > window.innerWidth) {
            left = rect.left - modalWidth - padding;
        }

        // If still no space, place below
        if (left < 0) {
            left = rect.left;
            top = rect.bottom + padding;
        }

        // Ensure top is not off-screen
        if (top + modalHeight > window.innerHeight) {
            top = window.innerHeight - modalHeight - padding;
        }
        if (top < padding) {
            top = padding;
        }

        // Ensure left is not off-screen
        if (left < padding) {
            left = padding;
        }
        if (left + modalWidth > window.innerWidth) {
            left = window.innerWidth - modalWidth - padding;
        }

        modal.style.top = top + 'px';
        modal.style.left = left + 'px';
    }

    extractContent(element) {
        // Capture visible text to give the LLM context about the annotated element's content
        const text = (element.innerText || element.textContent || '').trim();
        // Truncate to 500 chars to avoid bloating chrome.storage or the generated prompt
        return text.length > 500 ? text.slice(0, 500) + '...' : text;
    }

    saveAnnotation(element, feedback, existingIndex, selector) {
        const rect = element.getBoundingClientRect();

        // Store the element's visible content so the generated prompt includes LLM-readable context
        const content = this.extractContent(element);

        if (existingIndex !== -1) {
            // Update
            this.annotations[existingIndex].feedback = feedback;
            this.annotations[existingIndex].content = content;
            this.annotations[existingIndex].timestamp = Date.now();
        } else {
            // Create
            const id = Date.now().toString();
            const annotation = {
                id: id,
                selector: selector,
                feedback: feedback,
                content: content,
                tagName: element.tagName,
                rect: {
                    width: rect.width,
                    height: rect.height,
                    top: rect.top,
                    left: rect.left
                },
                url: window.location.href,
                timestamp: Date.now()
            };
            this.annotations.push(annotation);
            element.setAttribute('data-agentation-id', id);
        }

        element.setAttribute('data-agentation-annotated', 'true');
        this.saveAnnotations();
    }

    renderBadges() {
        // Remove existing badges
        document.querySelectorAll('.agentation-badge').forEach(el => el.remove());

        this.annotations.forEach((ant, index) => {
            // Network annotations don't have DOM elements for badges
            if (ant.type === 'network') return;
            const element = document.querySelector(ant.selector);
            if (element) {
                // Ensure element has ID link for updates to work
                if (!element.getAttribute('data-agentation-id')) {
                    element.setAttribute('data-agentation-id', ant.id);
                    element.setAttribute('data-agentation-annotated', 'true');
                }

                const badge = document.createElement('div');
                badge.className = 'agentation-badge';
                badge.textContent = index + 1;
                badge.dataset.index = index;

                const rect = element.getBoundingClientRect();
                // Position badge top-right of element (outside)
                const top = rect.top + window.scrollY - 12; // Half height offset
                const left = rect.right + window.scrollX - 12; // Right side of element

                badge.style.top = Math.max(0, top) + 'px';
                badge.style.left = Math.max(0, left) + 'px';

                document.body.appendChild(badge);
            }
        });
    }

    saveAnnotations() {
        chrome.storage.local.set({ ['annotations_' + window.location.href]: this.annotations }, () => {
            console.log('Annotations saved');
            this.renderBadges();
            chrome.runtime.sendMessage({ action: 'annotationsUpdated' }, (response) => {
                if (chrome.runtime.lastError) { /* ignore */ }
            });
        });
    }

    loadAnnotations() {
        chrome.storage.local.get(['annotations_' + window.location.href], (result) => {
            const data = result['annotations_' + window.location.href];
            if (data) {
                this.annotations = data;
                console.log('Loaded annotations:', this.annotations);
                this.renderBadges();
            }
        });
    }

    clearAllAnnotations() {
        // Remove all badges
        document.querySelectorAll('.agentation-badge').forEach(el => el.remove());

        // Remove data attributes from annotated elements
        document.querySelectorAll('[data-agentation-annotated]').forEach(el => {
            el.removeAttribute('data-agentation-annotated');
            el.removeAttribute('data-agentation-id');
        });

        // Clear annotations array
        this.annotations = [];

        // Clear from storage
        chrome.storage.local.remove(['annotations_' + window.location.href], () => {
            console.log('[UISelector2AI] All annotations cleared');
            this.playSound('clear');
            chrome.runtime.sendMessage({ action: 'annotationsUpdated' }, (response) => {
                if (chrome.runtime.lastError) { /* ignore */ }
            });
        });

        // Close modal if open
        if (this.activeModal) {
            this.activeModal.host.remove();
            this.activeModal = null;
        }

        // Reset network capture
        this.capturedRequests = [];
        if (this.networkPanel) this.renderNetworkPanel();
    }

    removeAnnotation(index) {
        if (index >= 0 && index < this.annotations.length) {
            const ant = this.annotations[index];
            // Remove data attributes from element (only for UI annotations)
            if (ant.type !== 'network') {
                const element = document.querySelector(ant.selector);
                if (element) {
                    element.removeAttribute('data-agentation-annotated');
                    element.removeAttribute('data-agentation-id');
                }
            }
            // Remove from array
            this.annotations.splice(index, 1);
            // Save and render
            this.saveAnnotations();
            this.playSound('clear');
        }
    }

    // ── Network Capture ──

    initNetworkCapture() {
        window.addEventListener('message', (e) => {
            if (e.source !== window || !e.data || e.data.type !== '__UISELECTOR2AI_REQUEST__') return;
            if (!this.networkCapture) return;

            const req = e.data.data;
            this.capturedRequests.unshift(req);
            if (this.capturedRequests.length > this.MAX_CAPTURED_REQUESTS) {
                this.capturedRequests.pop();
            }
            this.renderNetworkPanel();
        });
    }

    toggleNetworkCapture() {
        this.networkCapture = !this.networkCapture;
        if (this.networkCapture) {
            this.capturedRequests = [];
            this._networkPanelDocked = 'bottom';
            this.showNetworkPanel();
            this.playSound('on');
        } else {
            this.hideNetworkPanel();
            this.playSound('off');
        }
        chrome.runtime.sendMessage({ action: 'networkCaptureChanged', capturing: this.networkCapture }, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
        });
    }

    showNetworkPanel() {
        if (this.networkPanel) return;

        const iframe = document.createElement('iframe');
        iframe.id = 'agentation-network-panel';
        const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const shadow = darkMode
            ? '0 -4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)'
            : '0 -4px 20px rgba(0,0,0,0.15)';

        // _networkPanelDocked: 'bottom' (default) or 'top'
        if (!this._networkPanelDocked) this._networkPanelDocked = 'bottom';
        const posStyle = this._networkPanelDocked === 'top'
            ? 'top:12px;right:12px;'
            : 'bottom:12px;right:12px;';

        iframe.style.cssText = `position:fixed;${posStyle}width:420px;height:340px;border:none;z-index:2147483646;background:transparent;border-radius:12px;box-shadow:${shadow};`;
        document.body.appendChild(iframe);
        this.networkPanel = iframe;
        this.renderNetworkPanel();
    }

    repositionNetworkPanel() {
        // Toggle docked position and recreate
        this._networkPanelDocked = this._networkPanelDocked === 'bottom' ? 'top' : 'bottom';
        if (this.networkPanel) {
            this.networkPanel.remove();
            this.networkPanel = null;
        }
        this.showNetworkPanel();
    }

    hideNetworkPanel() {
        if (this.networkPanel) {
            this.networkPanel.remove();
            this.networkPanel = null;
        }
    }

    renderNetworkPanel() {
        if (!this.networkPanel) return;
        const iframe = this.networkPanel;
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        const c = isDark ? {
            bg: '#1e293b', surface: '#0f172a', text: '#f1f5f9', muted: '#94a3b8',
            border: '#334155', hover: '#334155', scrollThumb: '#475569',
            inputBg: '#0f172a', inputBorder: '#475569', focus: '#3b82f6',
        } : {
            bg: '#ffffff', surface: '#f8fafc', text: '#333', muted: '#666',
            border: '#e2e8f0', hover: '#f1f5f9', scrollThumb: '#cbd5e1',
            inputBg: '#ffffff', inputBorder: '#ddd', focus: '#4285f4',
        };

        const methodColors = {
            GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b', PATCH: '#f59e0b',
            DELETE: '#ef4444', OPTIONS: '#8b5cf6', HEAD: '#6b7280',
        };

        const rows = this.capturedRequests.map((req, i) => {
            const mColor = methodColors[req.method] || '#6b7280';
            const statusColor = req.status >= 200 && req.status < 300 ? '#22c55e'
                : req.status >= 400 ? '#ef4444' : req.status >= 300 ? '#f59e0b' : '#ef4444';
            const shortUrl = req.url.length > 50 ? '…' + req.url.slice(-48) : req.url;
            const safeUrl = shortUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const fullSafeUrl = req.url.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

            return `<div class="req-row" data-index="${i}" data-url="${fullSafeUrl}" data-method="${req.method}" title="${req.method} ${fullSafeUrl}">
                <span class="method" style="background:${mColor}">${req.method}</span>
                <span class="url">${safeUrl}</span>
                <span class="status" style="color:${statusColor}">${req.status || 'ERR'}</span>
                <span class="duration">${req.duration}ms</span>
                <button class="annotate-btn" data-index="${i}">+</button>
            </div>`;
        }).join('');

        const emptyMsg = this.capturedRequests.length === 0
            ? `<div class="empty-msg" style="text-align:center;color:${c.muted};padding:40px 20px;font-size:13px;">Waiting for network requests…</div>`
            : '';

        doc.open();
        doc.write(`<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',system-ui,sans-serif;background:${c.bg};color:${c.text};border-radius:12px;overflow:hidden;font-size:13px;}
.header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid ${c.border};background:${c.surface};}
.header-left{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;}
.badge{background:#3b82f6;color:white;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:600;}
.header-right{display:flex;align-items:center;gap:4px;}
.move-btn,.close-btn{background:none;border:none;color:${c.muted};cursor:pointer;padding:2px 6px;border-radius:4px;display:flex;align-items:center;}
.move-btn:hover,.close-btn:hover{background:${c.hover};color:${c.text};}
.close-btn{font-size:18px;}
.search-bar{padding:6px 14px;border-bottom:1px solid ${c.border};}
.search-bar input{width:100%;padding:5px 8px 5px 28px;border:1px solid ${c.inputBorder};border-radius:6px;background:${c.inputBg};color:${c.text};font-size:12px;font-family:monospace;outline:none;transition:border-color 0.15s;}
.search-bar input:focus{border-color:${c.focus};}
.search-bar input::placeholder{color:${c.muted};}
.search-wrap{position:relative;}
.search-icon{position:absolute;left:8px;top:50%;transform:translateY(-50%);color:${c.muted};pointer-events:none;}
.list{overflow-y:auto;max-height:252px;padding:4px 0;}
.list::-webkit-scrollbar{width:6px;}
.list::-webkit-scrollbar-track{background:transparent;}
.list::-webkit-scrollbar-thumb{background:${c.scrollThumb};border-radius:3px;}
.no-results{text-align:center;color:${c.muted};padding:20px;font-size:12px;display:none;}
.req-row{display:flex;align-items:center;gap:8px;padding:6px 14px;cursor:default;transition:background 0.1s;}
.req-row:hover{background:${c.hover};}
.req-row.hidden{display:none;}
.method{font-size:10px;font-weight:700;color:white;padding:2px 6px;border-radius:4px;flex-shrink:0;min-width:42px;text-align:center;}
.url{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace;font-size:12px;color:${c.muted};}
.status{font-weight:600;font-size:12px;flex-shrink:0;min-width:28px;text-align:right;}
.duration{color:${c.muted};font-size:11px;flex-shrink:0;min-width:44px;text-align:right;}
.annotate-btn{background:none;border:1px solid ${c.border};color:${c.muted};cursor:pointer;font-size:16px;line-height:1;padding:1px 7px;border-radius:4px;flex-shrink:0;transition:all 0.1s;}
.annotate-btn:hover{background:#3b82f6;color:white;border-color:#3b82f6;}
</style></head><body>
<div class="header">
    <div class="header-left">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        Network Capture
        <span class="badge" id="countBadge">${this.capturedRequests.length}</span>
    </div>
    <div class="header-right">
        <button class="move-btn" id="moveBtn" title="Move panel">
            ${this._networkPanelDocked === 'bottom'
                ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>'
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>'
            }
        </button>
        <button class="close-btn" id="closeBtn">×</button>
    </div>
</div>
<div class="search-bar">
    <div class="search-wrap">
        <svg class="search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="searchInput" placeholder="Filter by URL… e.g. /products" spellcheck="false" />
    </div>
</div>
<div class="list" id="list">${rows || emptyMsg}</div>
<div class="no-results" id="noResults">No matching requests</div>
</body></html>`);
        doc.close();

        // ── Search / filter logic ──
        const searchInput = doc.getElementById('searchInput');
        const listEl = doc.getElementById('list');
        const noResults = doc.getElementById('noResults');
        const countBadge = doc.getElementById('countBadge');

        // Preserve the previous search term across re-renders
        if (this._networkSearchTerm) {
            searchInput.value = this._networkSearchTerm;
        }

        const applyFilter = () => {
            const term = searchInput.value.toLowerCase();
            this._networkSearchTerm = term;
            const allRows = listEl.querySelectorAll('.req-row');
            let visible = 0;
            allRows.forEach(row => {
                const url = (row.getAttribute('data-url') || '').toLowerCase();
                const method = (row.getAttribute('data-method') || '').toLowerCase();
                const match = !term || url.includes(term) || method.includes(term);
                row.classList.toggle('hidden', !match);
                if (match) visible++;
            });
            noResults.style.display = (allRows.length > 0 && visible === 0) ? 'block' : 'none';
            countBadge.textContent = term ? `${visible}/${this.capturedRequests.length}` : this.capturedRequests.length;
        };

        searchInput.addEventListener('input', applyFilter);
        // Apply filter immediately in case term was preserved
        if (this._networkSearchTerm) applyFilter();

        // ── Event handlers ──
        doc.getElementById('closeBtn').addEventListener('click', () => {
            this._networkSearchTerm = '';
            this.toggleNetworkCapture();
        });

        doc.querySelectorAll('.annotate-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                if (!isNaN(idx) && this.capturedRequests[idx]) {
                    this.openNetworkModal(this.capturedRequests[idx]);
                }
            });
        });

        // ── Move button: toggle between top and bottom ──
        doc.getElementById('moveBtn').addEventListener('click', () => {
            this.repositionNetworkPanel();
        });
    }

    openNetworkModal(requestData) {
        // Close existing modal
        if (this.activeModal) {
            this.activeModal.host.remove();
            this.activeModal = null;
        }

        const iframe = document.createElement('iframe');
        iframe.id = 'agentation-network-modal';
        const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const modalShadow = darkMode
            ? '0 8px 30px rgba(200,200,200,0.15), 0 0 0 1px rgba(255,255,255,0.08)'
            : '0 8px 30px rgba(0,0,0,0.25)';
        iframe.style.cssText = `position:fixed;width:440px;height:380px;border:none;z-index:2147483647;background:transparent;border-radius:12px;box-shadow:${modalShadow};`;

        // Center the modal
        const left = Math.max(12, (window.innerWidth - 440) / 2);
        const top = Math.max(12, (window.innerHeight - 380) / 2);
        iframe.style.left = left + 'px';
        iframe.style.top = top + 'px';

        document.body.appendChild(iframe);

        const isDark = darkMode;
        const c = isDark ? {
            bg: '#1e293b', text: '#f1f5f9', muted: '#94a3b8',
            border: '#334155', inputBg: '#0f172a', inputBorder: '#475569',
            codeBg: '#334155', focus: '#3b82f6',
            cancelBg: '#334155', cancelText: '#94a3b8',
        } : {
            bg: 'white', text: '#333', muted: '#666',
            border: '#f0f0f0', inputBg: 'white', inputBorder: '#ddd',
            codeBg: '#f5f5f5', focus: '#4285f4',
            cancelBg: '#f5f5f5', cancelText: '#666',
        };

        const methodColors = {
            GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b', PATCH: '#f59e0b',
            DELETE: '#ef4444', OPTIONS: '#8b5cf6', HEAD: '#6b7280',
        };
        const mColor = methodColors[requestData.method] || '#6b7280';
        const statusColor = requestData.status >= 200 && requestData.status < 300 ? '#22c55e'
            : requestData.status >= 400 ? '#ef4444' : '#f59e0b';

        const safeUrl = requestData.url.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const safePayload = requestData.payload
            ? requestData.payload.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            : '';
        const safeResponse = requestData.response
            ? requestData.response.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').slice(0, 300)
            : '';

        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(`<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',system-ui,sans-serif;padding:16px;background:${c.bg};color:${c.text};border-radius:12px;font-size:13px;}
.header{border-bottom:1px solid ${c.border};padding-bottom:10px;margin-bottom:12px;}
.req-line{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.method{font-size:11px;font-weight:700;color:white;padding:2px 8px;border-radius:4px;background:${mColor};}
.status{font-weight:600;color:${statusColor};}
.duration{color:${c.muted};font-size:12px;}
.url{font-family:monospace;font-size:11px;color:${c.muted};background:${c.codeBg};padding:4px 8px;border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;}
.details{display:flex;gap:8px;margin-bottom:12px;max-height:80px;overflow:hidden;}
.detail-box{flex:1;background:${c.codeBg};border-radius:4px;padding:6px 8px;font-family:monospace;font-size:10px;color:${c.muted};overflow:hidden;line-height:1.4;}
.detail-box .label{font-weight:600;color:${c.text};font-size:10px;margin-bottom:2px;font-family:system-ui;}
textarea{width:100%;height:80px;padding:8px;border:1px solid ${c.inputBorder};border-radius:6px;resize:none;font-family:inherit;font-size:14px;outline:none;background:${c.inputBg};color:${c.text};}
textarea:focus{border-color:${c.focus};}
.footer{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;}
button{padding:8px 16px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:500;}
.cancel-btn{background:${c.cancelBg};color:${c.cancelText};}
.cancel-btn:hover{background:${isDark ? '#475569' : '#e0e0e0'};}
.add-btn{background:#4285f4;color:white;}
.add-btn:hover{background:#3367d6;}
</style></head><body>
<div class="header">
    <div class="req-line">
        <span class="method">${requestData.method}</span>
        <span class="status">${requestData.status || 'ERR'} ${requestData.statusText || ''}</span>
        <span class="duration">${requestData.duration}ms</span>
    </div>
    <span class="url" title="${safeUrl}">${safeUrl}</span>
</div>
<div class="details">
    ${safePayload ? `<div class="detail-box"><div class="label">Payload</div>${safePayload}</div>` : ''}
    ${safeResponse ? `<div class="detail-box"><div class="label">Response</div>${safeResponse}</div>` : ''}
</div>
<textarea id="feedback" placeholder="Describe the issue or observation about this request…"></textarea>
<div class="footer">
    <button class="cancel-btn" id="cancelBtn">Cancel</button>
    <button class="add-btn" id="addBtn">Save</button>
</div>
</body></html>`);
        doc.close();

        const textarea = doc.getElementById('feedback');
        const cancelBtn = doc.getElementById('cancelBtn');
        const addBtn = doc.getElementById('addBtn');

        const closeModal = () => {
            iframe.remove();
            this.activeModal = null;
        };

        const saveAndClose = () => {
            const feedback = textarea.value.trim();
            if (feedback) {
                this.saveNetworkAnnotation(requestData, feedback);
            }
            closeModal();
        };

        cancelBtn.addEventListener('click', closeModal);
        addBtn.addEventListener('click', saveAndClose);

        doc.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveAndClose(); }
            else if (e.key === 'Escape') { closeModal(); }
        });

        this.activeModal = { host: iframe, modal: doc.body, targetElement: null };
        setTimeout(() => textarea.focus(), 100);
    }

    openNetworkEditModal(annotation, existingIndex) {
        // Close existing modal
        if (this.activeModal) {
            this.activeModal.host.remove();
            this.activeModal = null;
        }

        const iframe = document.createElement('iframe');
        iframe.id = 'agentation-network-modal';
        const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const modalShadow = darkMode
            ? '0 8px 30px rgba(200,200,200,0.15), 0 0 0 1px rgba(255,255,255,0.08)'
            : '0 8px 30px rgba(0,0,0,0.25)';
        iframe.style.cssText = `position:fixed;width:440px;height:380px;border:none;z-index:2147483647;background:transparent;border-radius:12px;box-shadow:${modalShadow};`;

        const left = Math.max(12, (window.innerWidth - 440) / 2);
        const top = Math.max(12, (window.innerHeight - 380) / 2);
        iframe.style.left = left + 'px';
        iframe.style.top = top + 'px';

        document.body.appendChild(iframe);

        const isDark = darkMode;
        const c = isDark ? {
            bg: '#1e293b', text: '#f1f5f9', muted: '#94a3b8',
            border: '#334155', inputBg: '#0f172a', inputBorder: '#475569',
            codeBg: '#334155', focus: '#3b82f6',
            cancelBg: '#334155', cancelText: '#94a3b8',
            removeBg: 'rgba(248,113,113,0.15)', removeText: '#f87171',
            removeBgHover: 'rgba(248,113,113,0.25)',
        } : {
            bg: 'white', text: '#333', muted: '#666',
            border: '#f0f0f0', inputBg: 'white', inputBorder: '#ddd',
            codeBg: '#f5f5f5', focus: '#4285f4',
            cancelBg: '#f5f5f5', cancelText: '#666',
            removeBg: '#ffebee', removeText: '#d93025',
            removeBgHover: '#ffcdd2',
        };

        const methodColors = {
            GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b', PATCH: '#f59e0b',
            DELETE: '#ef4444', OPTIONS: '#8b5cf6', HEAD: '#6b7280',
        };
        const mColor = methodColors[annotation.method] || '#6b7280';
        const statusColor = annotation.status >= 200 && annotation.status < 300 ? '#22c55e'
            : annotation.status >= 400 ? '#ef4444' : '#f59e0b';

        const safeUrl = (annotation.requestUrl || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const safePayload = annotation.payload
            ? annotation.payload.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            : '';
        const safeResponse = annotation.response
            ? annotation.response.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').slice(0, 300)
            : '';
        const safeFeedback = annotation.feedback.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(`<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',system-ui,sans-serif;padding:16px;background:${c.bg};color:${c.text};border-radius:12px;font-size:13px;}
.header{border-bottom:1px solid ${c.border};padding-bottom:10px;margin-bottom:12px;}
.req-line{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.method{font-size:11px;font-weight:700;color:white;padding:2px 8px;border-radius:4px;background:${mColor};}
.status{font-weight:600;color:${statusColor};}
.duration{color:${c.muted};font-size:12px;}
.url{font-family:monospace;font-size:11px;color:${c.muted};background:${c.codeBg};padding:4px 8px;border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;}
.details{display:flex;gap:8px;margin-bottom:12px;max-height:80px;overflow:hidden;}
.detail-box{flex:1;background:${c.codeBg};border-radius:4px;padding:6px 8px;font-family:monospace;font-size:10px;color:${c.muted};overflow:hidden;line-height:1.4;}
.detail-box .label{font-weight:600;color:${c.text};font-size:10px;margin-bottom:2px;font-family:system-ui;}
textarea{width:100%;height:80px;padding:8px;border:1px solid ${c.inputBorder};border-radius:6px;resize:none;font-family:inherit;font-size:14px;outline:none;background:${c.inputBg};color:${c.text};}
textarea:focus{border-color:${c.focus};}
.footer{display:flex;align-items:center;margin-top:12px;}
.footer-right{display:flex;gap:8px;margin-left:auto;}
button{padding:8px 16px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:500;}
.cancel-btn{background:${c.cancelBg};color:${c.cancelText};}
.cancel-btn:hover{background:${isDark ? '#475569' : '#e0e0e0'};}
.add-btn{background:#4285f4;color:white;}
.add-btn:hover{background:#3367d6;}
.remove-btn{background:${c.removeBg};color:${c.removeText};padding:8px 12px;}
.remove-btn:hover{background:${c.removeBgHover};}
</style></head><body>
<div class="header">
    <div class="req-line">
        <span class="method">${annotation.method}</span>
        <span class="status">${annotation.status || 'ERR'} ${annotation.statusText || ''}</span>
        <span class="duration">${annotation.duration}ms</span>
    </div>
    <span class="url" title="${safeUrl}">${safeUrl}</span>
</div>
<div class="details">
    ${safePayload ? `<div class="detail-box"><div class="label">Payload</div>${safePayload}</div>` : ''}
    ${safeResponse ? `<div class="detail-box"><div class="label">Response</div>${safeResponse}</div>` : ''}
</div>
<textarea id="feedback" placeholder="Describe the issue or observation about this request…">${safeFeedback}</textarea>
<div class="footer">
    <button class="remove-btn" id="removeBtn">Remove</button>
    <div class="footer-right">
        <button class="cancel-btn" id="cancelBtn">Cancel</button>
        <button class="add-btn" id="addBtn">Save</button>
    </div>
</div>
</body></html>`);
        doc.close();

        const textarea = doc.getElementById('feedback');
        const cancelBtn = doc.getElementById('cancelBtn');
        const addBtn = doc.getElementById('addBtn');
        const removeBtn = doc.getElementById('removeBtn');

        const closeModal = () => {
            iframe.remove();
            this.activeModal = null;
        };

        const saveAndClose = () => {
            const feedback = textarea.value.trim();
            if (feedback) {
                this.annotations[existingIndex].feedback = feedback;
                this.annotations[existingIndex].timestamp = Date.now();
                this.saveAnnotations();
            }
            closeModal();
        };

        cancelBtn.addEventListener('click', closeModal);
        addBtn.addEventListener('click', saveAndClose);
        removeBtn.addEventListener('click', () => {
            this.removeAnnotation(existingIndex);
            closeModal();
        });

        doc.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveAndClose(); }
            else if (e.key === 'Escape') { closeModal(); }
        });

        this.activeModal = { host: iframe, modal: doc.body, targetElement: null };
        setTimeout(() => textarea.focus(), 100);
    }

    saveNetworkAnnotation(requestData, feedback) {
        const annotation = {
            id: Date.now().toString(),
            type: 'network',
            method: requestData.method,
            requestUrl: requestData.url,
            status: requestData.status,
            statusText: requestData.statusText,
            payload: requestData.payload,
            response: requestData.response,
            duration: requestData.duration,
            initiator: requestData.initiator,
            feedback: feedback,
            url: window.location.href,
            timestamp: Date.now(),
        };
        this.annotations.push(annotation);
        this.saveAnnotations();
        this.playSound('success');
    }
}

new AgentationContentScript();
