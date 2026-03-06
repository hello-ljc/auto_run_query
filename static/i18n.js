/* ──────────────────────────────────────────────────────────────────────────
   i18n.js – lightweight internationalization for Auto Run Query
   Supported languages: zh (Chinese, default), en (English)
   ────────────────────────────────────────────────────────────────────────── */

const TRANSLATIONS = {
    zh: {
        /* Topbar */
        appTitle: 'Auto Run Query',
        langBtn: 'EN',

        /* Sidebar */
        sidebarTitle: '参数配置',
        sidebarOpenBtn: '⚙ 配置',
        sidebarCollapseTitle: '收起',

        /* API Settings card */
        apiSettingsHeader: '接口设置',
        instanceIdsLabel: 'Instance IDs',
        instanceIdsHint: '（逗号分隔）',
        instanceIdsPlaceholder: 'e.g. 707988ec-7e6a-4b0c-...',

        /* Search switches card */
        searchSwitchesHeader: '检索开关',
        useKeywordsLabel: '关键词检索',
        useRagLabel: 'RAG 检索',
        useGraphRagLabel: '图数据库检索',

        /* Basic params card */
        basicParamsHeader: '基础检索参数',
        retrievalTopKLabel: '检索 Top-K',
        keyRagWeightLabel: '关键词/RAG 权重',

        /* Graph params card */
        graphParamsHeader: '图检索参数',

        /* Save config */
        saveConfigBtn: '💾 保存配置',
        saveOk: '✓ 已保存',
        saveErr: '✗ 保存失败',

        /* Upload area */
        modeBatch: '📊 批量上传',
        modeSingle: '💬 单次提问',
        dropText: '拖拽 Excel 文件至此，或',
        dropClickLabel: '点击选择',
        dropHint: '支持 .xlsx / .xls · 第一列为问题列表',
        runBtn: '▶ 开始运行',
        askBtn: '提问',
        singlePlaceholder: '请输入你的问题…',
        exportBtn: '⬇ 导出 Excel',

        /* Results */
        emptyResults: '上传 Excel 文件并运行后，结果将显示在此处',

        /* Dynamic status */
        statusIdle: '就绪',
        statusRunning: '运行中…',
        statusDone: '完成',
        statusError: '错误',
        requestFailed: '请求失败',

        /* Tab / panel */
        tabWaiting: '等待执行…',
        tabLoading: '正在请求中…',
        tabErrorPrefix: '**错误：**',

        /* Alerts */
        fileTypeAlert: '请上传 .xlsx 或 .xls 格式的 Excel 文件',
        requestFailedAlert: '请求失败：',
        apiErrorAlert: '错误：',

        /* Export */
        exportSheetName: '查询结果',
        exportColQuestion: '问题',
        exportColAnswer: '答案',
    },

    en: {
        /* Topbar */
        appTitle: 'Auto Run Query',
        langBtn: '中文',

        /* Sidebar */
        sidebarTitle: 'Configuration',
        sidebarOpenBtn: '⚙ Config',
        sidebarCollapseTitle: 'Collapse',

        /* API Settings card */
        apiSettingsHeader: 'API Settings',
        instanceIdsLabel: 'Instance IDs',
        instanceIdsHint: '(comma-separated)',
        instanceIdsPlaceholder: 'e.g. 707988ec-7e6a-4b0c-...',

        /* Search switches card */
        searchSwitchesHeader: 'Search Switches',
        useKeywordsLabel: 'Keyword Search',
        useRagLabel: 'RAG Search',
        useGraphRagLabel: 'Graph DB Search',

        /* Basic params card */
        basicParamsHeader: 'Basic Parameters',
        retrievalTopKLabel: 'Retrieval Top-K',
        keyRagWeightLabel: 'Keyword/RAG Weight',

        /* Graph params card */
        graphParamsHeader: 'Graph Parameters',

        /* Save config */
        saveConfigBtn: '💾 Save Config',
        saveOk: '✓ Saved',
        saveErr: '✗ Save failed',

        /* Upload area */
        modeBatch: '📊 Batch Upload',
        modeSingle: '💬 Single Query',
        dropText: 'Drag Excel file here, or',
        dropClickLabel: 'click to select',
        dropHint: 'Supports .xlsx / .xls · First column = questions',
        runBtn: '▶ Start',
        askBtn: 'Ask',
        singlePlaceholder: 'Enter your question here…',
        exportBtn: '⬇ Export Excel',

        /* Results */
        emptyResults: 'Upload an Excel file and run to see results here',

        /* Dynamic status */
        statusIdle: 'Idle',
        statusRunning: 'Running…',
        statusDone: 'Done',
        statusError: 'Error',
        requestFailed: 'Request failed',

        /* Tab / panel */
        tabWaiting: 'Waiting…',
        tabLoading: 'Requesting…',
        tabErrorPrefix: '**Error:**',

        /* Alerts */
        fileTypeAlert: 'Please upload an .xlsx or .xls Excel file.',
        requestFailedAlert: 'Request failed: ',
        apiErrorAlert: 'Error: ',

        /* Export */
        exportSheetName: 'Query Results',
        exportColQuestion: 'Question',
        exportColAnswer: 'Answer',
    },
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentLang = localStorage.getItem('arq_lang') || 'zh';

// ── Helpers ───────────────────────────────────────────────────────────────────
function t(key) {
    return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key])
        || TRANSLATIONS['zh'][key]
        || key;
}

/** Walk the DOM and update all elements with data-i18n / data-i18n-placeholder / data-i18n-title */
function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });
    // Update html lang attribute
    document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
}

function switchLang() {
    currentLang = currentLang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('arq_lang', currentLang);
    applyI18n();
    // Notify app.js that language changed so it can re-translate dynamic content
    document.dispatchEvent(new CustomEvent('langchange', { detail: currentLang }));
}
