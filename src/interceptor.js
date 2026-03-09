// src/interceptor.js — Runs in MAIN world to intercept fetch() and XMLHttpRequest
// Communicates with the content script (ISOLATED world) via window.postMessage
(function () {
    'use strict';

    const MSG_TYPE = '__UISELECTOR2AI_REQUEST__';
    const originalFetch = window.fetch;
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    function post(data) {
        window.postMessage({ type: MSG_TYPE, data }, '*');
    }

    function truncate(str, max) {
        if (!str) return str;
        return str.length > max ? str.slice(0, max) + '…' : str;
    }

    // Limits: payload 50KB, response 200KB — generous enough for real API responses
    // while protecting against multi-MB blobs eating chrome.storage (10MB total limit)
    const MAX_PAYLOAD = 50000;
    const MAX_RESPONSE = 200000;

    function serializeBody(body) {
        if (!body) return null;
        if (typeof body === 'string') return truncate(body, MAX_PAYLOAD);
        if (body instanceof URLSearchParams) return truncate(body.toString(), MAX_PAYLOAD);
        if (body instanceof FormData) {
            const parts = [];
            body.forEach((v, k) => parts.push(`${k}=${v}`));
            return truncate(parts.join('&'), MAX_PAYLOAD);
        }
        try { return truncate(JSON.stringify(body), MAX_PAYLOAD); }
        catch { return '[Binary]'; }
    }

    // Capture a deep stack trace (default V8 limit is 10 which is too shallow
    // for frameworks like Angular/React that wrap calls through many internal layers).
    function captureStack() {
        const prev = Error.stackTraceLimit;
        Error.stackTraceLimit = 50;
        const stack = new Error().stack;
        Error.stackTraceLimit = prev;
        return stack;
    }

    function cleanStack(stack) {
        if (!stack) return '';
        // Skip first 3 lines: "Error", our captureStack() frame, and the fetch/XHR wrapper frame
        const lines = stack.split('\n').slice(3).map(l => l.trim()).filter(Boolean);

        // ── Whitelist approach: a frame is "user code" if its URL points to a
        //    source file that is NOT inside a known framework / bundler path. ──
        //
        // We check the URL portion of each frame (the part inside parentheses,
        // or the bare URL for frames without a function name).

        // Paths that indicate non-user code
        const noisePaths = [
            /node_modules/,
            /\/deps\//,                   // Vite pre-bundled deps
            /\.angular\/cache/,           // Angular Vite cache
            /chunk-[\w]+\./,              // Webpack chunks
            /vendor[\.\-]/,
            /polyfills[\.\-]/,
            /runtime[\.\-]/,
            /webpack-internal/,
            /webpack:\/\//,
            /turbopack/i,
            /\/__next\//,
            /next\/dist/i,
            /nuxt[\.\/@]/i,
            /@remix-run\//i,
            /astro[\.\/@].*\/runtime/i,
            /hot-update\./,
            /zone[_.].*\.js/i,
            /rxjs/i,
            /\/@angular\//,
            /@angular\//,
            /core\.mjs/,
            /common\.mjs/,
            /router\.mjs/,
            /platform-browser/i,
            /react-dom/i,
            /react-reconciler/i,
            /react-refresh/i,
            /scheduler[\.\/@]/i,
            /vue[\.\/@].*\.js/i,
            /vue-router/i,
            /pinia[\.\/@]/i,
            /vuex[\.\/@]/i,
            /svelte[\.\/@]/i,
            /svelte\/internal/i,
            /axios[\.\/@]/i,
            /\bredux[\.\/@]/i,
            /\bngrx[\.\/@]/i,
            /@tanstack/i,
            /apollo[\.\/@]/i,
            /jest[\.\/@]/i,
            /vitest[\.\/@]/i,
            /cypress[\.\/@]/i,
            /playwright[\.\/@]/i,
        ];

        // Function names that are framework internals even if the path isn't caught
        const noiseFunctions = [
            /^at Object\.\s/,              // generic Object. wrappers
            /^at Generator\.next\b/,
            /^at new \w/,                  // constructors
            /^at _?Zone\b/i,
            /^at _?ZoneDelegate\b/i,
            /^at ZoneImpl\b/i,
            /^at proto\.\</,               // Zone.js proto.<computed>
            /^at _?FetchBackend\b/,        // Angular's FetchBackend
            /^at _?HttpClient\b/,          // Angular HttpClient
            /^at _?HttpXhr/i,
            /^at Observable\b/i,
            /^at Subscriber\b/i,
            /^at SafeSubscriber\b/i,
            /^at errorContext\b/i,
            /^at operatorSubscriberCreate\b/i,
            /\brender(Root|Subtree)Into/i,
            /\b(begin|complete|commit)Work\b/,
            /\bperformSyncWorkOnRoot\b/,
            /\bperformConcurrentWork/,
            /\bdispatchSetState\b/,
            /\bworkLoop\b/i,
            /\bprocessUpdateQueue\b/,
            /\brenderWithHooks\b/,
            /\bsetupRenderEffect\b/,
            /\bsetupStatefulComponent\b/,
            /\bcreateVNode\b/,
            /\brenderComponentRoot\b/,
            /\bflushJobs\b/,
            /\bflushPostFlushCbs\b/,
            /\bcallWith(Async)?ErrorHandling\b/,
            /\b(patch|mount|unmount)Component\b/,
        ];

        function isNoise(line) {
            // Frames with <anonymous>, (native), [native code] are always noise
            if (/<anonymous>/.test(line) || /\(native\)/.test(line) || /\[native code\]/.test(line)) return true;
            // Check the URL/path portion
            if (noisePaths.some(p => p.test(line))) return true;
            // Check the function name portion
            if (noiseFunctions.some(p => p.test(line))) return true;
            return false;
        }

        // Extract a clean "functionName @ file:line" from a stack frame
        function formatFrame(line) {
            // Chrome: "at functionName (url:line:col)" or "at url:line:col"
            let match = line.match(/at\s+(.+?)\s+\((.+?)(?::\d+)?\)$/);
            if (match) {
                return `${match[1]} @ ${simplifyPath(match[2])}`;
            }
            match = line.match(/at\s+(.+?)(?::\d+)?$/);
            if (match) {
                return simplifyPath(match[1]);
            }
            // Firefox: "functionName@url:line:col"
            match = line.match(/^(.+?)@(.+?)(?::\d+)?$/);
            if (match) {
                return `${match[1]} @ ${simplifyPath(match[2])}`;
            }
            return line;
        }

        // https://vendix.com/src/app/products/products.component.ts:215:10
        // → products.component.ts:215
        function simplifyPath(fullPath) {
            try {
                let p = fullPath.replace(/^https?:\/\/[^/]+/, '');
                // Strip query strings (?v=xxx) before extracting filename
                p = p.replace(/\?[^:]*/, '');
                const fileMatch = p.match(/([^/]+\.\w+):(\d+)(:\d+)?$/);
                if (fileMatch) return `${fileMatch[1]}:${fileMatch[2]}`;
                const nameMatch = p.match(/([^/]+\.\w+)$/);
                if (nameMatch) return nameMatch[1];
                return p;
            } catch {
                return fullPath;
            }
        }

        const userFrames = lines.filter(l => !isNoise(l));

        if (userFrames.length > 0) {
            return userFrames.slice(0, 5).map(formatFrame).join(' ← ');
        }

        // No user code found — return empty so the prompt doesn't show garbage
        return '';
    }

    function shouldCapture(url) {
        if (!url) return false;
        const s = typeof url === 'string' ? url : url.toString();
        // Skip extension and data URLs
        if (s.startsWith('chrome-extension://') || s.startsWith('moz-extension://') || s.startsWith('data:')) return false;
        return true;
    }

    // ── Patch fetch ──
    window.fetch = async function (...args) {
        const request = args[0];
        const options = args[1] || {};

        const url = typeof request === 'string' ? request : (request instanceof Request ? request.url : String(request));
        if (!shouldCapture(url)) return originalFetch.apply(this, args);

        const method = (options.method || (request instanceof Request ? request.method : 'GET')).toUpperCase();
        const payload = serializeBody(options.body || (request instanceof Request ? request.body : null));
        const initiator = cleanStack(captureStack());
        const startTime = performance.now();

        try {
            const response = await originalFetch.apply(this, args);
            const duration = Math.round(performance.now() - startTime);

            // Read response body from a clone so original stream is untouched
            let responseBody = null;
            try {
                const clone = response.clone();
                const text = await clone.text();
                responseBody = truncate(text, MAX_RESPONSE);
            } catch { /* binary or unreadable */ }

            post({
                method, url, payload, initiator, duration,
                status: response.status,
                statusText: response.statusText,
                response: responseBody,
                timestamp: Date.now(),
            });

            return response;
        } catch (err) {
            post({
                method, url, payload, initiator,
                duration: Math.round(performance.now() - startTime),
                status: 0, statusText: 'Network Error',
                response: err.message,
                timestamp: Date.now(),
            });
            throw err;
        }
    };

    // ── Patch XMLHttpRequest ──
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__uis2ai = { method: (method || 'GET').toUpperCase(), url: String(url) };
        return originalXHROpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
        const info = this.__uis2ai;
        if (!info || !shouldCapture(info.url)) return originalXHRSend.call(this, body);

        const payload = serializeBody(body);
        const initiator = cleanStack(captureStack());
        const startTime = performance.now();

        this.addEventListener('loadend', function () {
            const duration = Math.round(performance.now() - startTime);
            let responseBody = null;
            try {
                responseBody = truncate(this.responseText, MAX_RESPONSE);
            } catch { /* unreadable */ }

            post({
                method: info.method, url: info.url, payload, initiator, duration,
                status: this.status,
                statusText: this.statusText,
                response: responseBody,
                timestamp: Date.now(),
            });
        });

        return originalXHRSend.call(this, body);
    };
})();
