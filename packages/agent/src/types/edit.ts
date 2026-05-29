/** 文本选区范围 */
export interface TextSelection {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/** 编辑操作 —— Agent 生成的最小编辑单元 */
export interface EditOperation {
  type: 'insert' | 'delete' | 'replace';
  range: TextSelection;
  text?: string;
}
