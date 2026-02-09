// v3 Background Script - Multi-Rule Support

let rules = [];
let isExtensionEnabled = true;

// Cooldown State
let safetyDelay = 0; // seconds
let isCooldown = false;

// Load initial settings
chrome.storage.local.get(['rules', 'webhookUrl', 'matchType', 'matchValue', 'isExtensionEnabled', 'safetyDelay'], (items) => {
    isExtensionEnabled = items.isExtensionEnabled !== false;
    safetyDelay = items.safetyDelay || 0;

    // Set initial icon state
    updateIconState(isExtensionEnabled);

    if (items.rules) {
        rules = items.rules;
        console.log("Background: Loaded rules from storage:", rules.length);
    } else if (items.webhookUrl) {
        // Migration
        rules = [{
            webhookUrl: items.webhookUrl,
            matchType: items.matchType || 'contains',
            matchValue: items.matchValue || '',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
        }];
        console.log("Background: Migrated legacy rules");
    }
});

// Listen for setting changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.rules) {
            rules = changes.rules.newValue;
            console.log("Background: Rules updated:", rules);
        }
        if (changes.isExtensionEnabled) {
            isExtensionEnabled = changes.isExtensionEnabled.newValue;
            console.log("Background: Extension Enabled state changed:", isExtensionEnabled);
            updateIconState(isExtensionEnabled);
        }
        if (changes.safetyDelay) {
            safetyDelay = changes.safetyDelay.newValue || 0;
            console.log("Background: Safety Delay updated:", safetyDelay);
            // Optional: Reset cooldown on change? No, keep it safe.
        }
    }
});

// Helper to check match against a specific rule
function isMatch(url, method, rule) {
    if (!rule.matchValue || !rule.webhookUrl) return false;
    if (rule.isActive === false) return false; // Ignore inactive rules
    if (!url) return false;

    // Check Method (if defined in rule)
    if (rule.methods && rule.methods.length > 0) {
        const reqMethod = (method || 'GET').toUpperCase();
        if (!rule.methods.includes(reqMethod)) {
            return false;
        }
    }

    // Use Trim to be safe (consistent with injected.js)
    const matchVal = rule.matchValue.trim();
    if (!matchVal) return false;

    if (rule.matchType === 'exact') {
        return url === matchVal;
    } else {
        // contains
        return url.includes(matchVal);
    }
}

// --- Network Header Capture (Robust Matching via Correlation ID) ---
const correlationCache = new Map();

chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        let correlationId = null;
        const headers = {};

        if (details.requestHeaders) {
            details.requestHeaders.forEach(h => {
                headers[h.name] = h.value;
                if (h.name.toLowerCase() === 'x-request-forwarder-id') {
                    correlationId = h.value;
                }
            });
        }

        if (correlationId) {
            // Store by ID for 100% accurate matching
            correlationCache.set(correlationId, headers);

            // Cleanup after 60s
            setTimeout(() => correlationCache.delete(correlationId), 60000);
        }
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders", "extraHeaders"]
);

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        if (!isExtensionEnabled) return;

        if (message.source === 'start-capture-extension') {
            const data = message.payload;
            const urlToCheck = data.finalUrl || data.url;
            const methodToCheck = data.method;

            if (!rules || rules.length === 0) {
                const storage = await chrome.storage.local.get(['rules', 'safetyDelay']);
                rules = storage.rules || [];
                safetyDelay = storage.safetyDelay || 0;
            }

            if (safetyDelay > 0 && isCooldown) return;

            for (const rule of rules) {
                let isTarget = (data.ruleId) ? (rule.id == data.ruleId) : isMatch(urlToCheck, methodToCheck, rule);

                if (isTarget) {
                    if (safetyDelay > 0) {
                        isCooldown = true;
                        setTimeout(() => isCooldown = false, safetyDelay * 1000);
                    }
                    flashIcon();

                    const ruleOpts = rule.captureOptions || {};
                    let finalPayload = {
                        ...data,
                        pageUrl: sender.tab ? sender.tab.url : 'unknown',
                        matchedRule: rule.matchValue
                    };

                    if (ruleOpts.requestHeaders !== false) {
                        // 1. Matching via Correlation ID (Accurate Network Headers)
                        let realHeaders = correlationCache.get(data.correlationId);

                        if (realHeaders) {
                            // Strip our internal ID before merging
                            realHeaders = { ...realHeaders };
                            delete realHeaders['X-Request-Forwarder-Id'];
                            Object.keys(realHeaders).forEach(k => {
                                if (k.toLowerCase() === 'x-request-forwarder-id') delete realHeaders[k];
                            });

                            finalPayload.requestHeaders = { ...finalPayload.requestHeaders, ...realHeaders };
                            correlationCache.delete(data.correlationId);
                        }

                        // 2. Check if we already have a Cookie header
                        const hasCookie = Object.keys(finalPayload.requestHeaders || {}).some(k => k.toLowerCase() === 'cookie');

                        // 3. Enrich ONLY if Cookie header is missing
                        if (!hasCookie) {
                            try {
                                const allCookies = await chrome.cookies.getAll({ url: urlToCheck });
                                if (allCookies && allCookies.length > 0) {
                                    const cookieString = allCookies.map(c => `${c.name}=${c.value}`).join('; ');
                                    if (!finalPayload.requestHeaders) finalPayload.requestHeaders = {};
                                    finalPayload.requestHeaders['Cookie'] = cookieString;
                                }
                            } catch (e) { console.error("Cookie fallback error:", e); }
                        }
                    }

                    sendToWebhook(finalPayload, rule.webhookUrl);
                }
            }
        }
    })();
    return true;
});

// --- Visual Feedback ---
function flashIcon(tabId) {
    // In Chrome, setBadgeBackgroundColor is correct for badge background
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId: tabId });
    chrome.action.setBadgeText({ text: 'ON', tabId: tabId });
    chrome.action.setBadgeTextColor({ color: '#FFFFFF', tabId: tabId });

    // Auto clear after 3 seconds
    setTimeout(() => {
        // Check if tab still exists? chrome.action handles invalid tabs gracefully usually, but good to be safe.
        // For simplicity, just try to clear.
        chrome.action.setBadgeText({ text: '', tabId: tabId });
    }, 3000);
}

async function sendToWebhook(payload, webhookUrl) {
    if (!webhookUrl) return;

    try {
        const response = await fetch(webhookUrl, {
            method: "POST", // Force POST
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        console.log(`Background: Forwarded [${payload.url}] -> [${webhookUrl}]. Status: ${response.status}`);
    } catch (err) {
        console.error("Background: Failed to forward request to webhook:", err);
    }
}

// --- Icon State Management ---
async function updateIconState(isEnabled) {
    if (isEnabled) {
        // Restore default colored icon
        chrome.action.setIcon({
            path: {
                "16": "icons/icon16.png",
                "48": "icons/icon48.png",
                "128": "icons/icon128.png"
            }
        });
        chrome.action.setBadgeText({ text: '' }); // Clear any badge
    } else {
        // Set Grayscale Icon
        try {
            // We'll create grayscale version of icon48
            const grayscaleData = await createGrayscaleIcon("icons/icon48.png");
            if (grayscaleData) {
                chrome.action.setIcon({ imageData: { "48": grayscaleData } });
            }
            chrome.action.setBadgeText({ text: 'OFF' });
            chrome.action.setBadgeBackgroundColor({ color: '#9E9E9E' });
        } catch (e) {
            console.error("Failed to set grayscale icon:", e);
            // Fallback: just show badge
            chrome.action.setBadgeText({ text: 'OFF' });
            chrome.action.setBadgeBackgroundColor({ color: '#9E9E9E' });
        }
    }
}

async function createGrayscaleIcon(imagePath) {
    // In Service Worker (MV3), use OffscreenCanvas if available, or fetch + bitmap
    try {
        const response = await fetch(chrome.runtime.getURL(imagePath));
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);

        const width = bitmap.width;
        const height = bitmap.height;
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');

        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Convert to grayscale
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = avg;     // R
            data[i + 1] = avg; // G
            data[i + 2] = avg; // B
            // Alpha (data[i+3]) remains same.
        }

        return imageData;
    } catch (err) {
        console.error("createGrayscaleIcon error:", err);
        return null;
    }
}
