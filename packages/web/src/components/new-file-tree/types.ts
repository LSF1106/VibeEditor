export interface ClipboardData {
  action: 'cut' | 'copy'
  path: string
  isDirectory: boolean
  name: string
}

export interface ContextMenuPayload {
  type: 'file' | 'folder' | 'root'
  path: string
  name: string
}
