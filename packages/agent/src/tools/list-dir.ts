import type { ITool, ToolInputSchema, ToolExecutionContext, ToolAnnotations } from '../types/tool';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'Path to the directory to list' },
  },
  required: ['path'],
};

const annotations: ToolAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
};

export class ListDirTool implements ITool {
  readonly name = 'list_dir';
  readonly description = 'List directory contents';
  readonly usage = '<list_dir path="path/to/dir"/>';
  readonly inputSchema = inputSchema;
  readonly annotations = annotations;

  async execute(params: Record<string, string>, context: ToolExecutionContext): Promise<string> {
    try {
      const entries = await context.fs.readDir(params.path);
      if (entries.length === 0) return `## Directory: ${params.path} (empty)`;

      const lines = entries
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .map(e => `${e.isDirectory ? '📁' : '📄'} ${e.name}${e.isDirectory ? '/' : ''}`);

      return `## Directory: ${params.path}\n${lines.join('\n')}`;
    } catch (e: any) {
      return `Error listing ${params.path}: ${e.message}`;
    }
  }
}
