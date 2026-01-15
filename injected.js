(function () {
    console.log("%c[RequestForwarder] Injected script LOADED.", "color: green; font-weight: bold;");

    let activeRules = [];
    const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    // --- Message Listener ---
    window.addEventListener('message', function (event) {
        // Debug: Log source to check if it matches 'window'
        // console.log("[RequestForwarder Debug] Msg received from:", event.source === window ? "Self" : "Other");

        if (event.source !== window) return;

        const data = event.data;
        if (data && data.source === 'extension-rules-sync') {
            activeRules = data.rules || [];
            console.log("%c[RequestForwarder] Rules Synced:", "color: blue; font-weight: bold;", activeRules);
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
        if (activeRules.length === 0) return false;

        const isMatch = activeRules.some(rule => {
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

        if (isMatch) {
            // console.log("[RequestForwarder] MATCHED:", url);
        }
        return isMatch;
    }

    // --- XHR Override ---
    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;
    const setRequestHeader = XHR.setRequestHeader;

    XHR.open = function (method, url) {
        this._method = method;
        this._resolvedUrl = resolveUrl(url);
        this._shouldCapture = checkMatch(this._resolvedUrl, method);
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
        if (this._shouldCapture) {
            this.addEventListener('load', function () {
                let responseBody = null;
                if (!this.responseType || this.responseType === 'text') {
                    responseBody = this.responseText;
                } else {
                    responseBody = `[Binary/Blob: ${this.responseType}]`;
                }

                const data = {
                    type: 'xhr',
                    method: this._method,
                    url: this._resolvedUrl,
                    finalUrl: this.responseURL || this._resolvedUrl,
                    requestHeaders: this._requestHeaders,
                    requestBody: postData,
                    responseBody: responseBody,
                    status: this.status,
                    timestamp: this._startTime
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

        if (config && config.method) method = config.method;

        const resolvedUrl = resolveUrl(url);
        const shouldCap = checkMatch(resolvedUrl, method);

        return originalFetch.apply(this, args).then(async (response) => {
            if (!shouldCap) {
                return response;
            }

            const clone = response.clone();
            let responseBody = '';
            try {
                responseBody = await clone.text();
            } catch (e) {
                responseBody = '[Read Error]';
            }

            const data = {
                type: 'fetch',
                method: method,
                url: response.url || resolvedUrl,
                requestHeaders: config ? config.headers : {},
                requestBody: config ? config.body : null,
                responseBody: responseBody,
                status: response.status,
                timestamp: startTime
            };

            window.postMessage({ source: 'start-capture-extension', payload: data }, '*');

            return response;
        });
    };
})();
