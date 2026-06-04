import { app, BrowserWindow, ipcMain, dialog, Menu, protocol } from 'electron';
import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { registerFileHandlers } from './ipc/file-handler';

const appInfo = JSON.parse(readFileSync(path.join(__dirname, '../../../app-info.json'), 'utf-8'));

let mainWindow: BrowserWindow | null = null;

const WEB_DIST_DIR = path.join(__dirname, '../web/dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vibe',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

function getMimeType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function resolveVibePath(url: string): string {
  const pathPart = url.replace(/^vibe:\/\/app/, '').split(/[?#]/)[0];
  const relativePath = decodeURIComponent(pathPart).replace(/\\/g, '/').replace(/^\/+/, '') || 'index.html';
  const filePath = path.resolve(WEB_DIST_DIR, relativePath);
  const webRoot = path.resolve(WEB_DIST_DIR);

  if (filePath !== webRoot && !filePath.startsWith(`${webRoot}${path.sep}`)) {
    throw new Error('Invalid vibe protocol path');
  }

  return filePath;
}

function registerVibeProtocol() {
  protocol.handle('vibe', async (request) => {
    try {
      const filePath = resolveVibePath(request.url);
      const data = await readFile(filePath);
      return new Response(new Uint8Array(data), {
        headers: { 'Content-Type': getMimeType(filePath) },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function sendMenuAction(action: string) {
  if (mainWindow) {
    mainWindow.webContents.send('menu:action', action);
  }
}

function buildMenu(): Electron.MenuItemConstructorOptions[] {
  return [
    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenuAction('new-file'),
        },
        {
          label: 'New Folder',
          click: () => sendMenuAction('new-folder'),
        },
        { type: 'separator' },
        {
          label: 'Open Folder',
          click: () => sendMenuAction('open-folder'),
        },
        {
          label: 'Browse Server',
          click: () => sendMenuAction('connect-server'),
        },
        {
          label: 'Open File',
          click: () => sendMenuAction('open-local-file'),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenuAction('save'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          click: () => sendMenuAction('edit-cut'),
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          click: () => sendMenuAction('edit-copy'),
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          click: () => sendMenuAction('edit-paste'),
        },
        { type: 'separator' },
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => sendMenuAction('edit-undo'),
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Y',
          click: () => sendMenuAction('edit-redo'),
        },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => sendMenuAction('edit-find'),
        },
        {
          label: 'Replace',
          accelerator: 'CmdOrCtrl+H',
          click: () => sendMenuAction('edit-replace'),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: `About ${appInfo.name}`,
              message: appInfo.name,
              detail: `Version: ${appInfo.version}\nAuthor: ${appInfo.authors.map((a: { name: string }) => a.name).join('、')}`,
            });
          },
        },
      ],
    },
  ];
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'VibeEditor',
    backgroundColor: '#1e1e1e',
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('vibe://app/index.html');
  }

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximizeChange', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximizeChange', false));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerVibeProtocol();
  registerFileHandlers(ipcMain, dialog);

  ipcMain.handle('app:getInfo', () => appInfo);

  const menu = Menu.buildFromTemplate(buildMenu());
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(menu);
  }

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => mainWindow?.maximize());
  ipcMain.handle('window:unmaximize', () => mainWindow?.unmaximize());
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle('window:getBounds', () => {
    if (!mainWindow) return null;
    const bounds = mainWindow.getBounds();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  });
  ipcMain.handle('window:resize', (_event, x: number, y: number, w: number, h: number) => {
    if (!mainWindow) return;
    const minW = 800;
    const minH = 600;
    const newW = Math.max(minW, w);
    const newH = Math.max(minH, h);
    mainWindow.setBounds({ x, y, width: newW, height: newH });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
