# Changelog

All notable changes to **Shopify Edge Guardian** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.2] - 2026-10-12

### Added
- **Project Configuration Subsystem (`.edgeguardianrc.json` & `shopify.app.toml [edge_guardian]`):**
  - Projects can now define `.edgeguardianrc.json`, `.edgeguardian.json`, `edge-guardian.json`, or a `[edge_guardian]` section inside `shopify.app.toml`.
  - Added support for custom `ignore: string[]` glob patterns and file lists across all analyzers.
  - Added support for project-level rule overrides (`rules: Record<string, "off" | "warning" | "error" | "info">`).
  - Added support for `wasm: { required: false }` to explicitly declare pure Node/Remix apps without Rust Shopify Functions.
  - Added `--config` / `-c` CLI option to specify a custom configuration file path.
- **Default Exclusion for Developer & Release Documentation:**
  - `ReviewAnalyzer` now automatically excludes internal engineering release notes, changelogs, licenses, and contributor files (`RELEASE_NOTES.md`, `CHANGELOG.md`, `CHANGES.md`, `HISTORY.md`, `TODO.md`, `CONTRIBUTING.md`, `LICENSE.md`, `SECURITY.md`, etc.).
  - Default directories like `test`, `tests`, `__tests__`, `spec`, `docs`, and `.agents` are automatically bypassed from marketing superlative and deprecation scans.
- **Intelligent Non-Rust Project Auto-Detection in Wasm Profiler:**
  - Projects without `Cargo.toml` or `extensions/**/Cargo.toml` automatically suppress the `WASM_BINARY_NOT_FOUND` informational notice unless `wasm.required = true` is explicitly configured.

### Fixed
- **Engineering Statements in Superlative Absolute Rule (`SUPERLATIVE_ABSOLUTE_CAPABILITY`):**
  - Removed generic `success` from absolute capability regex to prevent false flagging technical unit test reports (e.g. "All 14 automated unit tests passed with 100% success").
  - Fixed regex word boundary matching for `#1` superlative claims (`SUPERLATIVE_THE_BEST`) when preceded by whitespace.

---

## [1.0.1] - 2026-10-12

### Added
- **Diagnostic Line & Phrase Highlighting:**
  - Reports now display compiler-grade diagnostic callouts with exact file locations (`file:line`), matched offending phrases, and syntax-highlighted code snippets.
  - Multi-language syntax formatting for TOML, TypeScript, JavaScript, Liquid, GraphQL, and HTML.
- **False-Positive Prevention Subsystem (`src/utils/sanitizer.ts`):**
  - Offset-preserving comment masking state machine (`maskComments`) supporting Hash (`#`), C-style (`//`, `/* */`), Liquid (`{% comment %}`, `{% # %}`), and Markdown/HTML (`<!-- -->`) comments.
  - Guarantees character offsets and line counts are strictly preserved so diagnostic line numbers match the original source.
  - String literal boundary protection to ensure `#` or `//` inside strings (e.g. URLs or TOML scope values) are never treated as comments.
- **Lockfile & Build Artifact Exclusion:**
  - High-throughput exclusion (`isIgnoredFile`) for ecosystem lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, etc.) and minified bundles/source maps (`*.min.js`, `*.min.css`, `*.map`).
- **Expanded NLP Morphological Scanner:**
  - Algorithmic morphological detection for `-est` superlatives in listing copy with an extensive false-positive exclusion dictionary (`NON_SUPERLATIVE_EST_WORDS`).
- **Pluggable AI Semantic Evaluator:**
  - Optional LLM-assisted evaluation for subtle or evasive superlative claims (`--ai` CLI flag, supporting `GUARDIAN_AI_KEY` or `OPENAI_API_KEY`).
- **Sigstore Provenance & Release Workflow:**
  - Automated GitHub Actions release pipeline (`.github/workflows/release.yml`) with npm provenance attestation and floating major tag (`v1`) auto-sync.

### Changed
- All rule analyzers (`ReviewAnalyzer`, `PrivilegeAnalyzer`, `DeprecationAnalyzer`, `ComplianceAnalyzer`) now route file content through the sanitization engine before regex evaluation.

---

## [1.0.0] - 2026-10-11

### Initial Release
- **GDPR & Privacy Compliance:** Mandatory webhook enforcement (`customers/data_request`, `customers/redact`, `shop/redact`) and App Bridge 3.x embedded standards.
- **Principle of Least Privilege:** Detection of declared but unused access scopes and overprivileged write scopes.
- **App Store Review Linter:** Detection of trademark brand misuse, direct `layout/theme.liquid` modification, hardcoded API tokens, and checkout bypasses.
- **GraphQL API Deprecation Watchdog:** AST scanning for sunsetting fields across quarterly Shopify API versions (`2026-01`, `2026-04`, `2026-07`).
- **Rust Wasm Profiler:** 256 KB binary size limit enforcement and simulated 5.0ms edge execution latency check for Shopify Functions.
- **"Built for Shopify" (BFS) Canary:** Response latency (500ms Core Web Vitals) and Content Security Policy validation.
- **Agency Fleet Manager:** Consolidated compliance dashboard across multi-client app fleets.
