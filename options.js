document.addEventListener('DOMContentLoaded', () => {
    const rulesList = document.getElementById('rulesList');
    const emptyState = document.getElementById('emptyState');
    const addRuleBtn = document.getElementById('addRuleBtn');
    const toast = document.getElementById('toast');

    let rules = [];
    const AVAILABLE_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
    const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    // Load Data
    loadRules();

    function loadRules() {
        chrome.storage.local.get(['rules'], (items) => {
            if (chrome.runtime.lastError) {
                console.error('Failed to load rules:', chrome.runtime.lastError);
                rules = [];
                renderAll();
                return;
            }
            rules = (items && Array.isArray(items.rules)) ? items.rules : [];
            renderAll();
        });
    }

    function renderAll() {
        rulesList.innerHTML = '';
        if (rules.length === 0) {
            emptyState.style.display = 'block';
            return;
        }
        emptyState.style.display = 'none';

        rules.forEach(rule => {
            renderCard(rule);
        });
    }

    function renderCard(rule) {
        const card = document.createElement('div');
        card.className = 'rule-card';
        card.dataset.id = rule.id;

        // --- Row 1: Methods + Delete Button ---
        const row1 = document.createElement('div');
        row1.className = 'card-row row-methods-header';

        const methodGroup = document.createElement('div');
        methodGroup.className = 'method-group';
        const currentMethods = rule.methods || DEFAULT_METHODS;

        AVAILABLE_METHODS.forEach(m => {
            const badge = document.createElement('span');
            badge.className = `method-badge ${currentMethods.includes(m) ? 'selected' : ''}`;
            badge.textContent = m;
            badge.onclick = () => toggleMethod(rule.id, m, badge);
            methodGroup.appendChild(badge);
        });

        // Delete Button (Trash Icon)
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete';
        delBtn.innerHTML = '🗑️';
        delBtn.title = 'Delete Rule';
        delBtn.onclick = () => deleteRule(rule.id);

        // Toggle Switch
        const toggleWrapper = document.createElement('label');
        toggleWrapper.className = 'switch';
        toggleWrapper.title = 'Enable/Disable Rule';

        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = rule.isActive !== false; // Default true if undefined
        toggleInput.onchange = (e) => {
            updateRule(rule.id, 'isActive', e.target.checked);
            if (e.target.checked) {
                card.classList.remove('inactive');
            } else {
                card.classList.add('inactive');
            }
        };

        const toggleSlider = document.createElement('span');
        toggleSlider.className = 'slider round';
        toggleWrapper.appendChild(toggleInput);
        toggleWrapper.appendChild(toggleSlider);

        // Apply initial visual state
        if (rule.isActive === false) {
            card.classList.add('inactive');
        }

        row1.append(toggleWrapper, methodGroup, delBtn);


        // --- Row 2: Condition (Type + Source) ---
        const row2 = document.createElement('div');
        row2.className = 'card-row';

        // Type Select
        const selectType = document.createElement('select');
        selectType.className = 'select-control';
        selectType.innerHTML = `
            <option value="contains">URL Contains</option>
            <option value="exact">Exact Match</option>
        `;
        selectType.value = rule.matchType;
        selectType.onchange = (e) => updateRule(rule.id, 'matchType', e.target.value);

        // Source Input
        const inputSource = document.createElement('input');
        inputSource.type = 'text';
        inputSource.className = 'input-control input-url';
        inputSource.placeholder = 'Source URL Condition (e.g. /api/users)';
        inputSource.value = rule.matchValue;
        inputSource.oninput = (e) => updateRule(rule.id, 'matchValue', e.target.value);

        row2.append(selectType, inputSource);


        // --- Row 2.5: Capture Options ---
        const rowOptions = document.createElement('div');
        rowOptions.className = 'card-row';
        rowOptions.style.marginTop = '-5px'; // Tighten up

        const checkboxGroup = document.createElement('div');
        checkboxGroup.className = 'checkbox-group';
        checkboxGroup.style.marginLeft = '0'; // Current file style override

        const opts = rule.captureOptions || {
            queryParams: true,
            requestBody: true,
            requestHeaders: true,
            responseHeaders: true,
            responseBody: true
        };

        const dedupWarning = document.createElement('span');
        dedupWarning.className = 'dedup-warning';
        dedupWarning.textContent = 'cần bật Req Headers';

        const updateDedupWarning = () => {
            const hasDedup = typeof rule.dedupHeader === 'string' && rule.dedupHeader.trim() !== '';
            const reqHeadersEnabled = !rule.captureOptions || rule.captureOptions.requestHeaders !== false;
            dedupWarning.style.display = (hasDedup && !reqHeadersEnabled) ? 'inline' : 'none';
        };

        const createCheckbox = (label, key) => {
            const lbl = document.createElement('label');
            lbl.className = 'checkbox-label';

            const box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = opts[key] !== false; // Default true
            box.onchange = (e) => {
                if (!rule.captureOptions) rule.captureOptions = { ...opts };
                rule.captureOptions[key] = e.target.checked;
                updateDedupWarning();
                scheduleSave();
            };

            lbl.append(box, label);
            return lbl;
        };

        checkboxGroup.append(
            createCheckbox('Req Body', 'requestBody'),
            createCheckbox('Res Body', 'responseBody'),
            createCheckbox('Req Headers', 'requestHeaders'),
            createCheckbox('Res Headers', 'responseHeaders'),
            createCheckbox('Query Params', 'queryParams')
        );

        rowOptions.appendChild(checkboxGroup);


        // --- Row 3: Action (Action Type + Target Webhook URL) ---
        const row3 = document.createElement('div');
        row3.className = 'card-row';

        // Action Select (Currently only Forward)
        const selectAction = document.createElement('select');
        selectAction.className = 'select-control';
        // Future: Add REDIRECT option here
        selectAction.innerHTML = `
            <option value="forward">Forward Request</option>
        `;
        selectAction.value = rule.actionType || 'forward';
        selectAction.disabled = true; // Temporary disabled as it's the only option, or keep enabled? User asked for dropdown. Let's keep it enabled but with 1 option.
        selectAction.disabled = false;
        // selectAction.onchange = ... (Future)

        // Webhook Input
        const inputWebhook = document.createElement('input');
        inputWebhook.type = 'text';
        inputWebhook.className = 'input-control input-url';
        inputWebhook.placeholder = 'Target Webhook URL';
        inputWebhook.value = rule.webhookUrl || '';
        inputWebhook.oninput = (e) => updateRule(rule.id, 'webhookUrl', e.target.value);

        row3.append(selectAction, inputWebhook);


        // --- Row 4: Webhook Bearer Token ---
        const row4 = document.createElement('div');
        row4.className = 'card-row';

        const tokenLabel = document.createElement('label');
        tokenLabel.className = 'field-label';
        tokenLabel.textContent = 'Webhook header  Authorization: Bearer';

        const inputToken = document.createElement('input');
        inputToken.type = 'password';
        inputToken.className = 'input-control input-token';
        inputToken.placeholder = 'token (để trống = không gửi header)';
        inputToken.autocomplete = 'off';
        inputToken.value = rule.webhookToken || '';
        inputToken.oninput = (e) => updateRule(rule.id, 'webhookToken', e.target.value);

        const toggleTokenBtn = document.createElement('button');
        toggleTokenBtn.type = 'button';
        toggleTokenBtn.className = 'btn-toggle-token';
        toggleTokenBtn.textContent = 'Show';
        toggleTokenBtn.title = 'Show/Hide Bearer Token';
        toggleTokenBtn.onclick = () => {
            const isHidden = inputToken.type === 'password';
            inputToken.type = isHidden ? 'text' : 'password';
            toggleTokenBtn.textContent = isHidden ? 'Hide' : 'Show';
        };

        row4.append(tokenLabel, inputToken, toggleTokenBtn);


        // --- Row 5: Dedup by Request Header ---
        const row5 = document.createElement('div');
        row5.className = 'card-row';

        const dedupLabel = document.createElement('label');
        dedupLabel.className = 'field-label';
        dedupLabel.textContent = 'Chỉ gửi khi request header này đổi giá trị:';

        const inputDedupHeader = document.createElement('input');
        inputDedupHeader.type = 'text';
        inputDedupHeader.className = 'input-control input-dedup-header';
        inputDedupHeader.placeholder = 'vd Authorization — để trống = gửi mọi lần';
        inputDedupHeader.value = typeof rule.dedupHeader === 'string' ? rule.dedupHeader : '';
        inputDedupHeader.oninput = (e) => {
            updateRule(rule.id, 'dedupHeader', e.target.value);
            updateDedupWarning();
        };

        updateDedupWarning();

        row5.append(dedupLabel, inputDedupHeader, dedupWarning);

        card.append(row1, row2, rowOptions, row3, row4, row5);
        rulesList.appendChild(card);
    }

    // --- Logic ---
    let saveTimeout;
    function scheduleSave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveToStorage();
        }, 500);
    }

    function saveToStorage() {
        chrome.storage.local.set({ rules: rules }, () => {
            if (chrome.runtime.lastError) {
                console.error('Failed to save rules:', chrome.runtime.lastError);
                return;
            }
            showToast('Saved');
        });
    }

    function updateRule(id, field, value) {
        const rule = rules.find(r => r.id === id);
        if (rule) {
            rule[field] = value;
            scheduleSave();
        }
    }

    function toggleMethod(id, method, badgeEl) {
        const rule = rules.find(r => r.id === id);
        if (rule) {
            if (!rule.methods) rule.methods = [...DEFAULT_METHODS];

            if (rule.methods.includes(method)) {
                rule.methods = rule.methods.filter(m => m !== method);
                badgeEl.classList.remove('selected');
            } else {
                rule.methods.push(method);
                badgeEl.classList.add('selected');
            }
            scheduleSave();
        }
    }

    function deleteRule(id) {
        if (confirm('Delete this rule?')) {
            rules = rules.filter(r => r.id !== id);
            renderAll();
            saveToStorage();
            chrome.storage.local.remove(`dedupHash_${id}`, () => {
                if (chrome.runtime.lastError) {
                    console.error('Failed to remove dedup hash for deleted rule:', chrome.runtime.lastError);
                }
            });
        }
    }

    addRuleBtn.onclick = () => {
        const newRule = {
            id: Date.now(),
            isActive: true, // Default ON
            matchType: 'contains',
            matchValue: '',
            webhookUrl: '',
            webhookToken: '',
            dedupHeader: '',
            methods: [...DEFAULT_METHODS],
            actionType: 'forward',
            captureOptions: {
                queryParams: true,
                requestBody: true,
                requestHeaders: true,
                responseHeaders: true,
                responseBody: true
            }
        };
        rules.push(newRule);
        emptyState.style.display = 'none';

        renderAll();
        saveToStorage();
    };

    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    }
});
