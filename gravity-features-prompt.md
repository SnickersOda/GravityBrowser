# ПРОМПТ ДЛЯ АГЕНТА — GRAVITY BROWSER
## Задача: расширения + инкогнито + менеджер загрузок + автодополнение поиска

---

## КОНТЕКСТ ПРОЕКТА

Ты работаешь с браузером **Gravity Browser** — это десктопный браузер на **Electron + Chromium**, написанный на JavaScript. Репозиторий: https://github.com/SnickersOda/GravityBrowser

Структура проекта:
```
gravity-browser/
├── main.js          ← главный процесс Electron (точка входа)
├── preload.js       ← preload скрипт
├── src/             ← исходники UI (HTML/CSS/JS рендерера)
├── package.json
└── icon_backup.ico
```

Перед тем как что-то менять — **прочитай все файлы** проекта чтобы понять текущую структуру: как создаётся BrowserWindow, какие сессии используются, как устроен UI. Не угадывай — читай код.

---

## ДИЗАЙН-СИСТЕМА (ОБЯЗАТЕЛЬНО СОБЛЮДАТЬ)

Весь UI строго в стиле Gravity — тёмный минимализм:

```css
:root {
  --bg:       #080808;
  --bg2:      #0d0d0d;
  --bg3:      #141414;
  --card:     #101010;
  --border:   #1a1a1a;
  --border2:  #262626;
  --text:     #e8e8e8;
  --text-sub: #777;
  --text-dim: #333;
  --accent:   #ffffff;
}
```

**Правила:**
- Шрифт: Inter (уже используется в проекте)
- Все новые UI элементы должны визуально совпадать с существующим интерфейсом
- Никаких светлых фонов, синих акцентов, скруглений > 16px в панелях
- Иконки: SVG inline, stroke="currentColor", минимализм
- Анимации: `transition: all 0.2s ease` для hover, `cubic-bezier(0.34, 1.56, 0.64, 1)` для pop-эффектов
- Кнопки с белым фоном (#fff, color #000) — только для главных действий
- Все остальные кнопки: border 1px solid var(--border2), background transparent

---

## ЗАДАЧА 1: МЕНЕДЖЕР РАСШИРЕНИЙ

### Что нужно сделать

Добавить возможность устанавливать и управлять расширениями Chromium прямо в браузере.

### Реализация в main.js

```javascript
const { app, BrowserWindow, session, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

// Загрузка расширений при старте
async function loadExtensions() {
  const extDir = path.join(app.getPath('userData'), 'extensions')
  if (!fs.existsSync(extDir)) fs.mkdirSync(extDir, { recursive: true })

  const folders = fs.readdirSync(extDir)
  for (const folder of folders) {
    const extPath = path.join(extDir, folder)
    if (fs.statSync(extPath).isDirectory()) {
      try {
        await session.defaultSession.loadExtension(extPath, { allowFileAccess: true })
        console.log('Загружено расширение:', folder)
      } catch (e) {
        console.error('Ошибка загрузки расширения:', folder, e.message)
      }
    }
  }
}

// IPC: установить расширение из выбранной папки
ipcMain.handle('extensions:install', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Выбери папку расширения',
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths[0]) return { success: false, reason: 'cancelled' }

  const srcPath = result.filePaths[0]
  const extDir = path.join(app.getPath('userData'), 'extensions')
  const name = path.basename(srcPath)
  const destPath = path.join(extDir, name)

  // Копируем папку расширения
  fs.cpSync(srcPath, destPath, { recursive: true })

  try {
    const ext = await session.defaultSession.loadExtension(destPath, { allowFileAccess: true })
    return { success: true, name: ext.name, id: ext.id }
  } catch (e) {
    return { success: false, reason: e.message }
  }
})

// IPC: получить список расширений
ipcMain.handle('extensions:list', () => {
  const exts = session.defaultSession.getAllExtensions()
  return Object.values(exts).map(e => ({
    id: e.id,
    name: e.name,
    version: e.version,
    description: e.manifest?.description || '',
    enabled: true,
  }))
})

// IPC: удалить расширение
ipcMain.handle('extensions:remove', async (_, extId) => {
  try {
    await session.defaultSession.removeExtension(extId)
    // Удаляем папку
    const extDir = path.join(app.getPath('userData'), 'extensions')
    const exts = fs.readdirSync(extDir)
    // Найти папку по id (в manifest.json)
    for (const folder of exts) {
      const manifestPath = path.join(extDir, folder, 'manifest.json')
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        if (manifest.key === extId) {
          fs.rmSync(path.join(extDir, folder), { recursive: true })
          break
        }
      }
    }
    return { success: true }
  } catch (e) {
    return { success: false, reason: e.message }
  }
})
```

### UI страницы расширений (gravity://extensions)

Создай файл `src/extensions.html` — страница открывается как вкладка внутри браузера.

Дизайн страницы:
```
┌─────────────────────────────────────────────┐
│  Расширения                    [+ Добавить] │
│  ─────────────────────────────────────────  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  [иконка]  uBlock Origin      v1.59  │  │
│  │            Блокировщик рекламы       │  │
│  │                        [Удалить]     │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  [иконка]  Dark Reader         v4.9  │  │
│  │            Тёмная тема для сайтов    │  │
│  │                        [Удалить]     │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  Как установить расширение:                 │
│  1. Скачай расширение из Chrome Web Store   │
│  2. Распакуй .crx архив (переименуй в .zip) │
│  3. Нажми "+ Добавить" и выбери папку       │
└─────────────────────────────────────────────┘
```

CSS для карточки расширения:
```css
.ext-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: background 0.2s, border-color 0.2s;
}
.ext-card:hover {
  background: var(--bg3);
  border-color: var(--border2);
}
.ext-icon {
  width: 40px; height: 40px;
  border-radius: 8px;
  background: var(--bg3);
  border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; flex-shrink: 0;
}
.ext-info { flex: 1; }
.ext-name { font-size: 15px; font-weight: 600; color: var(--text); }
.ext-version { font-size: 11px; color: var(--text-dim); margin-left: 8px; }
.ext-desc { font-size: 13px; color: var(--text-sub); margin-top: 3px; }
.ext-remove {
  padding: 7px 14px;
  background: transparent;
  border: 1px solid var(--border2);
  border-radius: 7px;
  color: var(--text-sub);
  font-size: 12px; cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}
.ext-remove:hover { border-color: #c0392b; color: #e74c3c; }
```

Добавь кнопку "Расширения" в панель навигации браузера (рядом с другими кнопками).

---

## ЗАДАЧА 2: РЕЖИМ ИНКОГНИТО

### Что нужно сделать

Открытие нового окна в режиме инкогнито — отдельная сессия без истории, куки и кэша.

### Реализация в main.js

```javascript
const { app, BrowserWindow, session, ipcMain } = require('electron')

// Создание окна инкогнито
function createIncognitoWindow() {
  // Создаём отдельную сессию (in-memory, не сохраняет ничего)
  const incognitoSession = session.fromPartition('incognito:' + Date.now(), {
    cache: false
  })

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    // Скопируй параметры из существующего createWindow()
    // но добавь визуальный маркер инкогнито
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      session: incognitoSession,
      nodeIntegration: false,
      contextIsolation: true,
    }
  })

  // Загружаем тот же UI но с флагом инкогнито
  win.loadFile('src/index.html', {
    query: { incognito: 'true' }
  })

  return win
}

// IPC: открыть инкогнито окно
ipcMain.on('window:incognito', () => {
  createIncognitoWindow()
})
```

### UI изменения для инкогнито

В `src/index.html` / основном рендерере определяй режим и меняй стиль:

```javascript
// В renderer процессе
const isIncognito = new URLSearchParams(window.location.search).get('incognito') === 'true'

if (isIncognito) {
  document.body.classList.add('incognito-mode')
  document.title = 'Gravity — Инкогнито'
}
```

CSS для инкогнито режима:
```css
/* Тонкая фиолетовая полоска сверху — маркер инкогнито */
.incognito-mode::after {
  content: '';
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, #6c3483, #8e44ad, #6c3483);
  z-index: 9999;
}

/* Бейдж в адресной строке */
.incognito-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  background: rgba(142, 68, 173, 0.12);
  border: 1px solid rgba(142, 68, 173, 0.25);
  border-radius: 100px;
  font-size: 11px;
  color: #a569bd;
  letter-spacing: 0.06em;
}
/* SVG иконка маски для бейджа */
```

Добавь кнопку открытия инкогнито в интерфейс:
- В меню (правая кнопка мыши по вкладке или кнопка в navbar)
- Горячая клавиша: `Ctrl+Shift+N` (стандарт для всех браузеров)

```javascript
// В main.js — глобальный шорткат
const { globalShortcut } = require('electron')

app.whenReady().then(() => {
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    createIncognitoWindow()
  })
})
```

---

## ЗАДАЧА 3: МЕНЕДЖЕР ЗАГРУЗОК

### Что нужно сделать

Панель загрузок внизу браузера — файлы отображаются сразу при скачивании, клик открывает файл или папку.

### Реализация в main.js

```javascript
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')

// Перехватываем все загрузки
function setupDownloadManager(win) {
  win.webContents.session.on('will-download', (event, item, webContents) => {
    // Папка загрузок по умолчанию
    const downloadsDir = app.getPath('downloads')
    const fileName = item.getFilename()
    const savePath = path.join(downloadsDir, fileName)
    item.setSavePath(savePath)

    // Сообщаем рендереру о начале загрузки
    win.webContents.send('download:start', {
      id: item.getETag() || Date.now().toString(),
      fileName,
      savePath,
      totalBytes: item.getTotalBytes(),
      url: item.getURL(),
    })

    // Прогресс загрузки
    item.on('updated', (event, state) => {
      win.webContents.send('download:progress', {
        savePath,
        state,                              // 'progressing' | 'interrupted'
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        percent: item.getTotalBytes() > 0
          ? Math.round((item.getReceivedBytes() / item.getTotalBytes()) * 100)
          : 0,
      })
    })

    // Завершение загрузки
    item.once('done', (event, state) => {
      win.webContents.send('download:done', {
        savePath,
        state,   // 'completed' | 'cancelled' | 'interrupted'
        fileName,
      })
    })
  })
}

// IPC: открыть файл
ipcMain.on('download:open', (_, filePath) => {
  shell.openPath(filePath)
})

// IPC: показать файл в проводнике
ipcMain.on('download:show', (_, filePath) => {
  shell.showItemInFolder(filePath)
})

// IPC: открыть папку загрузок
ipcMain.on('download:openFolder', () => {
  shell.openPath(app.getPath('downloads'))
})
```

### UI панели загрузок

В рендерере создай панель внизу экрана. Она появляется когда есть активные или завершённые загрузки.

```
┌─────────────────────────────────────────────────────────────────┐
│  gravity.exe   ████████░░  80%        [Открыть]  [В папке]  [×] │
│  photo.jpg     ██████████  Готово  ↗  [Открыть]  [В папке]  [×] │
└─────────────────────────────────────────────────────────────────┘
```

CSS панели загрузок:
```css
.downloads-bar {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: var(--card);
  border-top: 1px solid var(--border);
  padding: 0;
  z-index: 1000;
  max-height: 160px;
  overflow-y: auto;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.34, 1.2, 0.64, 1);
}
.downloads-bar.visible {
  transform: translateY(0);
}
.download-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}
.download-item:last-child { border-bottom: none; }
.download-item:hover { background: var(--bg3); }

.download-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  min-width: 160px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* КЛИК — открывает файл */
  cursor: pointer;
}
.download-name:hover { color: #fff; text-decoration: underline; text-underline-offset: 3px; }

.download-progress {
  flex: 1;
  height: 3px;
  background: var(--border2);
  border-radius: 100px;
  overflow: hidden;
}
.download-progress-fill {
  height: 100%;
  background: #fff;
  border-radius: 100px;
  transition: width 0.3s ease;
}
.download-progress-fill.done {
  background: #4ade80;
}
.download-percent {
  font-size: 11px;
  color: var(--text-sub);
  min-width: 36px;
  text-align: right;
}
.download-status {
  font-size: 11px;
  color: var(--text-dim);
  min-width: 60px;
}
.download-status.done { color: #4ade80; }
.download-status.error { color: #e74c3c; }

.download-btn {
  padding: 5px 10px;
  background: transparent;
  border: 1px solid var(--border2);
  border-radius: 6px;
  color: var(--text-sub);
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: all 0.15s;
}
.download-btn:hover { border-color: #444; color: var(--text); }

.download-close {
  width: 22px; height: 22px;
  background: transparent; border: none;
  color: var(--text-dim); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; font-size: 14px;
  transition: all 0.15s; flex-shrink: 0;
}
.download-close:hover { background: var(--bg3); color: var(--text); }
```

JS логика в рендерере:
```javascript
// Слушаем события загрузок от main процесса
const { ipcRenderer } = require('electron') // или через preload contextBridge

const downloads = new Map() // id → данные загрузки

ipcRenderer.on('download:start', (_, data) => {
  downloads.set(data.savePath, { ...data, percent: 0, state: 'progressing' })
  renderDownloads()
  showDownloadsBar()
})

ipcRenderer.on('download:progress', (_, data) => {
  if (downloads.has(data.savePath)) {
    Object.assign(downloads.get(data.savePath), data)
    renderDownloads()
  }
})

ipcRenderer.on('download:done', (_, data) => {
  if (downloads.has(data.savePath)) {
    const dl = downloads.get(data.savePath)
    dl.state = data.state
    dl.percent = data.state === 'completed' ? 100 : dl.percent
    renderDownloads()
  }
})

function renderDownloads() {
  const bar = document.getElementById('downloads-bar')
  bar.innerHTML = [...downloads.values()].map(dl => `
    <div class="download-item">
      <span class="download-name" onclick="openFile('${dl.savePath}')" title="${dl.fileName}">
        ${dl.fileName}
      </span>
      <div class="download-progress">
        <div class="download-progress-fill ${dl.state === 'completed' ? 'done' : ''}"
             style="width: ${dl.percent}%"></div>
      </div>
      <span class="download-percent">${dl.percent}%</span>
      <span class="download-status ${dl.state === 'completed' ? 'done' : dl.state === 'interrupted' ? 'error' : ''}">
        ${dl.state === 'completed' ? '✓ Готово' : dl.state === 'interrupted' ? 'Ошибка' : 'Загрузка...'}
      </span>
      <button class="download-btn" onclick="openFile('${dl.savePath}')">Открыть</button>
      <button class="download-btn" onclick="showInFolder('${dl.savePath}')">В папке</button>
      <button class="download-close" onclick="removeDownload('${dl.savePath}')">✕</button>
    </div>
  `).join('')
}

function openFile(filePath) {
  ipcRenderer.send('download:open', filePath)
}
function showInFolder(filePath) {
  ipcRenderer.send('download:show', filePath)
}
function removeDownload(savePath) {
  downloads.delete(savePath)
  renderDownloads()
  if (downloads.size === 0) hideDownloadsBar()
}
function showDownloadsBar() {
  document.getElementById('downloads-bar').classList.add('visible')
}
function hideDownloadsBar() {
  document.getElementById('downloads-bar').classList.remove('visible')
}
```

---

## ЗАДАЧА 4: АВТОДОПОЛНЕНИЕ ПОИСКОВОЙ СТРОКИ

### Что нужно сделать

Когда пользователь вводит текст в адресную/поисковую строку — под ней появляется выпадающий список с подсказками, точно как в Chrome. Три типа подсказок: поисковые запросы Google, история браузера, закладки.

### Как это работает

```
Пользователь вводит: "клол"
                         ↓
         Три параллельных источника:
   ┌─────────────────────────────────────┐
   │ 1. Google Suggest API (живые)       │
   │ 2. История посещений (localStorage) │
   │ 3. Закладки (localStorage)          │
   └─────────────────────────────────────┘
                         ↓
              Объединяем, дедуплицируем
                         ↓
         ┌─────────────────────────────┐
         │  🔍  клол — Поиск Google    │  ← первая строка всегда
         │  🔍  клод                   │  ← Google Suggest
         │  🔍  клопс                  │
         │  🕐  клолдб и шут           │  ← из истории
         │  ⭐  клодифен               │  ← из закладок
         └─────────────────────────────┘
```

### Реализация — рендерер (src/)

#### Шаг 1: Google Suggest API

Google предоставляет бесплатный публичный endpoint для подсказок:

```javascript
async function fetchGoogleSuggestions(query) {
  if (!query.trim()) return []
  try {
    // JSONP endpoint — работает без CORS проблем в Electron
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}&hl=ru`
    const res = await fetch(url)
    const data = await res.json()
    // data[1] — массив строк с подсказками
    return (data[1] || []).slice(0, 6).map(text => ({
      type: 'search',
      text,
      icon: 'search',
    }))
  } catch {
    return []
  }
}
```

#### Шаг 2: История и закладки

```javascript
// Сохранение истории при переходе по URL
function addToHistory(url, title) {
  const history = JSON.parse(localStorage.getItem('gravity-history') || '[]')
  const entry = { url, title: title || url, time: Date.now() }
  // Убираем дубликаты по URL
  const filtered = history.filter(h => h.url !== url)
  filtered.unshift(entry)
  // Храним последние 500 записей
  localStorage.setItem('gravity-history', JSON.stringify(filtered.slice(0, 500)))
}

// Поиск в истории
function searchHistory(query) {
  const q = query.toLowerCase()
  const history = JSON.parse(localStorage.getItem('gravity-history') || '[]')
  return history
    .filter(h => h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q))
    .slice(0, 3)
    .map(h => ({ type: 'history', text: h.title, url: h.url, icon: 'clock' }))
}

// Поиск в закладках
function searchBookmarks(query) {
  const q = query.toLowerCase()
  const bookmarks = JSON.parse(localStorage.getItem('gravity-bookmarks') || '[]')
  return bookmarks
    .filter(b => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q))
    .slice(0, 2)
    .map(b => ({ type: 'bookmark', text: b.title, url: b.url, icon: 'star' }))
}
```

#### Шаг 3: Объединение подсказок

```javascript
async function getSuggestions(query) {
  if (!query.trim()) return []

  // Первая строка — всегда прямой поиск введённого текста
  const directSearch = [{
    type: 'search',
    text: query,
    label: `${query} — Поиск Google`,
    icon: 'search',
    isFirst: true,
  }]

  // Параллельно запрашиваем все источники
  const [googleSuggests, historyResults, bookmarkResults] = await Promise.all([
    fetchGoogleSuggestions(query),
    Promise.resolve(searchHistory(query)),
    Promise.resolve(searchBookmarks(query)),
  ])

  // Объединяем: сначала история/закладки (они быстрее и персональнее),
  // потом Google подсказки, убираем дубликаты с запросом
  const combined = [
    ...historyResults,
    ...bookmarkResults,
    ...googleSuggests.filter(s => s.text.toLowerCase() !== query.toLowerCase()),
  ]

  // Дедупликация по тексту
  const seen = new Set([query.toLowerCase()])
  const deduped = combined.filter(s => {
    const key = (s.url || s.text).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return [...directSearch, ...deduped.slice(0, 7)]
}
```

#### Шаг 4: UI выпадающего списка

```javascript
let suggestionIndex = -1  // текущий выбранный элемент (стрелки)
let suggestionsData = []   // текущие подсказки
let suggestTimeout = null  // debounce таймер

// Вызывать при каждом input в адресной строке
async function onAddressInput(query) {
  clearTimeout(suggestTimeout)
  if (!query.trim()) {
    hideSuggestions()
    return
  }
  // Debounce 150ms — не спамим запросами
  suggestTimeout = setTimeout(async () => {
    suggestionsData = await getSuggestions(query)
    suggestionIndex = -1
    renderSuggestions(suggestionsData, query)
  }, 150)
}

function renderSuggestions(suggestions, query) {
  const dropdown = document.getElementById('suggestions-dropdown')
  if (!suggestions.length) { hideSuggestions(); return }

  dropdown.innerHTML = suggestions.map((s, i) => `
    <div class="suggestion-item ${s.isFirst ? 'suggestion-first' : ''}"
         data-index="${i}"
         onmousedown="selectSuggestion(${i})">
      <div class="suggestion-icon">
        ${getSuggestionIconSVG(s.icon)}
      </div>
      <div class="suggestion-text">
        ${s.isFirst
          ? `<span class="suggestion-label">${escapeHtml(s.label)}</span>`
          : `<span class="suggestion-match">${highlightMatch(escapeHtml(s.text), query)}</span>`
        }
        ${s.url && !s.isFirst ? `<span class="suggestion-url">${escapeHtml(truncateUrl(s.url))}</span>` : ''}
      </div>
      ${s.type === 'search' && !s.isFirst
        ? `<div class="suggestion-arrow" onmousedown="fillAddress(${i}, event)" title="Вставить в строку">
             <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 10L10 2M10 2H4M10 2v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
           </div>`
        : ''
      }
    </div>
  `).join('')

  dropdown.style.display = 'block'
}

// Подсветка совпадающей части в тексте
function highlightMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    text.slice(0, idx) +
    `<strong>${text.slice(idx, idx + query.length)}</strong>` +
    text.slice(idx + query.length)
  )
}

// Выбор подсказки кликом
function selectSuggestion(index) {
  const s = suggestionsData[index]
  if (!s) return
  if (s.url) {
    navigateTo(s.url)
  } else {
    navigateTo(`https://www.google.com/search?q=${encodeURIComponent(s.text)}`)
  }
  hideSuggestions()
}

// Стрелка вправо — только вставить в строку не переходя
function fillAddress(index, event) {
  event.stopPropagation()
  const s = suggestionsData[index]
  if (s) {
    document.getElementById('address-bar').value = s.text
    document.getElementById('address-bar').focus()
    onAddressInput(s.text)
  }
}

function hideSuggestions() {
  const dropdown = document.getElementById('suggestions-dropdown')
  if (dropdown) dropdown.style.display = 'none'
  suggestionIndex = -1
}

// Навигация стрелками клавиатуры
function handleAddressKeydown(e) {
  const items = document.querySelectorAll('.suggestion-item')
  if (!items.length) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    suggestionIndex = Math.min(suggestionIndex + 1, items.length - 1)
    updateSuggestionHighlight(items)
    // Показать текст подсказки в адресной строке
    if (suggestionsData[suggestionIndex]) {
      document.getElementById('address-bar').value = suggestionsData[suggestionIndex].text
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    suggestionIndex = Math.max(suggestionIndex - 1, -1)
    updateSuggestionHighlight(items)
  } else if (e.key === 'Escape') {
    hideSuggestions()
  } else if (e.key === 'Enter') {
    if (suggestionIndex >= 0) {
      selectSuggestion(suggestionIndex)
      e.preventDefault()
    }
    // иначе Enter обрабатывается стандартно (переход по введённому)
  }
}

function updateSuggestionHighlight(items) {
  items.forEach((el, i) => {
    el.classList.toggle('suggestion-active', i === suggestionIndex)
  })
}
```

#### Шаг 5: SVG иконки для типов подсказок

```javascript
function getSuggestionIconSVG(type) {
  const icons = {
    search: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/>
      <path d="M11 11l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
    clock: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
      <path d="M8 5v3l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
    star: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 2l1.8 3.6L14 6.3l-3 2.9.7 4.1L8 11.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7L8 2z"
            stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`,
  }
  return icons[type] || icons.search
}
```

### CSS выпадающего списка

```css
/* Обёртка адресной строки — нужна для позиционирования дропдауна */
.address-bar-wrap {
  position: relative;
  flex: 1;
}

#suggestions-dropdown {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  left: 0; right: 0;
  background: var(--card);
  border: 1px solid var(--border2);
  border-radius: 12px;
  overflow: hidden;
  z-index: 9999;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3);
  /* Плавное появление */
  animation: dropdownIn 0.15s cubic-bezier(0.34, 1.4, 0.64, 1);
}

@keyframes dropdownIn {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.12s;
  position: relative;
}
.suggestion-item:hover,
.suggestion-item.suggestion-active {
  background: var(--bg3);
}

/* Первая строка (прямой поиск) чуть выделена */
.suggestion-first {
  border-bottom: 1px solid var(--border);
}
.suggestion-first .suggestion-label {
  font-weight: 500;
  color: var(--text);
}

.suggestion-icon {
  color: var(--text-dim);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px;
}
.suggestion-item:hover .suggestion-icon,
.suggestion-item.suggestion-active .suggestion-icon {
  color: var(--text-sub);
}

.suggestion-text {
  flex: 1;
  min-width: 0;
}
.suggestion-match {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
/* Выделение совпадающей части */
.suggestion-match strong {
  color: #fff;
  font-weight: 700;
}
.suggestion-url {
  font-size: 11px;
  color: var(--text-dim);
  display: block;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Стрелка "вставить в строку" */
.suggestion-arrow {
  opacity: 0;
  color: var(--text-dim);
  padding: 4px;
  border-radius: 4px;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.suggestion-item:hover .suggestion-arrow,
.suggestion-item.suggestion-active .suggestion-arrow {
  opacity: 1;
}
.suggestion-arrow:hover {
  background: var(--border2);
  color: var(--text);
}
```

### Привязка к адресной строке

Найди в коде браузера адресную строку (input или contenteditable) и добавь обработчики:

```javascript
const addressBar = document.getElementById('address-bar') // найди реальный id

addressBar.addEventListener('input', (e) => {
  onAddressInput(e.target.value)
})

addressBar.addEventListener('keydown', handleAddressKeydown)

addressBar.addEventListener('focus', (e) => {
  if (e.target.value.trim()) {
    onAddressInput(e.target.value)
  }
})

// Скрывать при клике вне
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.address-bar-wrap') && !e.target.closest('#suggestions-dropdown')) {
    hideSuggestions()
  }
})

// Скрывать при переходе на страницу
addressBar.addEventListener('blur', () => {
  // Небольшая задержка чтобы mousedown на подсказке успел сработать
  setTimeout(hideSuggestions, 200)
})
```

### Вспомогательные функции

```javascript
function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function truncateUrl(url) {
  try {
    const u = new URL(url)
    return u.hostname + (u.pathname !== '/' ? u.pathname.slice(0, 30) : '')
  } catch {
    return url.slice(0, 40)
  }
}
```

---

## ЗАДАЧА 5: БЫСТРЫЕ ЯРЛЫКИ НА НОВОЙ ВКЛАДКЕ

### Что нужно сделать

На странице новой вкладки (`gravity://newtab` или `newtab.html`) добавить блок с ярлыками сайтов — как в Chrome. Пользователь может добавлять свои сайты, удалять и они сохраняются навсегда.

### Как выглядит

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   [YT]      [GH]      [VK]      [DS]      [G]       [+]   │
│  YouTube   GitHub     VK      Discord    Google   Добавить  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Каждый ярлык — кружок с favicon сайта, под ним короткое название. При наведении — крестик для удаления в правом верхнем углу.

### Данные и хранение

```javascript
// Структура одного ярлыка
// { id, title, url, favicon }

// Загрузить ярлыки
function loadShortcuts() {
  return JSON.parse(localStorage.getItem('gravity-shortcuts') || '[]')
}

// Сохранить ярлыки
function saveShortcuts(shortcuts) {
  localStorage.setItem('gravity-shortcuts', JSON.stringify(shortcuts))
}

// Добавить ярлык
function addShortcut(title, url) {
  const shortcuts = loadShortcuts()
  if (shortcuts.length >= 10) return // максимум 10
  const id = Date.now().toString()
  const favicon = getFaviconUrl(url)
  shortcuts.push({ id, title: title.trim(), url: normalizeUrl(url), favicon })
  saveShortcuts(shortcuts)
  renderShortcuts()
}

// Удалить ярлык
function removeShortcut(id) {
  const shortcuts = loadShortcuts().filter(s => s.id !== id)
  saveShortcuts(shortcuts)
  renderShortcuts()
}

// Нормализация URL — добавить https:// если нет
function normalizeUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url
  }
  return url
}

// Получить favicon через Google S2 API (бесплатный, без ключей)
function getFaviconUrl(url) {
  try {
    const hostname = new URL(normalizeUrl(url)).hostname
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
  } catch {
    return null
  }
}

// Получить короткое имя из URL если заголовок не указан
function getShortTitle(title, url) {
  if (title) return title.length > 12 ? title.slice(0, 11) + '…' : title
  try {
    return new URL(url).hostname.replace('www.', '').split('.')[0]
  } catch {
    return url.slice(0, 12)
  }
}
```

### Рендер ярлыков

```javascript
function renderShortcuts() {
  const shortcuts = loadShortcuts()
  const container = document.getElementById('shortcuts-grid')

  container.innerHTML = shortcuts.map(s => `
    <div class="shortcut-item" onclick="navigateTo('${escapeHtml(s.url)}')">
      <div class="shortcut-icon-wrap">
        <div class="shortcut-icon">
          ${s.favicon
            ? `<img src="${s.favicon}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : ''
          }
          <div class="shortcut-icon-fallback" style="${s.favicon ? 'display:none' : ''}">
            ${getShortTitle(s.title, s.url).charAt(0).toUpperCase()}
          </div>
        </div>
        <button class="shortcut-remove" onclick="event.stopPropagation(); removeShortcut('${s.id}')" title="Удалить">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <span class="shortcut-title">${escapeHtml(getShortTitle(s.title, s.url))}</span>
    </div>
  `).join('')

  // Кнопка "+" — только если меньше 10 ярлыков
  if (shortcuts.length < 10) {
    container.innerHTML += `
      <div class="shortcut-item shortcut-add" onclick="openAddShortcutDialog()">
        <div class="shortcut-icon-wrap">
          <div class="shortcut-icon shortcut-icon-add">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
        </div>
        <span class="shortcut-title">Добавить</span>
      </div>
    `
  }
}
```

### Диалог добавления ярлыка

Маленький модальный попап поверх страницы новой вкладки:

```javascript
function openAddShortcutDialog() {
  document.getElementById('add-shortcut-modal').style.display = 'flex'
  document.getElementById('shortcut-url-input').focus()
}

function closeAddShortcutDialog() {
  document.getElementById('add-shortcut-modal').style.display = 'none'
  document.getElementById('shortcut-url-input').value = ''
  document.getElementById('shortcut-name-input').value = ''
}

function confirmAddShortcut() {
  const url = document.getElementById('shortcut-url-input').value.trim()
  const title = document.getElementById('shortcut-name-input').value.trim()
  if (!url) return
  addShortcut(title || '', url)
  closeAddShortcutDialog()
}
```

HTML модального окна (добавить в newtab.html):
```html
<div id="add-shortcut-modal" style="display:none"
     class="modal-overlay" onclick="if(event.target===this) closeAddShortcutDialog()">
  <div class="modal-card">
    <div class="modal-header">
      <span class="modal-title">Добавить ярлык</span>
      <button class="modal-close" onclick="closeAddShortcutDialog()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div class="modal-body">
      <label class="modal-label">Адрес сайта</label>
      <input id="shortcut-url-input" class="modal-input" type="text"
             placeholder="https://example.com"
             onkeydown="if(event.key==='Enter') confirmAddShortcut()">
      <label class="modal-label" style="margin-top:12px">Название (необязательно)</label>
      <input id="shortcut-name-input" class="modal-input" type="text"
             placeholder="Мой сайт"
             onkeydown="if(event.key==='Enter') confirmAddShortcut()">
    </div>
    <div class="modal-footer">
      <button class="modal-btn-cancel" onclick="closeAddShortcutDialog()">Отмена</button>
      <button class="modal-btn-confirm" onclick="confirmAddShortcut()">Добавить</button>
    </div>
  </div>
</div>
```

### CSS

```css
/* ── СЕТКА ЯРЛЫКОВ ── */
#shortcuts-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  padding: 0 24px;
}

.shortcut-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  border-radius: 12px;
  cursor: pointer;
  width: 88px;
  transition: background 0.18s;
  position: relative;
}
.shortcut-item:hover { background: var(--bg3); }

.shortcut-icon-wrap {
  position: relative;
  width: 52px; height: 52px;
}

.shortcut-icon {
  width: 52px; height: 52px;
  border-radius: 50%;
  background: var(--bg3);
  border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  transition: border-color 0.18s;
}
.shortcut-item:hover .shortcut-icon { border-color: var(--border2); }

.shortcut-icon img {
  width: 28px; height: 28px;
  object-fit: contain;
}

.shortcut-icon-fallback {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 700;
  color: var(--text-sub);
}

/* Крестик удаления — появляется при наведении */
.shortcut-remove {
  position: absolute;
  top: -4px; right: -4px;
  width: 18px; height: 18px;
  background: var(--card);
  border: 1px solid var(--border2);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  color: var(--text-sub);
  opacity: 0;
  transform: scale(0.7);
  transition: opacity 0.15s, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s;
}
.shortcut-item:hover .shortcut-remove {
  opacity: 1;
  transform: scale(1);
}
.shortcut-remove:hover {
  background: var(--bg3);
  color: var(--text);
  border-color: #444;
}

/* Кнопка добавления */
.shortcut-icon-add {
  color: var(--text-dim);
  transition: color 0.18s;
}
.shortcut-add:hover .shortcut-icon-add {
  color: var(--text-sub);
}
.shortcut-add .shortcut-icon {
  border-style: dashed;
}

.shortcut-title {
  font-size: 12px;
  color: var(--text-sub);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
  line-height: 1.3;
  transition: color 0.18s;
}
.shortcut-item:hover .shortcut-title { color: var(--text); }

/* ── МОДАЛЬНОЕ ОКНО ── */
.modal-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  animation: fadeIn 0.15s ease;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.modal-card {
  background: var(--card);
  border: 1px solid var(--border2);
  border-radius: 16px;
  width: 360px;
  box-shadow: 0 32px 80px rgba(0,0,0,0.6);
  animation: modalIn 0.2s cubic-bezier(0.34, 1.4, 0.64, 1);
}
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.94) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 20px 0;
}
.modal-title { font-size: 15px; font-weight: 700; color: var(--text); }
.modal-close {
  width: 28px; height: 28px; border-radius: 7px;
  background: transparent; border: none;
  color: var(--text-dim); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.modal-close:hover { background: var(--bg3); color: var(--text); }

.modal-body { padding: 16px 20px; }
.modal-label {
  display: block; font-size: 12px;
  color: var(--text-sub); margin-bottom: 6px; letter-spacing: 0.03em;
}
.modal-input {
  width: 100%; padding: 10px 14px;
  background: var(--bg3); border: 1px solid var(--border2);
  border-radius: 8px; color: var(--text); font-size: 14px;
  font-family: inherit; outline: none;
  transition: border-color 0.18s;
}
.modal-input:focus { border-color: #444; }

.modal-footer {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 0 20px 20px;
}
.modal-btn-cancel {
  padding: 9px 18px; background: transparent;
  border: 1px solid var(--border2); border-radius: 8px;
  color: var(--text-sub); font-size: 13px; font-weight: 500;
  cursor: pointer; font-family: inherit; transition: all 0.18s;
}
.modal-btn-cancel:hover { border-color: #444; color: var(--text); }
.modal-btn-confirm {
  padding: 9px 18px; background: #fff; color: #000;
  border: none; border-radius: 8px;
  font-size: 13px; font-weight: 700;
  cursor: pointer; font-family: inherit;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s;
}
.modal-btn-confirm:hover { transform: scale(1.04); }
```

### Инициализация на странице новой вкладки

```javascript
// Вызвать при загрузке страницы newtab
document.addEventListener('DOMContentLoaded', () => {
  renderShortcuts()
})
```

---

## ЗАДАЧА 6: ОСНОВНОЙ БРАУЗЕР ПО УМОЛЧАНИЮ

### Что нужно сделать

Добавить возможность установить Gravity браузером по умолчанию в Windows — чтобы все ссылки из других программ открывались в нём.

### Реализация в main.js

```javascript
const { app, ipcMain, shell } = require('electron')

// Проверить — является ли Gravity основным браузером
function isDefaultBrowser() {
  return app.isDefaultProtocolClient('http') && app.isDefaultProtocolClient('https')
}

// Установить Gravity основным браузером
function setAsDefaultBrowser() {
  app.setAsDefaultProtocolClient('http')
  app.setAsDefaultProtocolClient('https')
  // На Windows открывает системный диалог выбора браузера по умолчанию
  // Пользователь сам подтверждает в окне Windows
}

// Открыть системные настройки Windows для выбора браузера
function openDefaultAppsSettings() {
  // Открывает раздел "Приложения по умолчанию" в настройках Windows
  shell.openExternal('ms-settings:defaultapps')
}

// IPC: проверить статус
ipcMain.handle('browser:isDefault', () => {
  return isDefaultBrowser()
})

// IPC: установить основным
ipcMain.handle('browser:setDefault', () => {
  try {
    setAsDefaultBrowser()
    // Если setAsDefaultProtocolClient не сработало (Windows 10/11 требует
    // подтверждения через системный диалог) — открываем настройки
    if (!isDefaultBrowser()) {
      openDefaultAppsSettings()
    }
    return { success: true, isDefault: isDefaultBrowser() }
  } catch (e) {
    return { success: false, reason: e.message }
  }
})

// IPC: открыть настройки Windows
ipcMain.on('browser:openSettings', () => {
  openDefaultAppsSettings()
})

// Проверка при запуске — если не основной, показать баннер
app.whenReady().then(() => {
  // Небольшая задержка чтобы окно успело загрузиться
  setTimeout(() => {
    if (!isDefaultBrowser()) {
      const wins = BrowserWindow.getAllWindows()
      if (wins[0]) {
        wins[0].webContents.send('browser:notDefault')
      }
    }
  }, 2000)
})
```

### UI — баннер при первом запуске

Показывается один раз если Gravity не является основным браузером. Тонкая полоска под адресной строкой:

```
┌─────────────────────────────────────────────────────────────┐
│  Gravity не является основным браузером   [Сделать основным] [×] │
└─────────────────────────────────────────────────────────────┘
```

```javascript
// В рендерере — слушаем событие от main
window.gravityAPI.on('browser:notDefault', () => {
  // Показывать только если пользователь ещё не отклонил
  const dismissed = localStorage.getItem('gravity-default-dismissed')
  if (!dismissed) {
    showDefaultBrowserBanner()
  }
})

function showDefaultBrowserBanner() {
  const banner = document.getElementById('default-browser-banner')
  if (banner) banner.style.display = 'flex'
}

function dismissDefaultBrowserBanner() {
  const banner = document.getElementById('default-browser-banner')
  if (banner) banner.style.display = 'none'
  // Запомнить — не показывать снова
  localStorage.setItem('gravity-default-dismissed', '1')
}

async function setAsDefault() {
  const result = await window.gravityAPI.invoke('browser:setDefault')
  if (result.isDefault) {
    dismissDefaultBrowserBanner()
    // Обновить кнопку в настройках если открыта
    updateDefaultBrowserButton(true)
  }
}
```

HTML баннера (добавить в основной index.html):
```html
<div id="default-browser-banner" style="display:none" class="default-banner">
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
    <path d="M8 5v3M8 10h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>
  <span class="default-banner-text">Gravity не является основным браузером</span>
  <button class="default-banner-btn" onclick="setAsDefault()">Сделать основным</button>
  <button class="default-banner-close" onclick="dismissDefaultBrowserBanner()">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>
</div>
```

### UI — кнопка в настройках браузера

В странице настроек (`gravity://settings`) добавить секцию:

```html
<div class="settings-section">
  <div class="settings-section-title">Браузер по умолчанию</div>
  <div class="settings-row">
    <div class="settings-row-info">
      <div class="settings-row-label">Gravity Browser</div>
      <div class="settings-row-desc">Открывать все ссылки в Gravity</div>
    </div>
    <button id="default-browser-btn" onclick="handleSetDefault()">
      Сделать основным
    </button>
  </div>
</div>
```

```javascript
async function initDefaultBrowserSection() {
  const isDefault = await window.gravityAPI.invoke('browser:isDefault')
  updateDefaultBrowserButton(isDefault)
}

function updateDefaultBrowserButton(isDefault) {
  const btn = document.getElementById('default-browser-btn')
  if (!btn) return
  if (isDefault) {
    btn.textContent = '✓ Gravity — основной браузер'
    btn.disabled = true
    btn.classList.add('btn-success')
  } else {
    btn.textContent = 'Сделать основным'
    btn.disabled = false
    btn.classList.remove('btn-success')
  }
}

async function handleSetDefault() {
  const result = await window.gravityAPI.invoke('browser:setDefault')
  updateDefaultBrowserButton(result.isDefault)
  if (!result.isDefault) {
    // Windows требует ручного выбора в системных настройках
    // Открылось окно настроек Windows — сообщить пользователю
    showToast('Выбери Gravity в открывшихся настройках Windows')
  }
}
```

### CSS

```css
/* ── БАННЕР ── */
.default-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-sub);
  flex-shrink: 0;
  animation: slideDown 0.25s cubic-bezier(0.34, 1.2, 0.64, 1);
}
@keyframes slideDown {
  from { transform: translateY(-100%); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
.default-banner-text { flex: 1; }
.default-banner-btn {
  padding: 5px 14px;
  background: #fff; color: #000;
  border: none; border-radius: 6px;
  font-size: 12px; font-weight: 700;
  cursor: pointer; font-family: inherit;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s;
  white-space: nowrap;
}
.default-banner-btn:hover { transform: scale(1.04); }
.default-banner-close {
  width: 24px; height: 24px;
  background: transparent; border: none;
  color: var(--text-dim); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: 5px; transition: all 0.15s; flex-shrink: 0;
}
.default-banner-close:hover { background: var(--bg3); color: var(--text); }

/* ── КНОПКА В НАСТРОЙКАХ ── */
.btn-success {
  background: transparent !important;
  border: 1px solid rgba(74,222,128,0.3) !important;
  color: #4ade80 !important;
  cursor: default !important;
}

/* ── ТОСТ УВЕДОМЛЕНИЕ ── */
.toast {
  position: fixed;
  bottom: 24px; left: 50%;
  transform: translateX(-50%) translateY(0);
  background: var(--card);
  border: 1px solid var(--border2);
  border-radius: 10px;
  padding: 12px 20px;
  font-size: 13px; color: var(--text);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  z-index: 99999;
  animation: toastIn 0.3s cubic-bezier(0.34, 1.4, 0.64, 1);
  white-space: nowrap;
}
@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(16px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

function showToast(msg, duration = 3000) {
  const existing = document.querySelector('.toast')
  if (existing) existing.remove()
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => {
    el.style.animation = 'none'
    el.style.opacity = '0'
    el.style.transition = 'opacity 0.2s'
    setTimeout(() => el.remove(), 200)
  }, duration)
}
```

### Важно про Windows 10/11

На Windows 10 и 11 нельзя программно стать браузером по умолчанию без подтверждения пользователя — Microsoft специально запретила это после скандалов. Поэтому:

1. `app.setAsDefaultProtocolClient()` регистрирует протоколы `http`/`https` за Gravity
2. Но Windows всё равно откроет системный диалог **"Выбор приложений по умолчанию"**
3. Пользователь должен **кликнуть на Gravity** в этом списке сам
4. Это нормальное поведение — так работает Chrome, Firefox и все остальные

Убедись что в `package.json` или installer прописана регистрация в реестре Windows. Для Inno Setup добавить:
```
[Registry]
Root: HKCR; Subkey: "GravityBrowser"; ValueType: string; ValueData: "Gravity Browser"
Root: HKCR; Subkey: "GravityBrowser\shell\open\command"; ValueType: string; ValueData: """{app}\Gravity Browser.exe"" ""%1"""
```

---

## ПОРЯДОК РАБОТЫ

1. **Прочитай все файлы проекта** — `main.js`, `preload.js`, `package.json`, всё в `src/`
2. **Найди** где создаётся `BrowserWindow`, как устроен `preload.js`, какие IPC каналы уже есть
3. **Неломай** существующий функционал — только добавляй новое
4. **Интегрируй** `setupDownloadManager(win)` в существующую функцию создания окна
5. **Добавь** `loadExtensions()` в `app.whenReady()`
6. **Добавь** IPC хендлеры рядом с существующими
7. **Обнови preload.js** — expose новые IPC каналы через `contextBridge`
8. **Добавь UI элементы** в существующие HTML файлы, не создавая новых без необходимости
9. **Проверь** что `contextIsolation: true` и `nodeIntegration: false` — не меняй эти настройки

---

## ЧЕКЛИСТ ПЕРЕД ЗАВЕРШЕНИЕМ

- [ ] Расширения загружаются при старте из папки `userData/extensions`
- [ ] Кнопка "+ Добавить расширение" открывает диалог выбора папки
- [ ] Список расширений отображается в стиле Gravity (тёмные карточки)
- [ ] Кнопка удаления расширения работает
- [ ] `Ctrl+Shift+N` открывает окно инкогнито
- [ ] Инкогнито окно визуально отличается (фиолетовая полоска + бейдж)
- [ ] Инкогнито сессия не сохраняет куки/историю/кэш
- [ ] Панель загрузок появляется снизу при скачивании файла
- [ ] Прогресс-бар обновляется в реальном времени
- [ ] Клик на имя файла или кнопка "Открыть" — открывает файл
- [ ] Кнопка "В папке" — показывает файл в проводнике
- [ ] Кнопка × убирает элемент из панели
- [ ] Панель скрывается когда все загрузки убраны
- [ ] Все цвета из палитры Gravity (#080808, #101010 и т.д.)
- [ ] Никакой регрессии — существующий функционал не сломан
- [ ] Выпадающий список появляется при вводе в адресную строку
- [ ] Первая строка — всегда прямой поиск введённого запроса
- [ ] Google Suggest подсказки подгружаются в реальном времени (debounce 150ms)
- [ ] История браузера фильтруется и показывается с иконкой часов
- [ ] Закладки фильтруются и показываются с иконкой звезды
- [ ] Совпадающая часть текста подсвечивается жирным белым
- [ ] Стрелки ↑↓ навигируют по списку, Enter выбирает
- [ ] Escape закрывает список
- [ ] Стрелка → вставляет текст подсказки в строку без перехода
- [ ] Клик вне списка — закрывает его
- [ ] Анимация появления плавная (dropdownIn)
- [ ] Список не выходит за пределы окна браузера
- [ ] Быстрые ярлыки отображаются на новой вкладке (newtab)
- [ ] Иконки сайтов подгружаются через favicon API
- [ ] Клик на ярлык — переходит на сайт
- [ ] Кнопка "+" открывает диалог добавления ярлыка
- [ ] Ярлык можно удалить (крестик при наведении)
- [ ] Ярлыки сохраняются в localStorage и не пропадают при перезапуске
- [ ] Максимум 10 ярлыков, потом "+" скрывается
- [ ] Дизайн строго в стиле Gravity (тёмные карточки, без цветных акцентов)
- [ ] Кнопка "Сделать основным браузером" в настройках
- [ ] При первом запуске показывается предложение сделать основным
- [ ] После установки основным — кнопка меняется на "Gravity — основной браузер ✓"
