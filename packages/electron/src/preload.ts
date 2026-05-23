import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  readFileBuffer: (filePath: string) => ipcRenderer.invoke('file:readBuffer', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('file:write', filePath, content),
  deleteFile: (filePath: string) => ipcRenderer.invoke('file:delete', filePath),
  readDir: (dirPath: string) => ipcRenderer.invoke('file:readDir', dirPath),
  createDir: (dirPath: string) => ipcRenderer.invoke('file:createDir', dirPath),
  deleteDir: (dirPath: string, recursive?: boolean) => ipcRenderer.invoke('file:deleteDir', dirPath, recursive),
  exists: (filePath: string) => ipcRenderer.invoke('file:exists', filePath),
  stat: (filePath: string) => ipcRenderer.invoke('file:stat', filePath),
  rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('file:rename', oldPath, newPath),
  openFolderPath: (folderPath: string) => ipcRenderer.invoke('file:openFolderPath', folderPath),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (filePath: string, content: string) => ipcRenderer.invoke('dialog:saveFile', filePath, content),
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu:action', (_event, action) => callback(action));
  },
});
