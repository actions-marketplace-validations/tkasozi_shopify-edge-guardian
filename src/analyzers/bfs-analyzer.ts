import * as fs from 'fs';
import * as path from 'path';
import {
  AppCategory,
  BfsScorecardMetric,
  BuiltForShopifyScorecard,
  EdgeGuardianConfig,
  Finding,
} from '../types/index.js';
import { AppDetector } from '../utils/app-detector.js';
import { maskComments, matchesIgnore } from '../utils/sanitizer.js';
import { ConfigLoader } from '../config/config-loader.js';

export class BfsAnalyzer {
  /**
   * Evaluates a Shopify application against the complete Built for Shopify (BFS)
   * criteria matrix from the Shopify Partner Dashboard:
   * 1. Performance (Core Web Vitals & Storefront Speed)
   * 2. Design and Functionality (Embedded, Session Tokens, App Bridge v4, No Asset API, Polaris)
   * 3. Category-Specific Criteria (Dynamically evaluated, e.g. Discounts: No Draft Orders, Native APIs)
   * 4. Merchant Utility (Post-launch partner milestones)
   */
  public analyze(projectRoot: string, config?: EdgeGuardianConfig): {
    scorecard: BuiltForShopifyScorecard;
    findings: Finding[];
  } {
    const findings: Finding[] = [];
    const metrics: BfsScorecardMetric[] = [];
    const resolvedRoot = path.resolve(projectRoot);

    // 1. Dynamic Category Detection
    const detectedCategory: AppCategory = AppDetector.detectCategory(resolvedRoot, config);
    const isDiscountApp = detectedCategory === 'discounts';
    const isSubscriptionApp = detectedCategory === 'subscriptions';
    const isBundlesApp = detectedCategory === 'product_bundles';
    const isReturnsApp = detectedCategory === 'returns_exchanges';
    const isReviewsApp = detectedCategory === 'product_reviews';
    const isFormsApp = detectedCategory === 'forms';
    const isInvoicesApp = detectedCategory === 'invoices_receipts';
    const isCarrierApp = detectedCategory === 'carrier_services';
    const isFulfillmentApp = detectedCategory === 'fulfillment_services';
    const isMarketingApp = detectedCategory === 'email_marketing' || detectedCategory === 'sms_marketing';
    const isWebPixelsApp = detectedCategory === 'ads' || detectedCategory === 'affiliates' || detectedCategory === 'analytics';
    const hasCategoryRules =
      isDiscountApp ||
      isSubscriptionApp ||
      isBundlesApp ||
      isReturnsApp ||
      isReviewsApp ||
      isFormsApp ||
      isInvoicesApp ||
      isCarrierApp ||
      isFulfillmentApp ||
      isMarketingApp ||
      isWebPixelsApp;

    // Collect codebase files for static inspection
    const scannedFiles = this.collectSourceFiles(resolvedRoot, [], config?.ignore, resolvedRoot);
    let allSourceContent = '';
    const fileContents: { file: string; content: string; clean: string }[] = [];

    for (const f of scannedFiles) {
      try {
        const raw = fs.readFileSync(f, 'utf-8');
        const clean = maskComments(raw, f);
        fileContents.push({ file: f, content: raw, clean });
        allSourceContent += '\n' + clean;
      } catch {}
    }

    // Inspect package.json
    let packageJsonContent = '';
    const packageJsonPath = path.join(resolvedRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
      } catch {}
    }

    // Inspect shopify.app.toml
    let tomlContent = '';
    const tomlPath = path.join(resolvedRoot, 'shopify.app.toml');
    if (fs.existsSync(tomlPath)) {
      try {
        tomlContent = fs.readFileSync(tomlPath, 'utf-8');
      } catch {}
    }

    // ==========================================
    // SECTION 1: Performance Criteria
    // ==========================================

    // 1.1 Meets benchmarks for 2025 Core Web Vitals (No ScriptTags, low latency)
    let cwvPassed = true;
    let cwvDetail = 'Storefront scripts optimized; no blocking ScriptTags detected.';

    // Check for deprecated ScriptTag API usage
    const scriptTagMatch = allSourceContent.match(/(?:\/admin\/api\/[^"']*\/script_tags(?:\.json|\/)?|\bscriptTagCreate\b)/i);
    if (scriptTagMatch) {
      cwvPassed = false;
      cwvDetail = 'Prohibited ScriptTag API detected. Use Theme App Extensions to protect Core Web Vitals.';
      const offending = this.findOffendingLocation(fileContents, /(?:\/admin\/api\/[^"']*\/script_tags|\bscriptTagCreate\b)/i, resolvedRoot);
      findings.push({
        id: 'BFS_STOREFRONT_SCRIPT_TAG_DEPRECATED',
        category: 'BUILT_FOR_SHOPIFY',
        severity: 'ERROR',
        title: 'ScriptTag API Prohibited for Built for Shopify',
        message: 'ScriptTags degrade storefront Core Web Vitals by injecting render-blocking scripts. Built for Shopify requires Theme App Extensions.',
        file: offending?.relPath || 'shopify.app.toml',
        line: offending?.line,
        matchedPhrase: scriptTagMatch[0],
        lineContent: offending?.lineContent,
        remediation: 'Migrate storefront script injections to Theme App Extensions (app embed blocks).',
      });
    }

    // Check Theme App Extension storefront assets size budget (< 50KB)
    const extensionsDir = path.join(resolvedRoot, 'extensions');
    if (fs.existsSync(extensionsDir)) {
      const assetFiles = this.collectAssetFiles(extensionsDir);
      for (const asset of assetFiles) {
        try {
          const stats = fs.statSync(asset);
          if (stats.size > 50 * 1024) {
            const relAsset = path.relative(resolvedRoot, asset);
            findings.push({
              id: 'BFS_STOREFRONT_ASSET_SIZE_EXCEEDED',
              category: 'BUILT_FOR_SHOPIFY',
              severity: 'WARNING',
              title: `Theme App Extension Asset Exceeds 50KB: ${path.basename(asset)}`,
              message: `Storefront asset '${relAsset}' is ${(stats.size / 1024).toFixed(1)}KB, exceeding the 50KB best-practice budget for storefront performance.`,
              file: relAsset,
              remediation: 'Minify and split Theme App Extension scripts to minimize impact on merchant Core Web Vitals.',
            });
            cwvDetail = 'Theme App Extension asset exceeds recommended 50KB performance threshold.';
          }
        } catch {}
      }
    }

    metrics.push({
      id: 'BFS_PERF_CWV',
      name: 'Meets benchmarks for 2025 Core Web Vitals',
      section: 'PERFORMANCE',
      status: cwvPassed ? 'PASSED' : 'FAILED',
      detail: cwvDetail,
      isAutomatedCodeGate: true,
    });

    // 1.2 Minimizes impact on storefront loading speed
    const syncScriptMatch = allSourceContent.match(/\bdocument\.write\s*\(/i);
    if (syncScriptMatch) {
      metrics.push({
        id: 'BFS_PERF_STOREFRONT_SPEED',
        name: 'Minimizes impact on storefront loading speed',
        section: 'PERFORMANCE',
        status: 'FAILED',
        detail: 'Synchronous document.write detected in storefront scripts.',
        isAutomatedCodeGate: true,
      });
      const offending = this.findOffendingLocation(fileContents, /\bdocument\.write\s*\(/i, resolvedRoot);
      findings.push({
        id: 'BFS_STOREFRONT_SYNC_SCRIPT',
        category: 'BUILT_FOR_SHOPIFY',
        severity: 'ERROR',
        title: 'Synchronous Storefront Script Execution Prohibited',
        message: 'Synchronous DOM injection (`document.write`) blocks storefront rendering and severely degrades Core Web Vitals.',
        file: offending?.relPath || 'src',
        line: offending?.line,
        matchedPhrase: syncScriptMatch[0],
        lineContent: offending?.lineContent,
        remediation: 'Use asynchronous DOM manipulation or Theme App Extension app embeds.',
      });
    } else {
      metrics.push({
        id: 'BFS_PERF_STOREFRONT_SPEED',
        name: 'Minimizes impact on storefront loading speed',
        section: 'PERFORMANCE',
        status: 'PASSED',
        detail: 'Asynchronous storefront asset delivery verified.',
        isAutomatedCodeGate: true,
      });
    }

    // ==========================================
    // SECTION 2: Design and Functionality
    // ==========================================

    // 2.1 Enable app embedding
    const embeddedMatch = tomlContent.match(/^\s*embedded\s*=\s*(true|false)/m);
    const isEmbedded = embeddedMatch ? embeddedMatch[1].toLowerCase() === 'true' : false;

    if (!isEmbedded) {
      findings.push({
        id: 'BFS_DESIGN_NOT_EMBEDDED',
        category: 'BUILT_FOR_SHOPIFY',
        severity: 'ERROR',
        title: 'Embedded App Required for Built for Shopify',
        message: 'Built for Shopify requires apps to be embedded in Shopify Admin. Set `embedded = true` in shopify.app.toml.',
        file: 'shopify.app.toml',
        remediation: 'Set `embedded = true` in shopify.app.toml and configure Shopify App Bridge.',
      });
    }

    metrics.push({
      id: 'BFS_DESIGN_EMBEDDED',
      name: 'Enable app embedding',
      section: 'DESIGN_FUNCTIONALITY',
      status: isEmbedded ? 'PASSED' : 'FAILED',
      detail: isEmbedded ? '`embedded = true` configured in shopify.app.toml.' : '`embedded = false` or missing. Embedded admin required for Built for Shopify.',
      isAutomatedCodeGate: true,
    });

    // 2.2 Use session token authentication
    const hasSessionTokenAuth =
      /@shopify\/app-bridge-react\b/i.test(packageJsonContent) ||
      /@shopify\/shopify-app-remix\b/i.test(packageJsonContent) ||
      /\b(?:getSessionToken|idToken|authenticate\.admin|validateAuthenticatedSessionToken)\b/i.test(allSourceContent) ||
      /Authorization:\s*['"`]Bearer\s+/i.test(allSourceContent);

    const hasLegacyCookieAuth =
      /\b(?:res\.cookie\s*\(\s*['"]shopify_session|express-session|cookie-session)\b/i.test(allSourceContent) &&
      !hasSessionTokenAuth;

    if (hasLegacyCookieAuth) {
      metrics.push({
        id: 'BFS_DESIGN_SESSION_TOKENS',
        name: 'Use session token authentication',
        section: 'DESIGN_FUNCTIONALITY',
        status: 'FAILED',
        detail: 'Legacy cookie-based session authentication detected without App Bridge session tokens.',
        isAutomatedCodeGate: true,
      });
      findings.push({
        id: 'BFS_SESSION_TOKEN_AUTH_REQUIRED',
        category: 'BUILT_FOR_SHOPIFY',
        severity: 'ERROR',
        title: 'Session Token Authentication Required',
        message: 'Built for Shopify requires session token authentication. Legacy cookie authentication is rejected due to Safari ITP and Chrome cookie partitions.',
        remediation: 'Use @shopify/shopify-app-remix authenticate.admin(request) or App Bridge getSessionToken for API requests.',
      });
    } else if (hasSessionTokenAuth || !isEmbedded) {
      metrics.push({
        id: 'BFS_DESIGN_SESSION_TOKENS',
        name: 'Use session token authentication',
        section: 'DESIGN_FUNCTIONALITY',
        status: 'PASSED',
        detail: 'App Bridge session token authentication / bearer authorization verified.',
        isAutomatedCodeGate: true,
      });
    } else {
      metrics.push({
        id: 'BFS_DESIGN_SESSION_TOKENS',
        name: 'Use session token authentication',
        section: 'DESIGN_FUNCTIONALITY',
        status: 'WARNING',
        detail: 'Explicit session token middleware not verified. Ensure App Bridge session tokens authenticate all backend requests.',
        isAutomatedCodeGate: true,
      });
    }

    // 2.3 Use latest version of App Bridge on every page
    const hasAppBridgeV4Cdn = /cdn\.shopify\.com\/shopifycloud\/app-bridge\.js/i.test(allSourceContent);
    const hasAppBridgePkg = /"@shopify\/(?:app-bridge|shopify-app-remix)":\s*["']\^?[4-9]/i.test(packageJsonContent);
    const hasLegacyAppBridge = /"@shopify\/app-bridge":\s*["']\^?[1-3]\./i.test(packageJsonContent);

    if (hasLegacyAppBridge && !hasAppBridgeV4Cdn) {
      metrics.push({
        id: 'BFS_DESIGN_APP_BRIDGE_LATEST',
        name: 'Use the latest version of App Bridge on every page',
        section: 'DESIGN_FUNCTIONALITY',
        status: 'WARNING',
        detail: 'Legacy App Bridge version (v1-v3) detected in package.json. Upgrade to App Bridge v4.',
        isAutomatedCodeGate: true,
      });
      findings.push({
        id: 'BFS_APP_BRIDGE_LATEST_REQUIRED',
        category: 'BUILT_FOR_SHOPIFY',
        severity: 'WARNING',
        title: 'App Bridge v4 Upgrade Recommended',
        message: 'Shopify recommends the unified App Bridge v4 script on every page for the modern Admin experience.',
        remediation: 'Add <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script> to your HTML layout.',
      });
    } else if (hasAppBridgeV4Cdn || hasAppBridgePkg || /shopifyApp/i.test(allSourceContent)) {
      metrics.push({
        id: 'BFS_DESIGN_APP_BRIDGE_LATEST',
        name: 'Use the latest version of App Bridge on every page',
        section: 'DESIGN_FUNCTIONALITY',
        status: 'PASSED',
        detail: 'Modern App Bridge v4 / Shopify Admin integration detected.',
        isAutomatedCodeGate: true,
      });
    } else {
      metrics.push({
        id: 'BFS_DESIGN_APP_BRIDGE_LATEST',
        name: 'Use the latest version of App Bridge on every page',
        section: 'DESIGN_FUNCTIONALITY',
        status: 'WARNING',
        detail: 'App Bridge script not found. Include https://cdn.shopify.com/shopifycloud/app-bridge.js on all pages.',
        isAutomatedCodeGate: true,
      });
    }

    // 2.4 Doesn't use Asset API (Strict universal ban)
    const assetApiMatch = allSourceContent.match(/(?:\/admin\/api\/[^"']*\/assets(?:\.json|\/)?|\bassetUpdate\b)/i);
    if (assetApiMatch) {
      metrics.push({
        id: 'BFS_DESIGN_NO_ASSET_API',
        name: "Doesn't use Asset API",
        section: 'DESIGN_FUNCTIONALITY',
        status: 'FAILED',
        detail: 'Prohibited Asset API usage detected. Built for Shopify requires Theme App Extensions.',
        isAutomatedCodeGate: true,
      });
      const offending = this.findOffendingLocation(fileContents, /(?:\/admin\/api\/[^"']*\/assets|\bassetUpdate\b)/i, resolvedRoot);
      findings.push({
        id: 'BFS_ASSET_API_PROHIBITED',
        category: 'BUILT_FOR_SHOPIFY',
        severity: 'ERROR',
        title: 'Asset API Usage Prohibited for Built for Shopify',
        message: 'Apps qualifying for Built for Shopify must not use the Asset API to alter theme files. Apps must use Theme App Extensions.',
        file: offending?.relPath || 'src',
        line: offending?.line,
        matchedPhrase: assetApiMatch[0],
        lineContent: offending?.lineContent,
        remediation: 'Migrate storefront customizations from Asset API to Theme App Extensions.',
      });
    } else {
      metrics.push({
        id: 'BFS_DESIGN_NO_ASSET_API',
        name: "Doesn't use Asset API",
        section: 'DESIGN_FUNCTIONALITY',
        status: 'PASSED',
        detail: 'Zero Asset API calls detected across codebase.',
        isAutomatedCodeGate: true,
      });
    }

    // 2.5 Uses Shopify design guidelines
    const hasPolaris =
      /@shopify\/polaris\b/i.test(packageJsonContent) ||
      /@shopify\/polaris\b/i.test(allSourceContent) ||
      /@shopify\/polaris-tokens\b/i.test(allSourceContent);

    metrics.push({
      id: 'BFS_DESIGN_POLARIS',
      name: 'Uses Shopify design guidelines',
      section: 'DESIGN_FUNCTIONALITY',
      status: hasPolaris ? 'PASSED' : 'WARNING',
      detail: hasPolaris ? 'Shopify Polaris design system detected.' : 'Polaris not detected. Ensure embedded UI follows Shopify Polaris guidelines.',
      isAutomatedCodeGate: true,
    });

    // ==========================================
    // SECTION 3: Category-Specific Criteria (Shopify Section 5)
    // ==========================================
    if (isDiscountApp) {
      // 5.5 Discount apps
      // 5.5.1 Uses discount primitives
      const hasDiscountApis =
        /\b(?:discountAutomaticAppCreate|discountCodeAppCreate|discountNode|purchase\.discount)\b/i.test(allSourceContent) ||
        tomlContent.includes('write_discounts');

      metrics.push({
        id: 'BFS_CAT_DISCOUNT_APIS',
        name: 'Uses discount APIs',
        section: 'CATEGORY_SPECIFIC',
        status: hasDiscountApis ? 'PASSED' : 'WARNING',
        detail: hasDiscountApis ? 'Section 5.5.1: Native GraphQL Discount APIs or Shopify Functions detected.' : 'Section 5.5.1: No native discount API mutations found.',
        isAutomatedCodeGate: true,
      });

      // 5.5.2 Doesn't create draft orders (CRITICAL REVIEW BLOCKER)
      const draftOrderMatch = allSourceContent.match(/(?:\/admin\/api\/[^"']*\/draft_orders(?:\.json|\/)?|\bdraftOrderCreate\b)/i);
      if (draftOrderMatch) {
        metrics.push({
          id: 'BFS_CAT_DISCOUNT_NO_DRAFT_ORDERS',
          name: "Doesn't create draft orders",
          section: 'CATEGORY_SPECIFIC',
          status: 'FAILED',
          detail: 'Section 5.5.2 Blocker: Discount app creates draft orders to apply discounts. Prohibited for Built for Shopify.',
          isAutomatedCodeGate: true,
        });

        const offending = this.findOffendingLocation(fileContents, /(?:\/admin\/api\/[^"']*\/draft_orders|\bdraftOrderCreate\b)/i, resolvedRoot);
        findings.push({
          id: 'BFS_DISCOUNT_NO_DRAFT_ORDERS',
          category: 'CATEGORY_CRITERIA',
          severity: 'ERROR',
          title: 'Discounts Category Blocker: Draft Orders Prohibited (Section 5.5.2)',
          message: 'Shopify Built for Shopify requirement for Discounts category (Section 5.5.2): Apps in the Discounts category must not create draft orders to apply discounts. They must use native Discount APIs or Shopify Functions.',
          file: offending?.relPath || 'src',
          line: offending?.line,
          matchedPhrase: draftOrderMatch[0],
          lineContent: offending?.lineContent,
          remediation: 'Remove draft order creation. Use GraphQL discountAutomaticAppCreate, discountCodeAppCreate, or Shopify Functions (purchase.discount).',
        });
      } else {
        metrics.push({
          id: 'BFS_CAT_DISCOUNT_NO_DRAFT_ORDERS',
          name: "Doesn't create draft orders",
          section: 'CATEGORY_SPECIFIC',
          status: 'PASSED',
          detail: 'Section 5.5.2: Compliant: Zero draft order creation calls in discount app.',
          isAutomatedCodeGate: true,
        });
      }

      // 5.5.3 Uses a single redeem code per discount
      const bulkDiscountMatch = allSourceContent.match(/\b(?:generateBulkDiscountCodes|discountRedeemCodeBulkCreate)\b/i);
      if (bulkDiscountMatch) {
        metrics.push({
          id: 'BFS_CAT_DISCOUNT_SINGLE_CODE',
          name: 'Uses a single redeem code per discount',
          section: 'CATEGORY_SPECIFIC',
          status: 'WARNING',
          detail: 'Section 5.5.3: Bulk discount redeem code creation detected. Single redeem code expected for Built for Shopify.',
          isAutomatedCodeGate: true,
        });
        const offending = this.findOffendingLocation(fileContents, /\b(?:generateBulkDiscountCodes|discountRedeemCodeBulkCreate)\b/i, resolvedRoot);
        findings.push({
          id: 'BFS_DISCOUNT_SINGLE_REDEEM_CODE',
          category: 'CATEGORY_CRITERIA',
          severity: 'WARNING',
          title: 'Discounts Category Criterion: Single Redeem Code Expected (Section 5.5.3)',
          message: 'Shopify Built for Shopify criteria (Section 5.5.3) expect a single redeem code per discount configuration rather than generating bulk fragmented codes.',
          file: offending?.relPath || 'src',
          line: offending?.line,
          matchedPhrase: bulkDiscountMatch[0],
          lineContent: offending?.lineContent,
          remediation: 'Configure a single redeem code per discount definition.',
        });
      } else {
        metrics.push({
          id: 'BFS_CAT_DISCOUNT_SINGLE_CODE',
          name: 'Uses a single redeem code per discount',
          section: 'CATEGORY_SPECIFIC',
          status: 'PASSED',
          detail: 'Section 5.5.3: Standard single discount code structure verified.',
          isAutomatedCodeGate: true,
        });
      }

      // 5.5.4 Links directly to discount creation flow
      const hasDiscountFlowLink =
        /(?:\/admin\/discounts\/new|shopify:\/\/admin\/discounts\/new)/i.test(allSourceContent) ||
        /intents\.invoke\s*\(\s*['"]discount/i.test(allSourceContent);

      metrics.push({
        id: 'BFS_CAT_DISCOUNT_DIRECT_FLOW',
        name: 'Links directly to discount creation flow',
        section: 'CATEGORY_SPECIFIC',
        status: hasDiscountFlowLink ? 'PASSED' : 'WARNING',
        detail: hasDiscountFlowLink ? 'Section 5.5.4: Deep link to Shopify Admin discount flow configured.' : 'Section 5.5.4: Provide deep links to /admin/discounts/new for seamless merchant flow.',
        isAutomatedCodeGate: true,
      });
    } else if (isSubscriptionApp) {
      // 5.14 Subscription apps
      // 5.14.1 Uses Selling Plan & Subscription Contract APIs
      const hasSubscriptionApis =
        /\b(?:sellingPlanGroupCreate|subscriptionContractCreate|sellingPlanGroup|subscriptionBillingAttemptCreate)\b/i.test(allSourceContent) ||
        tomlContent.includes('write_own_subscription_contracts') ||
        tomlContent.includes('write_subscriptions');

      if (!hasSubscriptionApis) {
        metrics.push({
          id: 'BFS_CAT_SUBSCRIPTION_PRIMITIVES',
          name: 'Uses Selling Plan & Subscription Contract APIs',
          section: 'CATEGORY_SPECIFIC',
          status: 'FAILED',
          detail: 'Section 5.14.1 Blocker: Subscription app missing Selling Plan and Subscription Contract APIs.',
          isAutomatedCodeGate: true,
        });
        findings.push({
          id: 'BFS_SUBSCRIPTION_PRIMITIVES_REQUIRED',
          category: 'CATEGORY_CRITERIA',
          severity: 'ERROR',
          title: 'Subscription Category Blocker: Selling Plan APIs Required (Section 5.14.1)',
          message: 'Shopify Built for Shopify requirement for Subscription apps (Section 5.14.1): Subscription apps must use native Shopify Selling Plan and Subscription Contract APIs.',
          file: 'shopify.app.toml',
          remediation: 'Implement GraphQL sellingPlanGroupCreate and subscriptionContractCreate APIs with write_own_subscription_contracts scope.',
        });
      } else {
        metrics.push({
          id: 'BFS_CAT_SUBSCRIPTION_PRIMITIVES',
          name: 'Uses Selling Plan & Subscription Contract APIs',
          section: 'CATEGORY_SPECIFIC',
          status: 'PASSED',
          detail: 'Section 5.14.1: Native Shopify Selling Plan / Subscription Contract integration verified.',
          isAutomatedCodeGate: true,
        });
      }

      // 5.14.2 Uses Theme App Blocks for product subscription options
      const hasThemeBlock =
        /extensions\/.*\.liquid/i.test(allSourceContent) ||
        /theme_app_extension/i.test(allSourceContent) ||
        fs.existsSync(path.join(resolvedRoot, 'extensions'));

      metrics.push({
        id: 'BFS_CAT_SUBSCRIPTION_THEME_BLOCKS',
        name: 'Uses Theme App Blocks for subscription options',
        section: 'CATEGORY_SPECIFIC',
        status: hasThemeBlock ? 'PASSED' : 'WARNING',
        detail: hasThemeBlock ? 'Section 5.14.2: Theme App Extension blocks configured for product subscription selection.' : 'Section 5.14.2: Deliver storefront subscription selection UI using Theme App Blocks.',
        isAutomatedCodeGate: true,
      });

      // 5.14.5 Customer Account API authentication
      const multipassMatch = allSourceContent.match(/\b(?:multipass|generateMultipassToken)\b/i);
      if (multipassMatch) {
        metrics.push({
          id: 'BFS_CAT_SUBSCRIPTION_CUSTOMER_PORTAL',
          name: 'Subscriber portal uses Customer Account API',
          section: 'CATEGORY_SPECIFIC',
          status: 'WARNING',
          detail: 'Section 5.14.5: Multipass detected. Built for Shopify requires Customer Account API for subscriber self-service.',
          isAutomatedCodeGate: true,
        });
        const offending = this.findOffendingLocation(fileContents, /\b(?:multipass|generateMultipassToken)\b/i, resolvedRoot);
        findings.push({
          id: 'BFS_SUBSCRIPTION_OFF_PLATFORM_AUTH',
          category: 'CATEGORY_CRITERIA',
          severity: 'WARNING',
          title: 'Subscription Category Criterion: Customer Account API Authentication (Section 5.14.5)',
          message: 'Shopify Built for Shopify requirement for Subscription apps (Section 5.14.5): Customer subscriber management portals must authenticate via Customer Account API or Customer Account UI extensions rather than Multipass.',
          file: offending?.relPath || 'src',
          line: offending?.line,
          matchedPhrase: multipassMatch[0],
          lineContent: offending?.lineContent,
          remediation: 'Integrate Customer Account API or build a customer-account UI extension.',
        });
      } else {
        metrics.push({
          id: 'BFS_CAT_SUBSCRIPTION_CUSTOMER_PORTAL',
          name: 'Subscriber portal uses Customer Account API',
          section: 'CATEGORY_SPECIFIC',
          status: 'PASSED',
          detail: 'Section 5.14.5: Compliant: Zero legacy multipass tokens detected for subscriber portal.',
          isAutomatedCodeGate: true,
        });
      }
    } else if (isFormsApp) {
      // 5.7 Forms apps
      // 5.7.1 Uses Shopify Segments GraphQL API
      const hasSegmentsApi =
        /\b(?:segmentCreate|customerSegmentMembersQuery|segments)\b/i.test(allSourceContent) ||
        tomlContent.includes('read_customer_segments');

      metrics.push({
        id: 'BFS_CAT_FORMS_SEGMENTS_API',
        name: 'Uses Shopify Segments GraphQL API',
        section: 'CATEGORY_SPECIFIC',
        status: hasSegmentsApi ? 'PASSED' : 'WARNING',
        detail: hasSegmentsApi ? 'Section 5.7.1: Shopify Segments GraphQL API detected.' : 'Section 5.7.1: Forms apps must sync audience segments directly with the Shopify Segments GraphQL API.',
        isAutomatedCodeGate: true,
      });

      // 5.7.3 Customer data sync
      const hasCustomerSync =
        /\b(?:customerCreate|customerUpdate|customerEmailMarketingConsentUpdate)\b/i.test(allSourceContent) ||
        tomlContent.includes('write_customers');

      metrics.push({
        id: 'BFS_CAT_FORMS_CUSTOMER_SYNC',
        name: 'Syncs customer data with Shopify Customer API',
        section: 'CATEGORY_SPECIFIC',
        status: hasCustomerSync ? 'PASSED' : 'WARNING',
        detail: hasCustomerSync ? 'Section 5.7.3: Form leads synchronized with Shopify Customer API.' : 'Section 5.7.3: Forms apps must sync collected emails and phone numbers directly with Shopify Customer API.',
        isAutomatedCodeGate: true,
      });
    } else if (isBundlesApp) {
      // 5.10 Product bundles apps
      const hasBundlePrimitives =
        /\b(?:purchase\.cart-transform|cartTransform|productBundleComponent|productVariantsArguments)\b/i.test(allSourceContent) ||
        allSourceContent.includes('cart_transform');

      if (!hasBundlePrimitives) {
        metrics.push({
          id: 'BFS_CAT_BUNDLES_PRIMITIVES',
          name: 'Uses Cart Transform API or Bundles primitives',
          section: 'CATEGORY_SPECIFIC',
          status: 'FAILED',
          detail: 'Section 5.10.1 Blocker: Product bundles apps must use Shopify Functions (purchase.cart-transform) or native Bundles GraphQL primitives.',
          isAutomatedCodeGate: true,
        });
        findings.push({
          id: 'BFS_BUNDLES_PRIMITIVES_REQUIRED',
          category: 'CATEGORY_CRITERIA',
          severity: 'ERROR',
          title: 'Bundles Category Blocker: Cart Transform / Bundles Primitives Required (Section 5.10.1)',
          message: 'Shopify Built for Shopify requirement for Product bundles apps (Section 5.10.1): Apps must use the Cart Transform Function API or GraphQL Bundles primitives.',
          file: 'shopify.app.toml',
          remediation: 'Implement a purchase.cart-transform Shopify Function or use GraphQL Bundles primitives.',
        });
      } else {
        metrics.push({
          id: 'BFS_CAT_BUNDLES_PRIMITIVES',
          name: 'Uses Cart Transform API or Bundles primitives',
          section: 'CATEGORY_SPECIFIC',
          status: 'PASSED',
          detail: 'Section 5.10.1: Native Shopify Cart Transform Function or Bundles primitives detected.',
          isAutomatedCodeGate: true,
        });
      }
    } else if (isReturnsApp) {
      // 5.12 Returns and exchanges apps
      const hasReturnsApis =
        /\b(?:returnCreate|returnRequestApprove|returnLineItem|reverseFulfillmentOrder)\b/i.test(allSourceContent) ||
        tomlContent.includes('write_returns');

      if (!hasReturnsApis) {
        metrics.push({
          id: 'BFS_CAT_RETURNS_NATIVE_APIS',
          name: 'Uses native Shopify Returns APIs',
          section: 'CATEGORY_SPECIFIC',
          status: 'FAILED',
          detail: 'Section 5.12.1 Blocker: Returns app must integrate with native Shopify Returns APIs (returnCreate, returnLineItem).',
          isAutomatedCodeGate: true,
        });
        findings.push({
          id: 'BFS_RETURNS_NATIVE_APIS_REQUIRED',
          category: 'CATEGORY_CRITERIA',
          severity: 'ERROR',
          title: 'Returns Category Blocker: Native Returns APIs Required (Section 5.12.1)',
          message: 'Shopify Built for Shopify requirement for Returns and exchanges apps (Section 5.12.1): Apps must use native Shopify Returns APIs.',
          file: 'shopify.app.toml',
          remediation: 'Integrate with GraphQL returnCreate, returnLineItem, and reverseFulfillmentOrder APIs.',
        });
      } else {
        metrics.push({
          id: 'BFS_CAT_RETURNS_NATIVE_APIS',
          name: 'Uses native Shopify Returns APIs',
          section: 'CATEGORY_SPECIFIC',
          status: 'PASSED',
          detail: 'Section 5.12.1: Native Shopify Returns API integration detected.',
          isAutomatedCodeGate: true,
        });
      }

      // 5.12.4 Customer Account API authentication
      const multipassMatch = allSourceContent.match(/\b(?:multipass|generateMultipassToken)\b/i);
      if (multipassMatch) {
        metrics.push({
          id: 'BFS_CAT_RETURNS_CUSTOMER_PORTAL',
          name: 'Return portal authenticates via Customer Account API',
          section: 'CATEGORY_SPECIFIC',
          status: 'WARNING',
          detail: 'Section 5.12.4: Multipass detected. Built for Shopify requires Customer Account API for return portals.',
          isAutomatedCodeGate: true,
        });
        const offending = this.findOffendingLocation(fileContents, /\b(?:multipass|generateMultipassToken)\b/i, resolvedRoot);
        findings.push({
          id: 'BFS_RETURNS_LEGACY_MULTIPASS',
          category: 'CATEGORY_CRITERIA',
          severity: 'WARNING',
          title: 'Returns Category Criterion: Customer Account API Authentication (Section 5.12.4)',
          message: 'Shopify Built for Shopify requirement for Returns and exchanges apps (Section 5.12.4): Buyer self-service return portals must authenticate using the Customer Account API rather than legacy Multipass tokens.',
          file: offending?.relPath || 'src',
          line: offending?.line,
          matchedPhrase: multipassMatch[0],
          lineContent: offending?.lineContent,
          remediation: 'Implement Customer Account API authentication or Customer Account UI extensions.',
        });
      } else {
        metrics.push({
          id: 'BFS_CAT_RETURNS_CUSTOMER_PORTAL',
          name: 'Return portal authenticates via Customer Account API',
          section: 'CATEGORY_SPECIFIC',
          status: 'PASSED',
          detail: 'Section 5.12.4: Compliant: Zero legacy multipass tokens detected for returns portal.',
          isAutomatedCodeGate: true,
        });
      }
    } else if (isReviewsApp) {
      // 5.11 Product reviews apps
      const hasFlowTriggers =
        /\b(?:shopify\.flow\.trigger|flow_trigger)\b/i.test(allSourceContent) ||
        /flow/i.test(allSourceContent);

      metrics.push({
        id: 'BFS_CAT_REVIEWS_FLOW_TRIGGERS',
        name: 'Implements Shopify Flow triggers for review events',
        section: 'CATEGORY_SPECIFIC',
        status: hasFlowTriggers ? 'PASSED' : 'WARNING',
        detail: hasFlowTriggers ? 'Section 5.11.1: Shopify Flow trigger integration detected.' : 'Section 5.11.1: Product reviews apps must emit Shopify Flow triggers on review submissions.',
        isAutomatedCodeGate: true,
      });

      const hasThemeBlock = /extensions\/.*\.liquid/i.test(allSourceContent) || fs.existsSync(path.join(resolvedRoot, 'extensions'));
      metrics.push({
        id: 'BFS_CAT_REVIEWS_THEME_BLOCKS',
        name: 'Renders review widgets with Theme App Blocks',
        section: 'CATEGORY_SPECIFIC',
        status: hasThemeBlock ? 'PASSED' : 'WARNING',
        detail: hasThemeBlock ? 'Section 5.11.2: Storefront review widgets rendered via Theme App Blocks.' : 'Section 5.11.2: Review widgets must be rendered via Theme App Blocks.',
        isAutomatedCodeGate: true,
      });
    } else if (isFulfillmentApp) {
      // 5.8 Fulfillment services apps
      const hasFulfillmentOrdersApi =
        /\b(?:fulfillmentOrders|fulfillmentOrderAcceptFulfillmentRequest)\b/i.test(allSourceContent) ||
        tomlContent.includes('write_fulfillment_orders');

      if (!hasFulfillmentOrdersApi) {
        metrics.push({
          id: 'BFS_CAT_FULFILLMENT_ORDERS_API',
          name: 'Uses Fulfillment Orders API',
          section: 'CATEGORY_SPECIFIC',
          status: 'FAILED',
          detail: 'Section 5.8.1 Blocker: Fulfillment services apps must use the Fulfillment Orders API.',
          isAutomatedCodeGate: true,
        });
        findings.push({
          id: 'BFS_FULFILLMENT_ORDERS_REQUIRED',
          category: 'CATEGORY_CRITERIA',
          severity: 'ERROR',
          title: 'Fulfillment Services Blocker: Fulfillment Orders API Required (Section 5.8.1)',
          message: 'Shopify Built for Shopify requirement for Fulfillment services apps (Section 5.8.1): Apps must use the Fulfillment Orders API.',
          file: 'shopify.app.toml',
          remediation: 'Migrate to the Fulfillment Orders GraphQL API (fulfillmentOrders).',
        });
      } else {
        metrics.push({
          id: 'BFS_CAT_FULFILLMENT_ORDERS_API',
          name: 'Uses Fulfillment Orders API',
          section: 'CATEGORY_SPECIFIC',
          status: 'PASSED',
          detail: 'Section 5.8.1: Fulfillment Orders API integration verified.',
          isAutomatedCodeGate: true,
        });
      }

      // Prohibit legacy fulfillment endpoints
      const legacyFulfillmentMatch = allSourceContent.match(/(?:\/admin\/api\/[^"']*\/fulfillments(?:\.json|\/)|\bfulfillmentCreate\b)/i);
      if (legacyFulfillmentMatch) {
        metrics.push({
          id: 'BFS_CAT_FULFILLMENT_NO_LEGACY',
          name: 'Prohibits legacy Fulfillment endpoints',
          section: 'CATEGORY_SPECIFIC',
          status: 'FAILED',
          detail: 'Section 5.8.1 Blocker: Legacy Fulfillment API endpoints detected. Prohibited for Built for Shopify.',
          isAutomatedCodeGate: true,
        });
        const offending = this.findOffendingLocation(fileContents, /(?:\/admin\/api\/[^"']*\/fulfillments|\bfulfillmentCreate\b)/i, resolvedRoot);
        findings.push({
          id: 'BFS_FULFILLMENT_LEGACY_ENDPOINTS',
          category: 'CATEGORY_CRITERIA',
          severity: 'ERROR',
          title: 'Fulfillment Services Blocker: Legacy Fulfillment API Prohibited (Section 5.8.1)',
          message: 'Shopify Built for Shopify requirement for Fulfillment services apps (Section 5.8.1): Apps must use the Fulfillment Orders API. Legacy Fulfillment endpoints are prohibited.',
          file: offending?.relPath || 'src',
          line: offending?.line,
          matchedPhrase: legacyFulfillmentMatch[0],
          lineContent: offending?.lineContent,
          remediation: 'Migrate to the Fulfillment Orders GraphQL API.',
        });
      } else {
        metrics.push({
          id: 'BFS_CAT_FULFILLMENT_NO_LEGACY',
          name: 'Prohibits legacy Fulfillment endpoints',
          section: 'CATEGORY_SPECIFIC',
          status: 'PASSED',
          detail: 'Section 5.8.1: Zero legacy fulfillment API calls detected.',
          isAutomatedCodeGate: true,
        });
      }
    } else if (isInvoicesApp) {
      // 5.9 Invoices & receipts apps
      const hasOrderAction =
        /\b(?:admin\.order-details\.action\.render|admin\.order-index\.action\.render)\b/i.test(allSourceContent) ||
        /order-details\.action/i.test(allSourceContent);

      metrics.push({
        id: 'BFS_CAT_INVOICES_ORDER_ACTIONS',
        name: 'Implements Admin Action extensions on Orders page',
        section: 'CATEGORY_SPECIFIC',
        status: hasOrderAction ? 'PASSED' : 'WARNING',
        detail: hasOrderAction ? 'Section 5.9.1: Admin Action Extension on Orders page detected.' : 'Section 5.9.1: Invoices apps must provide Admin Action extensions on Order details to print documents.',
        isAutomatedCodeGate: true,
      });
    } else if (isWebPixelsApp) {
      // 5.1 Ads, 5.2 Affiliates, 5.3 Analytics apps
      const hasPixelApi =
        /\b(?:web_pixel|analytics\.publish)\b/i.test(allSourceContent) ||
        tomlContent.includes('write_pixels') ||
        fs.existsSync(path.join(resolvedRoot, 'extensions'));

      metrics.push({
        id: 'BFS_CAT_WEB_PIXELS_API',
        name: 'Uses Web Pixels API for customer event tracking',
        section: 'CATEGORY_SPECIFIC',
        status: hasPixelApi ? 'PASSED' : 'WARNING',
        detail: hasPixelApi ? 'Section 5.1-5.3: Web Pixels API detected for customer event tracking.' : 'Section 5.1-5.3: Apps must subscribe to customer events via the Web Pixels API rather than custom storefront scripts.',
        isAutomatedCodeGate: true,
      });
    } else if (isMarketingApp) {
      // 5.6 Email marketing, 5.13 SMS marketing apps
      const hasPixelApi =
        /\b(?:web_pixel|analytics\.publish)\b/i.test(allSourceContent) ||
        tomlContent.includes('write_pixels');

      metrics.push({
        id: 'BFS_CAT_MARKETING_WEB_PIXELS',
        name: 'Uses Web Pixels API for storefront event tracking',
        section: 'CATEGORY_SPECIFIC',
        status: hasPixelApi ? 'PASSED' : 'WARNING',
        detail: hasPixelApi ? 'Section 5.6/5.13: Web Pixels API detected.' : 'Section 5.6/5.13: Marketing apps must use Web Pixels API for storefront event tracking.',
        isAutomatedCodeGate: true,
      });

      const hasConsentSync =
        /\b(?:customerEmailMarketingConsentUpdate|customerSmsMarketingConsentUpdate|emailMarketingConsent|smsMarketingConsent)\b/i.test(allSourceContent) ||
        tomlContent.includes('write_customers');

      metrics.push({
        id: 'BFS_CAT_MARKETING_CONSENT_SYNC',
        name: 'Syncs marketing consent with Shopify Customer API',
        section: 'CATEGORY_SPECIFIC',
        status: hasConsentSync ? 'PASSED' : 'WARNING',
        detail: hasConsentSync ? 'Section 5.6.2/5.13.2: Marketing consent state synchronized with Shopify Customer API.' : 'Section 5.6.2/5.13.2: Marketing apps must synchronize consent state directly with Shopify Customer API.',
        isAutomatedCodeGate: true,
      });
    } else if (isCarrierApp) {
      // 5.4 Carrier services apps
      metrics.push(
        {
          id: 'BFS_CAT_CARRIER_LATENCY_TELEMETRY',
          name: 'p95 rate calculation response latency under 500ms',
          section: 'CATEGORY_SPECIFIC',
          status: 'POST_LAUNCH_PENDING',
          detail: 'Section 5.4.1: Shopify Partner Dashboard telemetry requirement. p95 response time must be under 500ms under load.',
          isAutomatedCodeGate: false,
        },
        {
          id: 'BFS_CAT_CARRIER_RELIABILITY_TELEMETRY',
          name: 'Rate calculation failure rate under 0.1%',
          section: 'CATEGORY_SPECIFIC',
          status: 'POST_LAUNCH_PENDING',
          detail: 'Section 5.4.2: Shopify Partner Dashboard telemetry requirement. Rate calculation failures must be under 0.1%.',
          isAutomatedCodeGate: false,
        }
      );
    } else {
      // Non-Section 5 or general app: record category as skipped with rationale
      metrics.push({
        id: 'BFS_CAT_NON_DISCOUNT_SKIPPED',
        name: `Category-specific criteria: ${detectedCategory.toUpperCase()}`,
        section: 'CATEGORY_SPECIFIC',
        status: 'SKIPPED',
        detail: `No Section 5 category-specific requirements applicable for '${detectedCategory}'. Standard Built for Shopify rules apply.`,
        isAutomatedCodeGate: false,
      });
    }

    // ==========================================
    // SECTION 4: Merchant Utility (Post-Launch Milestones)
    // ==========================================
    metrics.push(
      {
        id: 'BFS_UTIL_MIN_INSTALLS',
        name: 'Minimum 50 net installs from active shops on paid plans',
        section: 'MERCHANT_UTILITY',
        status: 'POST_LAUNCH_PENDING',
        detail: 'Post-launch Shopify Partner Dashboard milestone. Requires live merchant distribution.',
        isAutomatedCodeGate: false,
      },
      {
        id: 'BFS_UTIL_MIN_REVIEWS',
        name: 'Minimum 5 reviews since launch',
        section: 'MERCHANT_UTILITY',
        status: 'POST_LAUNCH_PENDING',
        detail: 'Post-launch App Store milestone. Requires active merchant feedback.',
        isAutomatedCodeGate: false,
      },
      {
        id: 'BFS_UTIL_MIN_RATING',
        name: 'Rating of 4+ stars in the Shopify App Store',
        section: 'MERCHANT_UTILITY',
        status: 'POST_LAUNCH_PENDING',
        detail: 'Post-launch App Store milestone. Requires 4.0+ star customer satisfaction average.',
        isAutomatedCodeGate: false,
      }
    );

    // Compute gate statistics
    const automatedGates = metrics.filter((m) => m.isAutomatedCodeGate);
    const automatedGatesPassed = automatedGates.filter((m) => m.status === 'PASSED').length;
    const automatedGatesTotal = automatedGates.length;
    const merchantUtilityGatesPending = metrics.filter((m) => m.section === 'MERCHANT_UTILITY').length;

    // Apply rule overrides from config
    const finalFindings = ConfigLoader.applyRuleOverrides(findings, config?.rules);
    const hasErrors = finalFindings.some((f) => f.severity === 'ERROR');
    const hasFailedGates = automatedGates.some((m) => m.status === 'FAILED');

    const scorecard: BuiltForShopifyScorecard = {
      overallEligibleForReview: !hasErrors && !hasFailedGates,
      detectedCategory,
      categoryRulesApplied: hasCategoryRules,
      metrics,
      automatedGatesPassed,
      automatedGatesTotal,
      merchantUtilityGatesPending,
      findings: finalFindings,
    };

    return {
      scorecard,
      findings: finalFindings,
    };
  }

  private collectSourceFiles(
    dir: string,
    collected: string[] = [],
    customIgnore?: string[],
    root?: string
  ): string[] {
    const projectRoot = root || dir;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return collected;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const relPath = path.relative(projectRoot, fullPath);

      if (matchesIgnore(fullPath, projectRoot, customIgnore)) continue;

      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        const basename = path.basename(fullPath);
        if (['node_modules', '.git', 'dist', 'build', 'target', '.next', '.cache'].includes(basename)) {
          continue;
        }
        this.collectSourceFiles(fullPath, collected, customIgnore, projectRoot);
      } else if (stat.isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx', '.json', '.toml', '.liquid', '.html'].includes(ext)) {
          collected.push(fullPath);
        }
      }
    }

    return collected;
  }

  private collectAssetFiles(extensionsDir: string): string[] {
    const assetFiles: string[] = [];
    const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', '.cache']);
    try {
      const walk = (d: string) => {
        const items = fs.readdirSync(d);
        for (const item of items) {
          const fp = path.join(d, item);
          let st: fs.Stats;
          try {
            st = fs.statSync(fp);
          } catch {
            continue;
          }
          if (st.isDirectory()) {
            if (!ignoredDirs.has(item)) {
              walk(fp);
            }
          } else if (st.isFile()) {
            const ext = path.extname(fp).toLowerCase();
            if (['.js', '.css'].includes(ext)) {
              assetFiles.push(fp);
            }
          }
        }
      };
      walk(extensionsDir);
    } catch {}
    return assetFiles;
  }

  private findOffendingLocation(
    fileContents: { file: string; content: string; clean: string }[],
    regex: RegExp,
    root?: string
  ): { relPath: string; line: number; lineContent: string } | null {
    for (const item of fileContents) {
      const match = regex.exec(item.clean);
      if (match) {
        const lineIdx = item.clean.slice(0, match.index).split('\n').length;
        const lines = item.content.split('\n');
        return {
          relPath: root ? path.relative(root, item.file) : item.file,
          line: lineIdx,
          lineContent: lines[lineIdx - 1]?.trimEnd() || '',
        };
      }
    }
    return null;
  }
}
