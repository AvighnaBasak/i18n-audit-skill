import { AuditResult } from '../types';
import { formatBytes } from '../detectors/bundle';

export function toMarkdown(result: AuditResult): string {
  const lines: string[] = [];
  const ts = new Date().toISOString().slice(0, 10);

  lines.push(`# i18n Audit Report`);
  lines.push(`> Generated ${ts} by [i18n-audit](https://github.com/AvighnaBasak/i18n-audit-skill)`);
  lines.push('');

  if (result.framework) {
    lines.push(`**Framework detected:** \`${result.framework.name}\``);
    lines.push('');
  }

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Locales audited | ${result.summary.totalLocales} |`);
  lines.push(`| Total source keys | ${result.summary.totalKeys} |`);
  lines.push(`| Missing keys | ${result.summary.missingKeys === 0 ? '✅ 0' : `❌ ${result.summary.missingKeys}`} |`);
  lines.push(`| Orphaned keys | ${result.summary.orphanedKeys === 0 ? '✅ 0' : `⚠️ ${result.summary.orphanedKeys}`} |`);
  lines.push(`| Hardcoded strings | ${result.summary.hardcodedStrings === 0 ? '✅ 0' : `🟠 ${result.summary.hardcodedStrings}`} |`);
  lines.push(`| Quality issues | ${result.summary.qualityIssues === 0 ? '✅ 0' : `⚠️ ${result.summary.qualityIssues}`} |`);
  lines.push(`| Structural issues | ${result.summary.structuralIssues === 0 ? '✅ 0' : `⚠️ ${result.summary.structuralIssues}`} |`);
  lines.push(`| Lowest coverage | ${result.summary.lowestCoverageLocale}: ${result.summary.lowestCoverage}% |`);
  lines.push('');

  // Coverage table
  lines.push('## Coverage by Locale');
  lines.push('');
  lines.push('| Locale | Coverage | Missing | Orphaned | Status |');
  lines.push('|--------|----------|---------|----------|--------|');

  for (const entry of Object.values(result.coverage.perLocale).sort((a, b) => a.percentage - b.percentage)) {
    const status = entry.percentage === 100 ? '✅ Complete' :
      entry.percentage >= 80 ? '🟡 Partial' : '🔴 Incomplete';
    const isSource = entry.locale === result.options.sourceLocale;
    const localeName = isSource ? `**${entry.locale}** _(source)_` : entry.locale;
    lines.push(`| ${localeName} | ${entry.percentage}% | ${entry.missing} | ${entry.orphaned} | ${status} |`);
  }
  lines.push('');

  // Missing keys
  if (result.coverage.missingKeys.length > 0) {
    lines.push('## Missing Keys');
    lines.push('');
    lines.push('Keys used in source code but absent from one or more locale files.');
    lines.push('');

    const byNs: Record<string, typeof result.coverage.missingKeys> = {};
    for (const mk of result.coverage.missingKeys) {
      if (!byNs[mk.namespace]) byNs[mk.namespace] = [];
      byNs[mk.namespace].push(mk);
    }

    for (const [ns, keys] of Object.entries(byNs)) {
      lines.push(`### Namespace: \`${ns}\``);
      lines.push('');
      lines.push('| Key | Missing From | First Used At |');
      lines.push('|-----|-------------|----------------|');
      for (const mk of keys) {
        const usedAt = mk.usedAt[0] ? `\`${shorten(mk.usedAt[0].file)}:${mk.usedAt[0].line}\`` : '—';
        lines.push(`| \`${mk.key}\` | ${mk.locales.join(', ')} | ${usedAt} |`);
      }
      lines.push('');
    }
  }

  // Orphaned keys
  if (result.coverage.orphanedKeys.length > 0) {
    lines.push('## Orphaned Keys');
    lines.push('');
    lines.push('Keys defined in locale files but never referenced in source code.');
    lines.push('');

    const byLocale: Record<string, typeof result.coverage.orphanedKeys> = {};
    for (const ok of result.coverage.orphanedKeys) {
      if (!byLocale[ok.locale]) byLocale[ok.locale] = [];
      byLocale[ok.locale].push(ok);
    }

    for (const [locale, keys] of Object.entries(byLocale)) {
      const totalBytes = keys.reduce((s, k) => s + k.sizeBytes, 0);
      lines.push(`### ${locale} (${keys.length} keys, ${formatBytes(totalBytes)} wasted)`);
      lines.push('');
      lines.push('| Key | Namespace | Value (truncated) |');
      lines.push('|-----|-----------|-------------------|');
      for (const ok of keys.slice(0, 30)) {
        lines.push(`| \`${ok.key}\` | ${ok.namespace} | ${truncate(ok.value, 60)} |`);
      }
      if (keys.length > 30) lines.push(`| _...and ${keys.length - 30} more_ | | |`);
      lines.push('');
    }
  }

  // Hardcoded strings
  if (result.hardcoded.length > 0) {
    lines.push('## Hardcoded Strings');
    lines.push('');
    lines.push('User-facing strings found in source code that are not wrapped in translation functions.');
    lines.push('');

    const byFile: Record<string, typeof result.hardcoded> = {};
    for (const h of result.hardcoded) {
      if (!byFile[h.file]) byFile[h.file] = [];
      byFile[h.file].push(h);
    }

    for (const [file, findings] of Object.entries(byFile)) {
      lines.push(`### \`${shorten(file)}\``);
      lines.push('');
      lines.push('| Line | Confidence | Text | Reason |');
      lines.push('|------|------------|------|--------|');
      for (const h of findings) {
        lines.push(`| ${h.line} | ${h.confidence} | ${truncate(h.text, 50)} | ${h.reason} |`);
      }
      lines.push('');
    }
  }

  // Quality issues
  if (result.quality.length > 0) {
    lines.push('## Translation Quality Issues');
    lines.push('');

    const types = [...new Set(result.quality.map(q => q.type))];
    for (const type of types) {
      const typeIssues = result.quality.filter(q => q.type === type);
      const label = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      lines.push(`### ${label} (${typeIssues.length})`);
      lines.push('');
      lines.push('| Locale | Key | Issue |');
      lines.push('|--------|-----|-------|');
      for (const q of typeIssues.slice(0, 20)) {
        lines.push(`| ${q.locale} | \`${q.key}\` | ${q.detail} |`);
      }
      if (typeIssues.length > 20) lines.push(`| _...and ${typeIssues.length - 20} more_ | | |`);
      lines.push('');
    }
  }

  // Structural issues
  if (result.structural.length > 0) {
    lines.push('## Structural Issues');
    lines.push('');
    lines.push('| Severity | Type | Detail |');
    lines.push('|----------|------|--------|');
    for (const s of result.structural) {
      const icon = s.severity === 'error' ? '🔴' : s.severity === 'warning' ? '🟡' : '🔵';
      lines.push(`| ${icon} ${s.severity} | ${s.type.replace(/_/g, ' ')} | ${s.detail} |`);
    }
    lines.push('');
  }

  // Bundle impact
  if (result.bundle.length > 0) {
    const withSavings = result.bundle.filter(b => b.orphanedBytes > 0);
    if (withSavings.length > 0) {
      lines.push('## Bundle Impact');
      lines.push('');
      const totalSavings = withSavings.reduce((s, b) => s + b.orphanedBytes, 0);
      lines.push(`Total potential savings: **${formatBytes(totalSavings)}**`);
      lines.push('');
      lines.push('| Locale | Namespace | Orphaned Keys | Wasted Space | % of File |');
      lines.push('|--------|-----------|--------------|-------------|-----------|');
      for (const b of withSavings.sort((a, c) => c.orphanedBytes - a.orphanedBytes)) {
        lines.push(`| ${b.locale} | ${b.namespace} | ${b.orphanedKeys} | ${formatBytes(b.orphanedBytes)} | ${b.orphanedPercent}% |`);
      }
      lines.push('');
    }
  }

  // Fallback chain
  if (result.fallback && result.fallback.issues.length > 0) {
    lines.push('## Fallback Chain Issues');
    lines.push('');
    lines.push(`Chain: \`${result.fallback.chain.join(' → ')}\``);
    lines.push('');
    for (const issue of result.fallback.issues) {
      const icon = issue.type === 'circular' ? '🔄' : issue.type === 'broken_chain' ? '💥' : '❗';
      lines.push(`- ${icon} ${issue.detail}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function shorten(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts.length <= 3 ? filePath : `.../${parts.slice(-3).join('/')}`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max)}…` : str;
}
