import * as fs from 'fs';
import { LocaleFile, StructuralIssue } from '../types';
import { detectNamingConvention, getKeyDepth } from '../utils/flatten';
import { findDuplicateKeys } from '../parsers/locale';

export function detectStructuralIssues(localeFiles: LocaleFile[]): StructuralIssue[] {
  const issues: StructuralIssue[] = [];

  // Parse errors
  for (const file of localeFiles) {
    if (file.parseError) {
      issues.push({
        type: 'parse_error',
        locale: file.locale,
        namespace: file.namespace,
        detail: `Failed to parse ${file.path}: ${file.parseError}`,
        severity: 'error',
      });
    }
  }

  // Duplicate keys (JSON only)
  for (const file of localeFiles) {
    if (file.path.endsWith('.json') && !file.parseError) {
      const content = fs.readFileSync(file.path, 'utf8');
      const dupes = findDuplicateKeys(content);
      for (const key of dupes) {
        issues.push({
          type: 'duplicate_key',
          locale: file.locale,
          namespace: file.namespace,
          key,
          detail: `Duplicate key "${key}" in ${file.path} — JSON parsers silently use the last value`,
          severity: 'warning',
        });
      }
    }
  }

  // Naming convention inconsistency
  const allKeys = localeFiles.flatMap(f => Object.keys(f.flat));
  const convention = detectNamingConvention(allKeys);
  if (convention === 'mixed') {
    const byConvention = groupKeysByConvention(allKeys);
    const majorityConvention = Object.entries(byConvention).sort((a, b) => b[1] - a[1])[0];
    issues.push({
      type: 'naming_convention',
      locale: 'all',
      namespace: 'all',
      detail: `Mixed key naming conventions detected. Dominant style: ${majorityConvention?.[0] ?? 'unknown'}. Consider standardizing.`,
      severity: 'info',
    });
  }

  // Key depth inconsistency across locales
  const namespaceGroups = groupByNamespace(localeFiles);
  for (const [ns, files] of Object.entries(namespaceGroups)) {
    if (files.length < 2) continue;

    const [referenceFile, ...otherFiles] = files;
    const referenceKeys = new Set(Object.keys(referenceFile.flat));

    for (const file of otherFiles) {
      const fileKeys = new Set(Object.keys(file.flat));

      // Check for keys that exist in both but at different depths
      for (const key of referenceKeys) {
        const refDepth = getKeyDepth(key);
        const matchingFlat = [...fileKeys].find(k => k === key);
        if (!matchingFlat) continue;

        const fileDepth = getKeyDepth(matchingFlat);
        if (refDepth !== fileDepth) {
          issues.push({
            type: 'depth_inconsistency',
            locale: file.locale,
            namespace: ns,
            key,
            detail: `Key "${key}" is at depth ${refDepth} in ${referenceFile.locale} but depth ${fileDepth} in ${file.locale}`,
            severity: 'warning',
          });
        }
      }

      // Flat vs nested structure mismatch
      const refIsNested = [...referenceKeys].some(k => k.includes('.'));
      const fileIsNested = [...fileKeys].some(k => k.includes('.'));
      if (refIsNested !== fileIsNested) {
        issues.push({
          type: 'flat_vs_nested',
          locale: file.locale,
          namespace: ns,
          detail: `Locale "${referenceFile.locale}" uses ${refIsNested ? 'nested' : 'flat'} keys but "${file.locale}" uses ${fileIsNested ? 'nested' : 'flat'} keys in namespace "${ns}"`,
          severity: 'warning',
        });
      }
    }
  }

  // Check for locale files that exist in some namespaces but not others
  const locales = [...new Set(localeFiles.map(f => f.locale))];
  const namespaces = [...new Set(localeFiles.map(f => f.namespace))];

  for (const ns of namespaces) {
    const localesWithNs = new Set(
      localeFiles.filter(f => f.namespace === ns).map(f => f.locale)
    );
    const missingLocales = locales.filter(l => !localesWithNs.has(l));

    for (const locale of missingLocales) {
      issues.push({
        type: 'missing_locale_file',
        locale,
        namespace: ns,
        detail: `Namespace "${ns}" has no locale file for "${locale}"`,
        severity: 'warning',
      });
    }
  }

  return issues;
}

function groupKeysByConvention(keys: string[]): Record<string, number> {
  const counts: Record<string, number> = {
    camelCase: 0,
    snake_case: 0,
    'kebab-case': 0,
    PascalCase: 0,
  };

  for (const key of keys) {
    const parts = key.split('.');
    for (const part of parts) {
      if (/^[A-Z][a-zA-Z0-9]+$/.test(part)) counts.PascalCase++;
      else if (/^[a-z][a-zA-Z0-9]*[A-Z]/.test(part)) counts.camelCase++;
      else if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(part)) counts.snake_case++;
      else if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(part)) counts['kebab-case']++;
    }
  }

  return counts;
}

function groupByNamespace(files: LocaleFile[]): Record<string, LocaleFile[]> {
  const groups: Record<string, LocaleFile[]> = {};
  for (const f of files) {
    if (!groups[f.namespace]) groups[f.namespace] = [];
    groups[f.namespace].push(f);
  }
  return groups;
}
