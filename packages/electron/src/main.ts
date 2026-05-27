import { app, BrowserWindow, ipcMain, dialog, Menu, protocol } from 'electron';
import { readFile } from 'fs/promises';

Menu.setApplicationMenu(null);
import * as path from 'path';
import { registerFileHandlers } from './ipc/file-handler';

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'VibeEditor',
    backgroundColor: '#1e1e1e',
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerVibeProtocol();
  registerFileHandlers(ipcMain, dialog);
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
