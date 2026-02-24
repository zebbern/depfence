import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LockfileData, LockfileEntry } from '../types.js';

/**
 * Detect and parse the lockfile in the project root.
 */
export function parseLockfile(rootDir: string): LockfileData | undefined {
  const npmLock = resolve(rootDir, 'package-lock.json');
  if (existsSync(npmLock)) {
    return parseNpmLockfile(readFileSync(npmLock, 'utf-8'));
  }

  const yarnLock = resolve(rootDir, 'yarn.lock');
  if (existsSync(yarnLock)) {
    return parseYarnLockfile(readFileSync(yarnLock, 'utf-8'));
  }

  // pnpm-lock.yaml — basic detection, not fully parsed
  const pnpmLock = resolve(rootDir, 'pnpm-lock.yaml');
  if (existsSync(pnpmLock)) {
    return parsePnpmLockfile(readFileSync(pnpmLock, 'utf-8'));
  }

  return undefined;
}

/**
 * Parse npm package-lock.json content.
 */
export function parseNpmLockfile(content: string): LockfileData {
  const raw = JSON.parse(content) as Record<string, unknown>;
  const packages = new Map<string, LockfileEntry>();

  // lockfileVersion 2/3 uses "packages"
  const pkgs = (raw['packages'] ?? {}) as Record<string, Record<string, unknown>>;

  for (const [key, value] of Object.entries(pkgs)) {
    // Skip the root "" entry
    if (!key) continue;

    // key format: "node_modules/@scope/pkg" or "node_modules/pkg"
    const name = key.replace(/^node_modules\//, '');

    packages.set(name, {
      name,
      version: typeof value['version'] === 'string' ? value['version'] : '',
      resolved: typeof value['resolved'] === 'string' ? value['resolved'] : undefined,
      integrity: typeof value['integrity'] === 'string' ? value['integrity'] : undefined,
      hasInstallScripts: value['hasInstallScripts'] === true ? true : undefined,
    });
  }

  // Fallback: lockfileVersion 1 uses "dependencies"
  if (packages.size === 0) {
    const deps = (raw['dependencies'] ?? {}) as Record<string, Record<string, unknown>>;
    for (const [name, value] of Object.entries(deps)) {
      packages.set(name, {
        name,
        version: typeof value['version'] === 'string' ? value['version'] : '',
        resolved: typeof value['resolved'] === 'string' ? value['resolved'] : undefined,
        integrity: typeof value['integrity'] === 'string' ? value['integrity'] : undefined,
        hasInstallScripts: value['hasInstallScripts'] === true ? true : undefined,
      });
    }
  }

  return { type: 'npm', packages };
}

/**
 * Parse yarn.lock content (v1 text format).
 */
export function parseYarnLockfile(content: string): LockfileData {
  const packages = new Map<string, LockfileEntry>();
  const blocks = content.split(/\n(?=\S)/);

  for (const block of blocks) {
    const lines = block.split('\n');
    const header = lines[0]?.trim();
    if (!header || header.startsWith('#')) continue;

    // Header format: "@scope/pkg@^1.0.0", "pkg@^1.0.0":
    const nameMatch = /^"?(@?[^@"]+)@/.exec(header);
    if (!nameMatch) continue;

    const name = nameMatch[1]!;
    let version = '';
    let resolved: string | undefined;
    let integrity: string | undefined;

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      const versionMatch = /^version\s+"([^"]+)"/.exec(trimmed);
      if (versionMatch) version = versionMatch[1]!;

      const resolvedMatch = /^resolved\s+"([^"]+)"/.exec(trimmed);
      if (resolvedMatch) resolved = resolvedMatch[1]!;

      const integrityMatch = /^integrity\s+(\S+)/.exec(trimmed);
      if (integrityMatch) integrity = integrityMatch[1]!;
    }

    packages.set(name, { name, version, resolved, integrity });
  }

  return { type: 'yarn', packages };
}

/**
 * Parse pnpm-lock.yaml content.
 * Handles v5 (slash-separated), v6+ (@-separated), and v9 (quoted keys) formats.
 */
export function parsePnpmLockfile(content: string): LockfileData {
  const packages = new Map<string, LockfileEntry>();
  const lines = content.split('\n');

  let inPackagesSection = false;
  let currentName: string | undefined;
  let currentVersion: string | undefined;
  let currentIntegrity: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect packages section
    if (/^packages:/.test(trimmed)) {
      inPackagesSection = true;
      continue;
    }

    // If we hit another top-level key (non-indented, not a package entry), stop
    if (inPackagesSection && /^\S/.test(line) && trimmed.length > 0) {
      // Package entries start with /, @, or ' — anything else is a new section
      if (!trimmed.startsWith('/') && !trimmed.startsWith('@') && !trimmed.startsWith("'")) {
        // Flush last entry before leaving
        if (currentName && currentVersion && !packages.has(currentName)) {
          packages.set(currentName, {
            name: currentName,
            version: currentVersion,
            resolved: undefined,
            integrity: currentIntegrity,
          });
        }
        inPackagesSection = false;
        currentName = undefined;
        currentVersion = undefined;
        currentIntegrity = undefined;
        continue;
      }
    }

    if (!inPackagesSection) continue;

    // Try v5 scoped: /@scope/name/version: or '/@scope/name/version':
    const v5Scoped = trimmed.match(/^'?\/?(@[^/]+\/[^/]+)\/([\d][^:']*)'?:/);
    // Try v5 unscoped: /name/version: or '/name/version':
    const v5Unscoped = !v5Scoped ? trimmed.match(/^'?\/([^@/][^/]*)\/([\d][^:']*)'?:/) : null;
    // Try v6+/v9: /@scope/name@version: or /name@version: or 'name@version': or '@scope/name@version':
    const v6Match = !v5Scoped && !v5Unscoped ? trimmed.match(/^'?\/?(@[^@]+|[^@/'\s][^@]*?)@([\d][^:']*)'?:/) : null;

    const match = v5Scoped ?? v5Unscoped ?? v6Match;
    if (match) {
      // Save previous package entry
      if (currentName && currentVersion && !packages.has(currentName)) {
        packages.set(currentName, {
          name: currentName,
          version: currentVersion,
          resolved: undefined,
          integrity: currentIntegrity,
        });
      }

      currentName = match[1]!;
      currentVersion = match[2]!;
      currentIntegrity = undefined;
      continue;
    }

    // Check for integrity within a package block
    if (currentName) {
      const integrityMatch = trimmed.match(/integrity:\s*['"]?(sha[^}'"\s]+)['"]?/);
      if (integrityMatch) {
        currentIntegrity = integrityMatch[1]!;
      }
    }
  }

  // Flush the last package
  if (currentName && currentVersion && !packages.has(currentName)) {
    packages.set(currentName, {
      name: currentName,
      version: currentVersion,
      resolved: undefined,
      integrity: currentIntegrity,
    });
  }

  return { type: 'pnpm', packages };
}
