import { LocaleFile, FallbackResult, FallbackIssue } from '../types';

export function auditFallbackChain(
  localeFiles: LocaleFile[],
  fallbackChain: string[]
): FallbackResult {
  const issues: FallbackIssue[] = [];

  if (fallbackChain.length === 0) {
    return { chain: [], issues: [] };
  }

  // Circular fallback detection
  const seen = new Set<string>();
  for (const locale of fallbackChain) {
    if (seen.has(locale)) {
      issues.push({
        type: 'circular',
        chain: fallbackChain,
        detail: `Circular fallback detected: "${locale}" appears more than once in chain [${fallbackChain.join(' → ')}]`,
      });
      break;
    }
    seen.add(locale);
  }

  // Build a map of locale → flat keys
  const localeKeyMap: Record<string, Record<string, string>> = {};
  for (const file of localeFiles) {
    if (!localeKeyMap[file.locale]) localeKeyMap[file.locale] = {};
    for (const [key, value] of Object.entries(file.flat)) {
      const nsKey = file.namespace !== 'default' ? `${file.namespace}:${key}` : key;
      localeKeyMap[file.locale][nsKey] = value;
    }
  }

  // Verify each locale in the chain exists
  for (const locale of fallbackChain) {
    if (!localeKeyMap[locale]) {
      issues.push({
        type: 'broken_chain',
        chain: fallbackChain,
        detail: `Locale "${locale}" in fallback chain has no locale files — chain breaks here`,
      });
    }
  }

  // Find keys that fall off the end of the chain
  const endLocale = fallbackChain[fallbackChain.length - 1];
  const endKeys = localeKeyMap[endLocale] ? new Set(Object.keys(localeKeyMap[endLocale])) : new Set<string>();

  // Collect all keys from all locales in the chain
  const allChainKeys = new Set<string>();
  for (const locale of fallbackChain) {
    const keys = localeKeyMap[locale];
    if (keys) Object.keys(keys).forEach(k => allChainKeys.add(k));
  }

  // For each locale in the chain, find keys that are missing from ALL subsequent fallbacks
  for (let i = 0; i < fallbackChain.length - 1; i++) {
    const locale = fallbackChain[i];
    const localeKeys = localeKeyMap[locale];
    if (!localeKeys) continue;

    const remainingChain = fallbackChain.slice(i + 1);

    for (const key of Object.keys(localeKeys)) {
      // Check if the key falls off the end of the chain
      // Only flag keys that exist in the current locale but are missing from the terminal fallback
      if (!endKeys.has(key)) {
        const foundInChain = remainingChain.some(l => localeKeyMap[l]?.[key] !== undefined);
        if (!foundInChain) {
          const [ns, ...rest] = key.includes(':') ? key.split(':') : ['default', key];
          issues.push({
            type: 'missing_at_all_levels',
            key: rest.join(':') || ns,
            namespace: key.includes(':') ? ns : 'default',
            chain: fallbackChain,
            detail: `Key "${key}" exists in "${locale}" but falls off the end of fallback chain — missing from terminal locale "${endLocale}"`,
          });
        }
      }
    }
  }

  return { chain: fallbackChain, issues };
}
