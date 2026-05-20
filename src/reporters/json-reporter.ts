import { AuditResult } from '../types';

export function toJson(result: AuditResult): string {
  const output = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    exitCode: result.exitCode,
    summary: result.summary,
    framework: result.framework?.name ?? null,
    coverage: {
      perLocale: result.coverage.perLocale,
      missingKeys: result.coverage.missingKeys,
      orphanedKeys: result.coverage.orphanedKeys,
    },
    hardcoded: result.hardcoded,
    quality: result.quality,
    structural: result.structural,
    bundle: result.bundle,
    fallback: result.fallback,
  };
  return JSON.stringify(output, null, 2);
}

export function toGitHubActionsOutput(result: AuditResult): string {
  const lines: string[] = [];

  lines.push('## i18n-audit Report');
  lines.push('');

  const locales = Object.values(result.coverage.perLocale);
  lines.push('| Locale | Coverage | Missing | Orphaned |');
  lines.push('|--------|----------|---------|----------|');

  for (const locale of locales.sort((a, b) => a.percentage - b.percentage)) {
    const pctEmoji = locale.percentage === 100 ? '✅' :
      locale.percentage >= 80 ? '🟡' : '🔴';
    lines.push(
      `| ${locale.locale} | ${pctEmoji} ${locale.percentage}% | ${locale.missing} | ${locale.orphaned} |`
    );
  }

  lines.push('');

  if (result.summary.hardcodedStrings > 0) {
    lines.push(`🟠 **${result.summary.hardcodedStrings} hardcoded strings** detected in source files`);
  }
  if (result.summary.qualityIssues > 0) {
    lines.push(`🔵 **${result.summary.qualityIssues} quality issues** (copy-paste, placeholder mismatches, etc.)`);
  }
  if (result.summary.structuralIssues > 0) {
    lines.push(`🔧 **${result.summary.structuralIssues} structural issues** detected`);
  }

  return lines.join('\n');
}
