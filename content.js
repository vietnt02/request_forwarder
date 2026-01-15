// Inject the script
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
script.onload = function () {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

// --- Relay Captured Data to Background ---
window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (event.data.source && event.data.source === 'start-capture-extension') {
        chrome.runtime.sendMessage({
            type: 'CAPTURED_REQUEST',
            data: event.data.payload
        });
    }
});

// --- Sync Rules to Injected Script ---
function syncRulesToPage(rules) {
    // Send message to the page (Injected Script)
    window.postMessage({
        source: 'extension-rules-sync',
        rules: rules || []
    }, '*');
}

// 1. Initial Load
chrome.storage.local.get(['rules', 'webhookUrl', 'matchType', 'matchValue'], (items) => {
    let rules = items.rules || [];
    // Fallback migration logic same as background (just in case)
    if (rules.length === 0 && items.webhookUrl) {
        rules = [{
            webhookUrl: items.webhookUrl,
            matchType: items.matchType || 'contains',
            matchValue: items.matchValue || '',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] // Assume all for legacy
        }];
    }
    syncRulesToPage(rules);
});

// 2. Listen for changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.rules) {
        syncRulesToPage(changes.rules.newValue);
    }
});
