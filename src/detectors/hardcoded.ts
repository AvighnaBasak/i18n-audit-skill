import * as fs from 'fs';
import * as path from 'path';
import { parse as babelParse } from '@babel/parser';
import { HardcodedString } from '../types';
import { walkAST, ASTNode } from '../utils/walk';

const SKIP_ATTRS = new Set([
  'className', 'class', 'style', 'id', 'type', 'name', 'role', 'tabIndex',
  'href', 'src', 'rel', 'target', 'method', 'action', 'encType',
  'data-testid', 'data-cy', 'data-qa', 'htmlFor', 'key', 'ref',
  'width', 'height', 'size', 'color', 'stroke', 'fill',
  'onClick', 'onChange', 'onSubmit', 'onBlur', 'onFocus',
  'autoComplete', 'autoFocus', 'disabled', 'required', 'readOnly',
  'pattern', 'min', 'max', 'step', 'rows', 'cols',
]);

const HIGH_CONFIDENCE_ATTRS = new Set([
  'placeholder', 'label', 'title', 'alt', 'aria-label', 'aria-description',
  'aria-placeholder', 'tooltip', 'hint', 'description', 'helperText',
  'errorMessage', 'successMessage', 'buttonText', 'submitText',
  'cancelText', 'confirmText', 'heading', 'subheading', 'caption',
  'emptyMessage', 'noDataMessage', 'loadingText',
]);

const MEDIUM_CONFIDENCE_ATTRS = new Set([
  'aria-labelledby', 'data-tooltip', 'data-title', 'data-label',
  'summary', 'abbr',
]);

const SKIP_FUNCTIONS = new Set([
  'console', 'require', 'import', 'describe', 'it', 'test', 'expect',
  'beforeEach', 'afterEach', 'beforeAll', 'afterAll', 'jest', 'cy',
  'logger', 'log', 'warn', 'error', 'debug', 'info',
  'Error', 'TypeError', 'RangeError', 'new Error',
  'path', 'fs', 'url', 'regex', 'process',
]);

const LIKELY_UI_TEXT = /^[A-Z][a-z].*[a-zA-Z]$|^[a-z][a-z ]+[a-z]$/;
const LOOKS_LIKE_CODE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$|^\s*$|^https?:\/\/|^[./\\]|^\{|^\[|^#/;
const SHORT_COMMON = new Set(['a', 'an', 'the', 'or', 'and', 'on', 'off', 'ok', 'yes', 'no']);

export function detectHardcoded(filePath: string): HardcodedString[] {
  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath, 'utf8');

  if (ext === '.py') return detectHardcodedPython(content, filePath);
  if (ext === '.vue') return detectHardcodedVue(content, filePath);
  if (ext === '.svelte') return detectHardcodedSvelte(content, filePath);

  return detectHardcodedJS(content, filePath);
}

function detectHardcodedJS(content: string, filePath: string): HardcodedString[] {
  const findings: HardcodedString[] = [];
  let ast: ASTNode;

  try {
    ast = babelParse(content, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: [
        'jsx', 'typescript', 'decorators', 'classProperties',
        'dynamicImport', 'optionalChaining', 'nullishCoalescingOperator',
        'objectRestSpread', 'asyncGenerators',
      ],
    }) as unknown as ASTNode;
  } catch {
    return [];
  }

  const tCallNames = new Set(['t', '$t', 'translate', 'i18n.t', 'formatMessage', 'useTranslation']);
  const lines = content.split('\n');

  walkAST(ast, {
    JSXText(node, parent) {
      const n = node as ASTNode & { value: string };
      const text = n.value.trim();
      if (!isSignificantString(text)) return;

      const loc = (node as ASTNode & { loc?: { start: { line: number; column: number } } }).loc;
      const line = loc?.start.line ?? 0;
      const col = loc?.start.column ?? 0;

      findings.push({
        file: filePath,
        line,
        column: col,
        text,
        confidence: 'HIGH',
        reason: 'Literal text in JSX — not wrapped in translation function',
        context: lines[line - 1]?.trim() ?? '',
      });
    },

    JSXAttribute(node) {
      const n = node as ASTNode & {
        name: ASTNode & { name?: string };
        value: ASTNode & { value?: string; type: string };
      };
      const attrName = n.name?.name ?? '';
      if (SKIP_ATTRS.has(attrName)) return;

      if (n.value?.type === 'StringLiteral') {
        const text = n.value.value as string;
        if (!isSignificantString(text)) return;

        const loc = (node as ASTNode & { loc?: { start: { line: number; column: number } } }).loc;
        const line = loc?.start.line ?? 0;
        const col = loc?.start.column ?? 0;

        const confidence = HIGH_CONFIDENCE_ATTRS.has(attrName)
          ? 'HIGH'
          : MEDIUM_CONFIDENCE_ATTRS.has(attrName)
          ? 'MEDIUM'
          : 'LOW';

        if (confidence === 'LOW' && !LIKELY_UI_TEXT.test(text)) return;

        findings.push({
          file: filePath,
          line,
          column: col,
          text,
          confidence,
          reason: `Hardcoded string in JSX attribute "${attrName}"`,
          context: lines[line - 1]?.trim() ?? '',
        });
      }
    },

    StringLiteral(node, parent, ancestors) {
      if (!parent) return;

      const skipParentTypes = new Set([
        'ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration',
        'TSLiteralType', 'TSEnumMember',
        'ObjectProperty', 'Property',
      ]);

      // Allow string literals in object values for non-skippable parents
      if (skipParentTypes.has(parent.type)) return;

      if (parent.type === 'CallExpression') {
        const callee = (parent as ASTNode & { callee: ASTNode }).callee;
        const calleeName = getCalleeName(callee);
        if (tCallNames.has(calleeName) || SKIP_FUNCTIONS.has(calleeName.split('.')[0])) return;
        // String is first arg of ANY function call and looks like an i18n key → skip
        // Catches custom-named translation functions like tc(), tr(), i18nT(), etc.
        const strVal = (node as ASTNode & { value: string }).value;
        if (looksLikeI18nKey(strVal)) return;
      }

      if (parent.type === 'JSXAttribute') return;
      if (parent.type === 'JSXExpressionContainer') return;

      // Check if inside a JSX expression
      const inJSX = ancestors.some(a =>
        a.type === 'JSXElement' || a.type === 'JSXFragment'
      );
      if (!inJSX) return;

      const n = node as ASTNode & { value: string };
      const text = n.value;
      if (!isSignificantString(text)) return;
      if (LOOKS_LIKE_CODE.test(text)) return;

      const loc = (node as ASTNode & { loc?: { start: { line: number; column: number } } }).loc;
      const line = loc?.start.line ?? 0;
      const col = loc?.start.column ?? 0;

      findings.push({
        file: filePath,
        line,
        column: col,
        text,
        confidence: 'MEDIUM',
        reason: 'String literal in JSX expression — possibly user-facing',
        context: lines[line - 1]?.trim() ?? '',
      });
    },
  });

  return deduplicateFindings(findings);
}

// Strings like "auth.login", "dashboard.overview.title" — translation keys, not UI text
const I18N_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+$/;
function looksLikeI18nKey(text: string): boolean {
  return I18N_KEY_RE.test(text) && !text.includes(' ');
}

function isSignificantString(text: string): boolean {
  if (!text || text.trim().length < 2) return false;
  if (LOOKS_LIKE_CODE.test(text.trim())) return false;
  if (SHORT_COMMON.has(text.toLowerCase())) return false;
  if (/^\d+$/.test(text)) return false;
  if (!/[a-zA-Z]/.test(text)) return false;
  if (text.length < 3) return false;
  return true;
}

function getCalleeName(callee: ASTNode): string {
  if (callee.type === 'Identifier') return (callee as ASTNode & { name: string }).name;
  if (callee.type === 'MemberExpression') {
    const me = callee as ASTNode & {
      object: ASTNode & { name?: string };
      property: ASTNode & { name?: string };
    };
    return `${me.object.name ?? ''}.${me.property.name ?? ''}`;
  }
  return '';
}

function detectHardcodedVue(content: string, filePath: string): HardcodedString[] {
  const findings: HardcodedString[] = [];

  const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
  if (templateMatch) {
    const template = templateMatch[1];
    const baseLineOffset = content.slice(0, content.indexOf(templateMatch[1])).split('\n').length;
    const lines = template.split('\n');

    lines.forEach((line, idx) => {
      const stripped = line.replace(/\{\{[^}]+\}\}/g, '').replace(/<[^>]+>/g, '').trim();
      if (isSignificantString(stripped) && LIKELY_UI_TEXT.test(stripped)) {
        findings.push({
          file: filePath,
          line: baseLineOffset + idx,
          column: 0,
          text: stripped,
          confidence: 'HIGH',
          reason: 'Raw text in Vue template',
          context: line.trim(),
        });
      }

      const placeholderRe = /placeholder="([^"]+)"|:placeholder="'([^']+)'"/g;
      for (const m of line.matchAll(placeholderRe)) {
        const text = m[1] || m[2];
        if (text && isSignificantString(text)) {
          findings.push({
            file: filePath,
            line: baseLineOffset + idx,
            column: line.indexOf(m[0]),
            text,
            confidence: 'HIGH',
            reason: 'Hardcoded placeholder in Vue template',
            context: line.trim(),
          });
        }
      }
    });
  }

  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (scriptMatch) {
    const scriptContent = scriptMatch[1];
    const offset = content.slice(0, content.indexOf(scriptMatch[1])).split('\n').length;
    const jsFindings = detectHardcodedJS(scriptContent, filePath);
    for (const f of jsFindings) {
      findings.push({ ...f, line: f.line + offset - 1 });
    }
  }

  return deduplicateFindings(findings);
}

function detectHardcodedSvelte(content: string, filePath: string): HardcodedString[] {
  return detectHardcodedVue(content, filePath);
}

function detectHardcodedPython(content: string, filePath: string): HardcodedString[] {
  const findings: HardcodedString[] = [];
  const lines = content.split('\n');

  const i18nRe = /\b_\(|gettext\(|lazy_gettext\(|_l\(/;
  const printRe = /\bprint\s*\(/;
  const flashRe = /\bflash\s*\(|messages\.add\s*\(/;

  lines.forEach((line, idx) => {
    const stripped = line.trim();
    if (stripped.startsWith('#')) return;

    if (flashRe.test(line)) {
      const strRe = /['"]([^'"]{3,})['"]/g;
      for (const m of line.matchAll(strRe)) {
        const text = m[1];
        if (isSignificantString(text) && LIKELY_UI_TEXT.test(text) && !i18nRe.test(line)) {
          findings.push({
            file: filePath,
            line: idx + 1,
            column: line.indexOf(m[0]),
            text,
            confidence: 'HIGH',
            reason: 'Hardcoded string in flash/message call',
            context: line.trim(),
          });
        }
      }
    }
  });

  return findings;
}

function deduplicateFindings(findings: HardcodedString[]): HardcodedString[] {
  const seen = new Set<string>();
  return findings.filter(f => {
    const key = `${f.file}:${f.line}:${f.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
