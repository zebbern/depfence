import type { ScanResult, Severity } from '../types.js';

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: '\uD83D\uDD34',
  high: '\uD83D\uDFE0',
  medium: '\uD83D\uDFE1',
  low: '\uD83D\uDD35',
  info: '\u2139\uFE0F',
};

export function formatMarkdown(result: ScanResult): string {
  const lines: string[] = [];

  lines.push('# Dependency Confusion Scan Report');
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('| --- | --- |');
  lines.push(`| ${SEVERITY_EMOJI.critical} Critical | ${result.summary.critical} |`);
  lines.push(`| ${SEVERITY_EMOJI.high} High | ${result.summary.high} |`);
  lines.push(`| ${SEVERITY_EMOJI.medium} Medium | ${result.summary.medium} |`);
  lines.push(`| ${SEVERITY_EMOJI.low} Low | ${result.summary.low} |`);
  lines.push(`| ${SEVERITY_EMOJI.info} Info | ${result.summary.info} |`);
  lines.push(`| **Total** | **${result.summary.total}** |`);
  lines.push('');

  // Context
  lines.push('## Scan Context');
  lines.push('');
  lines.push(`- Packages scanned: ${result.context.packagesScanned}`);
  lines.push(`- Scoped packages: ${result.context.scopedPackages}`);
  lines.push(`- Registries configured: ${result.context.registriesConfigured}`);
  lines.push(`- Lockfile detected: ${result.context.lockfileDetected ? 'Yes' : 'No'}`);
  lines.push('');

  if (result.findings.length === 0) {
    lines.push('## Results');
    lines.push('');
    lines.push('\u2705 No dependency confusion risks detected.');
    return lines.join('\n');
  }

  // Findings
  lines.push('## Findings');
  lines.push('');

  for (const finding of result.findings) {
    const emoji = SEVERITY_EMOJI[finding.severity];
    lines.push(`### ${emoji} ${finding.ruleId}: ${finding.title}`);
    lines.push('');
    lines.push(`**Severity:** ${finding.severity}`);
    if (finding.packageName) {
      lines.push(`**Package:** \`${finding.packageName}\``);
    }
    lines.push('');
    lines.push(finding.description);
    lines.push('');
    lines.push(`**Recommendation:** ${finding.recommendation}`);
    if (finding.evidence) {
      lines.push('');
      lines.push(`> Evidence: ${finding.evidence}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
