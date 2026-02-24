import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import type { WorkspaceInfo, WorkspacePackage } from '../types.js';

/**
 * Detect if the rootDir is a monorepo workspace and discover all packages.
 * Supports npm workspaces, yarn workspaces, and pnpm workspaces.
 */
export function detectWorkspace(rootDir: string): WorkspaceInfo | undefined {
  const pkgPath = resolve(rootDir, 'package.json');
  if (!existsSync(pkgPath)) return undefined;

  const raw = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;

  // npm/yarn workspaces: "workspaces" field in package.json
  const workspaces = raw['workspaces'];
  if (workspaces) {
    const patterns = extractWorkspacePatterns(workspaces);

    if (patterns.length > 0) {
      const packages = resolveWorkspacePatterns(rootDir, patterns);
      const type = existsSync(resolve(rootDir, 'yarn.lock')) ? 'yarn' : 'npm';
      return { type, rootDir, packages };
    }
  }

  // pnpm workspaces: pnpm-workspace.yaml
  const pnpmWorkspacePath = resolve(rootDir, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWorkspacePath)) {
    const content = readFileSync(pnpmWorkspacePath, 'utf-8');
    const patterns = parsePnpmWorkspaceYaml(content);
    if (patterns.length > 0) {
      const packages = resolveWorkspacePatterns(rootDir, patterns);
      return { type: 'pnpm', rootDir, packages };
    }
  }

  return undefined;
}

/**
 * Extract workspace glob patterns from the "workspaces" field.
 * Handles both array format and `{ packages: [...] }` object format.
 */
function extractWorkspacePatterns(workspaces: unknown): string[] {
  if (Array.isArray(workspaces)) {
    return workspaces.filter((p): p is string => typeof p === 'string');
  }

  if (typeof workspaces === 'object' && workspaces !== null) {
    const obj = workspaces as Record<string, unknown>;
    if (Array.isArray(obj['packages'])) {
      return obj['packages'].filter((p): p is string => typeof p === 'string');
    }
  }

  return [];
}

/**
 * Parse pnpm-workspace.yaml to extract package patterns.
 * Handles the standard format:
 * ```
 * packages:
 *   - 'packages/*'
 *   - 'apps/*'
 * ```
 */
export function parsePnpmWorkspaceYaml(content: string): string[] {
  const patterns: string[] = [];
  const lines = content.split('\n');
  let inPackages = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'packages:') {
      inPackages = true;
      continue;
    }

    if (inPackages) {
      // Stop at next top-level key (non-whitespace start, non-empty)
      if (/^\S/.test(line) && trimmed !== '') {
        break;
      }

      // Parse list item: - 'pattern' or - "pattern" or - pattern
      const match = trimmed.match(/^-\s+['"]?([^'"]+)['"]?$/);
      if (match) {
        patterns.push(match[1]!);
      }
    }
  }

  return patterns;
}

/**
 * Resolve workspace glob patterns to actual package directories.
 * Supports patterns like "packages/*", "packages/**", and exact paths.
 */
function resolveWorkspacePatterns(rootDir: string, patterns: string[]): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    if (pattern.endsWith('/**')) {
      // Recursive: "packages/**"
      const parentDir = resolve(rootDir, pattern.slice(0, -3));
      if (existsSync(parentDir)) {
        scanPackageDirsRecursive(parentDir, rootDir, packages, seen);
      }
    } else if (pattern.endsWith('/*')) {
      // Shallow glob: "packages/*" → find all dirs in packages/
      const parentDir = resolve(rootDir, pattern.slice(0, -2));
      if (existsSync(parentDir)) {
        scanPackageDirs(parentDir, rootDir, packages, seen);
      }
    } else if (!pattern.includes('*')) {
      // Exact directory: "packages/my-lib"
      const dir = resolve(rootDir, pattern);
      addIfPackage(dir, rootDir, packages, seen);
    } else {
      // Other glob patterns: use static prefix and scan shallow
      const parts = pattern.split('/');
      const staticParts: string[] = [];
      for (const part of parts) {
        if (part.includes('*')) break;
        staticParts.push(part);
      }
      const parentDir = resolve(rootDir, ...staticParts);
      if (existsSync(parentDir)) {
        scanPackageDirs(parentDir, rootDir, packages, seen);
      }
    }
  }

  return packages;
}

/**
 * Scan a single level of directories for packages containing package.json.
 */
function scanPackageDirs(
  parentDir: string,
  rootDir: string,
  packages: WorkspacePackage[],
  seen: Set<string>,
): void {
  const entries = safeReaddir(parentDir);
  for (const entry of entries) {
    const dir = join(parentDir, entry);
    if (isDirectory(dir)) {
      addIfPackage(dir, rootDir, packages, seen);
    }
  }
}

/**
 * Recursively scan directories for packages containing package.json.
 */
function scanPackageDirsRecursive(
  parentDir: string,
  rootDir: string,
  packages: WorkspacePackage[],
  seen: Set<string>,
): void {
  const entries = safeReaddir(parentDir);
  for (const entry of entries) {
    if (entry === 'node_modules') continue;
    const dir = join(parentDir, entry);
    if (isDirectory(dir)) {
      addIfPackage(dir, rootDir, packages, seen);
      scanPackageDirsRecursive(dir, rootDir, packages, seen);
    }
  }
}

/**
 * Add a directory as a workspace package if it contains a valid package.json.
 */
function addIfPackage(
  dir: string,
  rootDir: string,
  packages: WorkspacePackage[],
  seen: Set<string>,
): void {
  const normalized = resolve(dir);
  if (seen.has(normalized)) return;

  const pkgJsonPath = join(dir, 'package.json');
  if (!existsSync(pkgJsonPath)) return;

  try {
    const raw = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
    const name = typeof raw['name'] === 'string' ? raw['name'] : relative(rootDir, dir);
    seen.add(normalized);
    packages.push({
      name,
      path: normalized,
      relativePath: relative(rootDir, normalized),
    });
  } catch {
    // Skip directories with invalid package.json
  }
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}
