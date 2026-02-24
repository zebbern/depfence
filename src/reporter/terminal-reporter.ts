import pc from 'picocolors';
import type { ScanResult, Finding, Severity } from '../types.js';

const SEVERITY_COLORS: Record<Severity, (s: string) => string> = {
  critical: pc.red,
  high: pc.yellow,
  medium: pc.cyan,
  low: pc.blue,
  info: pc.dim,
};

const SEVERITY_ICONS: Record<Severity, string> = {
  critical: '\u2717',
  high: '\u26A0',
  medium: '\u25CF',
  low: '\u25CB',
  info: '\u2139',
};

export function formatTerminal(result: ScanResult): string {
  const lines: string[] = [];

  lines.push(pc.bold('\nDependency Confusion Scan Results'));
  lines.push(pc.dim('\u2500'.repeat(50)));

  if (result.findings.length === 0) {
    lines.push(pc.green('\n\u2713 No dependency confusion risks detected.\n'));
    return lines.join('\n');
  }

  // Group by severity
  const grouped = groupBySeverity(result.findings);

  for (const severity of ['critical', 'high', 'medium', 'low', 'info'] as Severity[]) {
    const findings = grouped.get(severity);
    if (!findings || findings.length === 0) continue;

    const color = SEVERITY_COLORS[severity];
    const icon = SEVERITY_ICONS[severity];

    lines.push('');
    lines.push(color(pc.bold(`${icon} ${severity.toUpperCase()} (${findings.length})`)));

    for (const finding of findings) {
      lines.push(`  ${color(`[${finding.ruleId}]`)} ${finding.title}`);
      if (finding.packageName) {
        lines.push(`    ${pc.dim('Package:')} ${finding.packageName}`);
      }
      lines.push(`    ${pc.dim(finding.description)}`);
      lines.push(`    ${pc.green('Fix:')} ${finding.recommendation}`);
      if (finding.evidence) {
        lines.push(`    ${pc.dim('Evidence:')} ${finding.evidence}`);
      }
    }
  }

  lines.push('');
  lines.push(pc.dim('\u2500'.repeat(50)));
  lines.push(formatSummaryLine(result));
  lines.push(pc.dim(`Scanned: ${result.context.packagesScanned} packages (${result.context.scopedPackages} scoped)`));
  lines.push('');

  return lines.join('\n');
}

function formatSummaryLine(result: ScanResult): string {
  const parts: string[] = [];
  if (result.summary.critical > 0) parts.push(pc.red(`${result.summary.critical} critical`));
  if (result.summary.high > 0) parts.push(pc.yellow(`${result.summary.high} high`));
  if (result.summary.medium > 0) parts.push(pc.cyan(`${result.summary.medium} medium`));
  if (result.summary.low > 0) parts.push(pc.blue(`${result.summary.low} low`));
  if (result.summary.info > 0) parts.push(pc.dim(`${result.summary.info} info`));
  return `Total: ${result.summary.total} findings (${parts.join(', ')})`;
}

function groupBySeverity(findings: readonly Finding[]): Map<Severity, Finding[]> {
  const groups = new Map<Severity, Finding[]>();
  for (const finding of findings) {
    if (!groups.has(finding.severity)) {
      groups.set(finding.severity, []);
    }
    groups.get(finding.severity)!.push(finding);
  }
  return groups;
}
