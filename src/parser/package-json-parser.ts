import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PackageJsonData } from '../types.js';

export function parsePackageJson(rootDir: string): PackageJsonData {
  const pkgPath = resolve(rootDir, 'package.json');

  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json found in ${rootDir}`);
  }

  const raw = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  const scripts = (raw['scripts'] ?? {}) as Record<string, string>;

  return {
    name: typeof raw['name'] === 'string' ? raw['name'] : undefined,
    version: typeof raw['version'] === 'string' ? raw['version'] : undefined,
    isPrivate: raw['private'] === true,
    dependencies: (raw['dependencies'] ?? {}) as Record<string, string>,
    devDependencies: (raw['devDependencies'] ?? {}) as Record<string, string>,
    hasPreinstall: 'preinstall' in scripts,
    hasPostinstall: 'postinstall' in scripts,
    hasInstall: 'install' in scripts,
  };
}

/**
 * Parse package.json from raw content string (for testing).
 */
export function parsePackageJsonContent(content: string): PackageJsonData {
  const raw = JSON.parse(content) as Record<string, unknown>;
  const scripts = (raw['scripts'] ?? {}) as Record<string, string>;

  return {
    name: typeof raw['name'] === 'string' ? raw['name'] : undefined,
    version: typeof raw['version'] === 'string' ? raw['version'] : undefined,
    isPrivate: raw['private'] === true,
    dependencies: (raw['dependencies'] ?? {}) as Record<string, string>,
    devDependencies: (raw['devDependencies'] ?? {}) as Record<string, string>,
    hasPreinstall: 'preinstall' in scripts,
    hasPostinstall: 'postinstall' in scripts,
    hasInstall: 'install' in scripts,
  };
}
