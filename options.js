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
            rules = items.rules || [];
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

        const createCheckbox = (label, key) => {
            const lbl = document.createElement('label');
            lbl.className = 'checkbox-label';

            const box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = opts[key] !== false; // Default true
            box.onchange = (e) => {
                if (!rule.captureOptions) rule.captureOptions = { ...opts };
                rule.captureOptions[key] = e.target.checked;
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


        // --- Row 3: Action (Action Type + Target) ---
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
        inputWebhook.value = rule.webhookUrl;
        inputWebhook.oninput = (e) => updateRule(rule.id, 'webhookUrl', e.target.value);

        row3.append(selectAction, inputWebhook);

        row3.append(selectAction, inputWebhook);

        card.append(row1, row2, rowOptions, row3);
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
        }
    }

    addRuleBtn.onclick = () => {
        const newRule = {
            id: Date.now(),
            isActive: true, // Default ON
            matchType: 'contains',
            matchValue: '',
            webhookUrl: '',
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
