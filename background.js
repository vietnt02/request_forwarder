// v3 Background Script - Multi-Rule Support

let rules = [];

// Load initial settings
chrome.storage.local.get(['rules', 'webhookUrl', 'matchType', 'matchValue'], (items) => {
    if (items.rules) {
        rules = items.rules;
    } else if (items.webhookUrl) {
        // Migration for in-memory if user hasn't opened popup yet
        rules = [{
            webhookUrl: items.webhookUrl,
            matchType: items.matchType || 'contains',
            matchValue: items.matchValue || ''
        }];
    }
});

// Listen for setting changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.rules) {
            rules = changes.rules.newValue;
        }
    }
});

// Helper to check match against a specific rule
function isMatch(url, method, rule) {
    if (!rule.matchValue || !rule.webhookUrl) return false;
    if (!url) return false;

    // Check Method (if defined in rule)
    if (rule.methods && rule.methods.length > 0) {
        // Method from captured data is usually uppercase, but let's be safe
        const reqMethod = (method || 'GET').toUpperCase();
        if (!rule.methods.includes(reqMethod)) {
            return false;
        }
    }

    if (rule.matchType === 'exact') {
        return url === rule.matchValue;
    } else {
        // contains
        return url.includes(rule.matchValue);
    }
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CAPTURED_REQUEST') {
        const data = message.data;
        // Verify URL Match against ALL rules
        const urlToCheck = data.finalUrl || data.url;
        const methodToCheck = data.method;

        rules.forEach(rule => {
            if (isMatch(urlToCheck, methodToCheck, rule)) {
                // Forward to Webhook for this rule
                sendToWebhook({
                    ...data,
                    pageUrl: sender.tab ? sender.tab.url : 'unknown',
                    matchedRule: rule.matchValue // Optional info
                }, rule.webhookUrl);
            }
        });
    }
});

async function sendToWebhook(payload, webhookUrl) {
    if (!webhookUrl) return;

    try {
        await fetch(webhookUrl, {
            method: "POST", // Force POST
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        console.log(`Forwarded request [${payload.url}] to [${webhookUrl}]`);
    } catch (err) {
        console.error("Failed to forward request to webhook:", err);
    }
}
