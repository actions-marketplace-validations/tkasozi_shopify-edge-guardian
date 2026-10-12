import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LicenseManager } from '../src/licensing/license-manager.js';
import { MarkdownReporter } from '../src/reporter/markdown-reporter.js';
import { GuardianReport } from '../src/types/index.js';

describe('LicenseManager & Monetization System', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GUARDIAN_LICENSE_KEY;
    delete process.env.EDGE_GUARDIAN_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('resolves Community free tier when no license key is provided', () => {
    const status = LicenseManager.verifyLicenseSync();
    expect(status.tier).toBe('COMMUNITY');
    expect(status.valid).toBe(false);
    expect(status.features.aiSemanticReview).toBe(false);
    expect(status.features.fleetDashboardSync).toBe(false);
  });

  it('detects PRO tier from eg_live_ or eg_test_ keys', () => {
    const validProKey = 'eg_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    const status = LicenseManager.verifyLicenseSync(validProKey);
    expect(status.tier).toBe('PRO');
    expect(status.valid).toBe(true);
    expect(status.features.aiSemanticReview).toBe(true);
    expect(status.features.wasmEdgeProfiler).toBe(true);
    expect(status.features.fleetDashboardSync).toBe(false);
  });

  it('detects AGENCY_FLEET tier from eg_agency_ keys', () => {
    const agencyKey = 'eg_agency_1234567890abcdef1234567890abcdef';
    const status = LicenseManager.verifyLicenseSync(agencyKey);
    expect(status.tier).toBe('AGENCY_FLEET');
    expect(status.valid).toBe(true);
    expect(status.features.fleetDashboardSync).toBe(true);
    expect(status.features.aiSemanticReview).toBe(true);
  });

  it('rejects malformed license keys with clear diagnostic notice', () => {
    const invalidKey = 'invalid_key_123';
    const status = LicenseManager.verifyLicenseSync(invalidKey);
    expect(status.valid).toBe(false);
    expect(status.tier).toBe('COMMUNITY');
    expect(status.warning).toBeDefined();
  });

  it('prioritizes explicit key over environment variables and config', () => {
    process.env.GUARDIAN_LICENSE_KEY = 'eg_live_from_env_111122223333444455556666';
    const resolved = LicenseManager.resolveLicenseKey('eg_agency_explicit_1111222233334444');
    expect(resolved).toBe('eg_agency_explicit_1111222233334444');
  });

  it('falls back to environment variable when explicit key is absent', () => {
    process.env.GUARDIAN_LICENSE_KEY = 'eg_live_from_env_111122223333444455556666';
    const resolved = LicenseManager.resolveLicenseKey();
    expect(resolved).toBe('eg_live_from_env_111122223333444455556666');
  });
});

describe('MarkdownReporter Licensing Callouts', () => {
  const reporter = new MarkdownReporter();

  const baseReport: GuardianReport = {
    timestamp: '2026-10-12T12:00:00.000Z',
    passed: true,
    totalErrors: 0,
    totalWarnings: 0,
    compliance: {
      passed: true,
      hasGdprCustomersDataRequest: true,
      hasGdprCustomersRedact: true,
      hasGdprShopRedact: true,
      embeddedConfigured: true,
      scopesRequested: [],
      scopeBloatDetected: false,
      unnecessaryScopes: [],
      findings: [],
    },
    deprecation: { passed: true, deprecatedItemsCount: 0, items: [], findings: [] },
    summaryMarkdown: '',
  };

  it('displays Upgrade to Pro banner when on Community tier', () => {
    const report: GuardianReport = {
      ...baseReport,
      license: LicenseManager.getCommunityStatus(),
    };

    const output = reporter.generate(report);
    expect(output).toContain('Community Edition');
    expect(output).toContain('Upgrade to Pro or Agency');
    expect(output).toContain('https://github.com/marketplace/actions/shopify-edge-guardian');
  });

  it('displays Pro Active badge when verified Pro license is active', () => {
    const proKey = 'eg_live_11223344556677889900aabbccddeeff';
    const report: GuardianReport = {
      ...baseReport,
      license: LicenseManager.verifyLicenseSync(proKey),
    };

    const output = reporter.generate(report);
    expect(output).toContain('Edge Guardian Pro');
    expect(output).toContain('Verified License Active');
  });
});
