import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ComplianceAnalyzer } from '../src/analyzers/compliance-analyzer.js';

describe('ComplianceAnalyzer', () => {
  const analyzer = new ComplianceAnalyzer();
  const fixturesDir = path.resolve(__dirname, '../fixtures');
  const tempTestDir = path.resolve(__dirname, '../fixtures/temp-compliance');

  beforeAll(() => {
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true });
    }

    // File 1: Commented out GDPR webhooks (Blocker 4)
    fs.writeFileSync(
      path.join(tempTestDir, 'commented-gdpr.toml'),
      `name = "CommentedTestApp"
embedded = true

# customer_data_request_url = "https://app.example.com/webhooks"
# customer_deletion_url = "https://app.example.com/webhooks"
# shop_deletion_url = "https://app.example.com/webhooks"

# Commented out scope bloat should NOT trigger warning
# scopes = "read_all_orders,write_orders"
scopes = "write_discounts,read_discounts"
`
    );

    // File 2: TOML array scopes syntax (Defect 2)
    fs.writeFileSync(
      path.join(tempTestDir, 'array-scopes.toml'),
      `name = "ArrayScopesApp"
embedded = true

[access_scopes]
scopes = [
  "write_discounts",
  "read_discounts"
]

[webhooks.privacy_compliance]
customer_deletion_url = "https://app.example.com/webhooks"
customer_data_request_url = "https://app.example.com/webhooks"
shop_deletion_url = "https://app.example.com/webhooks"
`
    );
  });

  afterAll(() => {
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  it('passes a fully compliant shopify.app.toml', () => {
    const validAppDir = path.join(fixturesDir, 'valid-app');
    const result = analyzer.analyze(validAppDir);

    expect(result.passed).toBe(true);
    expect(result.hasGdprCustomersDataRequest).toBe(true);
    expect(result.hasGdprCustomersRedact).toBe(true);
    expect(result.hasGdprShopRedact).toBe(true);
    expect(result.embeddedConfigured).toBe(true);
    expect(result.scopeBloatDetected).toBe(false);
    expect(result.findings.filter((f) => f.severity === 'ERROR')).toHaveLength(0);
  });

  it('fails an app missing GDPR webhooks and flags scope bloat', () => {
    const invalidAppDir = path.join(fixturesDir, 'invalid-app');
    const result = analyzer.analyze(invalidAppDir);

    expect(result.passed).toBe(false);
    expect(result.hasGdprCustomersDataRequest).toBe(false);
    expect(result.hasGdprCustomersRedact).toBe(false);
    expect(result.hasGdprShopRedact).toBe(false);
    expect(result.embeddedConfigured).toBe(false);
    expect(result.scopeBloatDetected).toBe(true);
    expect(result.unnecessaryScopes).toContain('read_all_orders');
    expect(result.unnecessaryScopes).toContain('write_orders');

    const errors = result.findings.filter((f) => f.severity === 'ERROR');
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it('BLOCKER 4: catches commented-out GDPR endpoints and ignores commented-out scope bloat', () => {
    const filePath = path.join(tempTestDir, 'commented-gdpr.toml');
    const result = analyzer.analyze(filePath);

    // Commented out endpoints must NOT pass
    expect(result.passed).toBe(false);
    expect(result.hasGdprCustomersDataRequest).toBe(false);
    expect(result.hasGdprCustomersRedact).toBe(false);
    expect(result.hasGdprShopRedact).toBe(false);

    // Commented out scopes must NOT trigger scope bloat
    expect(result.scopeBloatDetected).toBe(false);
    expect(result.unnecessaryScopes).toHaveLength(0);
  });

  it('DEFECT 2: parses TOML array scopes syntax properly', () => {
    const filePath = path.join(tempTestDir, 'array-scopes.toml');
    const result = analyzer.analyze(filePath);

    expect(result.passed).toBe(true);
    expect(result.scopesRequested).toEqual(['write_discounts', 'read_discounts']);
    expect(result.scopeBloatDetected).toBe(false);
  });

  it('handles missing config file gracefully', () => {
    const nonExistentPath = path.join(fixturesDir, 'non-existent-dir');
    const result = analyzer.analyze(nonExistentPath);

    expect(result.passed).toBe(false);
    expect(result.findings[0].id).toBe('CONFIG_MISSING');
  });
});
