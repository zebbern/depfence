import type { ScanResult } from '../types.js';
import { formatTerminal } from './terminal-reporter.js';
import { formatJson } from './json-reporter.js';
import { formatMarkdown } from './markdown-reporter.js';

export type OutputFormat = 'terminal' | 'json' | 'markdown';

export function formatOutput(result: ScanResult, format: OutputFormat): string {
  switch (format) {
    case 'terminal':
      return formatTerminal(result);
    case 'json':
      return formatJson(result);
    case 'markdown':
      return formatMarkdown(result);
  }
}

export { formatTerminal } from './terminal-reporter.js';
export { formatJson } from './json-reporter.js';
export { formatMarkdown } from './markdown-reporter.js';
