const globalToggle = document.getElementById('globalToggle');
const statusText = document.getElementById('statusText');
const safetyDelayInput = document.getElementById('safetyDelayInput');

// Load Initial State
chrome.storage.local.get(['isExtensionEnabled', 'safetyDelay'], (result) => {
    // Default to TRUE if undefined
    const isEnabled = result.isExtensionEnabled !== false;
    globalToggle.checked = isEnabled;
    updateStatusLabel(isEnabled);

    // Safety Delay
    safetyDelayInput.value = result.safetyDelay || 0;
});

// Handle Change
globalToggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ isExtensionEnabled: isEnabled }, () => {
        updateStatusLabel(isEnabled);
    });
});

safetyDelayInput.addEventListener('change', (e) => {
    let val = parseFloat(e.target.value);
    if (isNaN(val) || val < 0) val = 0;
    chrome.storage.local.set({ safetyDelay: val });
});

function updateStatusLabel(isEnabled) {
    statusText.textContent = isEnabled ? 'ON' : 'OFF';
    statusText.style.color = isEnabled ? '#4CAF50' : '#9E9E9E';
}

document.getElementById('openOptions').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL('options.html'));
    }
});
