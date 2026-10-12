import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { ShopifyEdgeGuardian } from '../src/index.js';

describe('ShopifyEdgeGuardian (Integration)', () => {
  const guardian = new ShopifyEdgeGuardian();
  const fixturesDir = path.resolve(__dirname, '../fixtures');

  it('runs complete audit on valid app and generates markdown report', () => {
    const validDir = path.join(fixturesDir, 'valid-app');
    const report = guardian.runAudit(validDir);

    expect(report.passed).toBe(true);
    expect(report.totalErrors).toBe(0);
    expect(report.privilegeUsage).toBeDefined();
    expect(report.reviewRequirements).toBeDefined();
    expect(report.summaryMarkdown).toContain('Shopify Edge Guardian: All Pre-Flight Checks Passed');
    expect(report.summaryMarkdown).toContain('App Store & GDPR Compliance');
    expect(report.summaryMarkdown).toContain('Principle of Least Privilege');
  });

  it('runs complete audit on invalid app and blocks merge with error findings', () => {
    const invalidDir = path.join(fixturesDir, 'invalid-app');
    const report = guardian.runAudit(invalidDir);

    expect(report.passed).toBe(false);
    expect(report.totalErrors).toBeGreaterThan(0);
    expect(report.privilegeUsage?.unusedScopes.length).toBeGreaterThan(0);
    expect(report.summaryMarkdown).toContain('Shopify Edge Guardian: Merge Blocked');
    expect(report.summaryMarkdown).toContain('🔴  **ERROR**');
  });
});
