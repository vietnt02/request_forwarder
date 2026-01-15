console.log("[RequestForwarder Content] Script loaded.");

let currentRules = [];

// Inject the script
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
script.onload = function () {
    console.log("[RequestForwarder Content] Injected script loaded into DOM.");
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

// --- Relay Captured Data & Handle Handshake ---
window.addEventListener('message', function (event) {
    if (event.source !== window) return;

    const data = event.data;
    if (!data.source) return;

    if (data.source === 'start-capture-extension') {
        // console.log("[RequestForwarder Content] Relaying capture to Background.");
        try {
            chrome.runtime.sendMessage({
                source: 'start-capture-extension',
                payload: data.payload
            });
        } catch (e) {
            // Extension context invalidated (e.g. after reload/update)
            // Silence the error or log it.
            console.warn("[RequestForwarder] Extension context invalidated. Please reload the page.");
        }
    }
    else if (data.source === 'request-extension-rules') {
        syncRulesToPage(currentRules, isExtensionEnabled);
    }
});

function syncRulesToPage(rules, isEnabled) {
    window.postMessage({
        source: 'extension-rules-sync',
        rules: rules || [],
        isExtensionEnabled: isEnabled !== false // Default True
    }, '*');
}

let isExtensionEnabled = true;

// 1. Initial Load
chrome.storage.local.get(['rules', 'webhookUrl', 'matchType', 'matchValue', 'isExtensionEnabled'], (items) => {
    isExtensionEnabled = items.isExtensionEnabled !== false;

    let rules = items.rules || [];
    if (rules.length === 0 && items.webhookUrl) {
        rules = [{
            webhookUrl: items.webhookUrl,
            matchType: items.matchType || 'contains',
            matchValue: items.matchValue || '',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
        }];
    }
    currentRules = rules;
    // We don't necessarily need to push it down immediately if we trust the handshake.
    // But let's do it anyway just in case injected loaded super fast.
    syncRulesToPage(currentRules, isExtensionEnabled);
});

// 2. Listen for changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        let shouldSync = false;
        if (changes.rules) {
            currentRules = changes.rules.newValue;
            shouldSync = true;
        }
        if (changes.isExtensionEnabled) {
            isExtensionEnabled = changes.isExtensionEnabled.newValue;
            shouldSync = true;
        }

        if (shouldSync) {
            console.log("[RequestForwarder Content] Settings changed. Syncing...");
            syncRulesToPage(currentRules, isExtensionEnabled);
        }
    }
});
