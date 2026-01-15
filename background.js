// v3 Background Script - Multi-Rule Support

let rules = [];

// Load initial settings
chrome.storage.local.get(['rules', 'webhookUrl', 'matchType', 'matchValue'], (items) => {
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
    }
});

// Helper to check match against a specific rule
function isMatch(url, method, rule) {
    if (!rule.matchValue || !rule.webhookUrl) return false;
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

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CAPTURED_REQUEST') {
        const data = message.data;
        console.log("Background: Received captured request:", data.url, data.method);

        // Verify URL Match against ALL rules
        const urlToCheck = data.finalUrl || data.url;
        const methodToCheck = data.method;

        let matched = false;

        rules.forEach(rule => {
            if (isMatch(urlToCheck, methodToCheck, rule)) {
                matched = true;
                console.log("Background: Matched rule:", rule.matchValue, "Forwarding to:", rule.webhookUrl);

                // Forward to Webhook for this rule
                sendToWebhook({
                    ...data,
                    pageUrl: sender.tab ? sender.tab.url : 'unknown',
                    matchedRule: rule.matchValue // Optional info
                }, rule.webhookUrl);
            }
        });

        if (!matched) {
            console.log("Background: Request received but matched NO rules (Check sync/logic?):", urlToCheck);
        }
    }
});

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
