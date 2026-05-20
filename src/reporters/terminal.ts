import chalk from 'chalk';
import { AuditResult, LocaleCoverage } from '../types';
import { formatBytes } from '../detectors/bundle';

const SEVERITY_COLOR = {
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
};

const SEVERITY_ICON = {
  error: '🔴',
  warning: '🟡',
  info: '🔵',
};

export function printReport(result: AuditResult): void {
  const { coverage, hardcoded, quality, structural, bundle, fallback, framework, options } = result;

  printHeader(result);
  printCoverageTable(coverage.perLocale, options.sourceLocale);

  if (coverage.missingKeys.length > 0) {
    printSection('Missing Keys', '🔴');
    const grouped: Record<string, typeof coverage.missingKeys[0][]> = {};
    for (const mk of coverage.missingKeys) {
      const k = mk.namespace === 'default' ? 'default' : mk.namespace;
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(mk);
    }
    for (const [ns, keys] of Object.entries(grouped)) {
      // Group by locale to detect entire missing namespaces
      const localeGroups: Record<string, string[]> = {};
      for (const mk of keys) {
        for (const locale of mk.locales) {
          if (!localeGroups[locale]) localeGroups[locale] = [];
          localeGroups[locale].push(mk.key);
        }
      }
      // Check if a locale has ALL keys missing (= entire namespace absent)
      const totalKeysInNs = keys.length;
      const entirelyMissingLocales = Object.entries(localeGroups)
        .filter(([, missing]) => missing.length === totalKeysInNs)
        .map(([locale]) => locale);
      const partialLocales = Object.entries(localeGroups)
        .filter(([, missing]) => missing.length < totalKeysInNs);

      console.log(chalk.dim(`  [${ns}]`));

      if (entirelyMissingLocales.length > 0) {
        console.log(
          `    ${chalk.red('✗')} Entire namespace missing for: ${chalk.red(entirelyMissingLocales.join(', '))} ${chalk.dim(`(${totalKeysInNs} keys)`)}`
        );
      }

      for (const [locale, missingKeys] of partialLocales) {
        const nsKeys = keys.filter(mk => mk.locales.includes(locale));
        for (const mk of nsKeys.slice(0, 15)) {
          const usedAt = mk.usedAt[0] ? chalk.dim(` — ${shorten(mk.usedAt[0].file)}:${mk.usedAt[0].line}`) : '';
          console.log(`    ${chalk.yellow(mk.key)} missing in [${chalk.red(locale)}]${usedAt}`);
        }
        if (nsKeys.length > 15) {
          console.log(chalk.dim(`    ... and ${nsKeys.length - 15} more in [${locale}]`));
        }
      }
    }
  }

  if (coverage.orphanedKeys.length > 0) {
    printSection('Orphaned Keys (dead translations)', '🟡');
    const grouped: Record<string, typeof coverage.orphanedKeys> = {};
    for (const ok of coverage.orphanedKeys) {
      const k = `${ok.locale}/${ok.namespace}`;
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(ok);
    }
    for (const [group, keys] of Object.entries(grouped)) {
      const totalBytes = keys.reduce((s, k) => s + k.sizeBytes, 0);
      console.log(chalk.dim(`  [${group}] ${chalk.yellow(`${keys.length} orphaned`)} — ${formatBytes(totalBytes)} wasted`));
      for (const ok of keys.slice(0, 10)) {
        console.log(`    ${chalk.dim(ok.key)} = ${chalk.dim(truncate(ok.value, 50))}`);
      }
      if (keys.length > 10) console.log(chalk.dim(`    ... and ${keys.length - 10} more`));
    }
  }

  if (hardcoded.length > 0) {
    printSection('Hardcoded Strings', '🟠');
    const highCount = hardcoded.filter(h => h.confidence === 'HIGH').length;
    const medCount = hardcoded.filter(h => h.confidence === 'MEDIUM').length;
    const lowCount = hardcoded.filter(h => h.confidence === 'LOW').length;

    console.log(
      `  ${chalk.red(`HIGH: ${highCount}`)}  ${chalk.yellow(`MEDIUM: ${medCount}`)}  ${chalk.dim(`LOW: ${lowCount}`)}`
    );
    console.log();

    const byFile: Record<string, typeof hardcoded> = {};
    for (const h of hardcoded) {
      if (!byFile[h.file]) byFile[h.file] = [];
      byFile[h.file].push(h);
    }

    const sorted = Object.entries(byFile)
      .sort(([, a], [, b]) => {
        const aMax = Math.min(...a.map(h => ['HIGH', 'MEDIUM', 'LOW'].indexOf(h.confidence)));
        const bMax = Math.min(...b.map(h => ['HIGH', 'MEDIUM', 'LOW'].indexOf(h.confidence)));
        return aMax - bMax;
      });

    for (const [file, findings] of sorted.slice(0, 15)) {
      console.log(`  ${chalk.cyan(shorten(file))}`);
      for (const h of findings.slice(0, 5)) {
        const conf = h.confidence === 'HIGH' ? chalk.red(h.confidence) :
          h.confidence === 'MEDIUM' ? chalk.yellow(h.confidence) : chalk.dim(h.confidence);
        console.log(`    ${chalk.dim(`L${h.line}`)} [${conf}] ${chalk.white(truncate(h.text, 60))}`);
        console.log(`           ${chalk.dim(h.reason)}`);
      }
      if (findings.length > 5) console.log(chalk.dim(`    ... and ${findings.length - 5} more in this file`));
    }
    if (sorted.length > 15) {
      console.log(chalk.dim(`  ... and ${sorted.length - 15} more files`));
    }
  }

  if (quality.length > 0) {
    printSection('Translation Quality Issues', '🔵');
    const errors = quality.filter(q => q.severity === 'error');
    const warnings = quality.filter(q => q.severity === 'warning');

    for (const issue of [...errors, ...warnings].slice(0, 25)) {
      const icon = issue.severity === 'error' ? chalk.red('ERR') : chalk.yellow('WRN');
      const type = issue.type.replace(/_/g, ' ');
      console.log(`  [${icon}] ${chalk.bold(`${issue.locale}`)} › ${chalk.cyan(issue.key)} — ${chalk.dim(type)}`);
      console.log(`        ${chalk.dim(issue.detail)}`);
      if (issue.sourceValue && issue.targetValue) {
        console.log(`        ${chalk.green(`${issue.sourceLocale}:`)} ${truncate(issue.sourceValue, 60)}`);
        console.log(`        ${chalk.red(`${issue.locale}:`)} ${truncate(issue.targetValue, 60)}`);
      }
    }
    if (quality.length > 25) {
      console.log(chalk.dim(`  ... and ${quality.length - 25} more quality issues`));
    }
  }

  if (structural.length > 0) {
    printSection('Structural Issues', '🔧');
    for (const issue of structural) {
      const color = SEVERITY_COLOR[issue.severity];
      const icon = SEVERITY_ICON[issue.severity];
      console.log(`  ${icon} ${color(`[${issue.locale}/${issue.namespace}]`)} ${issue.detail}`);
    }
  }

  if (bundle.length > 0) {
    printSection('Bundle Impact', '📦');
    const withOrphans = bundle.filter(b => b.orphanedBytes > 0);
    if (withOrphans.length > 0) {
      console.log(`  ${chalk.bold('Savings available from orphaned key removal:')}`);
      for (const b of withOrphans.sort((a, c) => c.orphanedBytes - a.orphanedBytes)) {
        const bar = buildBar(b.orphanedPercent, 20);
        console.log(
          `  ${chalk.cyan(`${b.locale}/${b.namespace}`).padEnd(30)} ${bar} ${chalk.yellow(formatBytes(b.orphanedBytes))} (${b.orphanedPercent}% dead)`
        );
      }
    }
    const withRecs = bundle.filter(b => b.recommendation && b.orphanedBytes === 0);
    if (withRecs.length > 0) {
      console.log();
      for (const b of withRecs) {
        console.log(`  ${chalk.dim('ℹ')} ${chalk.cyan(`${b.locale}/${b.namespace}`)} — ${b.recommendation}`);
      }
    }
  }

  if (fallback && fallback.issues.length > 0) {
    printSection('Fallback Chain Issues', '⛓');
    console.log(`  Chain: ${chalk.cyan(fallback.chain.join(' → '))}`);
    for (const issue of fallback.issues) {
      const icon = issue.type === 'circular' ? '🔄' : issue.type === 'broken_chain' ? '💥' : '❗';
      console.log(`  ${icon} ${issue.detail}`);
    }
  }

  if (framework?.misconfigurations.length) {
    printSection('Framework Misconfigurations', '⚙️');
    for (const mc of framework.misconfigurations) {
      console.log(`  ${chalk.red('✗')} ${mc}`);
    }
  }

  printSummary(result);
}

function printHeader(result: AuditResult): void {
  console.log();
  console.log(chalk.bold.white('━'.repeat(60)));
  console.log(chalk.bold.white('  i18n-audit') + chalk.dim(' — internationalization quality report'));
  if (result.framework) {
    console.log(chalk.dim(`  Framework: ${result.framework.name}${result.framework.version ? ` ${result.framework.version}` : ''}`));
  }
  console.log(chalk.bold.white('━'.repeat(60)));
  console.log();
}

function printCoverageTable(perLocale: Record<string, LocaleCoverage>, sourceLocale: string): void {
  printSection('Coverage', '📊');

  const entries = Object.values(perLocale).sort((a, b) => a.percentage - b.percentage);
  const longestLocale = Math.max(...entries.map(e => e.locale.length), 6);

  console.log(
    `  ${'Locale'.padEnd(longestLocale + 2)} ${'Coverage'.padEnd(10)} ${'Progress'.padEnd(22)} ${'Missing'.padEnd(8)} ${'Orphaned'}`
  );
  console.log(`  ${'─'.repeat(longestLocale + 2)} ${'─'.repeat(10)} ${'─'.repeat(22)} ${'─'.repeat(8)} ${'─'.repeat(8)}`);

  for (const entry of entries) {
    const isSource = entry.locale === sourceLocale;
    const pct = entry.percentage;
    const bar = buildBar(pct, 20);
    const pctStr = `${pct}%`.padStart(4);
    const colorPct = pct === 100 ? chalk.green(pctStr) : pct >= 80 ? chalk.yellow(pctStr) : chalk.red(pctStr);
    const localeName = isSource ? chalk.bold.cyan(entry.locale.padEnd(longestLocale + 2)) : entry.locale.padEnd(longestLocale + 2);

    console.log(
      `  ${localeName} ${colorPct.padEnd(10)} ${bar} ${String(entry.missing).padEnd(8)} ${entry.orphaned}`
    );
  }
  console.log();
}

function buildBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const filledStr = '█'.repeat(filled);
  const emptyStr = '░'.repeat(empty);
  const color = percent === 100 ? chalk.green : percent >= 80 ? chalk.yellow : chalk.red;
  return `[${color(filledStr)}${chalk.dim(emptyStr)}]`;
}

function printSection(title: string, icon: string): void {
  console.log(chalk.bold(`${icon}  ${title}`));
  console.log(chalk.dim('─'.repeat(60)));
}

function printSummary(result: AuditResult): void {
  const { summary, exitCode } = result;
  console.log();
  console.log(chalk.bold.white('━'.repeat(60)));
  console.log(chalk.bold('  Summary'));
  console.log(chalk.bold.white('━'.repeat(60)));

  const lines = [
    [`Locales audited`, String(summary.totalLocales)],
    [`Total keys (source)`, String(summary.totalKeys)],
    [`Missing keys`, summary.missingKeys > 0 ? chalk.red(String(summary.missingKeys)) : chalk.green('0')],
    [`Orphaned keys`, summary.orphanedKeys > 0 ? chalk.yellow(String(summary.orphanedKeys)) : chalk.green('0')],
    [`Hardcoded strings`, summary.hardcodedStrings > 0 ? chalk.red(String(summary.hardcodedStrings)) : chalk.green('0')],
    [`Quality issues`, summary.qualityIssues > 0 ? chalk.yellow(String(summary.qualityIssues)) : chalk.green('0')],
    [`Structural issues`, summary.structuralIssues > 0 ? chalk.yellow(String(summary.structuralIssues)) : chalk.green('0')],
    [`Lowest coverage`, `${summary.lowestCoverageLocale}: ${summary.lowestCoverage < 80 ? chalk.red(`${summary.lowestCoverage}%`) : chalk.yellow(`${summary.lowestCoverage}%`)}`],
  ];

  for (const [label, value] of lines) {
    console.log(`  ${chalk.dim(label.padEnd(25))} ${value}`);
  }

  console.log();
  const exitLabel = exitCode === 0 ? chalk.green.bold('✓ PASS') :
    exitCode === 1 ? chalk.yellow.bold('⚠ WARNINGS') : chalk.red.bold('✗ FAIL');
  console.log(`  Exit code: ${exitCode}  ${exitLabel}`);
  console.log();
}

function shorten(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  if (parts.length <= 3) return filePath;
  return `.../${parts.slice(-3).join('/')}`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}
