import { LocaleFile, QualityIssue } from '../types';

const ICU_PLURAL_RE = /\{[^}]+,\s*plural\s*,/;
const PLACEHOLDER_RE = /\{(\w+)\}|%\{(\w+)\}|:(\w+)|%s|%d|{{(\w+)}}/g;

// Values that are legitimately identical across all languages
const COPY_PASTE_ALLOWLIST = [
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, // email addresses
  /^https?:\/\//,                                          // URLs
  /^[A-Z][a-z]+ [A-Z][a-z]+$/,                           // "Jane Smith" — proper names used as placeholders
  /^\+?[\d\s\-().]+$/,                                    // phone numbers
  /^[A-Z]{2,5}$/,                                         // currency/country codes: USD, EUR, US
  /^v?\d+\.\d+/,                                          // version numbers: v1.2.3
];

const ICU_PLURAL_FORMS_BY_LOCALE: Record<string, string[]> = {
  ar: ['zero', 'one', 'two', 'few', 'many', 'other'],
  ru: ['one', 'few', 'many', 'other'],
  pl: ['one', 'few', 'many', 'other'],
  cs: ['one', 'few', 'many', 'other'],
  sk: ['one', 'few', 'many', 'other'],
  uk: ['one', 'few', 'many', 'other'],
  lv: ['zero', 'one', 'other'],
  lt: ['one', 'few', 'many', 'other'],
  ga: ['one', 'two', 'few', 'many', 'other'],
  cy: ['zero', 'one', 'two', 'few', 'many', 'other'],
  mt: ['one', 'few', 'many', 'other'],
  sl: ['one', 'two', 'few', 'other'],
};

export function detectQualityIssues(
  localeFiles: LocaleFile[],
  sourceLocale: string
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const sourceFiles = localeFiles.filter(f => f.locale === sourceLocale);
  const otherFiles = localeFiles.filter(f => f.locale !== sourceLocale);

  const sourceFlat: Record<string, { value: string; namespace: string }> = {};
  for (const f of sourceFiles) {
    for (const [key, value] of Object.entries(f.flat)) {
      sourceFlat[key] = { value, namespace: f.namespace };
    }
  }

  for (const file of otherFiles) {
    for (const [key, value] of Object.entries(file.flat)) {
      const source = sourceFlat[key];
      if (!source) continue;

      const sourceVal = source.value;
      const ns = file.namespace;

      // Copy-paste detection
      if (value === sourceVal && value.length > 4) {
        const isSameInAllLangs = isTechnicalString(value) || COPY_PASTE_ALLOWLIST.some(re => re.test(value.trim()));
        if (!isSameInAllLangs) {
          issues.push({
            type: 'copy_paste',
            key,
            namespace: ns,
            locale: file.locale,
            sourceLocale,
            sourceValue: sourceVal,
            targetValue: value,
            detail: `Value is identical to ${sourceLocale} — possibly untranslated`,
            severity: 'warning',
          });
        }
      }

      // Empty value
      if (value.trim() === '' && sourceVal.trim() !== '') {
        issues.push({
          type: 'empty_value',
          key,
          namespace: ns,
          locale: file.locale,
          sourceLocale,
          sourceValue: sourceVal,
          targetValue: value,
          detail: 'Translation is empty',
          severity: 'error',
        });
      }

      // Placeholder mismatch
      const sourcePlaceholders = extractPlaceholders(sourceVal);
      const targetPlaceholders = extractPlaceholders(value);

      const missingInTarget = sourcePlaceholders.filter(p => !targetPlaceholders.includes(p));
      const extraInTarget = targetPlaceholders.filter(p => !sourcePlaceholders.includes(p));

      if (missingInTarget.length > 0 || extraInTarget.length > 0) {
        const detail: string[] = [];
        if (missingInTarget.length > 0) detail.push(`missing: {${missingInTarget.join('}, {')}}`);
        // Suppress "unexpected" warnings when source uses ICU plural format — the target may
        // use a non-ICU variable that still resolves correctly (e.g. {count} instead of # in plural)
        const sourceIsICU = ICU_PLURAL_RE.test(sourceVal);
        if (extraInTarget.length > 0 && !sourceIsICU) {
          detail.push(`unexpected: {${extraInTarget.join('}, {')}}`);
        } else if (extraInTarget.length > 0 && sourceIsICU) {
          detail.push(`format deviation: target uses {${extraInTarget.join('}, {')}} instead of ICU plural syntax`);
        }

        if (detail.length > 0) {
          issues.push({
            type: 'placeholder_mismatch',
            key,
            namespace: ns,
            locale: file.locale,
            sourceLocale,
            sourceValue: sourceVal,
            targetValue: value,
            detail: `Placeholder mismatch — ${detail.join('; ')}`,
            severity: missingInTarget.length > 0 ? 'error' : 'warning',
          });
        }
      }

      // ICU plural forms
      if (ICU_PLURAL_RE.test(sourceVal)) {
        const requiredForms = ICU_PLURAL_FORMS_BY_LOCALE[file.locale.split('-')[0]];
        if (requiredForms) {
          const missingForms = requiredForms.filter(form => !value.includes(form));
          if (missingForms.length > 0) {
            issues.push({
              type: 'icu_missing_forms',
              key,
              namespace: ns,
              locale: file.locale,
              sourceLocale,
              sourceValue: sourceVal,
              targetValue: value,
              detail: `ICU plural missing required forms for ${file.locale}: ${missingForms.join(', ')}`,
              severity: 'error',
            });
          }
        }
      }

      // Suspiciously short translation
      if (sourceVal.length > 20 && value.length > 0) {
        const ratio = value.length / sourceVal.length;
        const JAPANESE_LANGS = new Set(['ja', 'zh', 'ko']);
        const isLangThatCompresses = JAPANESE_LANGS.has(file.locale.split('-')[0]);

        const threshold = isLangThatCompresses ? 0.15 : 0.25;
        if (ratio < threshold && !ICU_PLURAL_RE.test(value)) {
          issues.push({
            type: 'suspiciously_short',
            key,
            namespace: ns,
            locale: file.locale,
            sourceLocale,
            sourceValue: sourceVal,
            targetValue: value,
            detail: `Translation is ${Math.round(ratio * 100)}% the length of ${sourceLocale} (${sourceVal.length} vs ${value.length} chars)`,
            severity: 'warning',
          });
        }
      }
    }
  }

  return issues;
}

function extractPlaceholders(str: string): string[] {
  const found: string[] = [];
  for (const m of str.matchAll(new RegExp(PLACEHOLDER_RE.source, 'g'))) {
    const name = m[1] || m[2] || m[3] || m[4] || m[0];
    found.push(name);
  }
  return found;
}

function isTechnicalString(value: string): boolean {
  // URLs, CSS classes, code, numbers — same in all languages is OK
  if (/^https?:\/\//.test(value)) return true;
  if (/^[a-zA-Z0-9_-]+$/.test(value)) return true;
  if (/^\d+(\.\d+)?$/.test(value)) return true;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return true;
  return false;
}
