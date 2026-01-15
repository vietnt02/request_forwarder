(function () {
    console.log("%c[RequestForwarder] Injected script LOADED.", "color: green; font-weight: bold;");

    let activeRules = [];
    let isExtensionEnabled = true;
    const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    // --- Message Listener ---
    window.addEventListener('message', function (event) {
        // Debug: Log source to check if it matches 'window'
        // console.log("[RequestForwarder Debug] Msg received from:", event.source === window ? "Self" : "Other");

        if (event.source !== window) return;

        const data = event.data;
        if (data && data.source === 'extension-rules-sync') {
            activeRules = data.rules || [];
            if (typeof data.isExtensionEnabled !== 'undefined') {
                isExtensionEnabled = data.isExtensionEnabled;
            }
            console.log("%c[RequestForwarder] Rules Synced. Enabled:", "color: blue; font-weight: bold;", isExtensionEnabled, activeRules);
        }
    });

    // --- Handshake: Request Rules immediately ---
    // Use setTimeout 0 to let the event loop turn and ensure Content Script listener is ready?
    // Or just send.
    setTimeout(() => {
        console.log("[RequestForwarder] Requesting rules from Content Script...");
        window.postMessage({ source: 'request-extension-rules' }, '*');
    }, 100);


    // --- Match Logic ---
    function resolveUrl(inputUrl) {
        if (!inputUrl) return '';
        try {
            return new URL(inputUrl, window.location.href).href;
        } catch (e) {
            return inputUrl;
        }
    }

    function checkMatch(url, method) {
        if (!isExtensionEnabled) return null;
        if (activeRules.length === 0) return null;

        const foundRule = activeRules.find(rule => {
            if (rule.isActive === false) return false; // Ignore inactive rules

            // Sync with background: Must have webhookUrl to be worth capturing
            if (!rule.webhookUrl || !rule.webhookUrl.trim()) return false;

            const ruleMethods = rule.methods || DEFAULT_METHODS;
            const reqMethod = (method || 'GET').toUpperCase();
            if (!ruleMethods.includes(reqMethod)) return false;

            if (!rule.matchValue || !rule.matchValue.trim()) return false;
            const matchVal = rule.matchValue.trim();

            if (rule.matchType === 'exact') {
                return url === matchVal;
            } else {
                return url.includes(matchVal);
            }
        });

        return foundRule || null;
    }

    // --- XHR Override ---
    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;
    const setRequestHeader = XHR.setRequestHeader;

    XHR.open = function (method, url) {
        this._method = method;
        this._resolvedUrl = resolveUrl(url);
        this._matchedRule = checkMatch(this._resolvedUrl, method); // Now returns Rule or Null
        this._shouldCapture = !!this._matchedRule;
        this._requestHeaders = {};
        this._startTime = Date.now();
        return open.apply(this, arguments);
    };

    XHR.setRequestHeader = function (header, value) {
        if (this._shouldCapture) {
            // Check if headers capture is enabled
            const opts = this._matchedRule.captureOptions || {};
            if (opts.requestHeaders !== false) {
                this._requestHeaders[header] = value;
            }
        }
        return setRequestHeader.apply(this, arguments);
    };

    XHR.send = function (postData) {
        if (this._shouldCapture) {
            this.addEventListener('load', function () {
                const opts = this._matchedRule.captureOptions || {};

                let responseBody = null;
                // Capture Response Body?
                if (opts.responseBody !== false) {
                    if (!this.responseType || this.responseType === 'text') {
                        responseBody = this.responseText;
                    } else {
                        responseBody = `[Binary/Blob: ${this.responseType}]`;
                    }
                }

                // Capture Request Body?
                const finalRequestBody = (opts.requestBody !== false) ? postData : null;

                // Capture Response Headers?
                let responseHeaders = {};
                if (opts.responseHeaders !== false) {
                    try {
                        const rawHeaders = this.getAllResponseHeaders();
                        if (rawHeaders) {
                            rawHeaders.trim().split(/[\r\n]+/).forEach((line) => {
                                const parts = line.split(': ');
                                const header = parts.shift();
                                if (header) responseHeaders[header] = parts.join(': ');
                            });
                        }
                    } catch (e) {
                        // Ignore error accessing headers
                    }
                }

                const data = {
                    type: 'xhr',
                    method: this._method,
                    url: this._resolvedUrl,
                    finalUrl: this.responseURL || this._resolvedUrl,
                    ruleId: this._matchedRule.id, // Pass ID
                    requestHeaders: this._requestHeaders, // Already filtered in setRequestHeader
                    requestBody: finalRequestBody,
                    responseHeaders: responseHeaders,
                    responseBody: responseBody,
                    status: this.status,
                    timestamp: this._startTime,
                    // Optional: remove query params if opts.queryParams === false.
                };
                window.postMessage({ source: 'start-capture-extension', payload: data }, '*');
            });
        }
        return send.apply(this, arguments);
    };

    // --- Fetch Override ---
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
        const startTime = Date.now();
        let [resource, config] = args;

        let url;
        let method = 'GET';

        if (resource instanceof Request) {
            url = resource.url;
            method = resource.method;
        } else {
            url = resource;
        }

        // Handle Request Object body/headers extraction if needed? 
        // For simplicity, we mostly rely on 'config'.

        if (config && config.method) method = config.method;

        const resolvedUrl = resolveUrl(url);
        const matchedRule = checkMatch(resolvedUrl, method);
        const shouldCap = !!matchedRule;

        return originalFetch.apply(this, args).then(async (response) => {
            if (!shouldCap) {
                return response;
            }

            const opts = matchedRule.captureOptions || {};
            let responseBody = '';

            // KEY OPTIMIZATION: Only clone if we need response body
            if (opts.responseBody !== false) {
                try {
                    const clone = response.clone();
                    responseBody = await clone.text();
                } catch (e) {
                    responseBody = '[Read Error]';
                }
            } else {
                responseBody = null; // Ignored
            }

            const reqHeaders = (opts.requestHeaders !== false && config) ? config.headers : {};
            const reqBody = (opts.requestBody !== false && config) ? config.body : null;

            // Capture Response Headers?
            let responseHeaders = {};
            if (opts.responseHeaders !== false) {
                response.headers.forEach((value, key) => {
                    responseHeaders[key] = value;
                });
            }

            const data = {
                type: 'fetch',
                method: method,
                url: response.url || resolvedUrl,
                ruleId: matchedRule.id, // Pass ID
                requestHeaders: reqHeaders || {},
                requestBody: reqBody,
                responseHeaders: responseHeaders,
                responseBody: responseBody,
                status: response.status,
                timestamp: startTime
            };

            window.postMessage({ source: 'start-capture-extension', payload: data }, '*');

            return response;
        });
    };
})();
