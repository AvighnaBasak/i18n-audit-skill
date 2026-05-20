import { LocaleFile, OrphanedKey, BundleImpact } from '../types';

const LAZY_LOAD_THRESHOLD_BYTES = 50_000;
const LARGE_LOCALE_RATIO = 1.5;

export function analyzeBundleImpact(
  localeFiles: LocaleFile[],
  orphanedKeys: OrphanedKey[]
): BundleImpact[] {
  const impacts: BundleImpact[] = [];

  const orphansByLocaleNs: Record<string, OrphanedKey[]> = {};
  for (const key of orphanedKeys) {
    const groupKey = `${key.locale}::${key.namespace}`;
    if (!orphansByLocaleNs[groupKey]) orphansByLocaleNs[groupKey] = [];
    orphansByLocaleNs[groupKey].push(key);
  }

  const localeNsMap: Record<string, LocaleFile> = {};
  for (const f of localeFiles) {
    localeNsMap[`${f.locale}::${f.namespace}`] = f;
  }

  for (const [groupKey, orphans] of Object.entries(orphansByLocaleNs)) {
    const file = localeNsMap[groupKey];
    if (!file) continue;

    const [locale, namespace] = groupKey.split('::');
    const orphanedBytes = orphans.reduce((sum, o) => sum + o.sizeBytes, 0);
    const totalKeys = Object.keys(file.flat).length;
    const orphanedCount = orphans.length;
    const orphanedPercent = totalKeys > 0 ? Math.round((orphanedCount / totalKeys) * 100) : 0;

    impacts.push({
      locale,
      namespace,
      totalKeys,
      orphanedKeys: orphanedCount,
      orphanedBytes,
      totalBytes: file.sizeBytes,
      orphanedPercent,
      recommendation: buildRecommendation(file, orphanedBytes, orphanedPercent),
    });
  }

  // Flag locales that are significantly larger than others without explanation
  const namespaceTotals: Record<string, number[]> = {};
  for (const f of localeFiles) {
    if (!namespaceTotals[f.namespace]) namespaceTotals[f.namespace] = [];
    namespaceTotals[f.namespace].push(f.sizeBytes);
  }

  for (const [ns, sizes] of Object.entries(namespaceTotals)) {
    if (sizes.length < 2) continue;
    const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const filesInNs = localeFiles.filter(f => f.namespace === ns);

    for (const file of filesInNs) {
      if (file.sizeBytes > avg * LARGE_LOCALE_RATIO && file.sizeBytes > 5_000) {
        const existing = impacts.find(i => i.locale === file.locale && i.namespace === file.namespace);
        if (!existing) {
          impacts.push({
            locale: file.locale,
            namespace: file.namespace,
            totalKeys: Object.keys(file.flat).length,
            orphanedKeys: 0,
            orphanedBytes: 0,
            totalBytes: file.sizeBytes,
            orphanedPercent: 0,
            recommendation: `File is ${Math.round(file.sizeBytes / avg * 100)}% larger than average (${formatBytes(file.sizeBytes)} vs avg ${formatBytes(avg)}) — check for copy-paste content`,
          });
        }
      }
    }
  }

  // Suggest chunking large locale files
  for (const f of localeFiles) {
    if (f.sizeBytes > LAZY_LOAD_THRESHOLD_BYTES) {
      const existing = impacts.find(i => i.locale === f.locale && i.namespace === f.namespace);
      if (!existing) {
        impacts.push({
          locale: f.locale,
          namespace: f.namespace,
          totalKeys: Object.keys(f.flat).length,
          orphanedKeys: 0,
          orphanedBytes: 0,
          totalBytes: f.sizeBytes,
          orphanedPercent: 0,
          recommendation: `Large locale file (${formatBytes(f.sizeBytes)}) — consider splitting into namespace-specific lazy-loaded chunks`,
        });
      }
    }
  }

  return impacts;
}

function buildRecommendation(
  file: LocaleFile,
  orphanedBytes: number,
  orphanedPercent: number
): string {
  if (orphanedPercent > 30) {
    return `${orphanedPercent}% of keys are orphaned — removing them saves ${formatBytes(orphanedBytes)} from this bundle`;
  }
  if (orphanedBytes > 1_000) {
    return `Removing ${formatBytes(orphanedBytes)} of dead translations would reduce this file`;
  }
  return `${formatBytes(orphanedBytes)} can be reclaimed from orphaned keys`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
