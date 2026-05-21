/** 编辑器标签页 —— 代表一个打开的文件 */
export interface EditorTab {
  id: string;
  /** 文件绝对路径 */
  path: string;
  /** 文件名（不含路径） */
  name: string;
  /** Monaco Editor 语言标识符 */
  language: string;
  /** 当前编辑器内容 */
  content: string;
  /** 上次保存时的内容，用于脏状态比对 */
  originalContent: string;
  /** 是否有未保存的修改 */
  isDirty: boolean;
  /** 是否为新建未命名文件 */
  isUntitled: boolean;
}

/** 编辑器全局状态 —— 标签页列表 + 当前活动标签 */
export interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
}

/** 光标位置（行号 + 列号，均从 1 开始） */
export interface CursorPosition {
  lineNumber: number;
  column: number;
}

/** 文本选区范围 */
export interface TextSelection {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/**
 * 编辑操作 —— Agent 生成的最小编辑单元
 *
 * 三种操作类型：
 * - insert:  在 range.start 位置插入 text
 * - delete:  删除 range 范围内的文本
 * - replace: 用 text 替换 range 范围内的文本
 */
export interface EditOperation {
  type: 'insert' | 'delete' | 'replace';
  range: TextSelection;
  text?: string;
}

/** 根据文件扩展名映射到 Monaco Editor 语言标识符 */
export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    json: 'json', html: 'html', css: 'css', scss: 'scss',
    md: 'markdown', py: 'python', rs: 'rust', go: 'go',
    java: 'java', cpp: 'cpp', c: 'c', h: 'c',
    yaml: 'yaml', yml: 'yaml', xml: 'xml', sql: 'sql',
    sh: 'shell', bat: 'bat', ps1: 'powershell',
    txt: 'plaintext', log: 'plaintext',
  };
  return languageMap[ext || ''] || 'plaintext';
}
