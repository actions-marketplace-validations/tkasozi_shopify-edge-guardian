import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BfsAnalyzer } from '../src/analyzers/bfs-analyzer.js';
import { MarkdownReporter } from '../src/reporter/markdown-reporter.js';
import { GuardianReport } from '../src/types/index.js';
import { AppDetector } from '../src/utils/app-detector.js';
import { ShopifyEdgeGuardian } from '../src/index.js';

describe('BfsAnalyzer (Built for Shopify Criteria & Dynamic Category Rules)', () => {
  const analyzer = new BfsAnalyzer();
  const reporter = new MarkdownReporter();
  const testRoot = path.resolve(__dirname, '../fixtures/temp-bfs-test');

  beforeAll(() => {
    if (!fs.existsSync(testRoot)) {
      fs.mkdirSync(testRoot, { recursive: true });
    }

    // App 1: Compliant Discount App with Session Tokens & App Bridge v4
    const dirCompliantDiscount = path.join(testRoot, 'compliant-discount-app');
    fs.mkdirSync(path.join(dirCompliantDiscount, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirCompliantDiscount, 'shopify.app.toml'),
      `name = "Quick Discounts for Shopify"\nembedded = true\nscopes = "write_discounts,read_discounts"\n`
    );
    fs.writeFileSync(
      path.join(dirCompliantDiscount, 'package.json'),
      JSON.stringify({
        name: 'quick-discounts',
        dependencies: {
          '@shopify/app-bridge': '^4.1.0',
          '@shopify/app-bridge-react': '^4.1.0',
          '@shopify/polaris': '^12.0.0',
        },
      })
    );
    fs.writeFileSync(
      path.join(dirCompliantDiscount, 'src', 'discount-service.ts'),
      `export const mutation = 'mutation { discountAutomaticAppCreate(...) }';
       export function getHeaders(token: string) {
         return { Authorization: 'Bearer ' + token };
       }
       export const discountLink = '/admin/discounts/new';`
    );

    // App 2: Discount App Violating Category Rule: Creates Draft Orders!
    const dirBadDiscount = path.join(testRoot, 'bad-discount-app');
    fs.mkdirSync(path.join(dirBadDiscount, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirBadDiscount, 'shopify.app.toml'),
      `name = "Draft Discount Hack for Shopify"\nembedded = true\nscopes = "write_discounts,read_discounts,write_draft_orders"\n`
    );
    fs.writeFileSync(
      path.join(dirBadDiscount, 'src', 'draft-discount.ts'),
      `// Anti-pattern: Using draftOrderCreate to bypass native discounts
       const mutation = "mutation { draftOrderCreate(...) }";`
    );

    // App 3: Order Sync App legitimately using Draft Orders (Non-Discount Category)
    const dirOrderSync = path.join(testRoot, 'order-sync-app');
    fs.mkdirSync(path.join(dirOrderSync, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirOrderSync, 'shopify.app.toml'),
      `name = "Wholesale ERP Sync for Shopify"\nembedded = true\nscopes = "write_orders,write_draft_orders"\n`
    );
    fs.writeFileSync(
      path.join(dirOrderSync, 'src', 'erp-sync.ts'),
      `// Legitimate order management tool creating draft orders
       const mutation = "mutation { draftOrderCreate(...) }";`
    );

    // App 4: App Using Prohibited Asset API & Legacy ScriptTags
    const dirInsecureBfs = path.join(testRoot, 'insecure-bfs-app');
    fs.mkdirSync(path.join(dirInsecureBfs, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirInsecureBfs, 'shopify.app.toml'),
      `name = "Asset Injector for Shopify"\nembedded = true\n`
    );
    fs.writeFileSync(
      path.join(dirInsecureBfs, 'src', 'bad-storefront.ts'),
      `// Prohibited ScriptTag & Asset API
       const call1 = "/admin/api/2024-10/script_tags.json";
       const call2 = "/admin/api/2024-10/assets.json?asset[key]=snippets/widget.liquid";
       res.cookie('shopify_session', 'legacy_session_id');`
    );
  });

  afterAll(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('evaluates compliant discount app with all automated Built for Shopify gates passing', () => {
    const dir = path.join(testRoot, 'compliant-discount-app');
    const result = analyzer.analyze(dir);

    expect(result.scorecard.detectedCategory).toBe('discounts');
    expect(result.scorecard.categoryRulesApplied).toBe(true);
    expect(result.scorecard.overallEligibleForReview).toBe(true);

    // Verify Performance
    const cwv = result.scorecard.metrics.find((m) => m.id === 'BFS_PERF_CWV');
    expect(cwv?.status).toBe('PASSED');

    // Verify Design & Functionality
    const sessionAuth = result.scorecard.metrics.find((m) => m.id === 'BFS_DESIGN_SESSION_TOKENS');
    expect(sessionAuth?.status).toBe('PASSED');

    const appBridge = result.scorecard.metrics.find((m) => m.id === 'BFS_DESIGN_APP_BRIDGE_LATEST');
    expect(appBridge?.status).toBe('PASSED');

    const noAssetApi = result.scorecard.metrics.find((m) => m.id === 'BFS_DESIGN_NO_ASSET_API');
    expect(noAssetApi?.status).toBe('PASSED');

    // Verify Discounts Category Criteria
    const discountApis = result.scorecard.metrics.find((m) => m.id === 'BFS_CAT_DISCOUNT_APIS');
    expect(discountApis?.status).toBe('PASSED');

    const noDraftOrders = result.scorecard.metrics.find((m) => m.id === 'BFS_CAT_DISCOUNT_NO_DRAFT_ORDERS');
    expect(noDraftOrders?.status).toBe('PASSED');

    // Verify Merchant Utility Milestones
    const utilityMetrics = result.scorecard.metrics.filter((m) => m.section === 'MERCHANT_UTILITY');
    expect(utilityMetrics).toHaveLength(3);
    for (const m of utilityMetrics) {
      expect(m.status).toBe('POST_LAUNCH_PENDING');
      expect(m.isAutomatedCodeGate).toBe(false);
    }
  });

  it('fails discount app that creates draft orders (CRITICAL category blocker)', () => {
    const dir = path.join(testRoot, 'bad-discount-app');
    const result = analyzer.analyze(dir);

    expect(result.scorecard.detectedCategory).toBe('discounts');
    expect(result.scorecard.overallEligibleForReview).toBe(false);

    const noDraftOrders = result.scorecard.metrics.find((m) => m.id === 'BFS_CAT_DISCOUNT_NO_DRAFT_ORDERS');
    expect(noDraftOrders?.status).toBe('FAILED');

    const draftOrderFinding = result.findings.find((f) => f.id === 'BFS_DISCOUNT_NO_DRAFT_ORDERS');
    expect(draftOrderFinding).toBeDefined();
    expect(draftOrderFinding?.severity).toBe('ERROR');
  });

  it('dynamically skips discount category draft order checks for non-discount apps', () => {
    const dir = path.join(testRoot, 'order-sync-app');
    // Explicitly configure as "orders" category to test dynamic scoping
    const result = analyzer.analyze(dir, { category: 'orders' });

    expect(result.scorecard.detectedCategory).toBe('orders');
    expect(result.scorecard.categoryRulesApplied).toBe(false);

    // The discount draft order rule should NOT fail this order-sync app
    expect(result.findings.some((f) => f.id === 'BFS_DISCOUNT_NO_DRAFT_ORDERS')).toBe(false);

    const skippedCategory = result.scorecard.metrics.find((m) => m.id === 'BFS_CAT_NON_DISCOUNT_SKIPPED');
    expect(skippedCategory?.status).toBe('SKIPPED');
  });

  it('detects prohibited ScriptTags, Asset API, and legacy cookie authentication', () => {
    const dir = path.join(testRoot, 'insecure-bfs-app');
    const result = analyzer.analyze(dir);

    expect(result.scorecard.overallEligibleForReview).toBe(false);

    // Prohibited ScriptTag
    expect(result.findings.some((f) => f.id === 'BFS_STOREFRONT_SCRIPT_TAG_DEPRECATED')).toBe(true);

    // Prohibited Asset API
    expect(result.findings.some((f) => f.id === 'BFS_ASSET_API_PROHIBITED')).toBe(true);

    // Legacy Cookie Authentication
    expect(result.findings.some((f) => f.id === 'BFS_SESSION_TOKEN_AUTH_REQUIRED')).toBe(true);
  });

  it('MarkdownReporter renders Sober Commercial Reality Notice and BFS Scorecard', () => {
    const mockPassingReport: GuardianReport = {
      timestamp: '2026-10-14T20:00:00.000Z',
      passed: true,
      totalErrors: 0,
      totalWarnings: 0,
      compliance: {
        passed: true,
        hasGdprCustomersDataRequest: true,
        hasGdprCustomersRedact: true,
        hasGdprShopRedact: true,
        embeddedConfigured: true,
        scopesRequested: ['write_discounts'],
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
      bfsScorecard: {
        overallEligibleForReview: true,
        detectedCategory: 'discounts',
        categoryRulesApplied: true,
        automatedGatesPassed: 6,
        automatedGatesTotal: 6,
        merchantUtilityGatesPending: 3,
        metrics: [
          {
            id: 'BFS_PERF_CWV',
            name: 'Meets benchmarks for 2025 Core Web Vitals',
            section: 'PERFORMANCE',
            status: 'PASSED',
            detail: 'Theme App Extensions used; zero blocking ScriptTags.',
            isAutomatedCodeGate: true,
          },
          {
            id: 'BFS_DESIGN_EMBEDDED',
            name: 'Enable app embedding',
            section: 'DESIGN_FUNCTIONALITY',
            status: 'PASSED',
            detail: 'embedded = true configured.',
            isAutomatedCodeGate: true,
          },
          {
            id: 'BFS_CAT_DISCOUNT_NO_DRAFT_ORDERS',
            name: "Doesn't create draft orders",
            section: 'CATEGORY_SPECIFIC',
            status: 'PASSED',
            detail: 'Zero draft order calls in discount app.',
            isAutomatedCodeGate: true,
          },
          {
            id: 'BFS_UTIL_MIN_INSTALLS',
            name: 'Minimum 50 net installs from active shops on paid plans',
            section: 'MERCHANT_UTILITY',
            status: 'POST_LAUNCH_PENDING',
            detail: 'Shopify Partner Dashboard telemetry milestone.',
            isAutomatedCodeGate: false,
          },
        ],
      },
      summaryMarkdown: '',
    };

    const output = reporter.generate(mockPassingReport);

    // Verify Sober Commercial Reality header & notice (Zero Vanity Metrics)
    expect(output).toContain('Shopify Edge Guardian: Automated Technical Pre-Flight Checks Passed');
    expect(output).toContain('Sober Commercial Reality Notice (Zero Vanity Metrics)');
    expect(output).toContain('**Automated Code Gates:** Passed');
    expect(output).toContain('**Human Review Requirement:**');
    expect(output).toContain('**Built for Shopify Badge Notice:** The BFS badge is **not granted at launch**');

    // Verify BFS Scorecard Table
    expect(output).toContain('### 5. Built for Shopify (BFS) Readiness Scorecard');
    expect(output).toContain('Primary App Category: **DISCOUNTS**');
    expect(output).toContain('Meets benchmarks for 2025 Core Web Vitals');
    expect(output).toContain("Doesn't create draft orders");
    expect(output).toContain('Minimum 50 net installs from active shops on paid plans');
    expect(output).toContain('⏳  Pending');
  });

  it('detects bulk discount redeem code creation (BFS_DISCOUNT_SINGLE_REDEEM_CODE) with warning', () => {
    const dirBulkDiscount = path.join(testRoot, 'bulk-discount-app');
    fs.mkdirSync(path.join(dirBulkDiscount, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirBulkDiscount, 'shopify.app.toml'),
      `name = "Bulk Coupons for Shopify"\nembedded = true\nscopes = "write_discounts"\n`
    );
    fs.writeFileSync(
      path.join(dirBulkDiscount, 'src', 'coupons.ts'),
      `export async function generateCodes() {
         return await shopify.graphql("mutation { discountRedeemCodeBulkCreate(...) }");
       }`
    );

    const result = analyzer.analyze(dirBulkDiscount);
    const metric = result.scorecard.metrics.find((m) => m.id === 'BFS_CAT_DISCOUNT_SINGLE_CODE');
    expect(metric?.status).toBe('WARNING');
    expect(result.findings.some((f) => f.id === 'BFS_DISCOUNT_SINGLE_REDEEM_CODE')).toBe(true);
  });

  it('marks overallEligibleForReview as false when non-embedded or document.write is present', () => {
    const dirNonEmbedded = path.join(testRoot, 'non-embedded-app');
    fs.mkdirSync(path.join(dirNonEmbedded, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirNonEmbedded, 'shopify.app.toml'),
      `name = "Non Embedded for Shopify"\nembedded = false\nscopes = "write_discounts"\n`
    );
    fs.writeFileSync(
      path.join(dirNonEmbedded, 'src', 'script.ts'),
      `document.write("<script>console.log('blocking');</script>");`
    );

    const result = analyzer.analyze(dirNonEmbedded);
    expect(result.scorecard.overallEligibleForReview).toBe(false);
    expect(result.findings.some((f) => f.id === 'BFS_DESIGN_NOT_EMBEDDED')).toBe(true);
    expect(result.findings.some((f) => f.id === 'BFS_STOREFRONT_SYNC_SCRIPT')).toBe(true);
  });

  it('AppDetector attaches category to shopify.app.toml and ignores commented-out scopes', () => {
    const dirCommented = path.join(testRoot, 'commented-scopes-app');
    fs.mkdirSync(dirCommented, { recursive: true });
    fs.writeFileSync(
      path.join(dirCommented, 'shopify.app.toml'),
      `client_id = "shp_12345"\nname = "Order Manager for Shopify"\nembedded = true\n# scopes = "write_discounts"\nscopes = "write_orders,read_orders"\n`
    );

    const appInfo = AppDetector.detect(dirCommented);
    expect(appInfo.category).toBe('orders');
    expect(appInfo.source).toBe('shopify.app.toml');
  });

  it('ShopifyEdgeGuardian propagates BFS findings into report and Section 7 of Markdown', () => {
    const guardian = new ShopifyEdgeGuardian();

    const dirBad = path.join(testRoot, 'bad-discount-app');
    const report = guardian.runAudit(dirBad);

    expect(report.passed).toBe(false);
    expect(report.totalErrors).toBeGreaterThan(0);
    expect(report.bfsScorecard?.findings).toBeDefined();
    expect(report.bfsScorecard?.findings?.some((f: any) => f.id === 'BFS_DISCOUNT_NO_DRAFT_ORDERS')).toBe(true);

    // Section 7 in summaryMarkdown must contain the draft order error and fix
    expect(report.summaryMarkdown).toContain('### 7. Required Action Items');
    expect(report.summaryMarkdown).toContain('Discounts Category Blocker: Draft Orders Prohibited');
    expect(report.summaryMarkdown).toContain('draftOrderCreate');
    expect(report.summaryMarkdown).toContain('purchase.discount');
  });

  it('deduplicates error counts between review analyzer and bfs analyzer in ShopifyEdgeGuardian', () => {
    const guardian = new ShopifyEdgeGuardian();
    const dirInsecure = path.join(testRoot, 'insecure-bfs-app');
    const report = guardian.runAudit(dirInsecure);

    // Verify deduplication: ScriptTag and Asset API errors are reported without artificial doubling
    const scriptTagErrors = report.bfsScorecard?.findings?.filter((f) => f.id === 'BFS_STOREFRONT_SCRIPT_TAG_DEPRECATED') || [];
    expect(scriptTagErrors.length).toBe(1);

    // Check that Section 7 does not have duplicated identical list items
    const matches = report.summaryMarkdown.match(/ScriptTag API Prohibited for Built for Shopify/g);
    expect(matches?.length).toBe(1);
  });

  it('evaluates Subscriptions app (Section 5.14): enforces Selling Plan APIs & flags Multipass', () => {
    // Bad Subscriptions App: no Selling Plan APIs, uses legacy Multipass
    const dirBadSub = path.join(testRoot, 'bad-sub-app');
    fs.mkdirSync(path.join(dirBadSub, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirBadSub, 'shopify.app.toml'),
      `name = "Custom Subscriptions for Shopify"\nembedded = true\n`
    );
    fs.writeFileSync(
      path.join(dirBadSub, 'src', 'portal.ts'),
      `export function loginUser() {
         return generateMultipassToken("cust_123");
       }`
    );

    const badResult = analyzer.analyze(dirBadSub, { category: 'subscriptions' });
    expect(badResult.scorecard.detectedCategory).toBe('subscriptions');
    expect(badResult.scorecard.categoryRulesApplied).toBe(true);
    expect(badResult.scorecard.overallEligibleForReview).toBe(false);

    // Blocker: Missing Selling Plan APIs
    const primMetric = badResult.scorecard.metrics.find((m) => m.id === 'BFS_CAT_SUBSCRIPTION_PRIMITIVES');
    expect(primMetric?.status).toBe('FAILED');
    expect(badResult.findings.some((f) => f.id === 'BFS_SUBSCRIPTION_PRIMITIVES_REQUIRED')).toBe(true);

    // Warning: Multipass
    const authMetric = badResult.scorecard.metrics.find((m) => m.id === 'BFS_CAT_SUBSCRIPTION_CUSTOMER_PORTAL');
    expect(authMetric?.status).toBe('WARNING');
    expect(badResult.findings.some((f) => f.id === 'BFS_SUBSCRIPTION_OFF_PLATFORM_AUTH')).toBe(true);

    // Compliant Subscriptions App
    const dirGoodSub = path.join(testRoot, 'good-sub-app');
    fs.mkdirSync(path.join(dirGoodSub, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dirGoodSub, 'extensions'), { recursive: true });
    fs.writeFileSync(
      path.join(dirGoodSub, 'shopify.app.toml'),
      `name = "Recurring Subscriptions Pro"\nembedded = true\nscopes = "write_own_subscription_contracts"\n`
    );
    fs.writeFileSync(
      path.join(dirGoodSub, 'package.json'),
      JSON.stringify({
        name: 'good-sub-app',
        dependencies: { '@shopify/app-bridge': '^4.1.0' },
      })
    );
    fs.writeFileSync(
      path.join(dirGoodSub, 'src', 'sub-plan.ts'),
      `export const mutation = 'mutation { sellingPlanGroupCreate(...) }';
       export const auth = 'Bearer token';`
    );

    const goodResult = analyzer.analyze(dirGoodSub);
    expect(goodResult.scorecard.detectedCategory).toBe('subscriptions');
    expect(goodResult.scorecard.categoryRulesApplied).toBe(true);
    const goodPrimMetric = goodResult.scorecard.metrics.find((m) => m.id === 'BFS_CAT_SUBSCRIPTION_PRIMITIVES');
    expect(goodPrimMetric?.status).toBe('PASSED');
  });

  it('evaluates Forms app (Section 5.7): verifies Segments GraphQL API and Customer Sync', () => {
    const dirForms = path.join(testRoot, 'forms-app');
    fs.mkdirSync(path.join(dirForms, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirForms, 'shopify.app.toml'),
      `name = "Interactive Popup Forms for Shopify"\nembedded = true\nscopes = "read_customer_segments,write_customers"\n`
    );
    fs.writeFileSync(
      path.join(dirForms, 'package.json'),
      JSON.stringify({
        name: 'forms-app',
        dependencies: { '@shopify/app-bridge': '^4.0.0' },
      })
    );
    fs.writeFileSync(
      path.join(dirForms, 'src', 'form-sync.ts'),
      `export const segQuery = "query { customerSegmentMembersQuery(...) }";
       export const custMut = "mutation { customerCreate(...) }";
       export const auth = "Bearer token";`
    );

    const result = analyzer.analyze(dirForms);
    expect(result.scorecard.detectedCategory).toBe('forms');
    expect(result.scorecard.categoryRulesApplied).toBe(true);

    const segMetric = result.scorecard.metrics.find((m) => m.id === 'BFS_CAT_FORMS_SEGMENTS_API');
    expect(segMetric?.status).toBe('PASSED');

    const custMetric = result.scorecard.metrics.find((m) => m.id === 'BFS_CAT_FORMS_CUSTOMER_SYNC');
    expect(custMetric?.status).toBe('PASSED');
  });

  it('evaluates Bundles app (Section 5.10): flags missing Cart Transform Functions', () => {
    const dirBundles = path.join(testRoot, 'bundles-app');
    fs.mkdirSync(path.join(dirBundles, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirBundles, 'shopify.app.toml'),
      `name = "Easy Bundler for Shopify"\nembedded = true\n`
    );
    fs.writeFileSync(
      path.join(dirBundles, 'src', 'bundle.ts'),
      `// Anti-pattern: fake bundle with no Cart Transform function
       const x = 1;`
    );

    const result = analyzer.analyze(dirBundles);
    expect(result.scorecard.detectedCategory).toBe('product_bundles');
    expect(result.scorecard.categoryRulesApplied).toBe(true);
    expect(result.scorecard.overallEligibleForReview).toBe(false);

    const bundleMetric = result.scorecard.metrics.find((m) => m.id === 'BFS_CAT_BUNDLES_PRIMITIVES');
    expect(bundleMetric?.status).toBe('FAILED');
    expect(result.findings.some((f) => f.id === 'BFS_BUNDLES_PRIMITIVES_REQUIRED')).toBe(true);
  });

  it('evaluates Fulfillment Services app (Section 5.8): flags legacy /fulfillments endpoint', () => {
    const dirFulfillment = path.join(testRoot, 'fulfillment-app');
    fs.mkdirSync(path.join(dirFulfillment, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirFulfillment, 'shopify.app.toml'),
      `name = "Fast 3PL Warehouse Fulfillment"\nembedded = true\nscopes = "write_fulfillment_orders"\n`
    );
    fs.writeFileSync(
      path.join(dirFulfillment, 'src', 'fulfill.ts'),
      `// Prohibited legacy fulfillment endpoint
       const call = "/admin/api/2024-10/fulfillments.json";`
    );

    const result = analyzer.analyze(dirFulfillment);
    expect(result.scorecard.detectedCategory).toBe('fulfillment_services');
    expect(result.scorecard.categoryRulesApplied).toBe(true);
    expect(result.scorecard.overallEligibleForReview).toBe(false);

    const legacyMetric = result.scorecard.metrics.find((m) => m.id === 'BFS_CAT_FULFILLMENT_NO_LEGACY');
    expect(legacyMetric?.status).toBe('FAILED');
    expect(result.findings.some((f) => f.id === 'BFS_FULFILLMENT_LEGACY_ENDPOINTS')).toBe(true);
  });

  it('evaluates Returns app (Section 5.12): flags missing native Returns APIs and Multipass', () => {
    const dirReturns = path.join(testRoot, 'returns-app');
    fs.mkdirSync(path.join(dirReturns, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirReturns, 'shopify.app.toml'),
      `name = "Automated RMA Returns Portal"\nembedded = true\n`
    );
    fs.writeFileSync(
      path.join(dirReturns, 'src', 'portal.ts'),
      `const token = generateMultipassToken("cust");`
    );

    const result = analyzer.analyze(dirReturns);
    expect(result.scorecard.detectedCategory).toBe('returns_exchanges');
    expect(result.scorecard.categoryRulesApplied).toBe(true);
    expect(result.scorecard.overallEligibleForReview).toBe(false);

    const nativeMetric = result.scorecard.metrics.find((m) => m.id === 'BFS_CAT_RETURNS_NATIVE_APIS');
    expect(nativeMetric?.status).toBe('FAILED');
    expect(result.findings.some((f) => f.id === 'BFS_RETURNS_NATIVE_APIS_REQUIRED')).toBe(true);

    const multiMetric = result.scorecard.metrics.find((m) => m.id === 'BFS_CAT_RETURNS_CUSTOMER_PORTAL');
    expect(multiMetric?.status).toBe('WARNING');
    expect(result.findings.some((f) => f.id === 'BFS_RETURNS_LEGACY_MULTIPASS')).toBe(true);
  });

  it('evaluates Carrier Services app (Section 5.4): records live telemetry gates', () => {
    const dirCarrier = path.join(testRoot, 'carrier-app');
    fs.mkdirSync(path.join(dirCarrier, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirCarrier, 'shopify.app.toml'),
      `name = "Live Carrier Rates for Shopify"\nembedded = true\n`
    );

    const result = analyzer.analyze(dirCarrier, { category: 'carrier_services' });
    expect(result.scorecard.detectedCategory).toBe('carrier_services');
    expect(result.scorecard.categoryRulesApplied).toBe(true);

    const latencyMetric = result.scorecard.metrics.find((m) => m.id === 'BFS_CAT_CARRIER_LATENCY_TELEMETRY');
    expect(latencyMetric?.status).toBe('POST_LAUNCH_PENDING');
    expect(latencyMetric?.isAutomatedCodeGate).toBe(false);

    const relMetric = result.scorecard.metrics.find((m) => m.id === 'BFS_CAT_CARRIER_RELIABILITY_TELEMETRY');
    expect(relMetric?.status).toBe('POST_LAUNCH_PENDING');
    expect(relMetric?.isAutomatedCodeGate).toBe(false);
  });
});
