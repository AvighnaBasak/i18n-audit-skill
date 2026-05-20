import { LocaleFile, UsedKey, CoverageResult, LocaleCoverage, MissingKey, OrphanedKey } from '../types';

export function detectCoverage(
  localeFiles: LocaleFile[],
  usedKeys: UsedKey[],
  sourceLocale: string
): CoverageResult {
  const usedKeySet = new Set(usedKeys.map(k => k.key));
  const usedKeyList = [...usedKeySet].filter(k => !k.endsWith('*'));

  const localeGroups: Record<string, Record<string, string>> = {};
  for (const file of localeFiles) {
    if (!localeGroups[file.locale]) localeGroups[file.locale] = {};
    for (const [key, value] of Object.entries(file.flat)) {
      const nsKey = file.namespace !== 'default' ? `${file.namespace}:${key}` : key;
      localeGroups[file.locale][nsKey] = value;
    }
  }

  const sourceKeys = localeGroups[sourceLocale]
    ? new Set(Object.keys(localeGroups[sourceLocale]))
    : new Set(usedKeyList);

  const allDefinedKeys = new Set<string>();
  for (const keys of Object.values(localeGroups)) {
    Object.keys(keys).forEach(k => allDefinedKeys.add(k));
  }

  const missingKeysMap: Record<string, MissingKey> = {};
  const orphanedKeys: OrphanedKey[] = [];

  const perLocale: Record<string, LocaleCoverage> = {};

  for (const [locale, keys] of Object.entries(localeGroups)) {
    const localeKeySet = new Set(Object.keys(keys));

    const missingInThisLocale = [...sourceKeys].filter(k => !localeKeySet.has(k));
    const orphanedInThisLocale = [...localeKeySet].filter(k => !usedKeySet.has(k) && !sourceKeys.has(k));

    for (const key of missingInThisLocale) {
      if (!missingKeysMap[key]) {
        const usedAt = usedKeys
          .filter(u => u.key === key)
          .map(u => ({ file: u.file, line: u.line }));
        const [ns, ...rest] = key.includes(':') ? key.split(':') : ['default', key];
        missingKeysMap[key] = {
          key: rest.join(':') || ns,
          namespace: key.includes(':') ? ns : 'default',
          locales: [],
          usedAt,
        };
      }
      missingKeysMap[key].locales.push(locale);
    }

    for (const key of orphanedInThisLocale) {
      const value = keys[key];
      const [ns, ...rest] = key.includes(':') ? key.split(':') : ['default', key];
      orphanedKeys.push({
        key: rest.join(':') || ns,
        namespace: key.includes(':') ? ns : 'default',
        locale,
        value,
        sizeBytes: Buffer.byteLength(`"${key}":"${value}"`, 'utf8'),
      });
    }

    const total = sourceKeys.size;
    const present = total - missingInThisLocale.length;

    perLocale[locale] = {
      locale,
      total,
      present,
      missing: missingInThisLocale.length,
      orphaned: orphanedInThisLocale.length,
      percentage: total > 0 ? Math.round((present / total) * 100) : 100,
    };
  }

  return {
    perLocale,
    missingKeys: Object.values(missingKeysMap),
    orphanedKeys,
    usedKeys: usedKeyList,
  };
}
