# i18n-audit

A Claude skill that audits the internationalization health of your codebase. Point it at any project and it finds what your linter and tests miss: missing translation keys, dead translations, hardcoded strings in components, copy-pasted English in other locales, dropped placeholder variables, ICU plural rules that don't match the language.

## Setup

### 1. Clone and build

```bash
git clone https://github.com/AvighnaBasak/il8n-audit-skill
cd il8n-audit-skill
npm install && npm run build
```

### 2. Install the skill

Run the one-liner from inside the cloned directory. It copies the skill file and wires up the install path automatically.

**macOS / Linux:**
```bash
INSTALL_DIR=$(pwd)
mkdir -p ~/.claude/skills/i18n-audit
sed "s|__INSTALL_PATH__|$INSTALL_DIR|g" SKILL.md > ~/.claude/skills/i18n-audit/SKILL.md
```

**Windows (PowerShell):**
```powershell
$installDir = (Get-Location).Path
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\skills\i18n-audit"
(Get-Content SKILL.md) -replace '__INSTALL_PATH__', $installDir | Set-Content "$env:USERPROFILE\.claude\skills\i18n-audit\SKILL.md"
```

### 3. Restart Claude Code

The skill registers automatically. No config files to edit.

### 4. Use it

```
/i18n-audit
```

That's it. Claude runs the audit on your current project, parses the results, and gives you a prioritized breakdown: coverage table, every missing key with file and line, hardcoded strings with suggested extractions, quality issues with source and target side by side, and a numbered fix list sorted by impact.

To audit a different project or set a coverage gate:

```
/i18n-audit --cwd /path/to/your/app --threshold 90
```

> **Tip:** You can share this repo's URL with Claude and ask it to install the skill for you. Claude will read these instructions and run the setup commands on your machine.

---

## What It Detects

**Coverage gaps** — Keys used in code but missing from locale files. Keys in locale files but never referenced in code (dead weight). Per-locale coverage percentages. Entire missing namespace detection (collapses 24 individual missing keys into "Entire namespace missing for: ja").

**Hardcoded strings** — AST-based detection across JS/TS/JSX/TSX/Vue/Svelte/Python. Not regex — it understands your code structure. Classifies findings as HIGH (placeholder text, button labels), MEDIUM (aria-labels, alt text), or LOW (needs human review). Skips class names, URLs, imports, test files, and i18n key patterns like `"auth.login"`.

**Translation quality** — Copy-paste detection (English in a French locale file). Placeholder mismatches (`{name}` in source, missing in translation — runtime error). ICU plural form validation per CLDR rules (Arabic needs 6 forms, not 2). Suspiciously short translations with CJK-aware thresholds.

**Structural validation** — JSON/YAML parse errors surfaced before anything else runs. Duplicate key detection using a stack-based parser (not regex — no false positives from nested objects). Mixed naming conventions (camelCase vs snake_case). Missing namespace files.

**Bundle impact** — Bytes wasted by orphaned keys. Oversized locale files. Lazy-load chunking suggestions.

**Fallback chain** — Verifies `zh-TW -> zh -> en` chains resolve every key. Catches circular configs and keys that fall off the end.

**Framework detection** — Auto-detects and applies patterns for react-i18next, next-intl, vue-i18n, react-intl, lingui, svelte-i18n, i18next, django, and flask-babel. Checks for framework-specific misconfigurations.

---

## What Claude Does With the Results

When you run `/i18n-audit`, Claude doesn't just dump the output. It:

1. Runs the audit in CI mode to get structured JSON
2. Parses every finding and groups them by severity
3. Presents a coverage table, then critical issues, then warnings, then quality flags
4. Gives you a prioritized fix list — highest impact first
5. Offers follow-ups: preview orphan removal, save a markdown report, add to CI, show full hardcoded string list

Example output from Claude:

```
## i18n Audit — my-app

**Framework:** react-i18next
**Locales:** en (source), fr, ar
**Source keys:** 45

| Locale | Coverage | Missing | Orphaned |
|--------|----------|---------|----------|
| en     | 100%     | 0       | 0        |
| fr     |  91%     | 4       | 2        |
| ar     |  67%     | 15      | 0        |

### Critical — Fix before shipping
- Missing in ar: 15 keys across auth, dashboard, settings namespaces
- dashboard.greeting placeholder {timeOfDay} dropped in fr, ar — runtime error

### Recommendations
1. Add 15 missing Arabic keys before ar-locale launch
2. Restore {timeOfDay} placeholder in fr and ar translations
3. Extract 3 hardcoded strings to i18n keys
4. Remove 2 orphaned keys from fr (saves 89 bytes)
```

---

## Output

### Terminal (default)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  i18n-audit — internationalization quality report
  Framework: react-i18next ^14.0.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊  Coverage
──────────────────────────────────────────────────────────────
  Locale   Coverage   Progress               Missing  Orphaned
  ──────── ────────── ────────────────────── ──────── ────────
  ar        61%       [████████████░░░░░░░░] 9        0
  fr        89%       [█████████████████░░░] 3        1
  en       100%       [████████████████████] 0        0

🔴  Missing Keys     🟡  Orphaned Keys     🟠  Hardcoded Strings     🔵  Quality Issues
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All locales clean — no missing keys, no warnings |
| `1` | Warnings present (orphaned keys, hardcoded strings, quality issues) |
| `2` | Hard failures — missing keys in production locales, or below `--threshold` |

---

## CI/CD Integration

The skill is built on a CLI that works standalone in pipelines:

```yaml
# .github/workflows/i18n.yml
name: i18n Quality Gate
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx i18n-audit --ci --threshold 90
        # Exit 2 = missing keys → step fails automatically
```

**Output summary (written to $GITHUB_STEP_SUMMARY):**

| Locale | Coverage | Missing | Orphaned |
|--------|----------|---------|----------|
| en | 100% | 0 | 0 |
| fr | 🟡 89% | 3 | 1 |
| ar | 🔴 61% | 9 | 0 |

The `--ci` flag outputs machine-readable JSON and writes the locale coverage table to `$GITHUB_STEP_SUMMARY`.

---

## CLI Reference

The skill calls the CLI under the hood. You can also run it directly:

```bash
i18n-audit                              # audit current directory
i18n-audit --cwd /path/to/app           # audit a specific project
i18n-audit --threshold 95               # fail if any locale < 95%
i18n-audit --ci                         # JSON output for pipelines
i18n-audit --report audit.md            # save markdown report
i18n-audit --fix-orphans --dry-run      # preview dead key removal
i18n-audit --fix-orphans                # remove dead keys
i18n-audit --fallback-chain "zh-TW,zh,en"
i18n-audit --skip-hardcoded --skip-quality  # fast coverage-only pass
```

| Flag | Default | Description |
|------|---------|-------------|
| `--cwd <path>` | `.` | Project root to audit |
| `--locales-dir <path>` | auto | Override locale file directory |
| `--src <path>` | `./` | Source file search root |
| `--source-locale <code>` | `en` | Reference locale |
| `--fallback-chain <chain>` | — | e.g. `zh-TW,zh,en` |
| `--threshold <n>` | — | Fail if any locale < n% |
| `--ci` | `false` | JSON output + GitHub Actions summary |
| `--report [path]` | — | Save markdown report |
| `--fix-orphans` | `false` | Remove orphaned keys |
| `--dry-run` | `false` | Preview without writing |
| `--skip-hardcoded` | `false` | Skip hardcoded string detection |
| `--skip-quality` | `false` | Skip quality checks |
| `--ignore <patterns>` | — | Comma-separated globs to exclude |
| `--namespace <names>` | — | Only audit specific namespaces |

---

## Locale File Auto-Discovery

Searches these directories automatically:

```
locales/    src/locales/      messages/
locale/     src/i18n/         assets/locales/
i18n/       src/translations/ static/locales/
translations/
```

Supports flat and nested structures:

```
locales/en.json              -> locale: en, namespace: default
locales/en/common.json       -> locale: en, namespace: common
messages/en.json             -> locale: en, namespace: default
src/i18n/messages.en.json    -> locale: en, namespace: messages
```

---

## Test Results

Tested against two reference projects with deliberately seeded issues. All detection rates measure found vs. planted.

### Simple App — react-i18next, 2 locales, 16 keys

| Check | Seeded | Detected | False Positives |
|-------|--------|----------|-----------------|
| Missing keys | 2 | 2 | 0 |
| Orphaned keys | 1 | 1 | 0 |
| Hardcoded strings (HIGH) | 8 | 8 | 0 |
| Copy-paste translations | 2 | 2 | 0 |
| **Total** | **13** | **13** | **0** |

Precision: 100% | Recall: 100%

### Complex App — next-intl, 5 locales, 4 namespaces, 55 keys

| Check | Seeded | Detected | False Positives |
|-------|--------|----------|-----------------|
| Missing keys (entire namespace) | 24 | 24 | 0 |
| Orphaned keys | 1 | 1 | 0 |
| Hardcoded strings (HIGH) | 14 | 14 | 0 |
| Copy-paste translations | 4 | 4 | 0 |
| Placeholder mismatches | 3 | 3 | 0 |
| ICU plural violations | 1 | 1 | 0 |
| Suspiciously short | 2 | 2 | 0 |
| Structural issues | 1 | 1 | 0 |
| **Total** | **50** | **50** | **0** |

Precision: 100% | Recall: 100%

### Improvements made during testing

| Issue | Fix |
|-------|-----|
| 24 missing keys listed individually for one absent namespace | Collapses to "Entire namespace missing for: ja (24 keys)" |
| Proper name "Jane Smith" flagged as copy-paste | Allowlist for proper names, emails, URLs, currency codes |
| `tc('actions.cancel')` flagged as hardcoded (non-standard function name) | `looksLikeI18nKey()` guard — dotted strings always skipped in call arguments |

Pre-fix false positive rate: 5.7% | Post-fix: 0%

---

## Architecture

```
src/
  cli.ts              CLI entry (commander)
  index.ts            Audit orchestrator
  types.ts            Shared types
  parsers/
    locale.ts          Locale file discovery & JSON/YAML parsing
    source.ts          Source scanning & key extraction
  detectors/
    coverage.ts        Missing/orphaned key analysis
    hardcoded.ts       AST-based hardcoded string detection
    quality.ts         Copy-paste, placeholder, ICU, length checks
    structural.ts      Naming, duplicates, schema sync
    bundle.ts          Bundle size impact
    fallback.ts        Fallback chain verification
  frameworks/
    detect.ts          Framework auto-detection
  reporters/
    terminal.ts        Color terminal output
    json-reporter.ts   JSON + GitHub Actions output
    markdown.ts        Markdown reports
  fixers/
    orphans.ts         Orphan key removal
  utils/
    flatten.ts         JSON flatten/unflatten
    walk.ts            AST walker
```

---

## Contributing

```bash
npm run build     # verify compilation
node dist/cli.js --cwd test-fixtures --source-locale en   # smoke test
```

---

## License

MIT
