import * as fs from 'fs';
import * as path from 'path';
import { FrameworkInfo } from '../types';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const FRAMEWORK_DEFINITIONS: Array<{
  name: string;
  packageNames: string[];
  patterns: FrameworkInfo['patterns'];
  configFiles: string[];
}> = [
  {
    name: 'react-i18next',
    packageNames: ['react-i18next', 'i18next'],
    patterns: {
      functionCall: [/\bt\(['"`]([^'"`]+)['"`]\)/, /useTranslation\(/, /i18n\.t\(/],
      componentUsage: [/<Trans\b/, /<I18nextProvider\b/],
      keyExtract: [/i18nKey=['"`]([^'"`]+)['"`]/],
    },
    configFiles: ['i18n.js', 'i18n.ts', 'i18next.config.js', 'i18next.config.ts'],
  },
  {
    name: 'next-intl',
    packageNames: ['next-intl'],
    patterns: {
      functionCall: [/\bt\(['"`]([^'"`]+)['"`]\)/, /useTranslations\(/, /getTranslations\(/],
      componentUsage: [/<NextIntlClientProvider\b/],
      keyExtract: [/useTranslations\(['"`]([^'"`]+)['"`]\)/],
    },
    configFiles: ['i18n.ts', 'next.config.ts', 'next.config.js'],
  },
  {
    name: 'vue-i18n',
    packageNames: ['vue-i18n'],
    patterns: {
      functionCall: [/\$t\(['"`]([^'"`]+)['"`]\)/, /useI18n\(/, /i18n\.global\.t\(/],
      componentUsage: [/v-t=['"`]/, /<i18n-t\b/],
      keyExtract: [/keypath=['"`]([^'"`]+)['"`]/],
    },
    configFiles: ['i18n.js', 'i18n.ts'],
  },
  {
    name: 'react-intl',
    packageNames: ['react-intl', '@formatjs/intl'],
    patterns: {
      functionCall: [/formatMessage\(\s*\{/, /useIntl\(/],
      componentUsage: [/<FormattedMessage\b/, /<IntlProvider\b/],
      keyExtract: [/id:\s*['"`]([^'"`]+)['"`]/],
    },
    configFiles: [],
  },
  {
    name: 'lingui',
    packageNames: ['@lingui/core', '@lingui/react'],
    patterns: {
      functionCall: [/useLingui\(/, /msg`/, /t`/],
      componentUsage: [/<Trans\b/, /<I18nProvider\b/],
      keyExtract: [/id:\s*['"`]([^'"`]+)['"`]/],
    },
    configFiles: ['lingui.config.js', 'lingui.config.ts'],
  },
  {
    name: 'svelte-i18n',
    packageNames: ['svelte-i18n'],
    patterns: {
      functionCall: [/\$_\(['"`]([^'"`]+)['"`]\)/, /\$t\(/, /\$format\(/],
      componentUsage: [],
      keyExtract: [],
    },
    configFiles: ['i18n.js', 'i18n.ts'],
  },
  {
    name: 'i18next',
    packageNames: ['i18next'],
    patterns: {
      functionCall: [/i18n\.t\(['"`]([^'"`]+)['"`]\)/, /i18next\.t\(/],
      componentUsage: [],
      keyExtract: [],
    },
    configFiles: ['i18n.js', 'i18n.ts', 'i18next.config.js'],
  },
  {
    name: 'django-i18n',
    packageNames: [],
    patterns: {
      functionCall: [/\b_\(['"]([^'"]+)['"]\)/, /\bgettext\(/, /\bugettext\(/],
      componentUsage: [/\{%\s*trans\s*%\}/],
      keyExtract: [],
    },
    configFiles: ['settings.py'],
  },
  {
    name: 'flask-babel',
    packageNames: [],
    patterns: {
      functionCall: [/\b_\(['"]([^'"]+)['"]\)/, /\bgettext\(/, /\blazy_gettext\(/],
      componentUsage: [],
      keyExtract: [],
    },
    configFiles: ['babel.cfg', 'messages.pot'],
  },
];

export function detectFramework(cwd: string): FrameworkInfo | null {
  const pkgPath = path.join(cwd, 'package.json');
  const requirementsTxt = path.join(cwd, 'requirements.txt');
  const pyprojectToml = path.join(cwd, 'pyproject.toml');

  let pkgJson: PackageJson = {};
  try {
    pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    // no package.json
  }

  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
  };

  // Check JS/TS frameworks
  for (const def of FRAMEWORK_DEFINITIONS) {
    const match = def.packageNames.find(pkg => allDeps[pkg]);
    if (match) {
      const version = allDeps[match];
      const misconfigurations = detectMisconfigurations(def.name, cwd, pkgJson);
      return {
        name: def.name,
        version,
        patterns: def.patterns,
        configFiles: def.configFiles,
        misconfigurations,
      };
    }
  }

  // Check Python frameworks
  if (fs.existsSync(requirementsTxt)) {
    const req = fs.readFileSync(requirementsTxt, 'utf8');
    if (/django/i.test(req)) {
      return makeFramework('django-i18n');
    }
    if (/flask[-_]babel/i.test(req)) {
      return makeFramework('flask-babel');
    }
  }

  if (fs.existsSync(pyprojectToml)) {
    const toml = fs.readFileSync(pyprojectToml, 'utf8');
    if (/django/i.test(toml)) return makeFramework('django-i18n');
    if (/flask/i.test(toml) && /babel/i.test(toml)) return makeFramework('flask-babel');
  }

  return null;
}

function makeFramework(name: string): FrameworkInfo {
  const def = FRAMEWORK_DEFINITIONS.find(d => d.name === name);
  return {
    name,
    patterns: def?.patterns ?? { functionCall: [], componentUsage: [], keyExtract: [] },
    configFiles: def?.configFiles ?? [],
    misconfigurations: [],
  };
}

function detectMisconfigurations(
  frameworkName: string,
  cwd: string,
  pkgJson: PackageJson
): string[] {
  const issues: string[] = [];

  if (frameworkName === 'react-i18next' || frameworkName === 'i18next') {
    const configExists = ['i18n.js', 'i18n.ts', 'i18next.config.js', 'i18next.config.ts'].some(
      f => fs.existsSync(path.join(cwd, f)) || fs.existsSync(path.join(cwd, 'src', f))
    );
    if (!configExists) {
      issues.push('No i18next config file found (i18n.js/i18n.ts) — defaultNS and fallbackLng may be misconfigured');
    }
  }

  if (frameworkName === 'next-intl') {
    const hasI18nTs = fs.existsSync(path.join(cwd, 'i18n.ts'));
    const hasI18nJs = fs.existsSync(path.join(cwd, 'i18n.js'));
    const hasSrcI18nTs = fs.existsSync(path.join(cwd, 'src', 'i18n.ts'));
    if (!hasI18nTs && !hasI18nJs && !hasSrcI18nTs) {
      issues.push('next-intl requires an i18n.ts request file — not found');
    }
  }

  return issues;
}
