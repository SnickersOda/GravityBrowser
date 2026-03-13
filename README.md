<div align="center">

```
  ██████╗ ██████╗  █████╗ ██╗   ██╗██╗████████╗██╗   ██╗
 ██╔════╝ ██╔══██╗██╔══██╗██║   ██║██║╚══██╔══╝╚██╗ ██╔╝
 ██║  ███╗██████╔╝███████║██║   ██║██║   ██║    ╚████╔╝ 
 ██║   ██║██╔══██╗██╔══██║╚██╗ ██╔╝██║   ██║     ╚██╔╝  
 ╚██████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║   ██║      ██║   
  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝   ╚═╝      ╚═╝   
```

**A fast, minimal browser built with Electron**

[![Version](https://img.shields.io/badge/version-1.0-blue?style=flat-square)](https://github.com/SnickersOda/GravityBrowser/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey?style=flat-square&logo=windows)](https://github.com/SnickersOda/GravityBrowser/releases)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848F?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

</div>

---

## ✦ About

**Gravity Browser** is a lightweight desktop browser built on top of Electron and Chromium. Designed to be clean, fast, and distraction-free — because browsing should feel weightless.

---

## ⬇️ Installation

### Windows

1. Download the latest installer from [**Releases**](https://github.com/SnickersOda/GravityBrowser/releases)
2. Run `Gravity Browser Installer.exe`
3. Follow the setup wizard
4. Launch **Gravity Browser** from your desktop or Start Menu

> Requires Windows 10 or later (64-bit)

---

## 🛠️ Build from Source

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm

### Steps

```bash
# Clone the repository
git clone https://github.com/SnickersOda/GravityBrowser.git
cd gravity-browser

# Install dependencies
npm install

# Run in development mode
npm start

# Build the app (creates dist/win-unpacked)
npx electron-builder --win --dir
```

### Create installer (Windows)

1. Install [Inno Setup](https://jrsoftware.org/isinfo.php)
2. Open `Gravity Browser Installer.iss` in Inno Setup IDE
3. Press `Ctrl+F9` to compile
4. Installer will appear in the project root folder

---

## 📁 Project Structure

```
gravity-browser/
├── dist/
│   └── win-unpacked/       # Compiled Electron app
├── resources/              # App resources & assets
├── locales/                # Locale files
├── main.js                 # Electron main process
├── package.json
├── Gravity Browser Installer.iss   # Inno Setup script
└── icon_backup.ico         # App icon
```

---

## 🚀 Features

- ⚡ Fast page loading powered by Chromium
- 🪶 Lightweight and minimal UI
- 🖥️ Native Windows integration
- 📦 Simple one-click installer

---

## 📦 Releases

| Version | Date | Download |
|---------|------|----------|
| v1.0 | 2026 | [Gravity Browser Installer.exe](https://github.com/SnickersOda/GravityBrowser/releases/tag/v1.0) |

---

## 👤 Author

**SnickersOda**
- GitHub: [@SnickersOda](https://github.com/SnickersOda)

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  <sub>Made with ♥ and Electron</sub>
</div>
