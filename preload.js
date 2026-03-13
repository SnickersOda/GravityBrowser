// ============================================================
// GRAVITY BROWSER — Preload Script (v2.0 — Full API)
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gravity', {
    // --- Window Controls ---
    window: {
        minimize: () => ipcRenderer.invoke('window:minimize'),
        maximize: () => ipcRenderer.invoke('window:maximize'),
        close: () => ipcRenderer.invoke('window:close'),
        isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
        fullscreen: () => ipcRenderer.invoke('window:fullscreen'),
        alwaysOnTop: (val) => ipcRenderer.invoke('window:alwaysOnTop', val),
        newWindow: () => ipcRenderer.invoke('window:new'),
        newIncognito: () => ipcRenderer.invoke('window:newIncognito'),
        onStateChanged: (cb) => ipcRenderer.on('window-state-changed', (_, d) => cb(d)),
        onFullscreenChanged: (cb) => ipcRenderer.on('fullscreen-changed', (_, v) => cb(v)),
    },

    // --- Settings ---
    settings: {
        load: () => ipcRenderer.invoke('settings:load'),
        save: (data) => ipcRenderer.invoke('settings:save', data),
        getDefault: () => ipcRenderer.invoke('settings:getDefault'),
        onChanged: (cb) => ipcRenderer.on('settings-changed', (_, data) => cb(data)),
    },

    // --- History ---
    history: {
        get: (query) => ipcRenderer.invoke('history:get', query),
        add: (entry) => ipcRenderer.invoke('history:add', entry),
        clear: () => ipcRenderer.invoke('history:clear'),
        remove: (id) => ipcRenderer.invoke('history:remove', id),
        search: (query) => ipcRenderer.invoke('history:search', query),
    },

    // --- Downloads ---
    downloads: {
        get: () => ipcRenderer.invoke('downloads:get'),
        clear: () => ipcRenderer.invoke('downloads:clear'),
        open: (filepath) => ipcRenderer.invoke('downloads:open', filepath),
        showInFolder: (filepath) => ipcRenderer.invoke('downloads:showInFolder', filepath),
        onProgress: (cb) => ipcRenderer.on('download-progress', (_, d) => cb(d)),
        onComplete: (cb) => ipcRenderer.on('download-complete', (_, d) => cb(d)),
    },

    // --- Bookmarks ---
    bookmarks: {
        get: () => ipcRenderer.invoke('bookmarks:get'),
        add: (bm) => ipcRenderer.invoke('bookmarks:add', bm),
        remove: (id) => ipcRenderer.invoke('bookmarks:remove', id),
    },

    // --- Sessions ---
    sessions: {
        get: () => ipcRenderer.invoke('sessions:get'),
        save: (name, tabs) => ipcRenderer.invoke('sessions:save', name, tabs),
        delete: (id) => ipcRenderer.invoke('sessions:delete', id),
    },

    // --- Quick Links ---
    quicklinks: {
        get: () => ipcRenderer.invoke('quicklinks:get'),
        save: (links) => ipcRenderer.invoke('quicklinks:save', links),
    },

    // --- Top Sites ---
    topsites: {
        get: () => ipcRenderer.invoke('topsites:get'),
    },

    // --- Notes ---
    notes: {
        get: () => ipcRenderer.invoke('notes:get'),
        save: (note) => ipcRenderer.invoke('notes:save', note),
        delete: (id) => ipcRenderer.invoke('notes:delete', id),
    },

    // --- Reading List ---
    readinglist: {
        get: () => ipcRenderer.invoke('readinglist:get'),
        add: (item) => ipcRenderer.invoke('readinglist:add', item),
        remove: (id) => ipcRenderer.invoke('readinglist:remove', id),
    },

    // --- Clipboard ---
    clipboard: {
        get: () => ipcRenderer.invoke('clipboard:get'),
        add: (text) => ipcRenderer.invoke('clipboard:add', text),
    },

    // --- Permissions ---
    permissions: {
        get: () => ipcRenderer.invoke('permissions:get'),
        set: (site, perm, val) => ipcRenderer.invoke('permissions:set', site, perm, val),
    },

    // --- Flags ---
    flags: {
        get: () => ipcRenderer.invoke('flags:get'),
        save: (flags) => ipcRenderer.invoke('flags:save', flags),
    },

    // --- Usage Stats ---
    usage: {
        get: () => ipcRenderer.invoke('usage:get'),
        track: (url, seconds) => ipcRenderer.invoke('usage:track', url, seconds),
    },

    // --- Pulse Stats ---
    pulse: {
        getStats: () => ipcRenderer.invoke('pulse:getStats'),
        resetStats: () => ipcRenderer.invoke('pulse:resetStats'),
        onUpdate: (cb) => ipcRenderer.on('pulse-stats-update', (_, d) => cb(d)),
    },

    // --- Config (legacy) ---
    config: {
        load: () => ipcRenderer.invoke('config:load'),
        save: (data) => ipcRenderer.invoke('config:save', data),
    },

    // --- Actions ---
    actions: {
        print: () => ipcRenderer.invoke('page:print'),
        screenshot: () => ipcRenderer.invoke('page:screenshot'),
        openDownloadsFolder: () => ipcRenderer.invoke('downloads:openFolder'),
    },

    // --- Data Management ---
    data: {
        clearAll: () => ipcRenderer.invoke('data:clearAll'),
        clearCache: () => ipcRenderer.invoke('data:clearCache'),
        clearCookies: () => ipcRenderer.invoke('data:clearCookies'),
    },

    // --- App Info ---
    app: {
        getInfo: () => ipcRenderer.invoke('app:getInfo'),
        getPath: (name) => ipcRenderer.invoke('app:getPath', name),
        getPreloadPath: () => ipcRenderer.invoke('app:getPreloadPath'),
    },

    // --- Shell ---
    shell: {
        openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    },

    // --- AI Agent ---
    ai: {
        chat: (messages) => ipcRenderer.invoke('ai:chat', messages),
        chatWithScreenshot: (messages, screenshot, isAgent) => ipcRenderer.invoke('ai:chatWithScreenshot', messages, screenshot, isAgent),
        captureTab: () => ipcRenderer.invoke('ai:captureTab'),
        captureWithInfo: () => ipcRenderer.invoke('ai:captureWithInfo'),
        testKey: (apiKey) => ipcRenderer.invoke('ai:testKey', apiKey),
        executeAction: (action) => ipcRenderer.invoke('ai:executeAction', action),
        getPageInfo: () => ipcRenderer.invoke('ai:getPageInfo'),
        voiceChat: (audioBase64, messages, isAgent) => ipcRenderer.invoke('ai:voiceChat', audioBase64, messages, isAgent),
        speak: (text) => ipcRenderer.invoke('ai:speak', text),
        getRealtimeToken: () => ipcRenderer.invoke('ai:getRealtimeToken'),
        sendSDP: (token, sdp) => ipcRenderer.invoke('ai:sendSDP', { token, sdp }),
        describeScreen: (base64) => ipcRenderer.invoke('ai:describeScreen', base64),
        // Gemini Live API
        connectGemini: () => ipcRenderer.invoke('ai:connectGemini'),
        disconnectGemini: () => ipcRenderer.invoke('ai:disconnectGemini'),
        sendGeminiAudio: (base64) => ipcRenderer.invoke('ai:sendGeminiAudio', base64),
        sendGeminiImage: (base64) => ipcRenderer.invoke('ai:sendGeminiImage', base64),
        sendGeminiToolResponse: (functionResponses) => ipcRenderer.invoke('ai:sendGeminiToolResponse', { functionResponses }),
        onGeminiEvent: (cb) => ipcRenderer.on('gemini-event', (_, msg) => cb(msg)),
        removeGeminiListeners: () => ipcRenderer.removeAllListeners('gemini-event'),
        // Provider
        getProvider: () => ipcRenderer.invoke('ai:getProvider'),
    },

    // --- Events ---
    on: {
        openUrl: (cb) => ipcRenderer.on('open-url-in-new-tab', (_, url) => cb(url)),
        toast: (cb) => ipcRenderer.on('toast', (_, data) => cb(data)),
        incognito: (cb) => ipcRenderer.on('set-incognito', (_, val) => cb(val)),
        triggerPrint: (cb) => ipcRenderer.on('trigger-print', () => cb()),
        shortcut: (cb) => ipcRenderer.on('shortcut-triggered', (_, data) => cb(data)),
    },

    // --- Import Wizard ---
    import: {
        detect: () => ipcRenderer.invoke('import:detect'),
        bookmarks: (browser) => ipcRenderer.invoke('import:bookmarks', browser),
        history: (browser) => ipcRenderer.invoke('import:history', browser),
        done: () => ipcRenderer.invoke('import:done'),
        close: () => ipcRenderer.send('import:close'),
        minimize: () => ipcRenderer.send('import:minimize'),
    },
});
