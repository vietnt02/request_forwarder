(function () {
    let activeRules = [];
    const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    // Listen for rules update from content script
    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        if (event.data.source && event.data.source === 'extension-rules-sync') {
            activeRules = event.data.rules || [];
        }
    });

    /**
     * Resolve URL relative to current page to ensure accurate matching.
     * @param {string} inputUrl 
     */
    function resolveUrl(inputUrl) {
        if (!inputUrl) return '';
        try {
            return new URL(inputUrl, window.location.href).href;
        } catch (e) {
            return inputUrl;
        }
    }

    function shouldCapture(url, method) {
        if (!url || activeRules.length === 0) return false;

        return activeRules.some(rule => {
            // Check Method
            const ruleMethods = rule.methods || DEFAULT_METHODS;
            const reqMethod = (method || 'GET').toUpperCase();
            if (!ruleMethods.includes(reqMethod)) return false;

            // Check URL
            // Ensure we don't accidentally match empty strings or just whitespace
            if (!rule.matchValue || !rule.matchValue.trim()) return false;

            if (rule.matchType === 'exact') {
                return url === rule.matchValue;
            } else {
                return url.includes(rule.matchValue.trim());
            }
        });
    }

    // --- XHR Override ---
    // Goal: Zero listener overhead if not matching
    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;
    const setRequestHeader = XHR.setRequestHeader;

    XHR.open = function (method, url) {
        this._method = method;
        this._url = url;
        this._resolvedUrl = resolveUrl(url);

        // Check capture status NOW
        this._shouldCapture = shouldCapture(this._resolvedUrl, method);

        this._requestHeaders = {};
        this._startTime = Date.now();

        return open.apply(this, arguments);
    };

    XHR.setRequestHeader = function (header, value) {
        if (this._shouldCapture) {
            this._requestHeaders[header] = value;
        }
        return setRequestHeader.apply(this, arguments);
    };

    XHR.send = function (postData) {
        // FAST EXIT
        if (!this._shouldCapture) {
            return send.apply(this, arguments);
        }

        // Only attach listener if capturing
        this.addEventListener('load', function () {
            let responseBody = null;

            // Safe Body Access: Prevent InvalidStateError for binary types
            // responseText is only accessible if responseType is '' or 'text'
            if (!this.responseType || this.responseType === 'text') {
                responseBody = this.responseText;
            } else {
                responseBody = `[Binary data: ${this.responseType}]`;
            }

            const data = {
                type: 'xhr',
                method: this._method,
                url: this._url,
                finalUrl: this.responseURL || this._resolvedUrl,
                requestHeaders: this._requestHeaders,
                requestBody: postData,
                responseBody: responseBody,
                status: this.status,
                timestamp: this._startTime
            };
            window.postMessage({ source: 'start-capture-extension', payload: data }, '*');
        });

        return send.apply(this, arguments);
    };

    // --- Fetch Override ---
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
        const startTime = Date.now();
        let [resource, config] = args;

        let url;
        let method = 'GET';
        let body = null;
        let headers = {};

        if (resource instanceof Request) {
            url = resource.url;
            method = resource.method;
            body = resource.body;
        } else {
            url = resource;
        }

        if (config) {
            if (config.method) method = config.method;
            if (config.body) body = config.body;
            if (config.headers) headers = config.headers;
        }

        // FAST EXIT
        const resolvedUrl = resolveUrl(url);
        if (!shouldCapture(resolvedUrl, method)) {
            return originalFetch.apply(this, args);
        }

        // Matching Request: Wrap logic
        return originalFetch.apply(this, args).then(async (response) => {
            const clone = response.clone();
            let responseBody = '';
            try {
                // clone.text() handles stream reading, should be generally safe but try/catch is good
                responseBody = await clone.text();
            } catch (e) {
                responseBody = '[Failed to read body or binary]';
            }

            const data = {
                type: 'fetch',
                method: method,
                url: response.url || resolvedUrl,
                requestHeaders: headers,
                requestBody: body,
                responseBody: responseBody,
                status: response.status,
                timestamp: startTime
            };

            window.postMessage({ source: 'start-capture-extension', payload: data }, '*');

            return response;
        });
    };
})();
