export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(meta: Record<string, unknown>): Logger;
}

function getConfiguredLevel(): LogLevel {
  const env = (typeof process !== 'undefined' && process.env?.LOG_LEVEL) || '';
  const normalized = env.toLowerCase();
  if (normalized === 'debug') return 'debug';
  if (normalized === 'info') return 'info';
  if (normalized === 'warn') return 'warn';
  if (normalized === 'error') return 'error';
  return 'info';
}

function shouldLog(category: string, level: LogLevel): boolean {
  const minLevel = LEVEL_ORDER[getConfiguredLevel()];
  if (LEVEL_ORDER[level] < minLevel) return false;

  const filter = typeof process !== 'undefined' && process.env?.LOG_CATEGORIES
    ? process.env.LOG_CATEGORIES
    : '';
  if (filter) {
    const allowed = filter.split(',').map(s => s.trim());
    if (!allowed.includes(category)) return false;
  }

  return true;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return '';
  return ' ' + JSON.stringify(meta);
}

function log(level: LogLevel, category: string, msg: string, extraMeta: Record<string, unknown>, baseMeta?: Record<string, unknown>) {
  if (!shouldLog(category, level)) return;
  const merged = { ...baseMeta, ...extraMeta };
  const metaStr = formatMeta(merged);
  const line = `[${formatTimestamp()}] [${level.toUpperCase()}] [${category}] ${msg}${metaStr}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(line);
}

export function createLogger(category: string, baseMeta?: Record<string, unknown>): Logger {
  return {
    debug(msg, meta) { log('debug', category, msg, meta || {}, baseMeta); },
    info(msg, meta)  { log('info', category, msg, meta || {}, baseMeta); },
    warn(msg, meta)  { log('warn', category, msg, meta || {}, baseMeta); },
    error(msg, meta) { log('error', category, msg, meta || {}, baseMeta); },
    child(childMeta: Record<string, unknown>): Logger {
      return createLogger(category, { ...baseMeta, ...childMeta });
    },
  };
}
