import type { ITool, ToolInputSchema, ToolExecutionContext, ToolAnnotations } from '../types/tool';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'Path to the file to read' },
  },
  required: ['path'],
};

const annotations: ToolAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
};

export class ReadFileTool implements ITool {
  readonly name = 'read_file';
  readonly description = 'Read a file not currently in context';
  readonly usage = '<read_file path="path/to/file"/>';
  readonly inputSchema = inputSchema;
  readonly annotations = annotations;

  async execute(params: Record<string, string>, context: ToolExecutionContext): Promise<string> {
    try {
      const content = await context.fs.readFile(params.path);
      return `## File: ${params.path}\n\`\`\`\n${content}\n\`\`\``;
    } catch (e: any) {
      return `Error reading ${params.path}: ${e.message}`;
    }
  }
}
