// ============================================================
// GRAVITY — Google Login Preload (Anti-Fingerprint)
// This runs BEFORE page JavaScript, hiding Electron traces
// ============================================================

// Anti-detect: hide Electron/webdriver traces so Google allows login
try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // Fake chrome object to look like a real Chrome browser
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) {
        window.chrome.runtime = {
            connect: function () { },
            sendMessage: function () { },
            id: undefined,
            getManifest: function () { return {}; },
            getURL: function (path) { return ''; },
            onMessage: { addListener: function () { }, removeListener: function () { } },
            onConnect: { addListener: function () { }, removeListener: function () { } }
        };
    }
    if (!window.chrome.app) {
        window.chrome.app = {
            isInstalled: false,
            InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
            RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
        };
    }
    if (!window.chrome.csi) window.chrome.csi = function () { return {}; };
    if (!window.chrome.loadTimes) window.chrome.loadTimes = function () { return {}; };

    // Override userAgentData to match real Chrome 124
    if (navigator.userAgentData) {
        Object.defineProperty(navigator, 'userAgentData', {
            get: () => ({
                brands: [
                    { brand: 'Chromium', version: '124' },
                    { brand: 'Google Chrome', version: '124' },
                    { brand: 'Not_A Brand', version: '8' }
                ],
                mobile: false,
                platform: 'Windows',
                getHighEntropyValues: function (hints) {
                    return Promise.resolve({
                        architecture: 'x86',
                        bitness: '64',
                        brands: this.brands,
                        fullVersionList: [
                            { brand: 'Chromium', version: '124.0.6367.243' },
                            { brand: 'Google Chrome', version: '124.0.6367.243' },
                            { brand: 'Not_A Brand', version: '8.0.0.0' }
                        ],
                        mobile: false,
                        model: '',
                        platform: 'Windows',
                        platformVersion: '15.0.0',
                        uaFullVersion: '124.0.6367.243'
                    });
                }
            })
        });
    }

    // Remove Electron-specific globals
    delete window.process;
    delete window.require;
    delete window.__electron_preload;
    delete window.Buffer;

    // Patch navigator.plugins to look like Chrome
    Object.defineProperty(navigator, 'plugins', {
        get: () => {
            const plugins = [
                { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
            ];
            plugins.length = 5;
            return plugins;
        }
    });

    // Patch navigator.languages
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US', 'en'] });

    // Patch permissions query to avoid detection
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
    );

    // Hide automation indicators
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });

    // Make sure iframe contentWindow works normally (Google uses iframes for login)
    // Override toString to prevent detection of overridden functions
    const nativeToString = Function.prototype.toString;
    Function.prototype.toString = function () {
        if (this === Function.prototype.toString) return 'function toString() { [native code] }';
        if (this === navigator.permissions.query) return 'function query() { [native code] }';
        return nativeToString.call(this);
    };

} catch (e) { /* silent */ }
