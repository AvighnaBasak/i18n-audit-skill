import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { OrphanedKey, LocaleFile } from '../types';
import { formatBytes } from '../detectors/bundle';

export interface FixOrphansResult {
  filesModified: string[];
  keysRemoved: number;
  bytesReclaimed: number;
  dryRun: boolean;
}

export function fixOrphans(
  orphanedKeys: OrphanedKey[],
  localeFiles: LocaleFile[],
  dryRun: boolean
): FixOrphansResult {
  const result: FixOrphansResult = {
    filesModified: [],
    keysRemoved: 0,
    bytesReclaimed: 0,
    dryRun,
  };

  if (orphanedKeys.length === 0) {
    console.log(chalk.green('No orphaned keys to remove.'));
    return result;
  }

  const byFile: Record<string, OrphanedKey[]> = {};
  for (const key of orphanedKeys) {
    const file = localeFiles.find(f => f.locale === key.locale && f.namespace === key.namespace);
    if (!file) continue;
    if (!byFile[file.path]) byFile[file.path] = [];
    byFile[file.path].push(key);
  }

  if (dryRun) {
    console.log(chalk.bold.yellow('DRY RUN — no files will be modified'));
    console.log();
  }

  for (const [filePath, keys] of Object.entries(byFile)) {
    const file = localeFiles.find(f => f.path === filePath);
    if (!file || file.parseError) continue;

    const ext = path.extname(filePath).toLowerCase();
    const isJson = ext === '.json';

    const totalBytes = keys.reduce((s, k) => s + k.sizeBytes, 0);

    console.log(
      `${dryRun ? chalk.dim('[DRY RUN] ') : ''}${chalk.cyan(shorten(filePath))} — removing ${chalk.yellow(String(keys.length))} orphaned keys (${formatBytes(totalBytes)})`
    );

    for (const key of keys) {
      console.log(`  ${chalk.dim('─')} ${key.key} = ${chalk.dim(truncate(key.value, 50))}`);
    }

    if (!dryRun) {
      try {
        const newContent = removeKeysFromFile(file, keys, isJson);
        fs.writeFileSync(filePath, newContent, 'utf8');
        result.filesModified.push(filePath);
        result.keysRemoved += keys.length;
        result.bytesReclaimed += totalBytes;
        console.log(chalk.green(`  ✓ Saved`));
      } catch (err) {
        console.log(chalk.red(`  ✗ Error: ${String(err)}`));
      }
    } else {
      result.keysRemoved += keys.length;
      result.bytesReclaimed += totalBytes;
    }

    console.log();
  }

  if (dryRun) {
    console.log(
      chalk.dim(`Would remove ${result.keysRemoved} keys and reclaim ${formatBytes(result.bytesReclaimed)}.`)
    );
    console.log(chalk.dim(`Run without --dry-run to apply changes.`));
  } else {
    console.log(
      chalk.green(`✓ Removed ${result.keysRemoved} keys from ${result.filesModified.length} files, reclaimed ${formatBytes(result.bytesReclaimed)}.`)
    );
  }

  return result;
}

function removeKeysFromFile(file: LocaleFile, keysToRemove: OrphanedKey[], isJson: boolean): string {
  const keyNames = new Set(keysToRemove.map(k => k.key));
  const newFlat = Object.fromEntries(
    Object.entries(file.flat).filter(([k]) => !keyNames.has(k))
  );

  const newNested = unflattenFlat(newFlat);

  if (isJson) {
    return JSON.stringify(newNested, null, 2) + '\n';
  }

  const yaml = require('js-yaml') as typeof import('js-yaml');
  return yaml.dump(newNested, { indent: 2 });
}

function unflattenFlat(flat: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let current: Record<string, unknown> = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }
  return result;
}

function shorten(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.length <= 3 ? p : `.../${parts.slice(-3).join('/')}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
