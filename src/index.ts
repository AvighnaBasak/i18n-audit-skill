import { AuditOptions, AuditResult, AuditSummary } from './types';
import { discoverLocaleFiles } from './parsers/locale';
import { discoverSourceFiles, extractUsedKeys } from './parsers/source';
import { detectCoverage } from './detectors/coverage';
import { detectHardcoded } from './detectors/hardcoded';
import { detectQualityIssues } from './detectors/quality';
import { detectStructuralIssues } from './detectors/structural';
import { analyzeBundleImpact } from './detectors/bundle';
import { auditFallbackChain } from './detectors/fallback';
import { detectFramework } from './frameworks/detect';

export async function runAudit(options: AuditOptions): Promise<AuditResult> {
  const framework = detectFramework(options.cwd);

  // 1. Discover and parse locale files
  const localeFiles = await discoverLocaleFiles(options.cwd, options.localesDir);

  if (localeFiles.length === 0) {
    throw new Error(
      'No locale files found. Use --locales-dir to specify the directory, or check that your locale files are in a standard location (locales/, i18n/, messages/, etc.)'
    );
  }

  // 2. Discover source files and extract used keys
  const sourceFiles = await discoverSourceFiles(
    options.cwd,
    options.srcDir,
    options.ignorePatterns
  );

  const usedKeys = sourceFiles.flatMap(file => {
    try {
      return extractUsedKeys(file, framework);
    } catch {
      return [];
    }
  });

  // 3. Run all detectors
  const coverage = detectCoverage(localeFiles, usedKeys, options.sourceLocale);

  const hardcoded = options.skipHardcoded
    ? []
    : sourceFiles.flatMap(file => {
        try {
          return detectHardcoded(file);
        } catch {
          return [];
        }
      });

  const quality = options.skipQuality
    ? []
    : detectQualityIssues(localeFiles, options.sourceLocale);

  const structural = detectStructuralIssues(localeFiles);

  const bundle = analyzeBundleImpact(localeFiles, coverage.orphanedKeys);

  const fallback =
    options.fallbackChain && options.fallbackChain.length > 0
      ? auditFallbackChain(localeFiles, options.fallbackChain)
      : null;

  // 4. Compute summary and exit code
  const perLocale = Object.values(coverage.perLocale);
  const lowestEntry = perLocale.reduce(
    (min, entry) => (entry.percentage < min.percentage ? entry : min),
    perLocale[0] ?? { locale: 'none', percentage: 100 }
  );

  const summary: AuditSummary = {
    totalLocales: perLocale.length,
    totalKeys: coverage.usedKeys.length,
    missingKeys: coverage.missingKeys.reduce((s, mk) => s + mk.locales.length, 0),
    orphanedKeys: coverage.orphanedKeys.length,
    hardcodedStrings: hardcoded.length,
    qualityIssues: quality.length,
    structuralIssues: structural.filter(s => s.severity !== 'info').length,
    lowestCoverage: lowestEntry.percentage,
    lowestCoverageLocale: lowestEntry.locale,
  };

  const exitCode = computeExitCode(summary, options);

  return {
    options,
    localeFiles,
    framework,
    coverage,
    hardcoded,
    quality,
    structural,
    bundle,
    fallback,
    summary,
    exitCode,
  };
}

function computeExitCode(
  summary: AuditSummary,
  options: AuditOptions
): 0 | 1 | 2 {
  if (summary.missingKeys > 0) return 2;

  if (options.threshold !== undefined && summary.lowestCoverage < options.threshold) return 2;

  if (
    summary.orphanedKeys > 0 ||
    summary.hardcodedStrings > 0 ||
    summary.qualityIssues > 0 ||
    summary.structuralIssues > 0
  ) {
    return 1;
  }

  return 0;
}

export type { AuditOptions, AuditResult } from './types';
