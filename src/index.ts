import type { ScanResult, ScanConfig, PackageDependency, PackageJsonData, Finding, ScanSummary, WorkspaceScanResult, WorkspacePackageResult } from './types.js';
import { parsePackageJson } from './parser/package-json-parser.js';
import { parseLockfile } from './parser/lockfile-parser.js';
import { parseRegistryConfig } from './parser/registry-config-parser.js';
import { detectWorkspace } from './parser/workspace-parser.js';
import { analyze } from './analyzer/analyzer.js';
import { buildConfig } from './config.js';
import type { ProjectContext, LockfileData } from './types.js';

export type {
  ScanResult,
  ScanConfig,
  ScanSummary,
  ScanContext,
  Finding,
  Severity,
  PackageManager,
  PackageDependency,
  PackageJsonData,
  LockfileData,
  LockfileEntry,
  RegistryConfig,
  ProjectContext,
  WorkspaceInfo,
  WorkspacePackage,
  WorkspaceScanResult,
  WorkspacePackageResult,
} from './types.js';

export { parsePackageJson, parsePackageJsonContent } from './parser/package-json-parser.js';
export { parseLockfile, parseNpmLockfile, parseYarnLockfile, parsePnpmLockfile } from './parser/lockfile-parser.js';
export { parseRegistryConfig, parseNpmrcContent, parseYarnrcContent } from './parser/registry-config-parser.js';
export { detectWorkspace, parsePnpmWorkspaceYaml } from './parser/workspace-parser.js';
export { analyze } from './analyzer/analyzer.js';
export { ALL_RULES } from './analyzer/rules.js';
export { checkPublicRegistry } from './analyzer/registry-checker.js';
export { formatOutput } from './reporter/index.js';
export { buildConfig } from './config.js';

/**
 * Scan a project directory for dependency confusion attack vectors.
 */
export async function scanForConfusion(
  overrides: Partial<ScanConfig> = {}
): Promise<ScanResult> {
  const config = buildConfig(overrides);

  // Parse project files
  const packageJson = parsePackageJson(config.rootDir);
  const lockfile = parseLockfile(config.rootDir);
  const registryConfig = parseRegistryConfig(config.rootDir);

  // Build dependency list
  const dependencies = buildDependencies(packageJson, lockfile);

  // Build context
  const context: ProjectContext = {
    rootDir: config.rootDir,
    packageJson,
    dependencies,
    registryConfig,
    lockfile,
  };

  // Analyze
  return analyze(context, {
    offline: config.offline,
    severityThreshold: config.severityThreshold,
    scopes: config.scopes ? [...config.scopes] : undefined,
    ignorePackages: config.ignorePackages ? [...config.ignorePackages] : undefined,
  });
}

function buildDependencies(
  packageJson: PackageJsonData,
  lockfile: LockfileData | undefined
): PackageDependency[] {
  const deps: PackageDependency[] = [];

  const addDeps = (entries: Readonly<Record<string, string>>, isDev: boolean): void => {
    for (const [name, version] of Object.entries(entries)) {
      const isScoped = name.startsWith('@');
      const scope = isScoped ? name.split('/')[0] : undefined;

      const lockEntry = lockfile?.packages.get(name);

      deps.push({
        name,
        version,
        scope,
        isScoped,
        isDev,
        resolvedUrl: lockEntry?.resolved,
        integrity: lockEntry?.integrity,
        hasInstallScripts: lockEntry?.hasInstallScripts ?? false,
      });
    }
  };

  addDeps(packageJson.dependencies, false);
  addDeps(packageJson.devDependencies, true);

  return deps;
}

/**
 * Scan an entire monorepo workspace for dependency confusion vectors.
 * Returns results per workspace package plus a combined summary.
 *
 * If the target directory is not a workspace, falls back to a single-project
 * scan wrapped in the workspace result shape for uniform handling.
 */
export async function scanWorkspace(
  overrides: Partial<ScanConfig> = {}
): Promise<WorkspaceScanResult> {
  const config = buildConfig(overrides);
  const workspace = detectWorkspace(config.rootDir);

  if (!workspace) {
    // Not a workspace — scan single project and wrap in workspace result
    const result = await scanForConfusion(overrides);
    return {
      isWorkspace: false,
      rootDir: config.rootDir,
      packageResults: [{ packageName: 'root', packagePath: config.rootDir, result }],
      combinedSummary: result.summary,
    };
  }

  const packageResults: WorkspacePackageResult[] = [];
  const allFindings: Finding[] = [];

  // Scan root package.json
  try {
    const rootResult = await scanForConfusion({ ...overrides, rootDir: config.rootDir });
    packageResults.push({ packageName: 'root', packagePath: config.rootDir, result: rootResult });
    allFindings.push(...rootResult.findings);
  } catch {
    // Root may not have useful deps — skip
  }

  // Scan each workspace package
  for (const pkg of workspace.packages) {
    try {
      const result = await scanForConfusion({ ...overrides, rootDir: pkg.path });
      packageResults.push({ packageName: pkg.name, packagePath: pkg.path, result });
      allFindings.push(...result.findings);
    } catch {
      // Package might not have deps — skip
    }
  }

  // Build combined summary
  const combinedSummary: ScanSummary = {
    total: allFindings.length,
    critical: allFindings.filter(f => f.severity === 'critical').length,
    high: allFindings.filter(f => f.severity === 'high').length,
    medium: allFindings.filter(f => f.severity === 'medium').length,
    low: allFindings.filter(f => f.severity === 'low').length,
    info: allFindings.filter(f => f.severity === 'info').length,
  };

  return {
    isWorkspace: true,
    rootDir: config.rootDir,
    packageResults,
    combinedSummary,
  };
}
