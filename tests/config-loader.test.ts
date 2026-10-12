import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader } from '../src/config/config-loader.js';
import { ShopifyEdgeGuardian } from '../src/index.js';
import { matchesIgnore } from '../src/utils/sanitizer.js';

describe('ConfigLoader & Project Configuration', () => {
  const testRoot = path.resolve(__dirname, '../fixtures/temp-config-test');

  beforeAll(() => {
    if (!fs.existsSync(testRoot)) {
      fs.mkdirSync(testRoot, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('matches globs and filenames correctly with matchesIgnore', () => {
    expect(matchesIgnore('RELEASE_NOTES.md', '/root', ['RELEASE_NOTES.md'])).toBe(true);
    expect(matchesIgnore('/root/RELEASE_NOTES.md', '/root', ['RELEASE_NOTES.md'])).toBe(true);
    expect(matchesIgnore('/root/docs/guide.md', '/root', ['docs/**'])).toBe(true);
    expect(matchesIgnore('/root/docs/sub/deep/faq.md', '/root', ['docs/**'])).toBe(true);
    expect(matchesIgnore('/root/src/foo.test.ts', '/root', ['*.test.ts'])).toBe(true);
    expect(matchesIgnore('/root/src/app.ts', '/root', ['docs/**', '*.test.ts'])).toBe(false);
  });

  it('loads and parses .edgeguardianrc.json with comments and rules', () => {
    const dirJson = path.join(testRoot, 'json-config-app');
    fs.mkdirSync(dirJson, { recursive: true });

    fs.writeFileSync(
      path.join(dirJson, '.edgeguardianrc.json'),
      `// Edge Guardian Project Config
{
  "ignore": ["docs/**", "RELEASE_NOTES.md"],
  "rules": {
    "SUPERLATIVE_ABSOLUTE_CAPABILITY": "off",
    "APP_NOT_EMBEDDED": "warning"
  },
  "wasm": {
    "required": false
  }
}`
    );

    const config = ConfigLoader.loadConfig(dirJson);
    expect(config.ignore).toEqual(['docs/**', 'RELEASE_NOTES.md']);
    expect(config.rules?.SUPERLATIVE_ABSOLUTE_CAPABILITY).toBe('off');
    expect(config.rules?.APP_NOT_EMBEDDED).toBe('warning');
    expect(config.wasm?.required).toBe(false);
  });

  it('parses [edge_guardian] configuration section from shopify.app.toml', () => {
    const dirToml = path.join(testRoot, 'toml-config-app');
    fs.mkdirSync(dirToml, { recursive: true });

    fs.writeFileSync(
      path.join(dirToml, 'shopify.app.toml'),
      `name = "Toml Config App for Shopify"
client_id = "test-client-id"
embedded = true

[webhooks.privacy_compliance]
customer_data_request_url = "https://example.com/gdpr/data_request"
customer_deletion_url = "https://example.com/gdpr/customer_redact"
shop_deletion_url = "https://example.com/gdpr/shop_redact"

[edge_guardian]
ignore = ["docs/**", "RELEASE_NOTES.md"]

[edge_guardian.rules]
SUPERLATIVE_EXCLUSIVITY = "off"
WASM_BINARY_NOT_FOUND = "off"

[edge_guardian.wasm]
required = false
`
    );

    const config = ConfigLoader.loadConfig(dirToml);
    expect(config.ignore).toEqual(['docs/**', 'RELEASE_NOTES.md']);
    expect(config.rules?.SUPERLATIVE_EXCLUSIVITY).toBe('off');
    expect(config.rules?.WASM_BINARY_NOT_FOUND).toBe('off');
    expect(config.wasm?.required).toBe(false);
  });

  it('auto-suppresses WASM_BINARY_NOT_FOUND on non-Rust projects without Cargo.toml', () => {
    const dirNonRust = path.join(testRoot, 'pure-node-app');
    fs.mkdirSync(dirNonRust, { recursive: true });

    fs.writeFileSync(
      path.join(dirNonRust, 'shopify.app.toml'),
      `name = "Pure Node App for Shopify"
embedded = true
[webhooks.privacy_compliance]
customer_data_request_url = "https://example.com/data"
customer_deletion_url = "https://example.com/redact"
shop_deletion_url = "https://example.com/shop"
`
    );

    const guardian = new ShopifyEdgeGuardian();
    const report = guardian.runAudit(dirNonRust);

    // No Cargo.toml exists, so wasm profiling should not flag WASM_BINARY_NOT_FOUND
    expect(report.wasmProfile?.findings).toHaveLength(0);
    expect(report.wasmProfile?.passed).toBe(true);
  });

  it('suppresses WASM_BINARY_NOT_FOUND when wasm.required = false even if Cargo.toml exists', () => {
    const dirRustOptOut = path.join(testRoot, 'rust-opt-out-app');
    fs.mkdirSync(dirRustOptOut, { recursive: true });

    fs.writeFileSync(path.join(dirRustOptOut, 'Cargo.toml'), `[package]\nname = "my-func"\nversion = "0.1.0"\n`);
    fs.writeFileSync(
      path.join(dirRustOptOut, 'shopify.app.toml'),
      `name = "Opt Out App for Shopify"
embedded = true
[webhooks.privacy_compliance]
customer_data_request_url = "https://example.com/data"
customer_deletion_url = "https://example.com/redact"
shop_deletion_url = "https://example.com/shop"

[edge_guardian.wasm]
required = false
`
    );

    const guardian = new ShopifyEdgeGuardian();
    const report = guardian.runAudit(dirRustOptOut);

    expect(report.wasmProfile?.findings).toHaveLength(0);
    expect(report.wasmProfile?.passed).toBe(true);
  });

  it('allows custom config file via options.configPath', () => {
    const dirCustom = path.join(testRoot, 'custom-path-app');
    fs.mkdirSync(dirCustom, { recursive: true });

    fs.writeFileSync(
      path.join(dirCustom, 'shopify.app.toml'),
      `name = "Custom Path App for Shopify"
embedded = true
[webhooks.privacy_compliance]
customer_data_request_url = "https://example.com/data"
customer_deletion_url = "https://example.com/redact"
shop_deletion_url = "https://example.com/shop"
`
    );

    fs.writeFileSync(
      path.join(dirCustom, 'custom-guardian.json'),
      JSON.stringify({
        rules: {
          SUPERLATIVE_THE_BEST: 'off',
        },
      })
    );

    const guardian = new ShopifyEdgeGuardian();
    const report = guardian.runAudit(dirCustom, {
      configPath: 'custom-guardian.json',
    });

    expect(report.passed).toBe(true);
  });
});
