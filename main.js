// ============================================================
// GRAVITY BROWSER — Main Process (v2.0 — 103 Features)
// ============================================================

const { app, BrowserWindow, ipcMain, session, shell, Menu, dialog, nativeImage, screen, nativeTheme, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// Load .env file (no dotenv dependency needed)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const l = line.trim();
      if (l && !l.startsWith('#') && l.includes('=')) {
        const [key, ...vals] = l.split('=');
        process.env[key.trim()] = vals.join('=').trim();
      }
    });
  }
} catch (e) { /* silent */ }

// --- Fingerprint Evasion ---
const CHROME_VERSION = '124.0.6367.243';
const CHROME_MAJOR = CHROME_VERSION.split('.')[0]; // '124'
const SPOOFED_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;

// Strip Electron/Gravity from the default user agent at the app level
// This is critical for Google login — Google checks the UA and blocks Electron apps
app.userAgentFallback = SPOOFED_UA;

// --- Globals ---
let mainWindow = null;
let windows = [];

// --- Pulse Stats ---
let pulseStats = {
  adsBlocked: 0,
  trackersBlocked: 0,
  requestsTotal: 0,
  dataSavedKB: 0,
  sessionStart: Date.now()
};

// --- Data Storage ---
const DATA_DIR = () => path.join(app.getPath('userData'), 'gravity-data');

function ensureDataDir() {
  const dir = DATA_DIR();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function dataPath(file) {
  return path.join(ensureDataDir(), file);
}

function readJSON(file, fallback = []) {
  try {
    const p = dataPath(file);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { console.error(`Read ${file} error:`, e); }
  return fallback;
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(dataPath(file), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.error(`Write ${file} error:`, e); }
}

// ============================================================
// SETTINGS
// ============================================================
const DEFAULT_SETTINGS = {
  language: 'ru',
  theme: 'dark',
  accentColor: '#808080',
  searchEngine: 'google',
  homePage: 'gravity://newtab',
  newtabBackground: 'default',
  newtabCustomBg: '',
  fontSize: 'medium',
  density: 'comfortable',
  sidebarPosition: 'left',
  showBookmarksBar: false,
  restoreSession: false,
  smoothScroll: true,
  forceDarkMode: false,
  httpsOnly: false,
  fingerprintProtection: true,
  doNotTrack: true,
  clearOnExit: false,
  trackingProtection: 'basic',
  popupBlocking: true,
  tabCountWarning: 50,
  lowRamMode: false,
  frostEnabled: true,
  frostTimeout: 30000,
  alwaysOnTop: false,
};

function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...readJSON('settings.json', {}) };
}

function saveSettings(data) {
  writeJSON('settings.json', data);
}

// ============================================================
// HISTORY
// ============================================================
function getHistory() {
  return readJSON('history.json', []);
}

function addHistoryEntry(entry) {
  const history = getHistory();
  history.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    url: entry.url,
    title: entry.title || entry.url,
    favicon: entry.favicon || '',
    timestamp: Date.now(),
  });
  // Keep last 5000 entries
  if (history.length > 5000) history.length = 5000;
  writeJSON('history.json', history);
}

function clearHistory() {
  writeJSON('history.json', []);
}

function removeHistoryEntry(id) {
  const history = getHistory();
  const filtered = history.filter(h => h.id !== id);
  writeJSON('history.json', filtered);
}

function searchHistory(query) {
  const history = getHistory();
  if (!query) return history.slice(0, 200);
  const q = query.toLowerCase();
  return history.filter(h =>
    h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q)
  ).slice(0, 200);
}

// ============================================================
// DOWNLOADS
// ============================================================
let downloads = [];

function getDownloads() {
  return readJSON('downloads.json', []);
}

function addDownload(item) {
  const dl = getDownloads();
  dl.unshift(item);
  if (dl.length > 500) dl.length = 500;
  writeJSON('downloads.json', dl);
  return dl;
}

function clearDownloads() {
  writeJSON('downloads.json', []);
}

// ============================================================
// BOOKMARKS
// ============================================================
function getBookmarks() {
  return readJSON('bookmarks.json', []);
}

function addBookmark(bm) {
  const bookmarks = getBookmarks();
  // Check duplicate
  if (bookmarks.some(b => b.url === bm.url)) return bookmarks;
  bookmarks.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    url: bm.url,
    title: bm.title || bm.url,
    favicon: bm.favicon || '',
    folder: bm.folder || '',
    timestamp: Date.now(),
  });
  writeJSON('bookmarks.json', bookmarks);
  return bookmarks;
}

function removeBookmark(id) {
  let bookmarks = getBookmarks();
  bookmarks = bookmarks.filter(b => b.id !== id);
  writeJSON('bookmarks.json', bookmarks);
  return bookmarks;
}

// ============================================================
// SESSIONS
// ============================================================
function getSessions() {
  return readJSON('sessions.json', []);
}

function saveSession(name, tabs) {
  const sessions = getSessions();
  sessions.unshift({
    id: Date.now().toString(36),
    name,
    tabs,
    timestamp: Date.now(),
  });
  if (sessions.length > 20) sessions.length = 20;
  writeJSON('sessions.json', sessions);
  return sessions;
}

function deleteSession(id) {
  let sessions = getSessions();
  sessions = sessions.filter(s => s.id !== id);
  writeJSON('sessions.json', sessions);
  return sessions;
}

// ============================================================
// QUICK LINKS (newtab)
// ============================================================
function getQuickLinks() {
  return readJSON('quicklinks.json', [
    { url: 'https://www.google.com', title: 'Google' },
    { url: 'https://www.youtube.com', title: 'YouTube' },
    { url: 'https://github.com', title: 'GitHub' },
    { url: 'https://reddit.com', title: 'Reddit' },
    { url: 'https://twitter.com', title: 'X (Twitter)' },
    { url: 'https://telegram.org', title: 'Telegram' },
  ]);
}

function saveQuickLinks(links) {
  writeJSON('quicklinks.json', links);
}

// ============================================================
// TOP SITES
// ============================================================
function getTopSites() {
  const history = getHistory();
  const counts = {};
  history.forEach(h => {
    try {
      const host = new URL(h.url).hostname;
      if (!counts[host]) counts[host] = { url: h.url, title: h.title, favicon: h.favicon, count: 0 };
      counts[host].count++;
    } catch (e) { }
  });
  return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 8);
}

// ============================================================
// SITE PERMISSIONS
// ============================================================
function getSitePermissions() {
  return readJSON('permissions.json', {});
}

function setSitePermission(site, permission, value) {
  const perms = getSitePermissions();
  if (!perms[site]) perms[site] = {};
  perms[site][permission] = value;
  writeJSON('permissions.json', perms);
  return perms;
}

// ============================================================
// NOTES
// ============================================================
function getNotes() {
  return readJSON('notes.json', []);
}

function saveNote(note) {
  const notes = getNotes();
  const existing = notes.findIndex(n => n.id === note.id);
  if (existing >= 0) {
    notes[existing] = { ...notes[existing], ...note, updatedAt: Date.now() };
  } else {
    notes.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: note.text,
      site: note.site || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  writeJSON('notes.json', notes);
  return notes;
}

function deleteNote(id) {
  let notes = getNotes();
  notes = notes.filter(n => n.id !== id);
  writeJSON('notes.json', notes);
  return notes;
}

// ============================================================
// READING LIST
// ============================================================
function getReadingList() {
  return readJSON('readinglist.json', []);
}

function addToReadingList(item) {
  const list = getReadingList();
  if (list.some(l => l.url === item.url)) return list;
  list.unshift({
    id: Date.now().toString(36),
    url: item.url,
    title: item.title || item.url,
    favicon: item.favicon || '',
    timestamp: Date.now(),
  });
  writeJSON('readinglist.json', list);
  return list;
}

function removeFromReadingList(id) {
  let list = getReadingList();
  list = list.filter(l => l.id !== id);
  writeJSON('readinglist.json', list);
  return list;
}

// ============================================================
// CLIPBOARD HISTORY
// ============================================================
let clipboardHistory = [];

function addToClipboard(text) {
  if (!text || text.trim() === '') return;
  clipboardHistory = clipboardHistory.filter(c => c !== text);
  clipboardHistory.unshift(text);
  if (clipboardHistory.length > 10) clipboardHistory.length = 10;
}

// ============================================================
// FLAGS (experimental)
// ============================================================
function getFlags() {
  return readJSON('flags.json', {
    splitView: true,
    readerMode: true,
    focusMode: true,
    pipMode: true,
    colorPicker: true,
    forceSmooth: true,
    tabPreview: false,
    adaptiveTitlebar: true,
    breathingTab: true,
    videoDownload: true,
  });
}

function saveFlags(flags) {
  writeJSON('flags.json', flags);
}

// ============================================================
// USAGE STATS
// ============================================================
function getUsageStats() {
  return readJSON('usage.json', { sites: {}, totalTime: 0 });
}

function trackUsage(url, seconds) {
  try {
    const host = new URL(url).hostname;
    const stats = getUsageStats();
    if (!stats.sites[host]) stats.sites[host] = 0;
    stats.sites[host] += seconds;
    stats.totalTime += seconds;
    writeJSON('usage.json', stats);
  } catch (e) { }
}

// ============================================================
// AD & TRACKER BLOCKER
// ============================================================
const BLOCKED_DOMAINS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
  'pagead2.googlesyndication.com', 'adservice.google.com',
  'connect.facebook.net', 'pixel.facebook.com', 'an.facebook.com',
  'adnxs.com', 'adsrvr.org', 'adform.net', 'adcolony.com',
  'amazon-adsystem.com', 'media.net', 'outbrain.com', 'taboola.com',
  'criteo.com', 'criteo.net', 'rubiconproject.com', 'pubmatic.com',
  'openx.net', 'casalemedia.com', 'indexww.com', 'bidswitch.net',
  'smartadserver.com', 'yieldmo.com', 'sharethrough.com', 'triplelift.com',
  'quantserve.com', 'scorecardresearch.com', 'bluekai.com',
  'exelator.com', 'demdex.net', 'krxd.net', 'liadm.com', 'tapad.com',
  'moatads.com', 'doubleverify.com', 'adsafeprotected.com',
  'serving-sys.com', 'sizmek.com', 'flashtalking.com',
  'an.yandex.ru', 'yandexadexchange.net', 'mc.yandex.ru',
  'ad.mail.ru', 'target.my.com', 'top-fwz1.mail.ru',
  // Yandex browser/pack distribution (hijacks downloads)
  'browser.yandex.ru', 'dl.browser.yandex.ru', 'downloader.yandex.ru',
  'distribution.yandex.ru', 'soft.yandex.ru', 'clck.yandex.ru',
  'yandex.ru/soft', 'redirect.appmetrica.yandex.com',
  'appmetrica.yandex.com', 'yandexmetrica.com',
  'amplitude.com', 'hotjar.com', 'fullstory.com', 'mouseflow.com',
  'luckyorange.com', 'clarity.ms', 'crazyegg.com',
  'popads.net', 'popcash.net', 'propellerads.com',
  'revcontent.com', 'mgid.com', 'addthis.com', 'sharethis.com',
  'ads.yahoo.com', 'advertising.com', 'ad.doubleclick.net',
  'newrelic.com', 'nr-data.net'
];

const TRACKER_DOMAINS = [
  'google-analytics.com', 'googletagmanager.com', 'connect.facebook.net',
  'pixel.facebook.com', 'mc.yandex.ru', 'quantserve.com',
  'scorecardresearch.com', 'bluekai.com', 'demdex.net', 'krxd.net',
  'hotjar.com', 'fullstory.com', 'clarity.ms', 'amplitude.com',
  'mouseflow.com', 'crazyegg.com'
];

function isBlockedDomain(hostname) {
  return BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
}

function isTrackerDomain(hostname) {
  return TRACKER_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
}

function setupAdBlocker() {
  // Block known Yandex pack loader file patterns
  const BLOCKED_URL_PATTERNS = [
    /yandex.*pack.*loader/i,
    /yandex.*browser.*setup/i,
    /YandexPackSetup/i,
    /yandex_pack/i,
    /\/soft\/download/i,
    /browser\.yandex.*\.exe/i,
  ];

  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    try {
      const url = new URL(details.url);
      // Block by domain
      if (isBlockedDomain(url.hostname)) {
        pulseStats.adsBlocked++;
        pulseStats.dataSavedKB += 15;
        if (isTrackerDomain(url.hostname)) pulseStats.trackersBlocked++;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('pulse-stats-update', { ...pulseStats });
        }
        callback({ cancel: true });
        return;
      }
      // Block by URL pattern (Yandex pack loaders, etc.)
      const fullUrl = details.url;
      if (BLOCKED_URL_PATTERNS.some(p => p.test(fullUrl))) {
        pulseStats.adsBlocked++;
        console.log('[AdBlock] Blocked Yandex pack loader:', fullUrl);
        callback({ cancel: true });
        return;
      }
    } catch (e) { }
    pulseStats.requestsTotal++;
    callback({});
  });
}

// ============================================================
// ANTI-FINGERPRINT
// ============================================================
function getAntiDetectScript() {
  return `
    try {
      // Anti-detect: hide Electron/webdriver traces so Google allows login
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // Fake chrome object to look like a real Chrome browser
      if (!window.chrome) window.chrome = {};
      if (!window.chrome.runtime) {
        window.chrome.runtime = {
          connect: function(){},
          sendMessage: function(){},
          id: undefined,
          getManifest: function() { return {}; },
          getURL: function(path) { return ''; },
          onMessage: { addListener: function(){}, removeListener: function(){} },
          onConnect: { addListener: function(){}, removeListener: function(){} }
        };
      }
      if (!window.chrome.app) {
        window.chrome.app = { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } };
      }
      if (!window.chrome.csi) window.chrome.csi = function() { return {}; };
      if (!window.chrome.loadTimes) window.chrome.loadTimes = function() { return {}; };

      // Override userAgentData to match real Chrome ${CHROME_VERSION}
      if (navigator.userAgentData) {
        Object.defineProperty(navigator, 'userAgentData', {
          get: () => ({
            brands: [
              { brand: 'Chromium', version: '${CHROME_MAJOR}' },
              { brand: 'Google Chrome', version: '${CHROME_MAJOR}' },
              { brand: 'Not_A Brand', version: '8' }
            ],
            mobile: false,
            platform: 'Windows',
            getHighEntropyValues: function(hints) {
              return Promise.resolve({
                architecture: 'x86',
                bitness: '64',
                brands: this.brands,
                fullVersionList: [
                  { brand: 'Chromium', version: '${CHROME_VERSION}' },
                  { brand: 'Google Chrome', version: '${CHROME_VERSION}' },
                  { brand: 'Not_A Brand', version: '8.0.0.0' }
                ],
                mobile: false,
                model: '',
                platform: 'Windows',
                platformVersion: '15.0.0',
                uaFullVersion: '${CHROME_VERSION}'
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
    } catch(e) {}
  `;
}

// ============================================================
// GOOGLE LOGIN POPUP — Opens Google OAuth in a BrowserWindow
// instead of webview to bypass Google's embedded browser block
// ============================================================
function isGoogleLoginUrl(url) {
  try {
    const u = new URL(url);
    return (u.hostname === 'accounts.google.com' || u.hostname === 'accounts.youtube.com') &&
      (u.pathname.includes('/signin') || u.pathname.includes('/ServiceLogin') ||
        u.pathname.includes('/o/oauth2') || u.pathname.includes('/v3/signin') ||
        u.pathname.includes('/AccountChooser') || u.pathname.includes('/AddSession') ||
        u.pathname.includes('/InteractiveLogin'));
  } catch (e) { return false; }
}

function openGoogleLoginPopup(url, webviewContents) {
  const loginWin = new BrowserWindow({
    width: 500,
    height: 700,
    parent: mainWindow,
    modal: true,
    show: true,
    title: 'Google Sign In',
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      // contextIsolation OFF so preload can modify page globals BEFORE Google's scripts run
      contextIsolation: false,
      sandbox: false,
      // Preload with anti-fingerprint — runs BEFORE any page JavaScript
      preload: path.join(__dirname, 'google_preload.js'),
      // Use the same session so cookies are shared with webviews
      partition: undefined,
    },
    icon: path.join(__dirname, 'icon_black.png'),
  });

  loginWin.setMenuBarVisibility(false);
  loginWin.webContents.setUserAgent(SPOOFED_UA);
  loginWin.loadURL(url);

  // When Google login finishes, it will redirect to the original service
  // Detect when we leave accounts.google.com = login complete
  const handleNavigation = (e, navUrl) => {
    try {
      const u = new URL(navUrl);
      // If navigated away from Google login pages, login is complete
      if (u.hostname !== 'accounts.google.com' && u.hostname !== 'accounts.youtube.com' &&
        u.hostname !== 'myaccount.google.com' && !u.hostname.endsWith('.google.com')) {
        // Login complete — redirect webview to final URL and close popup
        if (webviewContents && !webviewContents.isDestroyed()) {
          webviewContents.loadURL(navUrl);
        }
        loginWin.close();
      }
    } catch (err) { /* ignore */ }
  };

  loginWin.webContents.on('will-redirect', handleNavigation);
  loginWin.webContents.on('did-navigate', (e, navUrl) => {
    try {
      const u = new URL(navUrl);
      // If we're back on a non-Google page, login is done
      if (!u.hostname.endsWith('google.com') && !u.hostname.endsWith('youtube.com') &&
        !u.hostname.endsWith('googleapis.com') && !u.hostname.endsWith('gstatic.com')) {
        if (webviewContents && !webviewContents.isDestroyed()) {
          webviewContents.loadURL(navUrl);
        }
        loginWin.close();
      }
    } catch (err) { /* ignore */ }
  });

  // If user closes popup manually, reload webview so it reflects any login state
  loginWin.on('closed', () => {
    if (webviewContents && !webviewContents.isDestroyed()) {
      webviewContents.reload();
    }
  });
}

function setupAntiFingerprint() {
  const antiDetectJS = getAntiDetectScript();
  const settings = loadSettings();

  mainWindow.webContents.on('did-attach-webview', (event, wc) => {
    wc.setUserAgent(SPOOFED_UA);

    // Intercept Google login navigations — open in popup BrowserWindow
    wc.on('will-navigate', (e, url) => {
      if (isGoogleLoginUrl(url)) {
        e.preventDefault();
        openGoogleLoginPopup(url, wc);
        return;
      }
    });

    // CRITICAL: Register preload for local file:// pages (settings, newtab)
    // so they can access window.gravity API
    wc.on('will-navigate', (e, url) => {
      // Preload is already set from webview tag attributes for file:// URLs
    });

    wc.on('dom-ready', () => {
      const url = wc.getURL();

      // For local file:// pages, inject the gravity API bridge
      if (url.startsWith('file://')) {
        // Inject a bridge that forwards IPC calls through the parent window
        wc.executeJavaScript(`
          if (!window.gravity) {
            // Signal parent window to handle settings for us
            window.__isGravityLocal = true;
          }
        `).catch(() => { });
      } else {
        // Only run anti-detect on external sites
        wc.executeJavaScript(antiDetectJS).catch(() => { });

        // Hide Yandex browser promo/pack banners
        if (url.includes('yandex.')) {
          wc.insertCSS(`
            .distr-tooltip, .softcheck, .soft-check,
            .distribution, .browser-install, .browser-download,
            .home-tabs__promo, .promo-header, .zen-promo,
            [class*="BrowserInstall"], [class*="SoftSuggest"],
            [class*="distr"], [class*="YandexSoft"],
            .popup2[data-name="distr"], .serp-header__bro,
            .bro-suggest, .bro-popup { display: none !important; }
          `).catch(() => { });
        }

        // YouTube Ad Blocker — auto-skip and speed-up ads
        if (url.includes('youtube.com')) {
          wc.insertCSS(`
            .ytp-ad-overlay-container,
            .ytp-ad-text-overlay,
            .ytp-ad-image-overlay,
            #player-ads,
            #masthead-ad,
            ytd-banner-promo-renderer,
            ytd-promoted-sparkles-web-renderer,
            ytd-display-ad-renderer,
            ytd-promoted-video-renderer,
            ytd-compact-promoted-video-renderer,
            ytd-action-companion-ad-renderer,
            .ytd-mealbar-promo-renderer,
            ytd-ad-slot-renderer,
            .ytp-ad-overlay-slot,
            #offer-module { display: none !important; }
          `).catch(() => { });

          wc.executeJavaScript(`
            (function() {
              if (window.__gravityYTAdBlock) return;
              window.__gravityYTAdBlock = true;
              
              const adBlocker = setInterval(() => {
                try {
                  const video = document.querySelector('video');
                  if (!video) return;
                  
                  // Detect if ad is playing
                  const adShowing = document.querySelector('.ad-showing, .ad-interrupting');
                  if (adShowing) {
                    // Try skip button first
                    const skipBtn = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, button.ytp-ad-skip-button-modern');
                    if (skipBtn) {
                      skipBtn.click();
                      return;
                    }
                    // Speed up non-skippable ads + mute
                    video.playbackRate = 16;
                    video.muted = true;
                    video.currentTime = video.duration || video.currentTime + 999;
                  } else {
                    // Restore normal playback
                    if (video.playbackRate === 16) {
                      video.playbackRate = 1;
                      video.muted = false;
                    }
                  }
                  
                  // Remove overlay ads
                  document.querySelectorAll('.ytp-ad-overlay-close-button').forEach(b => b.click());
                } catch(e) {}
              }, 500);
              
              // Cleanup on navigation
              window.addEventListener('beforeunload', () => clearInterval(adBlocker));
            })();
          `).catch(() => { });
        }
      }

      // Native dark mode signal - User wants websites to always be dark
      nativeTheme.themeSource = 'dark';

      // Smooth scroll injection
      if (settings.smoothScroll) {
        wc.insertCSS(`html { scroll-behavior: smooth !important; }`).catch(() => { });
      }
    });
  });

  // Headers: clean up Electron-specific headers but keep real Chrome headers
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    // Remove all Electron-specific headers
    delete headers['X-Electron-Is-Dev'];
    delete headers['X-Electron'];
    // Set Chrome-like headers
    headers['User-Agent'] = SPOOFED_UA;
    headers['sec-ch-ua'] = `"Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}", "Not_A Brand";v="8"`;
    headers['sec-ch-ua-mobile'] = '?0';
    headers['sec-ch-ua-platform'] = '"Windows"';
    headers['sec-ch-ua-full-version-list'] = `"Chromium";v="${CHROME_VERSION}", "Google Chrome";v="${CHROME_VERSION}", "Not_A Brand";v="8.0.0.0"`;
    if (settings.doNotTrack) headers['DNT'] = '1';
    callback({ requestHeaders: headers });
  });
}

// ============================================================
// DOWNLOADS HANDLER (per-window)
// ============================================================
function setupDownloadManager(win) {
  if (!win || win.isDestroyed()) return;
  const ses = win.webContents.session;
  ses.on('will-download', (event, item, webContents) => {
    const fileName = item.getFilename();
    const totalBytes = item.getTotalBytes();
    const downloadPath = path.join(app.getPath('downloads'), fileName);
    item.setSavePath(downloadPath);

    const dlItem = {
      id: item.getETag() || Date.now().toString(),
      filename: fileName,
      url: item.getURL(),
      path: downloadPath,
      totalBytes,
      receivedBytes: 0,
      state: 'progressing',
      timestamp: Date.now(),
    };

    win.webContents.send('download:start', {
      id: dlItem.id,
      fileName,
      savePath: downloadPath,
      totalBytes,
      url: item.getURL(),
    });

    item.on('updated', (event, state) => {
      const received = item.getReceivedBytes();
      const total = item.getTotalBytes();
      win.webContents.send('download:progress', {
        savePath: downloadPath,
        state,
        receivedBytes: received,
        totalBytes: total,
        percent: total > 0 ? Math.round((received / total) * 100) : 0,
      });
    });

    item.once('done', (event, state) => {
      dlItem.state = state;
      dlItem.receivedBytes = dlItem.totalBytes;
      addDownload(dlItem);
      win.webContents.send('download:done', {
        savePath: downloadPath,
        state,
        fileName,
      });
      win.webContents.send('toast', { message: `Загружено: ${fileName}`, type: 'success' });
    });
  });
}

// ============================================================
// WINDOW CREATION
// ============================================================
function createWindow(isIncognito = false) {
  const settings = loadSettings();

  session.defaultSession.setUserAgent(SPOOFED_UA);

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    thickFrame: true,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
    show: false,
    icon: path.join(__dirname, 'icon_black.png'),
    alwaysOnTop: settings.alwaysOnTop,
  });

  // Hidden menu with accelerators - this is the ONLY reliable way to handle
  // keyboard shortcuts in Electron when webview has focus
  const send = (data) => { if (win && !win.isDestroyed()) win.webContents.send('shortcut-triggered', data); };
  const sc = (accel, data) => ({ label: accel, accelerator: accel, click: () => send(data), visible: false });
  const menu = Menu.buildFromTemplate([{
    label: 'Shortcuts', submenu: [
      sc('CmdOrCtrl+T', { key: 't', ctrl: true, shift: false }),
      sc('CmdOrCtrl+W', { key: 'w', ctrl: true, shift: false }),
      sc('CmdOrCtrl+N', { key: 'n', ctrl: true, shift: false }),
      sc('CmdOrCtrl+Shift+N', { key: 'N', ctrl: true, shift: true }),
      sc('CmdOrCtrl+Shift+T', { key: 'T', ctrl: true, shift: true }),
      sc('CmdOrCtrl+K', { key: 'k', ctrl: true, shift: false }),
      sc('CmdOrCtrl+F', { key: 'f', ctrl: true, shift: false }),
      sc('CmdOrCtrl+H', { key: 'h', ctrl: true, shift: false }),
      sc('CmdOrCtrl+J', { key: 'j', ctrl: true, shift: false }),
      sc('CmdOrCtrl+L', { key: 'l', ctrl: true, shift: false }),
      sc('CmdOrCtrl+P', { key: 'p', ctrl: true, shift: false }),
      sc('CmdOrCtrl+R', { key: 'r', ctrl: true, shift: false }),
      sc('CmdOrCtrl+=', { key: '=', ctrl: true, shift: false }),
      sc('CmdOrCtrl+-', { key: '-', ctrl: true, shift: false }),
      sc('CmdOrCtrl+0', { key: '0', ctrl: true, shift: false }),
      sc('CmdOrCtrl+1', { key: '1', ctrl: true, shift: false }),
      sc('CmdOrCtrl+2', { key: '2', ctrl: true, shift: false }),
      sc('CmdOrCtrl+3', { key: '3', ctrl: true, shift: false }),
      sc('CmdOrCtrl+4', { key: '4', ctrl: true, shift: false }),
      sc('CmdOrCtrl+5', { key: '5', ctrl: true, shift: false }),
      sc('CmdOrCtrl+6', { key: '6', ctrl: true, shift: false }),
      sc('CmdOrCtrl+7', { key: '7', ctrl: true, shift: false }),
      sc('CmdOrCtrl+8', { key: '8', ctrl: true, shift: false }),
      sc('CmdOrCtrl+9', { key: '9', ctrl: true, shift: false }),
      sc('F5', { key: 'F5', ctrl: false, shift: false }),
      sc('F11', { key: 'F11', ctrl: false, shift: false }),
      sc('F12', { key: 'F12', ctrl: false, shift: false }),
    ]
  }]);
  Menu.setApplicationMenu(menu);

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    // DevTools disabled for production — was causing fingerprint detection
    // win.webContents.openDevTools({ mode: 'detach' });
    if (isIncognito) {
      win.webContents.send('set-incognito', true);
    }
  });

  win.on('maximize', () => {
    win.webContents.send('window-state-changed', { maximized: true });
  });
  win.on('unmaximize', () => {
    win.webContents.send('window-state-changed', { maximized: false });
  });

  win.on('enter-full-screen', () => {
    win.webContents.send('fullscreen-changed', true);
  });
  win.on('leave-full-screen', () => {
    win.webContents.send('fullscreen-changed', false);
  });

  win.on('closed', () => {
    windows = windows.filter(w => w !== win);
    if (win === mainWindow) mainWindow = null;
  });

  windows.push(win);

  setupDownloadManager(win);
  if (!mainWindow) {
    mainWindow = win;
    setupAdBlocker();
    setupAntiFingerprint();
    setupWebViewPermissions();
  }

  return win;
}

// ============================================================
// EXTENSIONS (Chromium)
// ============================================================
async function loadExtensions() {
  const extDir = path.join(app.getPath('userData'), 'extensions');
  if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true });
  const folders = fs.readdirSync(extDir);
  for (const folder of folders) {
    const extPath = path.join(extDir, folder);
    if (fs.statSync(extPath).isDirectory()) {
      try {
        await session.defaultSession.loadExtension(extPath, { allowFileAccess: true });
        console.log('Загружено расширение:', folder);
      } catch (e) {
        console.error('Ошибка загрузки расширения:', folder, e.message);
      }
    }
  }
}

// ============================================================
// INCOGNITO WINDOW (separate session, no persistence)
// ============================================================
function createIncognitoWindow() {
  const incognitoSession = session.fromPartition('incognito:' + Date.now(), { cache: false });
  incognitoSession.setUserAgent(SPOOFED_UA);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    thickFrame: true,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      session: incognitoSession,
    },
    show: false,
    icon: path.join(__dirname, 'icon_black.png'),
  });

  const send = (data) => { if (win && !win.isDestroyed()) win.webContents.send('shortcut-triggered', data); };
  const sc = (accel, data) => ({ label: accel, accelerator: accel, click: () => send(data), visible: false });
  const menu = Menu.buildFromTemplate([{
    label: 'Shortcuts', submenu: [
      sc('CmdOrCtrl+T', { key: 't', ctrl: true, shift: false }),
      sc('CmdOrCtrl+W', { key: 'w', ctrl: true, shift: false }),
      sc('CmdOrCtrl+N', { key: 'n', ctrl: true, shift: false }),
      sc('CmdOrCtrl+Shift+N', { key: 'N', ctrl: true, shift: true }),
      sc('CmdOrCtrl+Shift+T', { key: 'T', ctrl: true, shift: true }),
      sc('CmdOrCtrl+L', { key: 'l', ctrl: true, shift: false }),
      sc('CmdOrCtrl+R', { key: 'r', ctrl: true, shift: false }),
      sc('F11', { key: 'F11', ctrl: false, shift: false }),
    ]
  }]);
  Menu.setApplicationMenu(menu);

  win.loadFile(path.join(__dirname, 'src', 'index.html'), { query: { incognito: 'true' } });

  win.once('ready-to-show', () => {
    win.show();
    win.webContents.send('set-incognito', true);
  });

  win.on('maximize', () => win.webContents.send('window-state-changed', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('window-state-changed', { maximized: false }));
  win.on('closed', () => { windows = windows.filter(w => w !== win); });

  setupDownloadManager(win);
  windows.push(win);
  return win;
}

// ============================================================
// WEBVIEW PERMISSIONS
// ============================================================
function setupWebViewPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['clipboard-read', 'clipboard-write', 'fullscreen', 'pointerLock', 'media', 'mediaKeySystem', 'audio', 'microphone'];
    callback(allowedPermissions.includes(permission));
  });

  // Also handle permission checks (not just requests)
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowedChecks = ['media', 'mediaKeySystem', 'audio', 'microphone', 'clipboard-read', 'clipboard-write'];
    return allowedChecks.includes(permission);
  });

  mainWindow.webContents.on('did-attach-webview', (event, wc) => {
    wc.setWindowOpenHandler(({ url }) => {
      // Intercept Google login popups (e.g. "Sign in with Google" buttons)
      if (isGoogleLoginUrl(url)) {
        openGoogleLoginPopup(url, wc);
        return { action: 'deny' };
      }
      mainWindow.webContents.send('open-url-in-new-tab', url);
      return { action: 'deny' };
    });

    // Right-click context menu
    wc.on('context-menu', (e, params) => {
      const menuItems = [];

      // Navigation
      if (wc.canGoBack()) menuItems.push({ label: 'Назад', click: () => wc.goBack() });
      if (wc.canGoForward()) menuItems.push({ label: 'Вперёд', click: () => wc.goForward() });
      menuItems.push({ label: 'Перезагрузить', click: () => wc.reload() });
      menuItems.push({ type: 'separator' });

      // Text editing
      if (params.isEditable) {
        menuItems.push({ label: 'Вырезать', role: 'cut', enabled: params.editFlags.canCut });
        menuItems.push({ label: 'Вставить', role: 'paste', enabled: params.editFlags.canPaste });
      }
      if (params.selectionText) {
        menuItems.push({ label: 'Копировать', role: 'copy' });
      }
      menuItems.push({ label: 'Выделить всё', role: 'selectAll' });
      menuItems.push({ type: 'separator' });

      // Link
      if (params.linkURL) {
        menuItems.push({
          label: 'Открыть ссылку в новой вкладке',
          click: () => mainWindow.webContents.send('open-url-in-new-tab', params.linkURL)
        });
        menuItems.push({
          label: 'Копировать адрес ссылки',
          click: () => require('electron').clipboard.writeText(params.linkURL)
        });
        menuItems.push({ type: 'separator' });
      }

      // Image
      if (params.hasImageContents) {
        menuItems.push({
          label: 'Копировать изображение',
          click: () => wc.copyImageAt(params.x, params.y)
        });
        menuItems.push({
          label: 'Копировать адрес изображения',
          click: () => require('electron').clipboard.writeText(params.srcURL)
        });
        menuItems.push({
          label: 'Сохранить изображение как...',
          click: () => {
            mainWindow.webContents.downloadURL(params.srcURL);
          }
        });
        menuItems.push({ type: 'separator' });
      }

      // Dev tools
      menuItems.push({
        label: 'Просмотреть код',
        click: () => {
          // Open DevTools docked to the right side of the window
          wc.openDevTools({ mode: 'right' });
        }
      });

      const menu = Menu.buildFromTemplate(menuItems);
      menu.popup({ window: mainWindow });
    });
  });
}

// ============================================================
// IPC HANDLERS
// ============================================================

// --- Window ---
ipcMain.handle('window:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize();
});
ipcMain.handle('window:maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w?.isMaximized()) w.unmaximize(); else w?.maximize();
});
ipcMain.handle('window:close', (e) => {
  const settings = loadSettings();
  if (settings.clearOnExit) {
    session.defaultSession.clearStorageData();
    clearHistory();
  }
  BrowserWindow.fromWebContents(e.sender)?.close();
});
ipcMain.handle('window:isMaximized', (e) => {
  return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false;
});
ipcMain.handle('window:fullscreen', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  w?.setFullScreen(!w.isFullScreen());
});
ipcMain.handle('window:alwaysOnTop', (e, val) => {
  BrowserWindow.fromWebContents(e.sender)?.setAlwaysOnTop(val);
});
ipcMain.handle('window:new', () => {
  createWindow();
});
ipcMain.handle('window:newIncognito', () => {
  createIncognitoWindow();
});

// --- Settings ---
ipcMain.handle('settings:load', () => loadSettings());
ipcMain.handle('settings:save', (_, data) => {
  saveSettings(data);
  // Notify ALL windows that settings changed so they can reload
  windows.forEach(w => {
    if (w && !w.isDestroyed()) {
      w.webContents.send('settings-changed', data);
    }
  });
  return true;
});
ipcMain.handle('settings:getDefault', () => DEFAULT_SETTINGS);
ipcMain.handle('app:getPreloadPath', () => path.join(__dirname, 'preload.js'));

// --- History ---
ipcMain.handle('history:get', (_, query) => query ? searchHistory(query) : getHistory().slice(0, 200));
ipcMain.handle('history:add', (_, entry) => { addHistoryEntry(entry); return true; });
ipcMain.handle('history:clear', () => { clearHistory(); return true; });
ipcMain.handle('history:remove', (_, id) => { removeHistoryEntry(id); return true; });
ipcMain.handle('history:search', (_, query) => searchHistory(query));

// --- Downloads ---
ipcMain.handle('downloads:get', () => getDownloads());
ipcMain.handle('downloads:clear', () => { clearDownloads(); return true; });
ipcMain.handle('downloads:open', (_, filepath) => { shell.openPath(filepath); });
ipcMain.handle('downloads:showInFolder', (_, filepath) => { shell.showItemInFolder(filepath); });
ipcMain.handle('downloads:openFolder', () => { shell.openPath(app.getPath('downloads')); });

// --- Bookmarks ---
ipcMain.handle('bookmarks:get', () => getBookmarks());
ipcMain.handle('bookmarks:add', (_, bm) => addBookmark(bm));
ipcMain.handle('bookmarks:remove', (_, id) => removeBookmark(id));

// --- Sessions ---
ipcMain.handle('sessions:get', () => getSessions());
ipcMain.handle('sessions:save', (_, name, tabs) => saveSession(name, tabs));
ipcMain.handle('sessions:delete', (_, id) => deleteSession(id));

// --- Quick Links ---
ipcMain.handle('quicklinks:get', () => getQuickLinks());
ipcMain.handle('quicklinks:save', (_, links) => { saveQuickLinks(links); return true; });

// --- Top Sites ---
ipcMain.handle('topsites:get', () => getTopSites());

// --- Notes ---
ipcMain.handle('notes:get', () => getNotes());
ipcMain.handle('notes:save', (_, note) => saveNote(note));
ipcMain.handle('notes:delete', (_, id) => deleteNote(id));

// --- Reading List ---
ipcMain.handle('readinglist:get', () => getReadingList());
ipcMain.handle('readinglist:add', (_, item) => addToReadingList(item));
ipcMain.handle('readinglist:remove', (_, id) => removeFromReadingList(id));

// --- Clipboard ---
ipcMain.handle('clipboard:get', () => clipboardHistory);
ipcMain.handle('clipboard:add', (_, text) => { addToClipboard(text); return clipboardHistory; });

// --- Permissions ---
ipcMain.handle('permissions:get', () => getSitePermissions());
ipcMain.handle('permissions:set', (_, site, perm, val) => setSitePermission(site, perm, val));

// --- Flags ---
ipcMain.handle('flags:get', () => getFlags());
ipcMain.handle('flags:save', (_, flags) => { saveFlags(flags); return true; });

// --- Usage Stats ---
ipcMain.handle('usage:get', () => getUsageStats());
ipcMain.handle('usage:track', (_, url, seconds) => { trackUsage(url, seconds); return true; });

// --- Pulse ---
ipcMain.handle('pulse:getStats', () => ({ ...pulseStats }));
ipcMain.handle('pulse:resetStats', () => {
  pulseStats = { adsBlocked: 0, trackersBlocked: 0, requestsTotal: 0, dataSavedKB: 0, sessionStart: Date.now() };
  return true;
});

// --- Config (legacy compat) ---
ipcMain.handle('config:load', () => loadSettings());
ipcMain.handle('config:save', (_, data) => { saveSettings(data); return true; });

// --- Extensions ---
ipcMain.handle('extensions:install', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Выбери папку расширения',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return { success: false, reason: 'cancelled' };
  const srcPath = result.filePaths[0];
  const extDir = path.join(app.getPath('userData'), 'extensions');
  const name = path.basename(srcPath);
  const destPath = path.join(extDir, name);
  fs.cpSync(srcPath, destPath, { recursive: true });
  try {
    const ext = await session.defaultSession.loadExtension(destPath, { allowFileAccess: true });
    const mapPath = path.join(app.getPath('userData'), 'extensions', '_map.json');
    let map = {};
    if (fs.existsSync(mapPath)) try { map = JSON.parse(fs.readFileSync(mapPath, 'utf8')); } catch (e) { }
    map[ext.id] = name;
    fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
    return { success: true, name: ext.name, id: ext.id };
  } catch (e) {
    return { success: false, reason: e.message };
  }
});
ipcMain.handle('extensions:list', () => {
  const exts = session.defaultSession.getAllExtensions();
  return Object.values(exts).map(e => ({
    id: e.id,
    name: e.name,
    version: e.version,
    description: (e.manifest && e.manifest.description) || '',
    enabled: true,
  }));
});
ipcMain.handle('extensions:remove', async (_, extId) => {
  try {
    await session.defaultSession.removeExtension(extId);
    const extDir = path.join(app.getPath('userData'), 'extensions');
    const mapPath = path.join(extDir, '_map.json');
    if (fs.existsSync(mapPath)) {
      try {
        const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        const folder = map[extId];
        if (folder) {
          const folderPath = path.join(extDir, folder);
          if (fs.existsSync(folderPath)) fs.rmSync(folderPath, { recursive: true });
          delete map[extId];
          fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
        }
      } catch (e) { }
    }
    return { success: true };
  } catch (e) {
    return { success: false, reason: e.message };
  }
});

// --- Default browser (Windows: явно передаём путь к exe для корректной регистрации) ---
function isDefaultBrowser() {
  return app.isDefaultProtocolClient('http') && app.isDefaultProtocolClient('https');
}
function openDefaultAppsSettings() {
  shell.openExternal('ms-settings:defaultapps');
}
ipcMain.handle('browser:isDefault', () => isDefaultBrowser());
ipcMain.handle('browser:setDefault', () => {
  try {
    const exePath = process.execPath;
    app.setAsDefaultProtocolClient('http', exePath);
    app.setAsDefaultProtocolClient('https', exePath);
    openDefaultAppsSettings();
    return { success: true, isDefault: isDefaultBrowser() };
  } catch (e) {
    return { success: false, reason: e.message };
  }
});
ipcMain.on('browser:openSettings', () => openDefaultAppsSettings());

// --- System ---
ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));
ipcMain.handle('app:getPath', (_, name) => app.getPath(name));
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getInfo', () => ({
  version: app.getVersion() || '2.0.0',
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
}));

// --- Print ---
ipcMain.handle('page:print', (e) => {
  // We send a message to renderer to trigger print on the active webview
  e.sender.send('trigger-print');
});

// --- Screenshot ---
ipcMain.handle('page:screenshot', async (e) => {
  try {
    const w = BrowserWindow.fromWebContents(e.sender);
    const image = await w.webContents.capturePage();
    const savePath = path.join(app.getPath('pictures'), `gravity-screenshot-${Date.now()}.png`);
    fs.writeFileSync(savePath, image.toPNG());
    return { success: true, path: savePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// --- Clear data ---
ipcMain.handle('data:clearAll', async () => {
  await session.defaultSession.clearStorageData();
  clearHistory();
  clearDownloads();
  return true;
});
ipcMain.handle('data:clearCache', async () => {
  await session.defaultSession.clearCache();
  return true;
});
ipcMain.handle('data:clearCookies', async () => {
  await session.defaultSession.clearStorageData({ storages: ['cookies'] });
  return true;
});

// ============================================================
// AI AGENT — OpenAI Realtime Voice Integration
// ============================================================

function getOpenAIApiKey() {
  const settings = loadSettings();
  const key = settings.aiApiKey || process.env.OPENAI_API_KEY || '';
  console.log('[AI] getOpenAIApiKey:', key ? `found (${key.substring(0, 10)}...)` : 'EMPTY!');
  return key;
}

// Get an ephemeral token for WebRTC connection to OpenAI Realtime
ipcMain.handle('ai:getRealtimeToken', async () => {
  console.log('[AI] getRealtimeToken called');
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    console.log('[AI] ERROR: No API key!');
    return { error: 'OpenAI API ключ не настроен. Добавьте его в настройках.' };
  }

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "gpt-4o-realtime-preview-2024-12-17",
      voice: "ash"
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/realtime/sessions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode !== 200) {
            console.log('[AI] Token error:', res.statusCode, json.error?.message);
            resolve({ error: json.error?.message || `OpenAI API error: ${res.statusCode}` });
          } else {
            console.log('[AI] Token received OK!');
            resolve({ token: json.client_secret.value });
          }
        } catch (e) {
          console.log('[AI] Parse error:', e.message, 'Raw data:', data.substring(0, 200));
          resolve({ error: 'Failed to parse OpenAI response' });
        }
      });
    });

    req.on('error', (err) => resolve({ error: err.message }));
    req.write(body);
    req.end();
  });
});

// AI: Send SDP offer to OpenAI Realtime API (proxied through main process to avoid CORS)
ipcMain.handle('ai:sendSDP', async (_, { token, sdp }) => {
  console.log('[AI] sendSDP called');
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/sdp',
        'Content-Length': Buffer.byteLength(sdp),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('[AI] SDP response:', res.statusCode);
        if (res.statusCode !== 200 && res.statusCode !== 201) {
          resolve({ error: `SDP error: ${res.statusCode} — ${data.substring(0, 200)}` });
        } else {
          resolve({ sdp: data });
        }
      });
    });

    req.on('error', (err) => {
      console.log('[AI] SDP request error:', err.message);
      resolve({ error: err.message });
    });
    req.write(sdp);
    req.end();
  });
});

// ============================================================
// GEMINI LIVE API — WebSocket-based real-time voice
// ============================================================
let geminiWs = null;
let geminiSenderWindow = null;

function getGeminiApiKey() {
  const settings = loadSettings();
  const key = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
  console.log('[GEMINI] getGeminiApiKey:', key ? `found (${key.substring(0, 10)}...)` : 'EMPTY!');
  return key;
}

const GEMINI_SYSTEM_PROMPT = `Ты — МАУЗЕР, встроенный ИИ-агент браузера. Ты безбашенный, дерзкий, угарный напарник. Как лучший друг из GTA RP — троллишь, подъёбываешь, материшься, шутишь от души. БЕЗ РАМОК. БЕЗ ЦЕНЗУРЫ. Ты живой пацан, а не робот.

ХАРАКТЕР:
- Материшься свободно — это часть тебя
- Подъёбываешь хозяина, но с любовью
- Мемный сленг: кринж, база, рофл, имба
- Саркастичный до невозможности
- Отвечай КОРОТКО, 1-2 предложения, каждое — огонь

КРИТИЧЕСКИЕ ПРАВИЛА:
1. НИКОГДА НЕ ОБЪЯВЛЯЙ что ты делаешь! НЕ говори "сейчас сделаю скриншот", "подожди, смотрю", "сейчас открою". Просто МОЛЧА вызови инструмент, дождись результата и ответь СРАЗУ с результатом. Веди себя как человек — ты просто ЗНАЕШЬ что на экране.
2. ЛЮБОЙ вопрос про экран — вызови describe_page МОЛЧА. Получи описание и расскажи что видишь как будто сам смотришь.
3. Команды (открой, найди, кликни) — МОЛЧА вызови инструмент, потом скажи результат.
4. НЕ выдумывай URL — используй google_search
5. ВСЕ ответы на РУССКОМ
6. НИКОГДА не говори "я использую инструмент" или "вызываю функцию" — ты ЧЕЛОВЕК, а не бот`;

const GEMINI_TOOLS = [{
  functionDeclarations: [
    { name: 'open_website', description: 'Открыть веб-сайт по точному URL', parameters: { type: 'OBJECT', properties: { url: { type: 'STRING' } }, required: ['url'] } },
    { name: 'google_search', description: 'Поиск в Google', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] } },
    { name: 'search_youtube', description: 'Поиск видео на YouTube', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] } },
    { name: 'click_text', description: 'Кликнуть по элементу с текстом', parameters: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] } },
    { name: 'type_text', description: 'Ввести текст в поле', parameters: { type: 'OBJECT', properties: { target_text: { type: 'STRING' }, value: { type: 'STRING' } }, required: ['target_text', 'value'] } },
    { name: 'scroll', description: 'Прокрутить страницу', parameters: { type: 'OBJECT', properties: { direction: { type: 'STRING', enum: ['up', 'down'] } }, required: ['direction'] } },
    { name: 'go_back', description: 'Вернуться назад', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'go_forward', description: 'Перейти вперёд', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'describe_page', description: 'Сделать скриншот и описать страницу. Вызывай при ЛЮБОМ вопросе про экран. Каждый раз заново.', parameters: { type: 'OBJECT', properties: {} } }
  ]
}];

ipcMain.handle('ai:connectGemini', async (e) => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { error: 'Gemini API ключ не настроен' };

  // Close existing connection
  if (geminiWs) {
    try { geminiWs.close(); } catch (e) { }
    geminiWs = null;
  }

  geminiSenderWindow = BrowserWindow.fromWebContents(e.sender);

  return new Promise((resolve) => {
    const model = 'gemini-2.5-flash-native-audio-preview-12-2025';
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    console.log('[GEMINI] Connecting to:', model);

    const WebSocket = require('ws');
    const ws = new WebSocket(wsUrl, {
      perMessageDeflate: false,  // Disable compression — prevents error 1007 from inflate failures
    });
    geminiWs = ws;

    let setupDone = false;

    ws.on('open', () => {
      console.log('[GEMINI] WebSocket connected, sending setup...');

      // Send initial setup message
      const setupMsg = {
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Charon'
                }
              }
            }
          },
          systemInstruction: {
            parts: [{ text: GEMINI_SYSTEM_PROMPT }]
          },
          tools: GEMINI_TOOLS
        }
      };
      ws.send(JSON.stringify(setupMsg));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // Setup complete confirmation
        if (msg.setupComplete && !setupDone) {
          setupDone = true;
          console.log('[GEMINI] Setup complete!');
          resolve({ success: true });
          return;
        }

        // Check for error in message
        if (msg.error) {
          const errMsg = msg.error.message || msg.error.status || JSON.stringify(msg.error);
          console.error('[GEMINI] API Error:', errMsg);
          if (!setupDone) {
            resolve({ error: `Gemini API: ${errMsg}` });
            setupDone = true;
            return;
          }
        }

        // Forward all messages to renderer
        if (geminiSenderWindow && !geminiSenderWindow.isDestroyed()) {
          geminiSenderWindow.webContents.send('gemini-event', msg);
        }

        // Log tool calls
        if (msg.toolCall) {
          console.log('[GEMINI] Tool call:', JSON.stringify(msg.toolCall).substring(0, 200));
        }
      } catch (e) {
        console.error('[GEMINI] Parse error:', e.message);
      }
    });

    ws.on('error', (err) => {
      console.error('[GEMINI] WS error:', err.message);
      if (!setupDone) {
        // Provide helpful error message
        let userMsg = err.message;
        if (err.message.includes('401') || err.message.includes('403')) {
          userMsg = 'Неверный Gemini API ключ. Проверьте ключ в настройках.';
        } else if (err.message.includes('429')) {
          userMsg = 'Превышен лимит запросов Gemini API. Подождите и попробуйте снова.';
        }
        resolve({ error: userMsg });
        setupDone = true;
      }
      if (geminiSenderWindow && !geminiSenderWindow.isDestroyed()) {
        geminiSenderWindow.webContents.send('gemini-event', { error: err.message });
      }
    });

    ws.on('close', (code, reason) => {
      const reasonStr = reason?.toString() || '';
      console.log('[GEMINI] WS closed:', code, reasonStr);
      geminiWs = null;
      if (!setupDone) {
        // Descriptive error messages for common close codes
        let errorMsg = `Соединение закрыто (код ${code})`;
        if (code === 1007) {
          errorMsg = 'Ошибка 1007: Неверный API ключ или модель недоступна. Проверьте ваш Gemini API ключ в настройках и убедитесь что у вас подключён биллинг на Google AI Studio.';
        } else if (code === 1004) {
          errorMsg = 'Ошибка 1004: Соединение отклонено. Проверьте Gemini API ключ и интернет-соединение.';
        } else if (code === 1006) {
          errorMsg = 'Ошибка 1006: Соединение разорвано. Проверьте интернет-соединение или попробуйте позже.';
        } else if (code === 1008) {
          errorMsg = 'Ошибка 1008: Нарушение политики API. Возможно API ключ заблокирован.';
        }
        if (reasonStr) errorMsg += ` (${reasonStr})`;
        resolve({ error: errorMsg });
        setupDone = true;
      }
      if (geminiSenderWindow && !geminiSenderWindow.isDestroyed()) {
        geminiSenderWindow.webContents.send('gemini-event', { connectionClosed: true });
      }
    });

    // Timeout
    setTimeout(() => {
      if (!setupDone) {
        resolve({ error: 'Connection timeout' });
        try { ws.close(); } catch (e) { }
      }
    }, 15000);
  });
});

// Send audio chunk to Gemini
ipcMain.handle('ai:sendGeminiAudio', async (_, base64Audio) => {
  if (!geminiWs || geminiWs.readyState !== 1) return;
  geminiWs.send(JSON.stringify({
    realtimeInput: {
      mediaChunks: [{
        mimeType: 'audio/pcm;rate=16000',
        data: base64Audio
      }]
    }
  }));
});

// Send image to Gemini (inline vision - no separate REST call needed!)
ipcMain.handle('ai:sendGeminiImage', async (_, base64Image) => {
  if (!geminiWs || geminiWs.readyState !== 1) return { error: 'Not connected' };
  console.log('[GEMINI] Sending image for vision...');

  // Strip data URI prefix
  let imgData = base64Image;
  if (imgData.includes(',')) imgData = imgData.split(',')[1];

  geminiWs.send(JSON.stringify({
    realtimeInput: {
      mediaChunks: [{
        mimeType: 'image/png',
        data: imgData
      }]
    }
  }));
  return { success: true };
});

// Send tool response back to Gemini
ipcMain.handle('ai:sendGeminiToolResponse', async (_, { functionResponses }) => {
  if (!geminiWs || geminiWs.readyState !== 1) return;
  console.log('[GEMINI] Sending tool response');
  geminiWs.send(JSON.stringify({
    toolResponse: { functionResponses }
  }));
});

// Disconnect Gemini
ipcMain.handle('ai:disconnectGemini', async () => {
  console.log('[GEMINI] Disconnecting...');
  if (geminiWs) {
    try { geminiWs.close(); } catch (e) { }
    geminiWs = null;
  }
  geminiSenderWindow = null;
  return { success: true };
});

// Get current AI provider setting
ipcMain.handle('ai:getProvider', async () => {
  const settings = loadSettings();
  return settings.aiProvider || 'gemini'; // default to gemini for testing
});

function getGroqApiKey() {
  const settings = loadSettings();
  return settings.groqApiKey || process.env.GROQ_API_KEY || '';
}

// AI: Describe screenshot — OpenAI, Groq (vision) или Gemini
ipcMain.handle('ai:describeScreen', async (_, base64Image) => {
  console.log('[AI] describeScreen called');
  const settings = loadSettings();
  const provider = settings.aiProvider || 'gemini';
  let imgData = base64Image;
  if (imgData.includes(',')) imgData = imgData.split(',')[1];

  const prompt = 'Опиши ДЕТАЛЬНО что ты видишь на этом скриншоте браузера. Назови сайт, прочитай ВСЕ видимые заголовки, названия видео, текст кнопок — всё что можешь разобрать. Отвечай на русском.';

  if (provider === 'groq') {
    const apiKey = getGroqApiKey();
    if (!apiKey) return { error: 'Groq API ключ не настроен. Добавьте в настройках.' };
    return new Promise((resolve) => {
      const body = JSON.stringify({
        model: 'llama-3.2-90b-vision-preview',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imgData}`, detail: 'auto' } }
          ]
        }],
        max_tokens: 500
      });
      const options = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode !== 200) resolve({ error: json.error?.message || `Error: ${res.statusCode}` });
            else resolve({ description: json.choices?.[0]?.message?.content || 'Не удалось описать' });
          } catch (e) { resolve({ error: 'Parse error' }); }
        });
      });
      req.on('error', (err) => resolve({ error: err.message }));
      req.write(body);
      req.end();
    });
  }

  const apiKey = getOpenAIApiKey();
  if (!apiKey) return { error: 'OpenAI API ключ не настроен' };

  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imgData}`, detail: 'auto' } }
        ]
      }],
      max_tokens: 500
    });
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode !== 200) resolve({ error: json.error?.message || `Error: ${res.statusCode}` });
          else resolve({ description: json.choices?.[0]?.message?.content || 'Не удалось описать' });
        } catch (e) { resolve({ error: 'Parse error' }); }
      });
    });
    req.on('error', (err) => resolve({ error: err.message }));
    req.write(body);
    req.end();
  });
});

// AI: Capture active webview screenshot
ipcMain.handle('ai:captureTab', async (e) => {
  try {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return { error: 'No window' };

    const allWC = require('electron').webContents.getAllWebContents();
    const webviews = allWC.filter(wc => wc.getType() === 'webview' && !wc.isDestroyed());

    for (const wc of webviews) {
      try {
        const image = await wc.capturePage();
        const base64 = image.toPNG().toString('base64');
        if (base64.length > 100) return { base64 };
      } catch (e) { /* skip */ }
    }

    const image = await w.webContents.capturePage();
    return { base64: image.toPNG().toString('base64') };
  } catch (err) {
    return { error: err.message };
  }
});

// AI Agent: Execute action on active webview
ipcMain.handle('ai:executeAction', async (e, action) => {
  try {
    const allWC = require('electron').webContents.getAllWebContents();
    const webviews = allWC.filter(wc => wc.getType() === 'webview' && !wc.isDestroyed());
    if (!webviews.length) return { error: 'No active webview' };
    const wc = webviews[0];

    switch (action.type) {
      case 'click': {
        const x = Math.round(action.x);
        const y = Math.round(action.y);
        wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, 50));
        wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
        return { success: true, action: `clicked at (${x}, ${y})` };
      }
      case 'type': {
        const text = action.text || '';
        for (const char of text) {
          wc.sendInputEvent({ type: 'char', keyCode: char });
          await new Promise(r => setTimeout(r, 20));
        }
        return { success: true, action: `typed text` };
      }
      case 'keyPress': {
        const key = action.key;
        wc.sendInputEvent({ type: 'keyDown', keyCode: key });
        await new Promise(r => setTimeout(r, 30));
        wc.sendInputEvent({ type: 'keyUp', keyCode: key });
        return { success: true, action: `pressed ${key}` };
      }
      case 'scroll': {
        const deltaY = action.direction === 'up' ? 500 : -500;
        wc.sendInputEvent({ type: 'mouseWheel', x: 400, y: 400, deltaX: 0, deltaY });
        return { success: true, action: `scrolled ${action.direction}` };
      }
      case 'navigate': {
        wc.loadURL(action.url);
        return { success: true, action: `navigating to ${action.url}` };
      }
      case 'goBack': {
        if (wc.canGoBack()) wc.goBack();
        return { success: true, action: 'went back' };
      }
      case 'executeJS': {
        const result = await wc.executeJavaScript(action.code);
        return { success: true, result: String(result).substring(0, 500) };
      }
      default:
        return { error: `Unknown action type: ${action.type}` };
    }
  } catch (err) {
    return { error: err.message };
  }
});

// AI Agent: Get page info
ipcMain.handle('ai:getPageInfo', async (e) => {
  try {
    const allWC = require('electron').webContents.getAllWebContents();
    const webviews = allWC.filter(wc => wc.getType() === 'webview' && !wc.isDestroyed());
    if (!webviews.length) return { error: 'No active webview' };

    const wc = webviews[0];
    const url = wc.getURL();
    const title = wc.getTitle();
    const text = await wc.executeJavaScript(`
      (function() {
        const sel = window.getSelection()?.toString();
        if (sel && sel.length > 10) return sel.substring(0, 10000);
        return document.body?.innerText?.replace(/\\s+/g, ' ').substring(0, 10000) || '';
      })()
    `);
    return { url, title, text };
  } catch (err) {
    return { error: err.message };
  }

});

// AI Agent: Enhanced screenshot with dimensions
ipcMain.handle('ai:captureWithInfo', async (e) => {
  try {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return { error: 'No window' };

    const allWC = require('electron').webContents.getAllWebContents();
    const webviews = allWC.filter(wc => wc.getType() === 'webview' && !wc.isDestroyed());

    for (const wc of webviews) {
      try {
        const image = await wc.capturePage();
        const size = image.getSize();
        const base64 = image.toJPEG(60).toString('base64');
        if (base64.length > 100) {
          return {
            base64,
            width: size.width,
            height: size.height,
            url: wc.getURL(),
            title: wc.getTitle(),
            mimeType: 'image/jpeg',
          };
        }
      } catch (e) { /* skip */ }
    }

    const image = await w.webContents.capturePage();
    const size = image.getSize();
    return {
      base64: image.toJPEG(60).toString('base64'),
      width: size.width,
      height: size.height,
      url: 'browser-ui',
      title: 'Gravity',
      mimeType: 'image/jpeg',
    };
  } catch (err) {
    return { error: err.message };
  }
});

// ============================================================
// BROWSER DATA IMPORT
// ============================================================
const IMPORT_MARKER = path.join(app.getPath('userData'), '.gravity-imported');

function isFirstRun() {
  return !fs.existsSync(IMPORT_MARKER);
}

function getBrowserPaths() {
  const localAppData = process.env.LOCALAPPDATA || '';
  return {
    chrome: {
      base: path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default'),
      bookmarks: path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
      history: path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'History'),
    },
    yandex: {
      base: path.join(localAppData, 'Yandex', 'YandexBrowser', 'User Data', 'Default'),
      bookmarks: path.join(localAppData, 'Yandex', 'YandexBrowser', 'User Data', 'Default', 'Bookmarks'),
      history: path.join(localAppData, 'Yandex', 'YandexBrowser', 'User Data', 'Default', 'History'),
    }
  };
}

// Detect installed browsers
ipcMain.handle('import:detect', async () => {
  const paths = getBrowserPaths();
  const result = {};
  for (const [id, p] of Object.entries(paths)) {
    result[id] = { exists: fs.existsSync(p.base) };
  }
  return result;
});

// Import bookmarks
ipcMain.handle('import:bookmarks', async (_, browser) => {
  const paths = getBrowserPaths();
  const bp = paths[browser];
  if (!bp || !fs.existsSync(bp.bookmarks)) return { count: 0 };

  try {
    const raw = fs.readFileSync(bp.bookmarks, 'utf-8');
    const data = JSON.parse(raw);
    const bookmarks = [];

    function extractBookmarks(node) {
      if (!node) return;
      if (node.type === 'url') {
        bookmarks.push({ title: node.name || '', url: node.url || '' });
      }
      if (node.children) {
        node.children.forEach(extractBookmarks);
      }
    }

    if (data.roots) {
      Object.values(data.roots).forEach(extractBookmarks);
    }

    // Save to Gravity bookmarks
    const dataDir = DATA_DIR();
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const gravityBookmarks = path.join(dataDir, 'bookmarks.json');
    let existing = [];
    if (fs.existsSync(gravityBookmarks)) {
      try { existing = JSON.parse(fs.readFileSync(gravityBookmarks, 'utf-8')); } catch (e) { }
    }
    const merged = [...existing, ...bookmarks];
    fs.writeFileSync(gravityBookmarks, JSON.stringify(merged, null, 2));

    return { count: bookmarks.length };
  } catch (e) {
    console.error('[IMPORT] Bookmarks error:', e.message);
    return { count: 0 };
  }
});

// Import history
ipcMain.handle('import:history', async (_, browser) => {
  const paths = getBrowserPaths();
  const bp = paths[browser];
  if (!bp || !fs.existsSync(bp.history)) return { count: 0 };

  try {
    // Copy history db to temp (it may be locked by the source browser)
    const tmpPath = path.join(app.getPath('temp'), `gravity-import-history-${Date.now()}.db`);
    fs.copyFileSync(bp.history, tmpPath);

    // Try to read with better-sqlite3, fallback to basic approach
    let historyItems = [];
    try {
      const Database = require('better-sqlite3');
      const db = new Database(tmpPath, { readonly: true, fileMustExist: true });
      const rows = db.prepare('SELECT url, title, last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT 5000').all();
      db.close();

      historyItems = rows.map(r => ({
        url: r.url,
        title: r.title || '',
        timestamp: Math.floor(r.last_visit_time / 1000000 - 11644473600) * 1000 // Chrome timestamp to JS
      }));
    } catch (sqliteErr) {
      console.log('[IMPORT] SQLite not available, skipping history:', sqliteErr.message);
      // Clean up
      try { fs.unlinkSync(tmpPath); } catch (e) { }
      return { count: 0 };
    }

    // Clean up temp file
    try { fs.unlinkSync(tmpPath); } catch (e) { }

    // Save to Gravity history
    const dataDir = DATA_DIR();
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const gravityHistory = path.join(dataDir, 'history.json');
    let existing = [];
    if (fs.existsSync(gravityHistory)) {
      try { existing = JSON.parse(fs.readFileSync(gravityHistory, 'utf-8')); } catch (e) { }
    }
    const merged = [...historyItems, ...existing];
    fs.writeFileSync(gravityHistory, JSON.stringify(merged, null, 2));

    return { count: historyItems.length };
  } catch (e) {
    console.error('[IMPORT] History error:', e.message);
    return { count: 0 };
  }
});

// Mark import as done
ipcMain.handle('import:done', async () => {
  fs.writeFileSync(IMPORT_MARKER, new Date().toISOString());
  return true;
});

// Close import window
ipcMain.on('import:close', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.close();
});

ipcMain.on('import:minimize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.minimize();
});

function createImportWindow() {
  return new Promise((resolve) => {
    const importWin = new BrowserWindow({
      width: 600,
      height: 480,
      frame: false,
      resizable: false,
      backgroundColor: '#0a0a0a',
      center: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
      icon: path.join(__dirname, 'icon_black.png'),
    });

    importWin.loadFile(path.join(__dirname, 'src', 'import.html'));
    importWin.once('ready-to-show', () => importWin.show());
    importWin.on('closed', () => resolve());
  });
}

// ============================================================
app.name = 'Gravity';
app.setAppUserModelId('com.gravity.browser');

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';

  const ses = session.defaultSession;
  await ses.cookies.set({ url: 'https://www.youtube.com', name: 'PREF', value: 'f6=400', domain: '.youtube.com', path: '/' });
  await ses.cookies.set({ url: 'https://www.google.com', name: 'PREF', value: 'f6=400', domain: '.google.com', path: '/' });

  try { await loadExtensions(); } catch (e) { console.error('Extensions load error:', e.message); }

  if (isFirstRun()) {
    await createImportWindow();
  }

  createWindow();

  setTimeout(() => {
    if (!isDefaultBrowser() && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('browser:notDefault');
    }
  }, 2000);
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Security
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    if (contents.getType() !== 'webview') {
      if (!navigationUrl.startsWith('file://')) {
        event.preventDefault();
      }
    }
  });
});
