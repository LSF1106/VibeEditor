import { IFileSystem } from '../fs/types';
import { EditOperation } from '../editor/types';
import { AgentEditResult } from './types';

/** 编辑执行结果 */
export interface ExecutionResult {
  success: boolean;
  errors: string[];
  /** 成功应用的文件数 */
  applied: number;
}

/**
 * 批量执行编辑操作
 *
 * 对每个 AgentEditResult：
 * 1. 读取目标文件（新文件以空字符串起始）
 * 2. 逐操作应用到文件内容
 * 3. 写回文件系统
 *
 * 单个文件失败不影响其他文件的执行，错误信息会收集到 errors 数组中。
 */
export async function executeEdits(
  fs: IFileSystem,
  edits: AgentEditResult[]
): Promise<ExecutionResult> {
  const errors: string[] = [];
  let applied = 0;

  for (const edit of edits) {
    try {
      const exists = await fs.exists(edit.filePath);
      let content = exists ? await fs.readFile(edit.filePath) : '';

      for (const op of edit.operations) {
        content = applyOperation(content, op);
      }

      await fs.writeFile(edit.filePath, content);
      applied++;
    } catch (err) {
      errors.push(`Failed to apply edit to ${edit.filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    success: errors.length === 0,
    errors,
    applied,
  };
}

/**
 * 对文件内容应用单个编辑操作
 *
 * 基于行列号（1-based）精确定位，支持三种操作：
 * - insert:  在指定行列位置插入文本
 * - delete:  删除指定范围（单行截断 / 多行拼接）
 * - replace: 替换指定范围为新的文本（可能跨行）
 */
function applyOperation(content: string, op: EditOperation): string {
  const lines = content.split('\n');

  switch (op.type) {
    case 'insert': {
      const lineIdx = op.range.startLineNumber - 1;
      const colIdx = Math.min(op.range.startColumn - 1, (lines[lineIdx] || '').length);
      const line = lines[lineIdx] || '';
      // 在指定列位置将文本插入当前行
      lines[lineIdx] = line.slice(0, colIdx) + (op.text || '') + line.slice(colIdx);
      break;
    }
    case 'delete': {
      const startLine = op.range.startLineNumber - 1;
      const endLine = op.range.endLineNumber - 1;

      if (startLine === endLine) {
        // 单行删除：截断该行
        const line = lines[startLine] || '';
        lines[startLine] = line.slice(0, op.range.startColumn - 1) + line.slice(op.range.endColumn - 1);
      } else {
        // 多行删除：拼接首行前缀 + 尾行后缀，移除中间所有行
        const firstLine = lines[startLine] || '';
        const lastLine = lines[endLine] || '';
        const prefix = firstLine.slice(0, op.range.startColumn - 1);
        const suffix = lastLine.slice(op.range.endColumn - 1);
        lines.splice(startLine, endLine - startLine + 1, prefix + suffix);
      }
      break;
    }
    case 'replace': {
      const startLine = op.range.startLineNumber - 1;
      const endLine = op.range.endLineNumber - 1;
      const text = (op.text || '').split('\n');

      // 保留替换范围前后的文本
      const firstLine = lines[startLine] || '';
      const lastLine = lines[endLine] || '';
      const prefix = firstLine.slice(0, op.range.startColumn - 1);
      const suffix = lastLine.slice(op.range.endColumn - 1);

      // 将新文本的首行拼上前缀，尾行拼上后缀
      text[0] = prefix + text[0];
      text[text.length - 1] = text[text.length - 1] + suffix;

      // 用新文本行替换旧的范围行
      lines.splice(startLine, endLine - startLine + 1, ...text);
      break;
    }
  }

  return lines.join('\n');
}

/**
 * 回滚编辑操作
 *
 * 将操作列表反转后逐一反向应用：
 * - insert → delete（删除刚插入的文本）
 * - delete → insert（恢复被删除的文本）
 * - replace → replace（再次替换以恢复原文本）
 */
export function revertEdits(content: string, operations: EditOperation[]): string {
  const reversed = [...operations].reverse().map(reverseOperation);
  let result = content;
  for (const op of reversed) {
    result = applyOperation(result, op);
  }
  return result;
}

/** 反转单个编辑操作 */
function reverseOperation(op: EditOperation): EditOperation {
  if (op.type === 'insert') {
    return { type: 'delete', range: op.range };
  }
  if (op.type === 'delete') {
    return { type: 'insert', range: op.range, text: op.text };
  }
  // replace 操作是其自身的逆操作（替换回原文本）
  return { type: 'replace', range: op.range, text: op.text };
}
