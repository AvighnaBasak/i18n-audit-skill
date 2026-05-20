export interface LocaleFile {
  path: string;
  locale: string;
  namespace: string;
  raw: Record<string, unknown>;
  flat: Record<string, string>;
  parseError?: string;
  sizeBytes: number;
}

export interface UsedKey {
  key: string;
  file: string;
  line: number;
  namespace?: string;
  context?: string;
}

export interface HardcodedString {
  file: string;
  line: number;
  column: number;
  text: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  context: string;
}

export interface CoverageResult {
  perLocale: Record<string, LocaleCoverage>;
  missingKeys: MissingKey[];
  orphanedKeys: OrphanedKey[];
  usedKeys: string[];
}

export interface LocaleCoverage {
  locale: string;
  total: number;
  present: number;
  missing: number;
  orphaned: number;
  percentage: number;
}

export interface MissingKey {
  key: string;
  namespace: string;
  locales: string[];
  usedAt: Array<{ file: string; line: number }>;
}

export interface OrphanedKey {
  key: string;
  namespace: string;
  locale: string;
  value: string;
  sizeBytes: number;
}

export interface QualityIssue {
  type:
    | 'copy_paste'
    | 'placeholder_mismatch'
    | 'icu_missing_forms'
    | 'suspiciously_short'
    | 'empty_value';
  key: string;
  namespace: string;
  locale: string;
  sourceLocale: string;
  sourceValue: string;
  targetValue: string;
  detail: string;
  severity: 'error' | 'warning' | 'info';
}

export interface StructuralIssue {
  type:
    | 'naming_convention'
    | 'depth_inconsistency'
    | 'duplicate_key'
    | 'parse_error'
    | 'missing_locale_file'
    | 'flat_vs_nested';
  locale: string;
  namespace: string;
  key?: string;
  detail: string;
  severity: 'error' | 'warning' | 'info';
}

export interface BundleImpact {
  locale: string;
  namespace: string;
  totalKeys: number;
  orphanedKeys: number;
  orphanedBytes: number;
  totalBytes: number;
  orphanedPercent: number;
  recommendation?: string;
}

export interface FallbackIssue {
  type: 'missing_at_all_levels' | 'circular' | 'broken_chain';
  key?: string;
  namespace?: string;
  chain: string[];
  detail: string;
}

export interface FallbackResult {
  chain: string[];
  issues: FallbackIssue[];
}

export interface FrameworkInfo {
  name: string;
  version?: string;
  patterns: {
    functionCall: RegExp[];
    componentUsage: RegExp[];
    keyExtract: RegExp[];
  };
  configFiles: string[];
  misconfigurations: string[];
}

export interface AuditOptions {
  cwd: string;
  localesDir?: string;
  srcDir?: string;
  sourceLocale: string;
  fallbackChain?: string[];
  threshold?: number;
  ci: boolean;
  report: boolean;
  reportPath?: string;
  fixOrphans: boolean;
  dryRun: boolean;
  ignorePatterns: string[];
  namespaces?: string[];
  verbose: boolean;
  skipHardcoded: boolean;
  skipQuality: boolean;
}

export interface AuditResult {
  options: AuditOptions;
  localeFiles: LocaleFile[];
  framework: FrameworkInfo | null;
  coverage: CoverageResult;
  hardcoded: HardcodedString[];
  quality: QualityIssue[];
  structural: StructuralIssue[];
  bundle: BundleImpact[];
  fallback: FallbackResult | null;
  summary: AuditSummary;
  exitCode: 0 | 1 | 2;
}

export interface AuditSummary {
  totalLocales: number;
  totalKeys: number;
  missingKeys: number;
  orphanedKeys: number;
  hardcodedStrings: number;
  qualityIssues: number;
  structuralIssues: number;
  lowestCoverage: number;
  lowestCoverageLocale: string;
}
