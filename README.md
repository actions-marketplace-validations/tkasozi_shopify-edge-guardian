# 🛡️  Shopify Edge Guardian

> **Continuous PR Gatekeeper, "Built for Shopify" (BFS) Criteria Engine & Rust Wasm Edge Profiler.**

Shopify Edge Guardian is a 100% open-source developer tool that protects your Shopify applications and checkout extensions from App Store rejections, GraphQL API deprecation blackouts, edge execution timeouts (>5ms), and missing **"Built for Shopify"** criteria.

---

## 🚀  Key Capabilities

1. **Dynamic Category Scoping (Shopify Canonical Taxonomy):**
   - Automatically detects app category (`discounts`, `shipping`, `payments`, `orders`, `general`) from `shopify.app.toml` scopes and extension targets.
   - Enforces category-specific requirements (e.g. prohibits Discount apps from creating Draft Orders to apply discounts — a critical BFS review blocker).

2. **Built for Shopify (BFS) Criteria Engine:**
   - Evaluates performance budgets, admin response latency, and storefront asset size limits (<50 KB).
   - Validates Embedded Admin Bridge, Session Token authentication, and Polaris design standards.
   - Strictly prohibits legacy Asset API theme modification (`BFS_ASSET_API_PROHIBITED`) and deprecated ScriptTags (`BFS_STOREFRONT_SCRIPT_TAG_DEPRECATED`).
   - Accurately reports post-launch merchant utility milestones (50 installs, 5 reviews, 4.0+ rating) without false promises.

3. **Pre-Flight App Store & GDPR Compliance:**
   - Verifies mandatory GDPR endpoints (`customers/data_request`, `customers/redact`, `shop/redact`).
   - Audits access scopes under the **Principle of Least Privilege** (flags scope bloat and unused scopes).
   - Scans for hardcoded `shpat_` / `shpca_` access tokens and direct Liquid code overwrites.
   - Detects off-platform checkout or billing bypasses (Section 1.1.2 & 1.2.1).

4. **App Store Listing & Marketing Copy Review:**
   - Detects exaggerated claims ("#1 app", "the best", "world's leading") and unsubstantiated guarantees under Section 4.3.3 / 4.3.4.
   - Enforces Shopify Trademark and Brand Guidelines (rejects app names leading with "Shopify" without "for Shopify").
   - **Pluggable AI Copilot:** Free cloud semantic evaluation endpoint (`https://billing.endptsec.com`) with per-project rate limiting and 24h content-hash caching, plus Bring-Your-Own-Key (`OPENAI_API_KEY`) support. Gracefully falls back to local deterministic rules if offline.

5. **Quarterly GraphQL API Deprecation Watchdog:**
   - Static AST scanner parses `.graphql`, `.ts`, and `.tsx` files for deprecated queries across quarterly sunsets (`2026-01`, `2026-04`, `2026-07`).
   - Free real-time alerts dispatched to Slack or Discord webhooks.

6. **Rust Wasm Edge Profiler (Shopify Functions):**
   - Enforces Shopify's **256 KB hard binary budget** and warns at 200 KB.
   - Verifies Link-Time Optimization (`lto = true`) and `opt-level = 'z'` in `Cargo.toml`.
   - Simulates edge execution latency against the **5.0ms hard checkout cutoff**.

7. **Sober Commercial Reality Notice (Zero Vanity Metrics):**
   - Explicitly reminds engineering teams that passing automated technical gates does not guarantee marketplace approval or grant the BFS badge without manual Shopify human review and post-launch adoption.

---

## 🛠️  Usage

### Local CLI
```bash
# Run pre-flight check in your current Shopify app directory
npx shopify-edge-guardian check

# Fail on warnings (e.g. approaching deprecations or unoptimized LTO)
npx shopify-edge-guardian check --fail-on-warning

# Output machine-readable JSON for CI pipelines
npx shopify-edge-guardian check --json

# Run with semantic AI copy review (uses free cloud endpoint or OPENAI_API_KEY)
npx shopify-edge-guardian check --ai

# Send deprecation alerts to Slack or Discord
npx shopify-edge-guardian check --slack-webhook https://hooks.slack.com/services/...

# Pass a custom configuration file path
npx shopify-edge-guardian check --config ./custom-guardian.json
```

### GitHub Actions CI/CD (`.github/workflows/ci.yml`)
```yaml
name: Shopify App Gatekeeper

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
        uses: tkasozi/shopify-edge-guardian@v1
        with:
          path: '.'
          fail-on-warning: 'false'
          ai: 'false'
          slack-webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Project Configuration (`.edgeguardianrc.json` or `shopify.app.toml`)
Customize file ignores, rule overrides, or disable Wasm requirements for pure Node/Remix apps by adding `.edgeguardianrc.json` to your repository root:

```json
{
  "category": "discounts",
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
category = "discounts"
ignore = ["RELEASE_NOTES.md", "docs/**"]

[edge_guardian.rules]
SUPERLATIVE_EXCLUSIVITY = "off"

[edge_guardian.wasm]
required = false
```

---

## 📄  License
MIT © Shopify Edge Guardian Authors. (Independent developer tool. Not affiliated with or endorsed by Shopify Inc.)
