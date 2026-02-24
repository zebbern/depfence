import type { ProjectContext, Finding, ScanResult, ScanSummary, ScanContext, Severity } from '../types.js';
import { ALL_RULES } from './rules.js';
import { checkPublicRegistry } from './registry-checker.js';

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/**
 * Analyze a project context for dependency confusion vulnerabilities.
 */
export async function analyze(
  context: ProjectContext,
  options: {
    offline: boolean;
    severityThreshold: Severity;
    scopes?: readonly string[];
    ignorePackages?: readonly string[];
  }
): Promise<ScanResult> {
  let findings: Finding[] = [];

  // Run static rules
  for (const rule of ALL_RULES) {
    const ruleFindings = rule.run(context);
    findings.push(...ruleFindings);
  }

  // Online check: DC-008
  if (!options.offline) {
    const onlineFindings = await checkPublicRegistry(context.dependencies);
    findings.push(...onlineFindings);
  }

  // Filter by scope
  if (options.scopes && options.scopes.length > 0) {
    const scopeSet = new Set(options.scopes);
    findings = findings.filter(f => {
      // Keep findings not tied to a specific package (project-level)
      if (!f.packageName) return true;
      const scope = extractScope(f.packageName);
      return scope ? scopeSet.has(scope) : true;
    });
  }

  // Filter by ignored packages
  if (options.ignorePackages && options.ignorePackages.length > 0) {
    const ignoredSet = new Set(options.ignorePackages);
    findings = findings.filter(f => !f.packageName || !ignoredSet.has(f.packageName));
  }

  // Filter by severity threshold
  const thresholdOrder = SEVERITY_ORDER[options.severityThreshold];
  findings = findings.filter(f => SEVERITY_ORDER[f.severity] <= thresholdOrder);

  // Sort by severity (most severe first)
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  // Build summary
  const summary = buildSummary(findings);
  const scanContext = buildContext(context);

  return { findings, summary, context: scanContext };
}

function buildSummary(findings: readonly Finding[]): ScanSummary {
  return {
    total: findings.length,
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    info: findings.filter(f => f.severity === 'info').length,
  };
}

function buildContext(context: ProjectContext): ScanContext {
  const scoped = context.dependencies.filter(d => d.isScoped);
  return {
    packagesScanned: context.dependencies.length,
    scopedPackages: scoped.length,
    registriesConfigured: context.registryConfig.scopeRegistries.size + (context.registryConfig.defaultRegistry ? 1 : 0),
    lockfileDetected: context.lockfile !== undefined,
  };
}

function extractScope(packageName: string): string | undefined {
  if (packageName.startsWith('@')) {
    const slashIndex = packageName.indexOf('/');
    if (slashIndex > 0) {
      return packageName.slice(0, slashIndex);
    }
  }
  return undefined;
}
