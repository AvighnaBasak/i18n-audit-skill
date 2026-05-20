---
name: i18n-audit
description: Run a comprehensive internationalization audit on any project. Detects missing keys, orphaned translations, hardcoded strings, placeholder mismatches, ICU plural violations, structural inconsistencies, and bundle bloat. Works with react-i18next, next-intl, vue-i18n, react-intl, lingui, svelte-i18n, django, and flask-babel.
argument-hint: "[--cwd /path/to/project] [--threshold 90] [--fix-orphans]"
license: MIT
metadata:
  author: AvighnaBasak
  version: "1.0.0"
---

# i18n-audit Skill

Run a comprehensive internationalization quality audit and provide actionable, prioritized findings.

## Tool Location

The i18n-audit CLI is installed at:
```
__INSTALL_PATH__/dist/cli.js
```

Run it with Node.js: `node "__INSTALL_PATH__/dist/cli.js" [flags]`

Or if globally linked: `i18n-audit [flags]`

## When This Skill Is Invoked

The user wants to audit a project's internationalization health. They may specify a project path, or you should audit the current working directory.

## Execution Protocol

### Step 1 — Determine target project
- If the user passed a path argument, use `--cwd <path>`
- If no path given, use `--cwd .` (current directory)
- If the user specified extra flags (--threshold, --fix-orphans, etc.), pass them through

### Step 2 — Run the audit

Run the tool in CI mode to get structured JSON output:
```bash
node "__INSTALL_PATH__/dist/cli.js" --cwd <target> --ci 2>&1
```

If the user also wants the visual terminal report, run without `--ci` first:
```bash
node "__INSTALL_PATH__/dist/cli.js" --cwd <target>
```

### Step 3 — Parse JSON result and produce analysis

Parse the JSON output and produce a structured human-readable analysis in this format:

```
## i18n Audit — <project name or path>
Framework detected: <framework or "none detected">

### Coverage
<locale>: <percent>% (<missing> missing, <orphaned> orphaned)
...
Worst coverage: <locale> at <percent>%

### Critical Issues (exit code 2)
- <issue type>: <detail with file:line if available>

### Warnings (exit code 1)
- <issue type>: <detail>

### Quality Issues
- <issue type>: <locale> › <key> — <detail>

### Recommendations (prioritized)
1. <highest impact fix first>
2. ...
```

### Step 4 — Offer follow-up actions

After presenting results, offer:
- "Run `--fix-orphans --dry-run` to preview removing X orphaned keys (saves Y bytes)?"
- "Run `--report audit.md` to save a full markdown report?"
- "Add `i18n-audit --ci --threshold 95` to your CI pipeline?"
- "Show the full list of hardcoded strings to fix?"

## Interpreting Results

### Exit Codes
- `0` — Clean. All locales complete, no warnings.
- `1` — Warnings. Orphaned keys, hardcoded strings, quality issues. Won't break the app but should be fixed.
- `2` — Failure. Missing keys in production locales (users will see raw key names or fallback to wrong language). Fix before shipping.

### Coverage
- `100%` — Complete. This locale is fully translated.
- `80-99%` — Partial. Users in this locale will see untranslated content for missing keys.
- `< 80%` — Incomplete. Significant untranslated content. Treat as a launch blocker.

### Hardcoded Strings — Confidence Levels
- `HIGH` — Almost certainly a user-facing string that needs to be extracted. Prioritize these.
- `MEDIUM` — Likely user-facing (aria-labels, alt text). Review each one.
- `LOW` — Possible. May be technical constants. Human judgment needed.

### Quality Issues
- `copy_paste` — Developer added a key but forgot to translate it. The string is byte-for-byte English in a non-English locale.
- `placeholder_mismatch` — A `{variable}` was dropped or renamed in translation. Will cause runtime errors in ICU-based frameworks.
- `icu_missing_forms` — A plural string is missing required plural category forms for the locale's language (Arabic needs 6 forms, Russian needs 4, English only 2).
- `suspiciously_short` — The translation is much shorter than the source string relative to what's typical for that language pair. May be truncated or untranslated.
- `empty_value` — A key exists but has an empty string value.

### Structural Issues
- `parse_error` — A locale file is not valid JSON/YAML. Fix immediately — the entire file is skipped.
- `duplicate_key` — The same key appears twice in one JSON object. The second value silently overwrites the first.
- `missing_locale_file` — A namespace exists for some locales but not others.
- `flat_vs_nested` — Different locales use different key organization for the same namespace.

## Recommendations to Give Users

### For missing keys
"Add these keys to `<locale>.json`. If using i18next, run `i18next-scanner` to extract them. If using next-intl, add them to your messages file."

### For orphaned keys
"Run `i18n-audit --cwd <project> --fix-orphans --dry-run` to preview removal, then drop `--dry-run` to apply. This is safe — orphaned keys by definition are not used in code."

### For hardcoded strings
"Wrap each string in your i18n function: `t('your.key')`. Add the key to all locale files. Focus on HIGH confidence findings first."

### For placeholder mismatches
"In `<locale>/<file>.json`, restore the `{variable}` placeholder in the translation. The source string has it; the translation dropped it."

### For ICU missing plural forms
"Add the missing plural categories to your ICU string. Arabic requires: `{count, plural, zero {0 عناصر} one {عنصر واحد} two {عنصران} few {# عناصر} many {# عنصرًا} other {# عنصر}}`"

### For copy-paste translations
"The string in `<locale>` is identical to English. Either it needs translation, or it's legitimately the same (technical term, proper noun) and should be marked with a `/* same-as-source */` comment in your workflow."

### For CI integration
```yaml
# .github/workflows/i18n.yml
- name: i18n audit
  run: npx i18n-audit --ci --threshold 90
```

## Example Analysis Format

When presenting findings, use this template:

```
## i18n Audit Results

**Framework:** react-i18next  
**Locales:** en (source), fr, ar  
**Source keys:** 45  

### Coverage
| Locale | Coverage | Missing | Orphaned |
|--------|----------|---------|----------|
| en     | 100%     | 0       | 0        |
| fr     |  91%     | 4       | 2        |
| ar     |  67%     | 15      | 0        |

### Critical (exit code 2) — Fix before shipping
- **Missing in fr:** `auth.forgotPassword`, `dashboard.subtitle`, `settings.theme`, `settings.language`
- **Missing in ar:** 15 keys across `auth`, `dashboard`, `settings` namespaces

### Hardcoded strings — 3 HIGH confidence
- `src/components/Header.tsx:24` — `placeholder="Search..."` — wrap in `t('header.searchPlaceholder')`
- `src/pages/Login.tsx:41` — `aria-label="Password field"` — wrap in `t('auth.passwordLabel')`
- `src/components/Modal.tsx:8` — JSX text "Are you sure?" — wrap in `t('common.confirmDialog')`

### Quality issues
- **ar** › `common.itemCount` — ICU plural missing forms: zero, two, few, many (Arabic requires 6)
- **fr** › `auth.login` — copy-paste from English (value identical to en)

### Recommendations
1. **Immediate:** Add 15 missing Arabic keys before your ar-locale launch
2. **This sprint:** Extract 3 hardcoded strings to i18n keys
3. **Cleanup:** Remove 2 orphaned keys from fr to save 89 bytes
4. **Quality:** Fix ICU plural forms for Arabic itemCount
```
