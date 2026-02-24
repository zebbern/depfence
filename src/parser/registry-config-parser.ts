import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RegistryConfig } from '../types.js';

/**
 * Parse registry configuration from .npmrc and .yarnrc.yml.
 */
export function parseRegistryConfig(rootDir: string): RegistryConfig {
  const npmrcConfig = parseNpmrc(rootDir);
  const yarnrcConfig = parseYarnrc(rootDir);

  // Merge: .npmrc takes precedence, then .yarnrc.yml
  const scopeRegistries = new Map<string, string>();

  // Add yarnrc scopes first, then npmrc overrides
  for (const [scope, registry] of yarnrcConfig.scopeRegistries) {
    scopeRegistries.set(scope, registry);
  }
  for (const [scope, registry] of npmrcConfig.scopeRegistries) {
    scopeRegistries.set(scope, registry);
  }

  return {
    defaultRegistry: npmrcConfig.defaultRegistry ?? yarnrcConfig.defaultRegistry,
    scopeRegistries,
    hasConfig: npmrcConfig.hasConfig || yarnrcConfig.hasConfig,
  };
}

/**
 * Parse .npmrc content from string.
 */
export function parseNpmrcContent(content: string): RegistryConfig {
  const scopeRegistries = new Map<string, string>();
  let defaultRegistry: string | undefined;

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    // Default registry: registry=https://...
    const registryMatch = /^registry\s*=\s*(.+)/.exec(trimmed);
    if (registryMatch) {
      defaultRegistry = registryMatch[1]!.trim();
      continue;
    }

    // Scoped registry: @scope:registry=https://...
    const scopeMatch = /^(@[^:]+):registry\s*=\s*(.+)/.exec(trimmed);
    if (scopeMatch) {
      scopeRegistries.set(scopeMatch[1]!, scopeMatch[2]!.trim());
    }
  }

  return {
    defaultRegistry,
    scopeRegistries,
    hasConfig: true,
  };
}

function parseNpmrc(rootDir: string): RegistryConfig {
  const npmrcPath = resolve(rootDir, '.npmrc');
  if (!existsSync(npmrcPath)) {
    return { defaultRegistry: undefined, scopeRegistries: new Map(), hasConfig: false };
  }
  return parseNpmrcContent(readFileSync(npmrcPath, 'utf-8'));
}

/**
 * Parse .yarnrc.yml content.
 * Handles npmRegistryServer appearing at any position under a scope block.
 */
export function parseYarnrcContent(content: string): RegistryConfig {
  const scopeRegistries = new Map<string, string>();
  let defaultRegistry: string | undefined;

  // npmRegistryServer: "https://..."
  const mainRegistryMatch = /npmRegistryServer:\s*"?([^"\n]+)"?/m.exec(content);
  if (mainRegistryMatch) {
    defaultRegistry = mainRegistryMatch[1]!.trim();
  }

  // Parse npmScopes section line-by-line
  const npmScopesMatch = /^npmScopes:\s*$/m.exec(content);
  if (npmScopesMatch) {
    const afterScopes = content.slice(npmScopesMatch.index + npmScopesMatch[0].length);
    const lines = afterScopes.split('\n');

    let currentScope: string | undefined;

    for (const line of lines) {
      // If we hit a non-indented, non-empty line, we've left npmScopes
      if (/^\S/.test(line) && line.trim()) break;

      // Match scope header: '  "@scope":' or '  @scope:' or "  '@scope':"
      const scopeMatch = line.match(/^\s{2}["']?(@[^"'\s:]+)["']?\s*:/);
      if (scopeMatch) {
        currentScope = scopeMatch[1]!;
        continue;
      }

      // Match npmRegistryServer within a scope (at any position under the scope)
      if (currentScope) {
        const regMatch = line.match(/^\s{4,}npmRegistryServer:\s*"?([^"\n]+)"?/);
        if (regMatch) {
          scopeRegistries.set(currentScope, regMatch[1]!.trim());
        }
      }
    }
  }

  return {
    defaultRegistry,
    scopeRegistries,
    hasConfig: true,
  };
}

function parseYarnrc(rootDir: string): RegistryConfig {
  const yarnrcPath = resolve(rootDir, '.yarnrc.yml');
  if (!existsSync(yarnrcPath)) {
    return { defaultRegistry: undefined, scopeRegistries: new Map(), hasConfig: false };
  }
  return parseYarnrcContent(readFileSync(yarnrcPath, 'utf-8'));
}
