const { app, BrowserWindow, shell, Menu, Tray, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Config ──────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const DEFAULT_URL  = 'https://app.doc-capture.app';

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch { return {}; }
}
function saveConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

let config = loadConfig();
let mainWindow = null;
let tray = null;

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const { width = 1280, height = 800, x, y } = config.windowBounds || {};

  mainWindow = new BrowserWindow({
    width, height, x, y,
    minWidth: 900,
    minHeight: 600,
    title: 'Vixor ERP',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
    show: false,
    backgroundColor: '#0e1642',
    // Frameless with custom titlebar would go here if needed
  });

  // Restore window bounds on move/resize
  ['resize','move'].forEach(e => mainWindow.on(e, () => {
    if (mainWindow.isMaximized()) return;
    config.windowBounds = mainWindow.getBounds();
    saveConfig(config);
  }));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (config.maximized) mainWindow.maximize();
  });

  mainWindow.on('maximize',   () => { config.maximized = true;  saveConfig(config); });
  mainWindow.on('unmaximize', () => { config.maximized = false; saveConfig(config); });

  // Open external links in browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', e => {
    if (process.platform === 'darwin') { e.preventDefault(); mainWindow.hide(); }
  });

  const serverUrl = config.serverUrl || DEFAULT_URL;
  mainWindow.loadURL(serverUrl);

  // Reload shortcut
  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.type !== 'keyDown') return;
    if ((input.control || input.meta) && input.key === 'r') mainWindow.reload();
  });
}

// ── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  const img = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(img);
  tray.setToolTip('Vixor ERP');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Vixor ERP', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── Menu ─────────────────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'Vixor ERP',
      submenu: [
        { label: 'About Vixor ERP', role: 'about' },
        { type: 'separator' },
        {
          label: 'Server settings…',
          click: async () => {
            const current = config.serverUrl || DEFAULT_URL;
            const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
              type: 'question',
              title: 'Server URL',
              message: `Current server:\n${current}`,
              buttons: ['Change URL', 'Reset to default', 'Cancel'],
            });
            if (response === 0) {
              // Show input dialog via renderer
              mainWindow.webContents.executeJavaScript(
                `prompt("Enter server URL:", "${current}")`
              ).then(url => {
                if (url && url.startsWith('http')) {
                  config.serverUrl = url;
                  saveConfig(config);
                  mainWindow.loadURL(url);
                }
              });
            } else if (response === 1) {
              config.serverUrl = DEFAULT_URL;
              saveConfig(config);
              mainWindow.loadURL(DEFAULT_URL);
            }
          },
        },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { app.isQuiting = true; app.quit(); } },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(process.platform === 'darwin'
          ? [{ type: 'separator' }, { role: 'front' }]
          : [{ role: 'close' }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();
  buildMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { app.isQuiting = true; });

// ── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('get-server-url', () => config.serverUrl || DEFAULT_URL);
ipcMain.handle('set-server-url', (_, url) => {
  config.serverUrl = url;
  saveConfig(config);
  mainWindow?.loadURL(url);
});
