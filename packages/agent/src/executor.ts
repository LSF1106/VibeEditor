import { IAgentFileSystem, EditOperation, AgentEditResult } from './types';

export interface ExecutionResult {
  success: boolean;
  errors: string[];
  applied: number;
}

export async function executeEdits(
  fs: IAgentFileSystem,
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

function applyOperation(content: string, op: EditOperation): string {
  const lines = content.split('\n');

  switch (op.type) {
    case 'insert': {
      const lineIdx = op.range.startLineNumber - 1;
      const colIdx = Math.min(op.range.startColumn - 1, (lines[lineIdx] || '').length);
      const line = lines[lineIdx] || '';
      lines[lineIdx] = line.slice(0, colIdx) + (op.text || '') + line.slice(colIdx);
      break;
    }
    case 'delete': {
      const startLine = op.range.startLineNumber - 1;
      const endLine = op.range.endLineNumber - 1;

      if (startLine === endLine) {
        const line = lines[startLine] || '';
        lines[startLine] = line.slice(0, op.range.startColumn - 1) + line.slice(op.range.endColumn - 1);
      } else {
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

      const firstLine = lines[startLine] || '';
      const lastLine = lines[endLine] || '';
      const prefix = firstLine.slice(0, op.range.startColumn - 1);
      const suffix = lastLine.slice(op.range.endColumn - 1);

      text[0] = prefix + text[0];
      text[text.length - 1] = text[text.length - 1] + suffix;

      lines.splice(startLine, endLine - startLine + 1, ...text);
      break;
    }
  }

  return lines.join('\n');
}

export function revertEdits(content: string, operations: EditOperation[]): string {
  const reversed = [...operations].reverse().map(reverseOperation);
  let result = content;
  for (const op of reversed) {
    result = applyOperation(result, op);
  }
  return result;
}

function reverseOperation(op: EditOperation): EditOperation {
  if (op.type === 'insert') {
    return { type: 'delete', range: op.range };
  }
  if (op.type === 'delete') {
    return { type: 'insert', range: op.range, text: op.text };
  }
  return { type: 'replace', range: op.range, text: op.text };
}
