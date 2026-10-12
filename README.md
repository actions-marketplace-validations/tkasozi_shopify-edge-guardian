# 🛡️  Shopify Edge Guardian

> **Continuous PR Gatekeeper, "Built for Shopify" (BFS) Defense Engine & Rust Wasm Edge Profiler.**

Shopify Edge Guardian protects your Shopify applications and checkout extensions from App Store rejections, GraphQL API deprecation blackouts, edge execution timeouts (>5ms), and silent loss of your **"Built for Shopify"** badge.

---

## 🚀  Key Capabilities

1. **Pre-Flight App Store & GDPR Compliance:**
   - Verifies mandatory GDPR endpoints (`customers/data_request`, `customers/redact`, `shop/redact`).
   - Audits access scopes under the **Principle of Least Privilege** (flags scope bloat like `read_all_orders`).
   - Enforces App Bridge 3.x embedded standards.

2. **Principle of Least Privilege: Unused Scope Auditing:**
   - Scans codebase queries and mutations to identify declared scopes that are never used.
   - Detects overprivileged write scopes where only read queries exist, recommending downgrades to lower merchant install friction.

3. **Shopify App Store Review Blockers & Listing Linter:**
   - Flags exaggerated claims ("#1 app", "the best", "world's leading") and unsubstantiated guarantees under Section 4.3.3.
   - Enforces Shopify Trademark and Brand Guidelines (rejects app names leading with "Shopify" without "for Shopify").
   - Prohibits direct `layout/theme.liquid` code overwrites via the Asset API (Section 5.1.1).
   - Scans for hardcoded `shpat_` / `shpca_` access tokens.
   - Detects off-platform checkout or billing bypasses (Section 1.1.2 & 1.2.1).

4. **Quarterly GraphQL API Deprecation Watchdog:**
   - Static AST scanner parses `.graphql`, `.ts`, and `.tsx` files for deprecated queries.
   - Alerts teams to Shopify quarterly deprecation sunsets (`2026-01`, `2026-04`, `2026-07`).
   - Ingests runtime `X-Shopify-API-Deprecated-Reason` headers.

5. **Rust Wasm Edge Profiler (Shopify Functions):**
   - Enforces Shopify's **256 KB hard binary budget** and warns at 200 KB.
   - Verifies Link-Time Optimization (`lto = true`) and `opt-level = 'z'` in `Cargo.toml`.
   - Simulates edge execution latency against the **5.0ms hard checkout cutoff**.

6. **"Built for Shopify" (BFS) Continuous Canary:**
   - Evaluates admin response latency against the **500ms Core Web Vitals** threshold.
   - Validates Content Security Policy (`frame-ancestors https://admin.shopify.com`).
   - Probes webhook endpoints with SSRF protection and 5s timeout enforcement.

7. **Multi-App Agency Fleet Dashboard:**
   - Aggregates compliance, API versions, and Wasm sizes across 20+ client stores in a single view.

---

## 🛠️  Usage

### Local CLI
```bash
# Run pre-flight check in your current Shopify app directory
npx shopify-edge-guardian check

# Fail on warnings (e.g. approaching deprecations or unoptimized LTO)
npx shopify-edge-guardian check --fail-on-warning

# Output machine-readable JSON
npx shopify-edge-guardian check --json

# Run with optional pluggable AI semantic audit (reads GUARDIAN_AI_KEY or OPENAI_API_KEY)
npx shopify-edge-guardian check --ai

# Pass a custom configuration file path
npx shopify-edge-guardian check --config ./custom-guardian.json
```

### Project Configuration (`.edgeguardianrc.json` or `shopify.app.toml`)
Customize file ignores, rule overrides, or disable Wasm requirements for pure Node/Remix apps by adding `.edgeguardianrc.json` to your repository root:

```json
{
  "ignore": [
    "RELEASE_NOTES.md",
    "docs/**",
    "legacy-api/**"
  ],
  "rules": {
    "SUPERLATIVE_ABSOLUTE_CAPABILITY": "off",
    "WASM_BINARY_NOT_FOUND": "off",
    "APP_NOT_EMBEDDED": "warning"
  },
  "wasm": {
    "required": false
  }
}
```

Or configure directly inside `shopify.app.toml`:
```toml
[edge_guardian]
ignore = ["RELEASE_NOTES.md", "docs/**"]

[edge_guardian.rules]
SUPERLATIVE_EXCLUSIVITY = "off"

[edge_guardian.wasm]
required = false
```

### GitHub Actions CI/CD (`.github/workflows/ci.yml`)
```yaml
name: Shopify App & Function Gatekeeper

on:
  pull_request:
    branches: [main, develop]

jobs:
  guardian-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run Shopify Edge Guardian
        uses: ./
        with:
          path: '.'
          fail-on-warning: 'false'
```

---

## 📄  License
MIT © Shopify Edge Guardian Authors. (Independent developer tool. Not affiliated with or endorsed by Shopify Inc.)
