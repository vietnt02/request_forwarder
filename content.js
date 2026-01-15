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
        chrome.runtime.sendMessage({
            type: 'CAPTURED_REQUEST',
            data: data.payload
        });
    }
    else if (data.source === 'request-extension-rules') {
        syncRulesToPage(currentRules);
    }
});

function syncRulesToPage(rules) {
    window.postMessage({
        source: 'extension-rules-sync',
        rules: rules || []
    }, '*');
}

// 1. Initial Load
chrome.storage.local.get(['rules', 'webhookUrl', 'matchType', 'matchValue'], (items) => {
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
    syncRulesToPage(currentRules);
});

// 2. Listen for changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.rules) {
        currentRules = changes.rules.newValue;
        console.log("[RequestForwarder Content] Rules changed. Syncing...");
        syncRulesToPage(currentRules);
    }
});
