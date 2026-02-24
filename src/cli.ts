#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { scanForConfusion, scanWorkspace } from './index.js';
import { formatOutput } from './reporter/index.js';
import type { Severity, WorkspaceScanResult } from './types.js';

const VALID_SEVERITIES: readonly string[] = ['critical', 'high', 'medium', 'low', 'info'];
const VALID_FORMATS: readonly string[] = ['terminal', 'json', 'markdown'];

function formatWorkspaceOutput(wsResult: WorkspaceScanResult, format: 'terminal' | 'json' | 'markdown'): string {
  if (format === 'json') {
    return JSON.stringify({
      isWorkspace: wsResult.isWorkspace,
      rootDir: wsResult.rootDir,
      packageResults: wsResult.packageResults.map(pr => ({
        packageName: pr.packageName,
        packagePath: pr.packagePath,
        ...JSON.parse(formatOutput(pr.result, 'json')),
      })),
      combinedSummary: wsResult.combinedSummary,
    }, null, 2) + '\n';
  }

  const lines: string[] = [];

  if (format === 'markdown') {
    lines.push('# Workspace Dependency Confusion Scan Report\n');
    for (const pr of wsResult.packageResults) {
      lines.push(`## Package: ${pr.packageName}\n`);
      lines.push(formatOutput(pr.result, 'markdown'));
      lines.push('');
    }
    lines.push('## Combined Summary\n');
    lines.push(`- **Total**: ${wsResult.combinedSummary.total}`);
    lines.push(`- **Critical**: ${wsResult.combinedSummary.critical}`);
    lines.push(`- **High**: ${wsResult.combinedSummary.high}`);
    lines.push(`- **Medium**: ${wsResult.combinedSummary.medium}`);
    lines.push(`- **Low**: ${wsResult.combinedSummary.low}`);
    lines.push(`- **Info**: ${wsResult.combinedSummary.info}`);
    lines.push('');
    return lines.join('\n');
  }

  // Terminal format
  lines.push(pc.bold('\nWorkspace Dependency Confusion Scan'));
  lines.push(pc.dim('\u2550'.repeat(50)));

  for (const pr of wsResult.packageResults) {
    lines.push('');
    lines.push(pc.bold(pc.cyan(`\u25B6 ${pr.packageName}`)));
    lines.push(pc.dim(`  ${pr.packagePath}`));
    lines.push(formatOutput(pr.result, 'terminal'));
  }

  lines.push(pc.dim('\u2550'.repeat(50)));
  lines.push(pc.bold('Combined Summary'));

  const parts: string[] = [];
  if (wsResult.combinedSummary.critical > 0) parts.push(pc.red(`${wsResult.combinedSummary.critical} critical`));
  if (wsResult.combinedSummary.high > 0) parts.push(pc.yellow(`${wsResult.combinedSummary.high} high`));
  if (wsResult.combinedSummary.medium > 0) parts.push(pc.cyan(`${wsResult.combinedSummary.medium} medium`));
  if (wsResult.combinedSummary.low > 0) parts.push(pc.blue(`${wsResult.combinedSummary.low} low`));
  if (wsResult.combinedSummary.info > 0) parts.push(pc.dim(`${wsResult.combinedSummary.info} info`));

  lines.push(`Total: ${wsResult.combinedSummary.total} findings across ${wsResult.packageResults.length} packages (${parts.join(', ')})`);
  lines.push('');

  return lines.join('\n');
}

const program = new Command();

program
  .name('depfence')
  .description('Detect dependency confusion attack vectors in Node.js projects')
  .version('1.0.0')
  .argument('[directory]', 'Project root directory', '.')
  .option('-f, --format <format>', 'Output format: terminal, json, markdown', 'terminal')
  .option('--severity <level>', 'Minimum severity threshold: critical, high, medium, low, info', 'info')
  .option('--online', 'Check package names against public npm registry', false)
  .option('--scopes <scopes...>', 'Only check specific scopes (e.g., @company @org)')
  .option('--ignore <packages...>', 'Ignore specific packages')
  .option('--workspace', 'Scan all workspace packages in a monorepo')
  .action(async (directory: string, options: Record<string, unknown>) => {
    try {
      const severity = options['severity'] as string;
      if (!VALID_SEVERITIES.includes(severity)) {
        throw new Error(`Invalid severity "${severity}". Valid values: ${VALID_SEVERITIES.join(', ')}`);
      }

      const format = options['format'] as string;
      if (!VALID_FORMATS.includes(format)) {
        throw new Error(`Invalid format "${format}". Valid values: ${VALID_FORMATS.join(', ')}`);
      }

      const scanConfig = {
        rootDir: directory,
        format: format as 'terminal' | 'json' | 'markdown',
        severityThreshold: severity as Severity,
        offline: !(options['online'] as boolean),
        scopes: options['scopes'] as string[] | undefined,
        ignorePackages: options['ignore'] as string[] | undefined,
      };

      if (options['workspace']) {
        const wsResult = await scanWorkspace(scanConfig);
        const output = formatWorkspaceOutput(wsResult, scanConfig.format);
        process.stdout.write(output);

        if (wsResult.combinedSummary.critical > 0) process.exit(3);
        if (wsResult.combinedSummary.high > 0) process.exit(2);
        if (wsResult.combinedSummary.medium > 0) process.exit(1);
        process.exit(0);
      }

      const result = await scanForConfusion(scanConfig);
      const output = formatOutput(result, scanConfig.format);
      process.stdout.write(output);

      // Exit code based on findings
      if (result.summary.critical > 0) process.exit(3);
      if (result.summary.high > 0) process.exit(2);
      if (result.summary.medium > 0) process.exit(1);
      process.exit(0);
    } catch (error) {
      console.error(pc.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(4);
    }
  });

program.parse();
