import type { Finding, ProjectContext, PackageDependency, Severity } from '../types.js';

interface Rule {
  readonly id: string;
  readonly severity: Severity;
  readonly title: string;
  run(context: ProjectContext): Finding[];
}

function isPublicRegistry(url: string | undefined): boolean {
  if (!url) return true; // No URL = defaults to public
  return url.includes('registry.npmjs.org') || url.includes('registry.yarnpkg.com');
}

function isVersionPinned(version: string): boolean {
  // Exact versions: 1.2.3, =1.2.3
  return /^\d+\.\d+\.\d+/.test(version) && !version.startsWith('^') && !version.startsWith('~')
    && !version.includes('>=') && !version.includes('<=') && !version.includes('>')
    && !version.includes('<') && version !== '*' && !version.includes('||');
}

function getScopedDependencies(context: ProjectContext): PackageDependency[] {
  return context.dependencies.filter(dep => dep.isScoped);
}

/**
 * DC-001: No registry configuration found and project uses scoped packages.
 */
const noRegistryConfig: Rule = {
  id: 'DC-001',
  severity: 'high',
  title: 'No registry configuration found',
  run(context) {
    const findings: Finding[] = [];
    const scoped = getScopedDependencies(context);

    if (!context.registryConfig.hasConfig && scoped.length > 0) {
      findings.push({
        ruleId: this.id,
        severity: this.severity,
        title: this.title,
        description: `No .npmrc or .yarnrc.yml found, but project uses ${scoped.length} scoped package(s). All packages resolve from the public npm registry by default.`,
        packageName: undefined,
        recommendation: 'Create an .npmrc file with scope-specific registry mappings for your private scopes.',
        evidence: `Scoped packages: ${scoped.map(d => d.name).join(', ')}`,
      });
    }

    return findings;
  },
};

/**
 * DC-002: Scoped package without a scope-specific registry mapping.
 */
const scopeWithoutRegistry: Rule = {
  id: 'DC-002',
  severity: 'critical',
  title: 'Scoped package without registry mapping',
  run(context) {
    const findings: Finding[] = [];
    if (!context.registryConfig.hasConfig) return findings; // DC-001 covers this

    const scoped = getScopedDependencies(context);

    for (const dep of scoped) {
      const scope = dep.scope!;
      const hasMapping = context.registryConfig.scopeRegistries.has(scope);
      const defaultIsPrivate = context.registryConfig.defaultRegistry
        && !isPublicRegistry(context.registryConfig.defaultRegistry);

      if (!hasMapping && !defaultIsPrivate) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          title: this.title,
          description: `Package "${dep.name}" uses scope "${scope}" but no registry mapping exists for this scope. It will be fetched from the public npm registry.`,
          packageName: dep.name,
          recommendation: `Add '${scope}:registry=https://your-private-registry.example.com/' to .npmrc`,
          evidence: `Scope: ${scope}, Version: ${dep.version}`,
        });
      }
    }

    return findings;
  },
};

/**
 * DC-003: Lockfile resolves scoped package from public registry when private registry is configured.
 */
const lockfilePublicResolution: Rule = {
  id: 'DC-003',
  severity: 'critical',
  title: 'Scoped package resolved from public registry',
  run(context) {
    const findings: Finding[] = [];
    if (!context.lockfile) return findings;

    const scoped = getScopedDependencies(context);

    for (const dep of scoped) {
      const scope = dep.scope!;
      const hasScopeRegistry = context.registryConfig.scopeRegistries.has(scope);

      if (!hasScopeRegistry) continue; // DC-002 covers this

      const lockEntry = context.lockfile.packages.get(dep.name);
      if (lockEntry?.resolved && isPublicRegistry(lockEntry.resolved)) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          title: this.title,
          description: `Package "${dep.name}" has a private registry configured for scope "${scope}", but the lockfile shows it resolved from the public npm registry.`,
          packageName: dep.name,
          recommendation: 'Delete the lockfile and node_modules, then run a fresh install to resolve from the correct registry.',
          evidence: `Resolved URL: ${lockEntry.resolved}`,
        });
      }
    }

    return findings;
  },
};

/**
 * DC-004: No lockfile found.
 */
const missingLockfile: Rule = {
  id: 'DC-004',
  severity: 'high',
  title: 'No lockfile found',
  run(context) {
    if (context.lockfile) return [];

    return [{
      ruleId: this.id,
      severity: this.severity,
      title: this.title,
      description: 'No package-lock.json, yarn.lock, or pnpm-lock.yaml found. Package resolution is non-deterministic.',
      packageName: undefined,
      recommendation: 'Run npm install (or yarn/pnpm install) and commit the lockfile to version control.',
      evidence: undefined,
    }];
  },
};

/**
 * DC-005: Lockfile entry missing integrity hash.
 */
const noIntegrityHash: Rule = {
  id: 'DC-005',
  severity: 'medium',
  title: 'Missing integrity hash in lockfile',
  run(context) {
    const findings: Finding[] = [];
    if (!context.lockfile) return findings;

    for (const dep of context.dependencies) {
      const lockEntry = context.lockfile.packages.get(dep.name);
      if (lockEntry && !lockEntry.integrity) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          title: this.title,
          description: `Package "${dep.name}" has no integrity hash in the lockfile. Package contents cannot be verified.`,
          packageName: dep.name,
          recommendation: 'Regenerate the lockfile with a recent version of npm/yarn/pnpm that includes integrity hashes.',
          evidence: undefined,
        });
      }
    }

    return findings;
  },
};

/**
 * DC-006: Package has install scripts (risk amplifier).
 */
const installScriptsRisk: Rule = {
  id: 'DC-006',
  severity: 'medium',
  title: 'Install scripts detected',
  run(context) {
    const findings: Finding[] = [];

    // Check project's own install scripts
    if (context.packageJson.hasPreinstall || context.packageJson.hasPostinstall || context.packageJson.hasInstall) {
      findings.push({
        ruleId: this.id,
        severity: this.severity,
        title: this.title,
        description: 'This project\'s package.json contains install lifecycle scripts that execute during npm install.',
        packageName: context.packageJson.name,
        recommendation: 'Review install scripts for unexpected behavior. Consider using --ignore-scripts for CI.',
        evidence: [
          context.packageJson.hasPreinstall && 'preinstall',
          context.packageJson.hasInstall && 'install',
          context.packageJson.hasPostinstall && 'postinstall',
        ].filter(Boolean).join(', '),
      });
    }

    // Check dependencies with install scripts (especially risky for scoped packages)
    for (const dep of context.dependencies) {
      if (dep.hasInstallScripts && dep.isScoped) {
        findings.push({
          ruleId: this.id,
          severity: 'high',
          title: 'Scoped dependency has install scripts',
          description: `Scoped package "${dep.name}" has install lifecycle scripts that execute during npm install. Combined with dependency confusion, this is a code execution vector.`,
          packageName: dep.name,
          recommendation: `Verify "${dep.name}" is from your private registry. Consider using --ignore-scripts or npm audit signatures.`,
          evidence: 'hasInstallScripts: true in lockfile',
        });
      }
    }

    return findings;
  },
};

/**
 * DC-007: Scoped package with unpinned version range.
 */
const unpinnedScopedVersion: Rule = {
  id: 'DC-007',
  severity: 'medium',
  title: 'Unpinned version on scoped package',
  run(context) {
    const findings: Finding[] = [];
    const scoped = getScopedDependencies(context);

    for (const dep of scoped) {
      if (!isVersionPinned(dep.version)) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          title: this.title,
          description: `Scoped package "${dep.name}" uses version range "${dep.version}". A higher version from the public registry could be pulled.`,
          packageName: dep.name,
          recommendation: `Pin to an exact version: "${dep.name}": "${dep.version.replace(/^[\^~]/, '')}"`,
          evidence: `Version: ${dep.version}`,
        });
      }
    }

    return findings;
  },
};

/**
 * DC-009: Mixed registries for packages in the same scope.
 */
const mixedScopeRegistries: Rule = {
  id: 'DC-009',
  severity: 'high',
  title: 'Mixed registries for same scope',
  run(context) {
    const findings: Finding[] = [];
    if (!context.lockfile) return findings;

    // Group scoped packages by scope and check their resolved registries
    const scopeRegistryMap = new Map<string, Set<string>>();
    const scopePackages = new Map<string, string[]>();

    for (const dep of context.dependencies) {
      if (!dep.isScoped || !dep.scope) continue;

      const lockEntry = context.lockfile.packages.get(dep.name);
      if (!lockEntry?.resolved) continue;

      const registryHost = extractRegistryHost(lockEntry.resolved);
      if (!registryHost) continue;

      if (!scopeRegistryMap.has(dep.scope)) {
        scopeRegistryMap.set(dep.scope, new Set());
        scopePackages.set(dep.scope, []);
      }
      scopeRegistryMap.get(dep.scope)!.add(registryHost);
      scopePackages.get(dep.scope)!.push(dep.name);
    }

    for (const [scope, registries] of scopeRegistryMap) {
      if (registries.size > 1) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          title: this.title,
          description: `Packages in scope "${scope}" resolve from ${registries.size} different registries. This could indicate a partial compromise.`,
          packageName: undefined,
          recommendation: `Ensure all packages in scope "${scope}" resolve from the same private registry.`,
          evidence: `Registries: ${[...registries].join(', ')}; Packages: ${scopePackages.get(scope)!.join(', ')}`,
        });
      }
    }

    return findings;
  },
};

/**
 * DC-010: Private registry configured (informational — positive signal).
 */
const privateRegistryConfigured: Rule = {
  id: 'DC-010',
  severity: 'info',
  title: 'Private registry configured',
  run(context) {
    const findings: Finding[] = [];

    if (context.registryConfig.defaultRegistry && !isPublicRegistry(context.registryConfig.defaultRegistry)) {
      findings.push({
        ruleId: this.id,
        severity: this.severity,
        title: this.title,
        description: `Default registry is set to a private registry: ${context.registryConfig.defaultRegistry}`,
        packageName: undefined,
        recommendation: 'This is a good practice. Ensure scope-specific mappings are also configured for completeness.',
        evidence: `Registry: ${context.registryConfig.defaultRegistry}`,
      });
    }

    for (const [scope, registry] of context.registryConfig.scopeRegistries) {
      if (!isPublicRegistry(registry)) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          title: `Private registry configured for ${scope}`,
          description: `Scope "${scope}" is mapped to private registry: ${registry}`,
          packageName: undefined,
          recommendation: 'Good configuration. Verify it matches your organization\'s private registry.',
          evidence: `Scope: ${scope}, Registry: ${registry}`,
        });
      }
    }

    return findings;
  },
};

function extractRegistryHost(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return undefined;
  }
}

export const ALL_RULES: readonly Rule[] = [
  noRegistryConfig,
  scopeWithoutRegistry,
  lockfilePublicResolution,
  missingLockfile,
  noIntegrityHash,
  installScriptsRisk,
  unpinnedScopedVersion,
  mixedScopeRegistries,
  privateRegistryConfigured,
];

export type { Rule };
