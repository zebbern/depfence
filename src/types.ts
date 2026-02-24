export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type PackageManager = 'npm' | 'yarn' | 'pnpm';

export interface PackageDependency {
  readonly name: string;
  readonly version: string;
  readonly scope: string | undefined;
  readonly isScoped: boolean;
  readonly isDev: boolean;
  readonly resolvedUrl: string | undefined;
  readonly integrity: string | undefined;
  readonly hasInstallScripts: boolean;
}

export interface RegistryConfig {
  readonly defaultRegistry: string | undefined;
  readonly scopeRegistries: ReadonlyMap<string, string>;
  readonly hasConfig: boolean;
}

export interface PackageJsonData {
  readonly name: string | undefined;
  readonly version: string | undefined;
  readonly isPrivate: boolean;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly hasPreinstall: boolean;
  readonly hasPostinstall: boolean;
  readonly hasInstall: boolean;
}

export interface LockfileData {
  readonly type: PackageManager;
  readonly packages: ReadonlyMap<string, LockfileEntry>;
}

export interface LockfileEntry {
  readonly name: string;
  readonly version: string;
  readonly resolved: string | undefined;
  readonly integrity: string | undefined;
  readonly hasInstallScripts?: boolean;
}

export interface ProjectContext {
  readonly rootDir: string;
  readonly packageJson: PackageJsonData;
  readonly dependencies: readonly PackageDependency[];
  readonly registryConfig: RegistryConfig;
  readonly lockfile: LockfileData | undefined;
}

export interface Finding {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly packageName: string | undefined;
  readonly recommendation: string;
  readonly evidence: string | undefined;
}

export interface ScanSummary {
  readonly total: number;
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
  readonly info: number;
}

export interface ScanContext {
  readonly packagesScanned: number;
  readonly scopedPackages: number;
  readonly registriesConfigured: number;
  readonly lockfileDetected: boolean;
}

export interface ScanResult {
  readonly findings: readonly Finding[];
  readonly summary: ScanSummary;
  readonly context: ScanContext;
}

export interface ScanConfig {
  readonly rootDir: string;
  readonly offline: boolean;
  readonly severityThreshold: Severity;
  readonly format: 'terminal' | 'json' | 'markdown';
  readonly scopes: readonly string[] | undefined;
  readonly ignorePackages: readonly string[] | undefined;
}

export interface WorkspaceInfo {
  readonly type: PackageManager;
  readonly rootDir: string;
  readonly packages: readonly WorkspacePackage[];
}

export interface WorkspacePackage {
  readonly name: string;
  readonly path: string;
  readonly relativePath: string;
}

export interface WorkspaceScanResult {
  readonly isWorkspace: boolean;
  readonly rootDir: string;
  readonly packageResults: readonly WorkspacePackageResult[];
  readonly combinedSummary: ScanSummary;
}

export interface WorkspacePackageResult {
  readonly packageName: string;
  readonly packagePath: string;
  readonly result: ScanResult;
}
