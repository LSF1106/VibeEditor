import { exec } from 'child_process';
import type { ITool, ToolInputSchema, ToolExecutionContext, ToolAnnotations } from '../types/tool';

const DEFAULT_TIMEOUT_MS = 120_000;   // 2 minutes
const MAX_TIMEOUT_MS = 600_000;       // 10 minutes
const MAX_OUTPUT_LENGTH = 120_000;    // characters before truncation

const inputSchema: ToolInputSchema = {
  type: 'object',
  properties: {
    command: { type: 'string', description: 'The command to execute' },
    timeout: { type: 'string', description: `Optional timeout in milliseconds (max ${MAX_TIMEOUT_MS}, default ${DEFAULT_TIMEOUT_MS})` },
    description: { type: 'string', description: 'Description of what this command does (for logging)' },
  },
  required: ['command'],
};

const annotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

export class BashTool implements ITool {
  readonly name = 'bash';
  readonly description = 'Execute a shell command in the project directory. Returns stdout and stderr. Long-running commands will be killed after timeout.';
  readonly usage = '<bash command="..." [timeout="120000"] [description="..."]/>';
  readonly inputSchema = inputSchema;
  readonly annotations = annotations;

  async execute(params: Record<string, string>, context: ToolExecutionContext): Promise<string> {
    const command = params.command.trim();
    if (!command) return 'Error: No command provided';

    const timeout = this.resolveTimeout(params.timeout);
    const description = params.description || '';

    return new Promise<string>(resolve => {
      const child = exec(command, {
        cwd: undefined,  // uses process.cwd()
        timeout,
        maxBuffer: 10 * 1024 * 1024,  // 10 MB stdout+stderr
        windowsHide: true,
        shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
      }, (error, stdout, stderr) => {
        if (child.killed) {
          resolve(this.formatResult(command, description, '', 'Command timed out after timeout', true));
          return;
        }

        if (error && error.code === null && error.signal === null) {
          resolve(this.formatResult(command, description, stdout, stderr));
          return;
        }

        resolve(this.formatResult(command, description, stdout, stderr));
      });

      child.on('error', err => {
        resolve(`## Bash Error\nCommand: \`${command}\`\n\n${err.message}`);
      });
    });
  }

  private resolveTimeout(raw: string | undefined): number {
    if (!raw) return DEFAULT_TIMEOUT_MS;
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
    return Math.min(parsed, MAX_TIMEOUT_MS);
  }

  private formatResult(
    command: string,
    description: string,
    stdout: string,
    stderr: string,
    timedOut = false,
  ): string {
    const header = description
      ? `## Bash: ${description}\nCommand: \`${command}\``
      : `## Bash\nCommand: \`${command}\``;

    if (timedOut) {
      return `${header}\n\n**⚠ Command timed out**\n\n${this.truncate(stderr, 'stderr')}`;
    }

    const parts: string[] = [header];

    if (stdout) {
      parts.push(`### stdout\n\`\`\`\n${this.truncate(stdout, 'stdout')}\n\`\`\``);
    }
    if (stderr) {
      parts.push(`### stderr\n\`\`\`\n${this.truncate(stderr, 'stderr')}\n\`\`\``);
    }
    if (!stdout && !stderr) {
      parts.push('*(no output)*');
    }

    return parts.join('\n\n');
  }

  private truncate(content: string, label: string): string {
    if (content.length <= MAX_OUTPUT_LENGTH) return content;
    const omitted = content.length - MAX_OUTPUT_LENGTH;
    return content.slice(0, MAX_OUTPUT_LENGTH) +
      `\n\n... [${omitted} more characters of ${label} truncated] ...`;
  }
}
