import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'fast-glob';
import { parse as babelParse } from '@babel/parser';
import { UsedKey, FrameworkInfo } from '../types';
import { walkAST, ASTNode } from '../utils/walk';

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/coverage/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
  '**/test/**',
  '**/tests/**',
];

export async function discoverSourceFiles(
  cwd: string,
  srcDir?: string,
  ignore: string[] = []
): Promise<string[]> {
  const base = srcDir || '.';
  const patterns = [
    `${base}/**/*.{js,jsx,ts,tsx,vue,svelte}`,
    `${base}/**/*.py`,
  ];
  return glob.default(patterns, {
    cwd,
    absolute: true,
    ignore: [...DEFAULT_IGNORE, ...ignore],
  });
}

export function extractUsedKeys(
  filePath: string,
  framework: FrameworkInfo | null
): UsedKey[] {
  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath, 'utf8');

  if (ext === '.py') return extractFromPython(content, filePath);
  if (ext === '.vue') return extractFromVue(content, filePath, framework);
  if (ext === '.svelte') return extractFromSvelte(content, filePath, framework);

  return extractFromJS(content, filePath, framework);
}

function extractFromJS(
  content: string,
  filePath: string,
  _framework: FrameworkInfo | null
): UsedKey[] {
  const keys: UsedKey[] = [];
  let ast: ASTNode;

  try {
    ast = babelParse(content, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: [
        'jsx',
        'typescript',
        'decorators',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'dynamicImport',
        'optionalChaining',
        'nullishCoalescingOperator',
        'objectRestSpread',
        'asyncGenerators',
        'importMeta',
        'exportDefaultFrom',
        'exportNamespaceFrom',
      ],
    }) as unknown as ASTNode;
  } catch {
    return [];
  }

  const T_CALL_NAMES = new Set(['t', '$t', 'translate', '__', '_t', 'i18n.t', 'i18n.global.t']);
  const INTL_CALL_NAMES = new Set(['formatMessage']);

  walkAST(ast, {
    CallExpression(node) {
      const n = node as ASTNode & {
        callee: ASTNode;
        arguments: ASTNode[];
      };

      const calleeName = getCalleeName(n.callee);
      const loc = (node as ASTNode & { loc?: { start: { line: number } } }).loc;
      const line = loc?.start.line ?? 0;

      if (T_CALL_NAMES.has(calleeName)) {
        const firstArg = n.arguments[0];
        if (firstArg?.type === 'StringLiteral') {
          const v = (firstArg as ASTNode & { value: string }).value;
          keys.push({ key: v, file: filePath, line, namespace: extractNsFromArgs(n.arguments) });
        } else if (firstArg?.type === 'TemplateLiteral') {
          const tpl = firstArg as ASTNode & { quasis: Array<{ value: { raw: string } }> };
          const prefix = tpl.quasis[0]?.value?.raw;
          if (prefix) keys.push({ key: `${prefix}*`, file: filePath, line, context: 'dynamic' });
        }
      }

      if (INTL_CALL_NAMES.has(calleeName)) {
        const firstArg = n.arguments[0];
        if (firstArg?.type === 'ObjectExpression') {
          const obj = firstArg as ASTNode & { properties: ASTNode[] };
          for (const prop of obj.properties) {
            const p = prop as ASTNode & {
              key: ASTNode & { name?: string; value?: string };
              value: ASTNode & { value?: string; type: string };
            };
            const isId = p.key?.name === 'id' || p.key?.value === 'id';
            if (isId && p.value?.type === 'StringLiteral') {
              keys.push({ key: p.value.value as string, file: filePath, line });
            }
          }
        }
      }
    },

    JSXAttribute(node) {
      const n = node as ASTNode & {
        name: ASTNode & { name?: string };
        value: ASTNode & {
          value?: string;
          type: string;
          expression?: ASTNode & { callee?: ASTNode; arguments?: ASTNode[] };
        };
      };
      const attrName = n.name?.name ?? '';
      const loc = (node as ASTNode & { loc?: { start: { line: number } } }).loc;
      const line = loc?.start.line ?? 0;

      if ((attrName === 'i18nKey' || attrName === 'id') && n.value?.type === 'StringLiteral') {
        keys.push({ key: n.value.value as string, file: filePath, line });
      }

      if (n.value?.type === 'JSXExpressionContainer') {
        const expr = n.value.expression;
        if (expr?.type === 'CallExpression' && expr.callee) {
          const calleeName = getCalleeName(expr.callee);
          if (calleeName === 't' || calleeName === '$t') {
            const firstArg = (expr as ASTNode & { arguments: ASTNode[] }).arguments?.[0];
            if (firstArg?.type === 'StringLiteral') {
              keys.push({ key: (firstArg as ASTNode & { value: string }).value, file: filePath, line });
            }
          }
        }
      }
    },

    JSXOpeningElement(node) {
      const n = node as ASTNode & {
        name: ASTNode & { name?: string };
        attributes: ASTNode[];
      };
      const loc = (node as ASTNode & { loc?: { start: { line: number } } }).loc;
      const line = loc?.start.line ?? 0;

      if (n.name?.name === 'Trans') {
        for (const attr of n.attributes) {
          const a = attr as ASTNode & {
            name: ASTNode & { name?: string };
            value: ASTNode & { value?: string; type: string };
          };
          if (a.name?.name === 'i18nKey' && a.value?.type === 'StringLiteral') {
            keys.push({ key: a.value.value as string, file: filePath, line });
          }
        }
      }
    },
  });

  return keys;
}

function getCalleeName(callee: ASTNode): string {
  if (callee.type === 'Identifier') return (callee as ASTNode & { name: string }).name;
  if (callee.type === 'MemberExpression') {
    const me = callee as ASTNode & {
      object: ASTNode;
      property: ASTNode & { name?: string };
    };
    const objName =
      me.object.type === 'Identifier' ? (me.object as ASTNode & { name: string }).name : '';
    const propName = me.property.name ?? '';
    return objName ? `${objName}.${propName}` : propName;
  }
  return '';
}

function extractNsFromArgs(args: ASTNode[]): string | undefined {
  for (const arg of args.slice(1)) {
    if (arg.type === 'ObjectExpression') {
      const obj = arg as ASTNode & { properties: ASTNode[] };
      for (const prop of obj.properties) {
        const p = prop as ASTNode & {
          key: ASTNode & { name?: string };
          value: ASTNode & { value?: string; type: string };
        };
        if (p.key?.name === 'ns' && p.value?.type === 'StringLiteral') return p.value.value;
      }
    }
  }
  return undefined;
}

function extractFromVue(
  content: string,
  filePath: string,
  framework: FrameworkInfo | null
): UsedKey[] {
  const keys: UsedKey[] = [];

  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (scriptMatch) {
    const scriptContent = scriptMatch[1];
    const offset = content.indexOf(scriptMatch[1]);
    const baseLines = content.slice(0, offset).split('\n').length;
    for (const k of extractFromJS(scriptContent, filePath, framework)) {
      keys.push({ ...k, line: k.line + baseLines - 1 });
    }
  }

  const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
  if (templateMatch) {
    const template = templateMatch[1];
    const offset = content.indexOf(templateMatch[1]);
    const baseLines = content.slice(0, offset).split('\n').length;
    const re = /\$t\(['"`]([^'"`]+)['"`]\)|v-t="'([^']+)'"|:i18n-key="'([^']+)'"/g;
    for (const m of template.matchAll(re)) {
      const key = m[1] || m[2] || m[3];
      if (key) {
        const linesBefore = template.slice(0, m.index ?? 0).split('\n').length;
        keys.push({ key, file: filePath, line: baseLines + linesBefore - 1 });
      }
    }
  }

  return keys;
}

function extractFromSvelte(
  content: string,
  filePath: string,
  framework: FrameworkInfo | null
): UsedKey[] {
  const keys: UsedKey[] = [];

  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (scriptMatch) {
    const scriptContent = scriptMatch[1];
    const offset = content.indexOf(scriptMatch[1]);
    const baseLines = content.slice(0, offset).split('\n').length;
    for (const k of extractFromJS(scriptContent, filePath, framework)) {
      keys.push({ ...k, line: k.line + baseLines - 1 });
    }
  }

  const re = /\$t\(['"`]([^'"`]+)['"`]\)|\{t\(['"`]([^'"`]+)['"`]\)\}/g;
  for (const m of content.matchAll(re)) {
    const key = m[1] || m[2];
    if (key) {
      const linesBefore = content.slice(0, m.index ?? 0).split('\n').length;
      keys.push({ key, file: filePath, line: linesBefore });
    }
  }

  return keys;
}

function extractFromPython(content: string, filePath: string): UsedKey[] {
  const keys: UsedKey[] = [];
  const lines = content.split('\n');

  const patterns = [
    /(?:^|[^a-zA-Z_])_\(['"]([^'"]+)['"]\)/,
    /\bgettext\(['"]([^'"]+)['"]\)/,
    /\blazy_gettext\(['"]([^'"]+)['"]\)/,
    /\bngettext\(['"]([^'"]+)['"]/,
    /\bpgettext\(['"][^'"]+['"],\s*['"]([^'"]+)['"]\)/,
    /\btrans\s+['"]([^'"]+)['"]/,
    /\{%\s*trans\s*%\}([^{]+)\{%\s*endtrans\s*%\}/,
    /\b_l\(['"]([^'"]+)['"]\)/,
  ];

  lines.forEach((line, idx) => {
    for (const pattern of patterns) {
      const m = line.match(pattern);
      if (m?.[1]) keys.push({ key: m[1], file: filePath, line: idx + 1 });
    }
  });

  return keys;
}
