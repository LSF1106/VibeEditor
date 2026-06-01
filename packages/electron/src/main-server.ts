import { app, BrowserWindow, ipcMain, dialog, Menu, protocol } from 'electron';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { startServer } from '@vibeeditor/server';
import type { Server } from 'http';
import { registerFileHandlers } from './ipc/file-handler';

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

const APP_INFO_PATH_DEV = path.join(__dirname, '../../../app-info.json');
const APP_INFO_PATH_PROD = path.join(__dirname, '../app-info.json');
const appInfoPath = existsSync(APP_INFO_PATH_PROD) ? APP_INFO_PATH_PROD : APP_INFO_PATH_DEV;
const appInfo = JSON.parse(readFileSync(appInfoPath, 'utf-8'));

const CONFIG_PATH_DEV = path.join(__dirname, '../../../app-config.json');
const CONFIG_PATH_PROD = app.isPackaged
  ? path.join(process.resourcesPath!, 'app-config.json')
  : path.join(__dirname, '../app-config.json');
const configPath = existsSync(CONFIG_PATH_PROD) ? CONFIG_PATH_PROD : CONFIG_PATH_DEV;
const appConfig = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf-8')) : {};

const CONFIG_DIR_DEV = path.resolve('config');
const CONFIG_DIR_PROD = path.resolve(process.resourcesPath!);
const resolvedConfigDir = app.isPackaged ? CONFIG_DIR_PROD : CONFIG_DIR_DEV;

let mainWindow: BrowserWindow | null = null;
let httpServer: Server | null = null;

const WEB_DIST_DIR = existsSync(path.join(__dirname, '../web-dist/index.html'))
  ? path.join(__dirname, '../web-dist')
  : path.join(__dirname, '../web/dist');

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
              detail: `Version: ${appInfo.version}\nAuthor: ${appInfo.author}`,
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

const SERVER_PORT = Number(process.env.SERVER_PORT) || appConfig.serverPort || 20385;

app.whenReady().then(() => {
  httpServer = startServer({ port: SERVER_PORT, configDir: resolvedConfigDir });
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      dialog.showErrorBox(
        'Port Conflict',
        `Could not start server on port ${SERVER_PORT}.\n` +
        `The port is already in use. Make sure no other instance of VibeEditor is running.\n\n` +
        `You can change the port in app-config.json or by setting the SERVER_PORT environment variable.`
      );
    } else {
      dialog.showErrorBox('Server Error', err.message);
    }
    app.quit();
  });
  httpServer.on('listening', () => {
    console.log(`[VibeEditor] Server started on port ${SERVER_PORT}`);

    registerVibeProtocol();
    registerFileHandlers(ipcMain, dialog);

    ipcMain.handle('app:getInfo', () => appInfo);

    ipcMain.handle('config:read', async (_event, filename: string) => {
      const p = path.join(resolvedConfigDir, `${path.basename(filename, '.json')}.json`);
      if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8'));
      return null;
    });
    ipcMain.handle('config:write', async (_event, filename: string, data: unknown) => {
      const p = path.join(resolvedConfigDir, `${path.basename(filename, '.json')}.json`);
      writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
    });

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
      const newW = Math.max(800, w);
      const newH = Math.max(600, h);
      mainWindow.setBounds({ x, y, width: newW, height: newH });
    });

    createWindow();

    mainWindow!.webContents.on('did-finish-load', () => {
      mainWindow!.webContents.executeJavaScript(`window.__VIBE_SERVER_PORT__ = ${SERVER_PORT};`);
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
});

app.on('before-quit', () => {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
    console.log('[VibeEditor] Server stopped');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
