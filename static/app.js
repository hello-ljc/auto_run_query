/* ──────────────────────────────────────────────────────────────────────────
   app.js  –  Auto Run Query frontend logic
   ────────────────────────────────────────────────────────────────────────── */

// ── KaTeX + Markdown rendering pipeline ────────────────────────────────────
function renderContent(rawText) {
    if (!rawText) return '';
    try {
        // 1. Protect LaTeX blocks before Markdown parsing
        const latexBlocks = [];
        const latexInlines = [];

        let protected_text = rawText.replace(/\$\$[\s\S]+?\$\$/g, (match) => {
            const idx = latexBlocks.length;
            latexBlocks.push(match);
            return `%%LATEX_BLOCK_${idx}%%`;
        });

        protected_text = protected_text.replace(/\$([^\$\n]+?)\$/g, (match, inner) => {
            const idx = latexInlines.length;
            latexInlines.push(inner);
            return `%%LATEX_INLINE_${idx}%%`;
        });

        // 2. Parse Markdown
        let html = '';
        try {
            html = marked.parse(protected_text, { breaks: true, gfm: true });
        } catch (e) {
            console.warn('[renderContent] marked.parse failed:', e);
            html = `<p>${escapeHtml(protected_text)}</p>`;
        }

        // 3. Restore LaTeX (only if KaTeX is loaded)
        if (typeof katex !== 'undefined') {
            html = html.replace(/%%LATEX_BLOCK_(\d+)%%/g, (_, idx) => {
                const src = latexBlocks[parseInt(idx)].slice(2, -2).trim();
                try {
                    return katex.renderToString(src, { displayMode: true, throwOnError: false });
                } catch (e) {
                    return `<span class="katex-error">$$${escapeHtml(src)}$$</span>`;
                }
            });
            html = html.replace(/%%LATEX_INLINE_(\d+)%%/g, (_, idx) => {
                const src = latexInlines[parseInt(idx)];
                try {
                    return katex.renderToString(src, { displayMode: false, throwOnError: false });
                } catch (e) {
                    return `<span class="katex-error">$${escapeHtml(src)}$</span>`;
                }
            });
        } else {
            // KaTeX not ready – restore raw LaTeX text so Markdown still renders
            html = html.replace(/%%LATEX_BLOCK_(\d+)%%/g, (_, idx) => escapeHtml(latexBlocks[parseInt(idx)]));
            html = html.replace(/%%LATEX_INLINE_(\d+)%%/g, (_, idx) => `$${escapeHtml(latexInlines[parseInt(idx)])}$`);
        }

        // 4. Sanitize
        if (typeof DOMPurify !== 'undefined') {
            return DOMPurify.sanitize(html, {
                ADD_TAGS: ['math', 'semantics', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub',
                    'mfrac', 'munder', 'mover', 'munderover', 'msqrt', 'mroot',
                    'mtable', 'mtr', 'mtd', 'annotation'],
                ADD_ATTR: ['xmlns', 'encoding'],
            });
        }
        return html;

    } catch (e) {
        console.error('[renderContent] unexpected error:', e);
        return `<pre style="white-space:pre-wrap">${escapeHtml(rawText)}</pre>`;
    }
}


function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Slider live-value badges ─────────────────────────────────────────────────
function wireSlider(id, precise = false) {
    const el = document.getElementById(id);
    const badge = document.getElementById(id + 'Val');
    if (!el || !badge) return;
    const update = () => {
        badge.textContent = precise ? parseFloat(el.value).toFixed(2) : el.value;
    };
    update();
    el.addEventListener('input', update);
}

['retrievalTopK', 'keyRagWeight', 'maxPaths', 'conceptTopK', 'maxHops', 'maxVisited', 'cutLimit']
    .forEach(id => wireSlider(id, false));
['conceptSimilarity', 'scoreLimit']
    .forEach(id => wireSlider(id, true));

// ── Show/hide graph params when toggle changes ───────────────────────────────
const useGraphRagEl = document.getElementById('useGraphRag');
const graphParamsCard = document.getElementById('graphParamsCard');
function updateGraphVisibility() {
    graphParamsCard.style.display = useGraphRagEl.checked ? '' : 'none';
}
useGraphRagEl.addEventListener('change', updateGraphVisibility);
updateGraphVisibility();

// ── Show/hide keyRagWeight when both keyword+rag are on ──────────────────────
const useKeywordsEl = document.getElementById('useKeywords');
const useRagEl = document.getElementById('useRag');
const keyRagGroup = document.getElementById('keyRagWeightGroup');
function updateKeyRagVisibility() {
    keyRagGroup.style.display = (useKeywordsEl.checked && useRagEl.checked) ? '' : 'none';
}
useKeywordsEl.addEventListener('change', updateKeyRagVisibility);
useRagEl.addEventListener('change', updateKeyRagVisibility);
updateKeyRagVisibility();

// ── Sidebar toggle ────────────────────────────────────────────────────────────
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarOpen = document.getElementById('sidebarOpen');

sidebarToggle.addEventListener('click', () => {
    sidebar.classList.add('collapsed');
});
sidebarOpen.addEventListener('click', () => {
    sidebar.classList.remove('collapsed');
});

// Re-translate dynamic content when language is switched
document.addEventListener('langchange', () => {
    applyI18n();
    // Re-translate status badge only if it shows the idle text
    if (statusBadge && statusBadge.classList.contains('idle')) {
        statusBadge.textContent = t('statusIdle');
    }
});

// ── Mode switch (batch / single) ──────────────────────────────────────────────
const modeBatch = document.getElementById('modeBatch');
const modeSingle = document.getElementById('modeSingle');
const batchSection = document.getElementById('batchSection');
const singleSection = document.getElementById('singleSection');
const singleQuestion = document.getElementById('singleQuestion');
const singleCharCount = document.getElementById('singleCharCount');
const askBtn = document.getElementById('askBtn');
const runBtn = document.getElementById('runBtn');

let currentMode = 'batch'; // 'batch' | 'single'

function setMode(mode) {
    currentMode = mode;
    const isSingle = mode === 'single';
    modeBatch.classList.toggle('active', !isSingle);
    modeSingle.classList.toggle('active', isSingle);
    batchSection.classList.toggle('hidden', isSingle);
    singleSection.classList.toggle('hidden', !isSingle);
    runBtn.classList.toggle('hidden', isSingle);
    askBtn.classList.toggle('hidden', !isSingle);
    exportBtn.classList.add('hidden'); // reset export on mode change
    if (isSingle) {
        askBtn.disabled = singleQuestion.value.trim().length === 0;
    } else {
        runBtn.disabled = !selectedFile;
    }
}

modeBatch.addEventListener('click', () => setMode('batch'));
modeSingle.addEventListener('click', () => setMode('single'));

// Char counter + enable/disable ask button
singleQuestion.addEventListener('input', () => {
    const len = singleQuestion.value.length;
    singleCharCount.textContent = `${len} / 2000`;
    askBtn.disabled = len === 0;
});

// ── File upload ───────────────────────────────────────────────────────────────
let selectedFile = null;
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileNameEl = document.getElementById('fileName');
const clearFileEl = document.getElementById('clearFile');


function setFile(file) {
    if (!file) return;
    const allowed = ['.xlsx', '.xls'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) { alert(t('fileTypeAlert')); return; }
    selectedFile = file;
    fileNameEl.textContent = file.name;
    fileInfo.classList.remove('hidden');
    dropZone.classList.add('hidden');
    runBtn.disabled = false;
}

function clearFile() {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.classList.add('hidden');
    dropZone.classList.remove('hidden');
    runBtn.disabled = true;
}

fileInput.addEventListener('change', e => setFile(e.target.files[0]));
clearFileEl.addEventListener('click', clearFile);

// Drag-and-drop
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
});

// ── Config builder ────────────────────────────────────────────────────────────
function buildConfig() {
    const v = id => document.getElementById(id);
    const instanceRaw = v('instanceIds').value.trim();
    const instanceIds = instanceRaw
        ? instanceRaw.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    const llmRaw = v('llmConfigId').value.trim();
    const llmConfigId = llmRaw ? parseInt(llmRaw) : null;

    return {
        apiUrl: v('apiUrl').value.trim(),
        kagConfig: {
            llmConfigId,
            instanceIds,
            analysisPromptId: v('analysisPromptId').value.trim() || null,
            resultGenerationPromptId: v('resultGenerationPromptId').value.trim() || null,
            useKeywords: v('useKeywords').checked,
            useRag: v('useRag').checked,
            useGraphRag: v('useGraphRag').checked,
            retrievalTopK: parseInt(v('retrievalTopK').value),
            keyRagWeight: parseInt(v('keyRagWeight').value),
            maxPaths: parseInt(v('maxPaths').value),
            searchType: 'both',
            conceptTopK: parseInt(v('conceptTopK').value),
            conceptSimilarity: parseFloat(v('conceptSimilarity').value),
            relationTopK: 5,
            relationSimilarity: 0.8,
            maxHops: parseInt(v('maxHops').value),
            maxVisited: parseInt(v('maxVisited').value),
            scoreLimit: parseFloat(v('scoreLimit').value),
            cutLimit: parseInt(v('cutLimit').value),
        },
    };
}

// ── Tab management ────────────────────────────────────────────────────────────
const tabList = document.getElementById('tabList');
const tabPanels = document.getElementById('tabPanels');
const tabBar = document.getElementById('tabBar');
const resultsEmpty = document.getElementById('resultsEmpty');
const exportBtn = document.getElementById('exportBtn');
let activeTabIndex = -1;

// Stores completed results for export: [{question, answer, status}]
let allResults = [];

function initTabs(questions) {
    allResults = [];              // reset on each new run
    exportBtn.classList.add('hidden');  // hide until done
    tabList.innerHTML = '';
    tabPanels.innerHTML = '';
    resultsEmpty.classList.add('hidden');
    tabBar.classList.remove('hidden');
    tabPanels.classList.remove('hidden');

    questions.forEach((q, i) => {
        // Tab button
        const btn = document.createElement('button');
        btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
        btn.dataset.index = i;
        btn.innerHTML = `
      <span class="tab-status" id="tabStatus_${i}">⏳</span>
      <span class="tab-label" title="${escapeHtml(q)}">${escapeHtml(q.length > 24 ? q.slice(0, 24) + '…' : q)}</span>
    `;
        btn.addEventListener('click', () => switchTab(i));
        tabList.appendChild(btn);

        // Tab panel
        const panel = document.createElement('div');
        panel.className = 'tab-panel' + (i === 0 ? ' active' : '');
        panel.id = `tabPanel_${i}`;
        panel.innerHTML = `
      <div class="panel-meta">
        <div class="panel-question">${escapeHtml(q)}</div>
      </div>
      <div class="panel-body" id="panelBody_${i}">
        <div class="panel-loading">
          <div class="spinner"></div>
          <span>${t('tabWaiting')}</span>
        </div>
      </div>
    `;
        tabPanels.appendChild(panel);
    });

    activeTabIndex = 0;
}

function switchTab(idx) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const btn = tabList.querySelector(`[data-index="${idx}"]`);
    const panel = document.getElementById(`tabPanel_${idx}`);
    if (btn) btn.classList.add('active');
    if (panel) panel.classList.add('active');
    activeTabIndex = idx;
}

function setTabLoading(idx) {
    const status = document.getElementById(`tabStatus_${idx}`);
    const body = document.getElementById(`panelBody_${idx}`);
    if (status) status.textContent = '⏳';
    if (body) body.innerHTML = `
    <div class="panel-loading">
      <div class="spinner"></div>
      <span>${t('tabLoading')}</span>
    </div>`;
    switchTab(idx);
}

function setTabResult(idx, answer, isError) {
    const status = document.getElementById(`tabStatus_${idx}`);
    const body = document.getElementById(`panelBody_${idx}`);
    if (status) status.textContent = isError ? '❌' : '✅';

    // Store for export
    const question = body ? (body.closest('.tab-panel')?.querySelector('.panel-question')?.textContent?.replace(/^Q:\s*/, '') ?? '') : '';
    allResults[idx] = { question, answer, isError };

    if (!body) return;
    if (isError) {
        body.innerHTML = `<div class="panel-error">${renderContent(answer)}</div>`;
    } else {
        body.innerHTML = `<div class="md-content">${renderContent(answer)}</div>`;
    }
}

// ── Export to Excel ───────────────────────────────────────────────────────────
function exportToExcel() {
    if (!allResults.length) return;

    const rows = [[t('exportColQuestion'), t('exportColAnswer')]];
    allResults.forEach(r => {
        if (r) rows.push([r.question, r.answer]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Auto column widths (rough estimate)
    ws['!cols'] = [
        { wch: 40 },   // question
        { wch: 120 },  // answer
    ];

    XLSX.utils.book_append_sheet(wb, ws, t('exportSheetName'));
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    XLSX.writeFile(wb, `query_results_${ts}.xlsx`);
}

exportBtn.addEventListener('click', exportToExcel);

// ── Status badge ──────────────────────────────────────────────────────────────
const statusBadge = document.getElementById('statusBadge');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

function setStatus(state, text) {
    statusBadge.className = `status-badge ${state}`;
    statusBadge.textContent = text;
}

function updateProgress(done, total) {
    const pct = total ? Math.round(done / total * 100) : 0;
    progressBar.style.width = pct + '%';
    progressText.textContent = `${done} / ${total}`;
}

// ── Run handler ───────────────────────────────────────────────────────────────
let currentEventSource = null;

runBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    // Abort any previous run
    if (currentEventSource) { currentEventSource.close(); currentEventSource = null; }

    const config = buildConfig();
    setStatus('running', t('statusRunning'));
    runBtn.disabled = true;
    progressWrap.classList.remove('hidden');
    updateProgress(0, 0);

    // Build FormData
    const form = new FormData();
    form.append('file', selectedFile);
    form.append('config', JSON.stringify(config));

    let totalQ = 0;
    let doneQ = 0;

    try {
        const resp = await fetch('/api/run-stream', { method: 'POST', body: form });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: resp.statusText }));
            alert(t('apiErrorAlert') + (err.error || resp.statusText));
            setStatus('error', t('statusError'));
            runBtn.disabled = false;
            return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processLine = (line) => {
            if (!line.startsWith('data:')) return;
            const dataStr = line.slice(5).trim();
            if (!dataStr) return;

            let msg;
            try { msg = JSON.parse(dataStr); } catch { return; }

            if (msg.type === 'init') {
                totalQ = msg.total;
                updateProgress(0, totalQ);
                initTabs(msg.questions);
            } else if (msg.type === 'start') {
                setTabLoading(msg.index);
            } else if (msg.type === 'result') {
                doneQ++;
                updateProgress(doneQ, totalQ);
                setTabResult(msg.index, msg.answer, msg.status === 'error');
            } else if (msg.type === 'done') {
                setStatus('done', `${t('statusDone')} ${doneQ}/${totalQ}`);
                runBtn.disabled = false;
                exportBtn.classList.remove('hidden');  // show export button
            }
        };

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE messages (separated by \n\n)
            const parts = buffer.split('\n\n');
            buffer = parts.pop(); // keep incomplete tail
            for (const part of parts) {
                for (const line of part.split('\n')) {
                    processLine(line);
                }
            }
        }
        // Process any remaining buffer
        if (buffer) {
            for (const line of buffer.split('\n')) processLine(line);
        }

    } catch (err) {
        console.error(err);
        setStatus('error', t('statusError'));
        alert(t('requestFailedAlert') + err.message);
        runBtn.disabled = false;
    }
});

// ── Single-question ask handler ────────────────────────────────────────────────
askBtn.addEventListener('click', async () => {
    const question = singleQuestion.value.trim();
    if (!question) return;

    askBtn.disabled = true;
    exportBtn.classList.add('hidden');
    progressWrap.classList.remove('hidden');
    updateProgress(0, 1);
    setStatus('running', t('statusRunning'));

    const config = buildConfig();
    let doneQ = 0, totalQ = 1;

    const processLine = (line) => {
        if (!line.startsWith('data:')) return;
        const dataStr = line.slice(5).trim();
        if (!dataStr) return;
        let msg;
        try { msg = JSON.parse(dataStr); } catch { return; }

        if (msg.type === 'init') {
            initTabs(msg.questions);
        } else if (msg.type === 'start') {
            setTabLoading(msg.index);
        } else if (msg.type === 'result') {
            doneQ++;
            updateProgress(doneQ, totalQ);
            setTabResult(msg.index, msg.answer, msg.status === 'error');
        } else if (msg.type === 'done') {
            setStatus('done', `${t('statusDone')} 1/1`);
            askBtn.disabled = false;
            exportBtn.classList.remove('hidden');
        }
    };

    try {
        const resp = await fetch('/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question,
                apiUrl: config.apiUrl,
                kagConfig: config.kagConfig,
            }),
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: resp.statusText }));
            alert(t('apiErrorAlert') + (err.detail || resp.statusText));
            setStatus('error', t('statusError'));
            askBtn.disabled = false;
            return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop();
            for (const part of parts) {
                for (const line of part.split('\n')) processLine(line);
            }
        }
        if (buffer) {
            for (const line of buffer.split('\n')) processLine(line);
        }
    } catch (err) {
        console.error(err);
        setStatus('error', t('statusError'));
        alert(t('requestFailedAlert') + err.message);
        askBtn.disabled = false;
    }
});

// ── Config persistence ────────────────────────────────────────────────────────
const saveConfigBtn = document.getElementById('saveConfigBtn');
const saveConfigStatus = document.getElementById('saveConfigStatus');

function collectConfig() {
    const v = id => document.getElementById(id);
    return {
        apiUrl: v('apiUrl').value.trim(),
        instanceIds: v('instanceIds').value.trim(),
        llmConfigId: parseInt(v('llmConfigId').value) || 8,
        analysisPromptId: v('analysisPromptId').value.trim(),
        resultGenerationPromptId: v('resultGenerationPromptId').value.trim(),
        useKeywords: v('useKeywords').checked,
        useRag: v('useRag').checked,
        useGraphRag: v('useGraphRag').checked,
        retrievalTopK: parseInt(v('retrievalTopK').value),
        keyRagWeight: parseInt(v('keyRagWeight').value),
        maxPaths: parseInt(v('maxPaths').value),
        conceptTopK: parseInt(v('conceptTopK').value),
        conceptSimilarity: parseFloat(v('conceptSimilarity').value),
        maxHops: parseInt(v('maxHops').value),
        maxVisited: parseInt(v('maxVisited').value),
        scoreLimit: parseFloat(v('scoreLimit').value),
        cutLimit: parseInt(v('cutLimit').value),
    };
}

function applyConfig(cfg) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (!el || val === undefined || val === null) return;
        if (el.type === 'checkbox') el.checked = Boolean(val);
        else el.value = val;
    };
    set('apiUrl', cfg.apiUrl);
    set('instanceIds', cfg.instanceIds);
    set('llmConfigId', cfg.llmConfigId);
    set('analysisPromptId', cfg.analysisPromptId);
    set('resultGenerationPromptId', cfg.resultGenerationPromptId);
    set('useKeywords', cfg.useKeywords);
    set('useRag', cfg.useRag);
    set('useGraphRag', cfg.useGraphRag);
    set('retrievalTopK', cfg.retrievalTopK);
    set('keyRagWeight', cfg.keyRagWeight);
    set('maxPaths', cfg.maxPaths);
    set('conceptTopK', cfg.conceptTopK);
    set('conceptSimilarity', cfg.conceptSimilarity);
    set('maxHops', cfg.maxHops);
    set('maxVisited', cfg.maxVisited);
    set('scoreLimit', cfg.scoreLimit);
    set('cutLimit', cfg.cutLimit);
    // Refresh slider badges and conditional visibility
    ['retrievalTopK', 'keyRagWeight', 'maxPaths', 'conceptTopK', 'maxHops', 'maxVisited', 'cutLimit'].forEach(id => wireSlider(id, false));
    ['conceptSimilarity', 'scoreLimit'].forEach(id => wireSlider(id, true));
    updateGraphVisibility();
    updateKeyRagVisibility();
}

function showSaveStatus(ok, text) {
    saveConfigStatus.textContent = text;
    saveConfigStatus.className = `save-config-status ${ok ? 'ok' : 'err'}`;
    saveConfigStatus.style.opacity = '1';
    setTimeout(() => { saveConfigStatus.style.opacity = '0'; }, 2500);
}

async function loadConfig() {
    try {
        const resp = await fetch('/api/config');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        applyConfig(await resp.json());
        console.log('[config] Loaded from server');
    } catch (e) {
        console.warn('[config] Using defaults:', e);
    }
}

async function saveConfig() {
    saveConfigBtn.disabled = true;
    try {
        const resp = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(collectConfig()),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        showSaveStatus(true, t('saveOk'));
    } catch (e) {
        console.error('[config] Save failed:', e);
        showSaveStatus(false, t('saveErr'));
    } finally {
        saveConfigBtn.disabled = false;
    }
}

saveConfigBtn.addEventListener('click', saveConfig);
loadConfig(); // auto-load on page open
