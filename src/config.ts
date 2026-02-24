import { resolve } from 'node:path';
import type { ScanConfig } from './types.js';

export function buildConfig(overrides: Partial<ScanConfig> = {}): ScanConfig {
  return {
    rootDir: resolve(overrides.rootDir ?? process.cwd()),
    offline: overrides.offline ?? true,
    severityThreshold: overrides.severityThreshold ?? 'info',
    format: overrides.format ?? 'terminal',
    scopes: overrides.scopes,
    ignorePackages: overrides.ignorePackages,
  };
}
