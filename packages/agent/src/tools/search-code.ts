import type { ITool, ToolInputSchema, ToolExecutionContext, ToolAnnotations } from '../types/tool';

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    pattern: { type: 'string', description: 'Regex pattern to search for' },
    path: { type: 'string', description: 'Directory to search in (default: project root)', default: '.' },
    maxResults: { type: 'string', description: 'Max results to return (default: 20)', default: '20' },
  },
  required: ['pattern'],
};

const annotations: ToolAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

export class SearchCodeTool implements ITool {
  readonly name = 'search_code';
  readonly description = 'Search code with regex pattern';
  readonly usage = '<search_code pattern="regex" [path="dir" maxResults="20"]/>';
  readonly inputSchema = inputSchema;
  readonly annotations = annotations;

  async execute(params: Record<string, string>, context: ToolExecutionContext): Promise<string> {
    const pattern = params.pattern;
    const searchPath = params.path || '.';
    const maxResults = parseInt(params.maxResults || '20');

    const results: string[] = [];
    let count = 0;

    const matchInContent = (relPath: string, content: string) => {
      if (count >= maxResults) return;
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, 'gi');
      } catch {
        return;
      }
      const lines = content.split('\n');
      for (let i = 0; i < lines.length && count < maxResults; i++) {
        if (regex.test(lines[i])) {
          regex.lastIndex = 0;
          results.push(`${relPath}:${i + 1}: ${lines[i].trim().substring(0, 120)}`);
          count++;
        }
      }
    };

    const walkDir = async (dirPath: string) => {
      if (count >= maxResults) return;
      try {
        const entries = await context.fs.readDir(dirPath);
        for (const entry of entries) {
          if (count >= maxResults) return;
          const entryPath = dirPath === '.' ? entry.name : `${dirPath}/${entry.name}`;

          if (entry.isDirectory) {
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
            await walkDir(entryPath);
          } else {
            try {
              const content = await context.fs.readFile(entryPath);
              matchInContent(entryPath, content);
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    };

    await walkDir(searchPath);

    if (results.length === 0) return `No matches found for "${pattern}"`;
    return `## Search results for "${pattern}":\n${results.join('\n')}`;
  }
}
