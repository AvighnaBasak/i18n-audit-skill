import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as glob from 'fast-glob';
import { LocaleFile } from '../types';
import { flattenObject } from '../utils/flatten';

const LOCALE_CODE_RE = /^[a-z]{2,3}(-[A-Z]{2,4})?$/;

export async function discoverLocaleFiles(
  cwd: string,
  localesDir?: string
): Promise<LocaleFile[]> {
  const searchDirs = localesDir ? [localesDir] : guessLocaleDirs(cwd);

  const patterns = searchDirs.flatMap(dir => [
    `${dir}/**/*.json`,
    `${dir}/**/*.yaml`,
    `${dir}/**/*.yml`,
  ]);

  const files = await glob.default(patterns, {
    cwd,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });

  return files.map(fp => parseLocaleFile(fp, cwd)).filter(Boolean) as LocaleFile[];
}

function guessLocaleDirs(cwd: string): string[] {
  const candidates = [
    'locales', 'locale', 'i18n', 'translations', 'messages',
    'public/locales', 'src/locales', 'src/i18n', 'src/translations',
    'assets/locales', 'static/locales',
  ];
  return candidates.filter(dir => {
    try { return fs.statSync(path.join(cwd, dir)).isDirectory(); } catch { return false; }
  });
}

export function parseLocaleFile(filePath: string, cwd: string): LocaleFile | null {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  const content = fs.readFileSync(filePath, 'utf8');

  let raw: Record<string, unknown> = {};
  let parseError: string | undefined;

  try {
    if (ext === '.json') {
      raw = JSON.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
      raw = (yaml.load(content) as Record<string, unknown>) || {};
    }
  } catch (err) {
    parseError = String(err);
    raw = {};
  }

  const { locale, namespace } = inferLocaleAndNamespace(filePath, cwd);

  return {
    path: filePath,
    locale,
    namespace,
    raw,
    flat: flattenObject(raw),
    parseError,
    sizeBytes: stat.size,
  };
}

function inferLocaleAndNamespace(filePath: string, cwd: string): { locale: string; namespace: string } {
  const relative = path.relative(cwd, filePath);
  const parts = relative.split(path.sep);
  const filename = path.basename(filePath, path.extname(filePath));

  if (LOCALE_CODE_RE.test(filename)) {
    const ns = parts.length > 2 ? parts[parts.length - 2] : 'default';
    return { locale: filename, namespace: ns };
  }

  for (let i = parts.length - 2; i >= 0; i--) {
    if (LOCALE_CODE_RE.test(parts[i])) {
      return { locale: parts[i], namespace: filename };
    }
  }

  const segments = filename.split('.');
  if (segments.length >= 2 && LOCALE_CODE_RE.test(segments[segments.length - 1])) {
    return {
      locale: segments[segments.length - 1],
      namespace: segments.slice(0, -1).join('.'),
    };
  }

  return { locale: filename, namespace: 'default' };
}

export function findDuplicateKeys(content: string): string[] {
  const duplicates: string[] = [];
  const stack: Array<Set<string> | null> = [];
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (ch === '{') {
      stack.push(new Set<string>());
      i++;
    } else if (ch === '}') {
      stack.pop();
      i++;
    } else if (ch === '[') {
      stack.push(null);
      i++;
    } else if (ch === ']') {
      stack.pop();
      i++;
    } else if (ch === '"') {
      let j = i + 1;
      let str = '';
      while (j < content.length) {
        if (content[j] === '\\') { str += content[j] + (content[j + 1] ?? ''); j += 2; }
        else if (content[j] === '"') { j++; break; }
        else { str += content[j]; j++; }
      }
      // Check if followed by colon → it's a key
      let k = j;
      while (k < content.length && (content[k] === ' ' || content[k] === '\n' || content[k] === '\r' || content[k] === '\t')) k++;
      if (content[k] === ':' && stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top !== null) {
          if (top.has(str)) duplicates.push(str);
          else top.add(str);
        }
      }
      i = j;
    } else {
      i++;
    }
  }

  return duplicates;
}

export function groupByLocale(files: LocaleFile[]): Record<string, LocaleFile[]> {
  const groups: Record<string, LocaleFile[]> = {};
  for (const f of files) {
    if (!groups[f.locale]) groups[f.locale] = [];
    groups[f.locale].push(f);
  }
  return groups;
}

export function groupByNamespace(files: LocaleFile[]): Record<string, LocaleFile[]> {
  const groups: Record<string, LocaleFile[]> = {};
  for (const f of files) {
    if (!groups[f.namespace]) groups[f.namespace] = [];
    groups[f.namespace].push(f);
  }
  return groups;
}

export function getMergedLocaleKeys(files: LocaleFile[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const f of files) {
    for (const [key, value] of Object.entries(f.flat)) {
      const nsKey = f.namespace !== 'default' ? `${f.namespace}:${key}` : key;
      merged[nsKey] = value;
    }
  }
  return merged;
}
