import type { Finding, PackageDependency } from '../types.js';

const NPM_REGISTRY = 'https://registry.npmjs.org';

type RegistryCheckResult = 'exists' | 'not-found' | 'error';

/**
 * Check if scoped package names exist on public npm.
 * Returns DC-008 findings for packages that exist publicly.
 * Checks are parallelized with a configurable concurrency limit.
 */
export async function checkPublicRegistry(
  dependencies: readonly PackageDependency[],
  concurrency = 5,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const scoped = dependencies.filter(dep => dep.isScoped);

  // Process in batches for concurrency control
  for (let i = 0; i < scoped.length; i += concurrency) {
    const batch = scoped.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (dep) => {
        const checkResult = await packageExistsOnPublicNpm(dep.name);
        return { dep, checkResult };
      })
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        // Safety net: Promise.allSettled should not reject, but handle gracefully
        continue;
      }

      const { dep, checkResult } = result.value;

      if (checkResult === 'exists') {
        findings.push({
          ruleId: 'DC-008',
          severity: 'high',
          title: 'Scoped package exists on public npm',
          description: `Package "${dep.name}" exists on the public npm registry. This is a direct dependency confusion attack vector if you expect this to be a private package.`,
          packageName: dep.name,
          recommendation: `Verify that the public "${dep.name}" package is the intended one, not a malicious squatter. Configure scope-specific registry in .npmrc.`,
          evidence: `Public npm URL: ${NPM_REGISTRY}/${dep.name}`,
        });
      } else if (checkResult === 'error') {
        findings.push({
          ruleId: 'DC-008',
          severity: 'low',
          title: 'Unable to check public registry',
          description: `Could not verify whether "${dep.name}" exists on the public npm registry. Network error or timeout occurred.`,
          packageName: dep.name,
          recommendation: 'Re-run with network access to complete the dependency confusion check.',
          evidence: 'Network check failed',
        });
      }
    }
  }

  return findings;
}

async function packageExistsOnPublicNpm(packageName: string): Promise<RegistryCheckResult> {
  try {
    const encodedName = encodeURIComponent(packageName).replace('%40', '@');
    const response = await fetch(`${NPM_REGISTRY}/${encodedName}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 200) return 'exists';
    if (response.status === 404) return 'not-found';
    return 'error'; // Unexpected status
  } catch {
    return 'error';
  }
}
