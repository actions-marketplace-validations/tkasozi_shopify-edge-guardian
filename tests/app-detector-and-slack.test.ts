import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AppDetector } from '../src/utils/app-detector.js';
import { SlackAlerter } from '../src/notifications/slack-alerter.js';
import { MarkdownReporter } from '../src/reporter/markdown-reporter.js';
import { GuardianReport } from '../src/types/index.js';

describe('AppDetector & Slack Deprecation Alerter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-detector-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.SHOPIFY_APP_CLIENT_ID;
    delete process.env.SHOPIFY_APP_NAME;
    delete process.env.SLACK_WEBHOOK_URL;
  });

  it('detects client_id, name, and handle from shopify.app.toml', () => {
    const tomlContent = `
client_id = "shp_partner_client_999888"
name = "Acme Upsell Engine"
handle = "acme-upsell-engine"
application_url = "https://acme-upsell.example.com"
embedded = true
`;
    fs.writeFileSync(path.join(tmpDir, 'shopify.app.toml'), tomlContent, 'utf-8');

    const app = AppDetector.detect(tmpDir);
    expect(app.source).toBe('shopify.app.toml');
    expect(app.appId).toBe('shp_partner_client_999888');
    expect(app.name).toBe('Acme Upsell Engine');
    expect(app.handle).toBe('acme-upsell-engine');
  });

  it('falls back to environment variables when toml is missing', () => {
    process.env.GITHUB_REPOSITORY = 'agency-partners/client-inventory-sync';
    process.env.SHOPIFY_APP_CLIENT_ID = 'shp_env_12345';
    process.env.SHOPIFY_APP_NAME = 'Client Inventory Sync';

    const app = AppDetector.detect(tmpDir);
    expect(app.source).toBe('env');
    expect(app.appId).toBe('shp_env_12345');
    expect(app.name).toBe('Client Inventory Sync');
    expect(app.repository).toBe('agency-partners/client-inventory-sync');
  });

  it('SlackAlerter rejects empty deprecations or missing webhook URL', async () => {
    const resNoWebhook = await SlackAlerter.dispatchDeprecationAlert({
      appInfo: { appId: 'app_1', name: 'Test App', source: 'directory' },
      deprecations: [
        {
          fieldOrEndpoint: 'Shop.plan',
          deprecatedSince: '2024-04',
          sunsetDate: '2025-04-01',
          reason: 'Use shop.planV2',
          file: 'src/queries.ts',
          line: 12,
        },
      ],
    });
    expect(resNoWebhook.delivered).toBe(false);
    expect(resNoWebhook.error).toMatch(/no slack or discord webhook/i);

    const resNoDeprecations = await SlackAlerter.dispatchDeprecationAlert({
      webhookUrl: 'https://hooks.slack.com/services/T000/B000/XXXX',
      appInfo: { appId: 'app_1', name: 'Test App', source: 'directory' },
      deprecations: [],
    });
    expect(resNoDeprecations.delivered).toBe(false);
    expect(resNoDeprecations.error).toMatch(/no deprecations/i);

    const resInvalidWebhook = await SlackAlerter.dispatchDeprecationAlert({
      webhookUrl: 'http://169.254.169.254/latest/meta-data',
      appInfo: { appId: 'app_1', name: 'Test App', source: 'directory' },
      deprecations: [
        {
          fieldOrEndpoint: 'Shop.plan',
          deprecatedSince: '2024-04',
          sunsetDate: '2025-04-01',
        },
      ],
    });
    expect(resInvalidWebhook.delivered).toBe(false);
    expect(resInvalidWebhook.error).toMatch(/invalid incoming webhook url/i);

    // Gated to Agency Fleet tier when license is provided
    const resProBlocked = await SlackAlerter.dispatchDeprecationAlert({
      webhookUrl: 'https://hooks.slack.com/services/T000/B000/XXXX',
      license: {
        tier: 'PRO',
        valid: true,
        features: {
          coreLinters: true,
          aiSemanticReview: true,
          wasmEdgeProfiler: true,
          fleetDashboardSync: false,
          autoRemediation: true,
          officialCertification: true,
        },
      },
      appInfo: { appId: 'app_1', name: 'Test App', source: 'directory' },
      deprecations: [
        {
          fieldOrEndpoint: 'Shop.plan',
          deprecatedSince: '2024-04',
          sunsetDate: '2025-04-01',
        },
      ],
    });
    expect(resProBlocked.delivered).toBe(false);
    expect(resProBlocked.error).toMatch(/require an agency fleet license/i);
  });

  it('SlackAlerter formats Block Kit and dispatches payload to Slack webhook', async () => {
    let capturedPayload: any = null;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      capturedPayload = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        text: async () => 'ok',
      };
    }) as any;

    try {
      const res = await SlackAlerter.dispatchDeprecationAlert({
        webhookUrl: 'https://hooks.slack.com/services/T000/B000/XXXX',
        appInfo: {
          appId: 'shp_client_111',
          name: 'Flash Checkout',
          repository: 'agency/flash-checkout',
          source: 'shopify.app.toml',
        },
        apiVersion: '2026-04',
        deprecations: [
          {
            fieldOrEndpoint: 'Order.financialStatus',
            deprecatedSince: '2025-01',
            sunsetDate: '2026-01-01',
            reason: 'Replaced by Order.displayFinancialStatus',
            replacement: 'query { order { displayFinancialStatus } }',
            file: 'src/orders.ts',
            line: 44,
          },
        ],
      });

      expect(res.delivered).toBe(true);
      expect(capturedPayload).toBeTruthy();
      expect(capturedPayload.blocks[0].text.text).toContain('Shopify API Deprecation Alert: Flash Checkout');
      expect(JSON.stringify(capturedPayload)).toContain('shp_client_111');
      expect(JSON.stringify(capturedPayload)).toContain('Order.financialStatus');
      expect(JSON.stringify(capturedPayload)).toContain('2026-01-01');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('MarkdownReporter incorporates Agency Fleet slot capacity and portal links', () => {
    const reporter = new MarkdownReporter();
    const mockReport: GuardianReport = {
      timestamp: new Date().toISOString(),
      passed: true,
      totalErrors: 0,
      totalWarnings: 0,
      compliance: {
        passed: true,
        hasGdprCustomersDataRequest: true,
        hasGdprCustomersRedact: true,
        hasGdprShopRedact: true,
        embeddedConfigured: true,
        scopesRequested: ['read_products'],
        scopeBloatDetected: false,
        unnecessaryScopes: [],
        findings: [],
      },
      deprecation: {
        passed: true,
        deprecatedItemsCount: 0,
        items: [],
        findings: [],
      },
      license: {
        tier: 'AGENCY_FLEET',
        valid: true,
        slotsUsed: 14,
        slotsTotal: 20,
        warning: 'Fleet quota exceeded: 21/20 app slots active. In 14-day expansion grace period.',
        features: {
          coreLinters: true,
          aiSemanticReview: true,
          wasmEdgeProfiler: true,
          fleetDashboardSync: true,
          autoRemediation: true,
          officialCertification: true,
        },
      },
      summaryMarkdown: '',
    };

    const md = reporter.generate(mockReport);
    expect(md).toContain('14 / 20 Slots');
    expect(md).toContain('[Manage Fleet](https://billing.endptsec.com/fleet)');
    expect(md).toContain('Fleet Notice');
    expect(md).toContain('14-day expansion grace period');
  });
});
