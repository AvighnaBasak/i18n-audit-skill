#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import ora from 'ora';
import { runAudit } from './index';
import { printReport } from './reporters/terminal';
import { toJson, toGitHubActionsOutput } from './reporters/json-reporter';
import { toMarkdown } from './reporters/markdown';
import { fixOrphans } from './fixers/orphans';
import { AuditOptions } from './types';

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
);

const program = new Command();

program
  .name('i18n-audit')
  .description('The missing code quality layer for multilingual apps')
  .version(pkg.version as string)
  .option('--cwd <path>', 'Working directory to audit', process.cwd())
  .option('--locales-dir <path>', 'Path to locale files directory')
  .option('--src <path>', 'Path to source files directory')
  .option('--source-locale <locale>', 'The authoritative locale (e.g. en)', 'en')
  .option('--fallback-chain <chain>', 'Fallback locale chain (e.g. "zh-TW,zh,en")')
  .option('--threshold <percent>', 'Fail if any locale is below this coverage percent', parseFloat)
  .option('--ci', 'CI mode: output JSON + GitHub Actions summary, respect exit codes', false)
  .option('--report [path]', 'Generate a markdown report file')
  .option('--fix-orphans', 'Remove confirmed orphaned keys from locale files', false)
  .option('--dry-run', 'Preview --fix-orphans changes without writing files', false)
  .option('--skip-hardcoded', 'Skip hardcoded string detection', false)
  .option('--skip-quality', 'Skip translation quality checks', false)
  .option('--ignore <patterns>', 'Comma-separated glob patterns to ignore')
  .option('--namespace <namespaces>', 'Only audit specific namespaces (comma-separated)')
  .option('--verbose', 'Show extra detail', false)
  .addHelpText('after', `
Examples:
  $ i18n-audit                          # Audit current directory
  $ i18n-audit --source-locale en       # Specify source locale
  $ i18n-audit --threshold 95           # Fail if coverage < 95%
  $ i18n-audit --ci                     # CI mode with JSON output
  $ i18n-audit --report audit.md        # Save markdown report
  $ i18n-audit --fix-orphans --dry-run  # Preview orphan removal
  $ i18n-audit --fix-orphans            # Remove orphaned keys
  $ i18n-audit --fallback-chain "zh-TW,zh,en"  # Audit fallback chain
  `);

program.action(async (opts) => {
  const cwd = path.resolve(opts.cwd ?? process.cwd());

  const options: AuditOptions = {
    cwd,
    localesDir: opts.localesDir,
    srcDir: opts.src,
    sourceLocale: opts.sourceLocale ?? 'en',
    fallbackChain: opts.fallbackChain
      ? opts.fallbackChain.split(',').map((s: string) => s.trim())
      : undefined,
    threshold: opts.threshold,
    ci: Boolean(opts.ci),
    report: opts.report !== undefined,
    reportPath: typeof opts.report === 'string' ? opts.report : 'i18n-audit-report.md',
    fixOrphans: Boolean(opts.fixOrphans),
    dryRun: Boolean(opts.dryRun),
    ignorePatterns: opts.ignore ? opts.ignore.split(',').map((s: string) => s.trim()) : [],
    namespaces: opts.namespace ? opts.namespace.split(',').map((s: string) => s.trim()) : undefined,
    verbose: Boolean(opts.verbose),
    skipHardcoded: Boolean(opts.skipHardcoded),
    skipQuality: Boolean(opts.skipQuality),
  };

  const spinner = ora({ text: 'Scanning locale files…', color: 'cyan' });

  if (!options.ci) spinner.start();

  let result;
  try {
    spinner.text = 'Parsing locale files…';
    result = await runAudit(options);
  } catch (err) {
    spinner.fail(`Audit failed: ${String(err)}`);
    process.exit(2);
  }

  spinner.stop();

  if (options.ci) {
    // JSON to stdout
    console.log(toJson(result));

    // GitHub Actions step summary
    const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
    if (summaryPath) {
      fs.appendFileSync(summaryPath, toGitHubActionsOutput(result));
    }
  } else {
    printReport(result);
  }

  // Markdown report
  if (options.report && options.reportPath) {
    const mdContent = toMarkdown(result);
    const reportPath = path.resolve(cwd, options.reportPath);
    fs.writeFileSync(reportPath, mdContent, 'utf8');
    if (!options.ci) {
      console.log(`Report saved to: ${reportPath}`);
    }
  }

  // Fix orphans
  if (options.fixOrphans) {
    console.log();
    fixOrphans(result.coverage.orphanedKeys, result.localeFiles, options.dryRun);
  }

  process.exit(result.exitCode);
});

program.parse();
