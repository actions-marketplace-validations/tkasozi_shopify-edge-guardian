export const SHOPIFY_PERFORMANCE_LIMITS = {
  WASM_SIZE_BUDGET_BYTES: 256 * 1024, // 256 KB
  WASM_SIZE_WARNING_BYTES: 200 * 1024, // 200 KB
  WASM_EXECUTION_BUDGET_MS: 5.0, // 5.0ms hard Shopify edge cutoff
  WASM_EXECUTION_TARGET_MS: 1.5, // Best-practice target
  BFS_ADMIN_LATENCY_MAX_MS: 500, // Built for Shopify Core Web Vitals
};

export const MANDATORY_GDPR_WEBHOOKS = [
  'customers/data_request',
  'customers/redact',
  'shop/redact',
];

export const SUSPICIOUS_HIGH_RISK_SCOPES = [
  'read_all_orders', // Triggers manual Shopify review
  'write_payment_gateways',
  'read_shopify_payments_payouts',
  'write_orders', // Bloat if app only manages discounts or cart rules
];

export interface KnownDeprecation {
  pattern: RegExp;
  fieldOrEndpoint: string;
  deprecatedSince: string;
  sunsetDate: string;
  reason: string;
  replacement: string;
  severity: 'ERROR' | 'WARNING';
}

export const KNOWN_DEPRECATIONS: KnownDeprecation[] = [
  {
    pattern: /\/admin\/api\/(?:202[0-3]-\d{2}|2024-0[1-7])\//i,
    fieldOrEndpoint: 'Legacy REST Admin API Endpoint',
    deprecatedSince: '2024-10',
    sunsetDate: 'Sunset / Unsupported',
    reason: 'REST Admin API has been deprecated in favor of the GraphQL Admin API.',
    replacement: 'Migrate to the Shopify GraphQL Admin API.',
    severity: 'ERROR',
  },
  {
    pattern: /\bdiscountAutomaticApp\s*\{[\s\S]*?\btitle\b/,
    fieldOrEndpoint: 'discountAutomaticApp.title',
    deprecatedSince: '2025-07',
    sunsetDate: '2026-07-01',
    reason: 'Direct modification of discount title via legacy query replaced by unified discount nodes.',
    replacement: 'Use DiscountNode query and DiscountAutomaticAppFragment.',
    severity: 'WARNING',
  },
  {
    pattern: /\bprivateMetafields\b/,
    fieldOrEndpoint: 'privateMetafields query/mutation',
    deprecatedSince: '2024-04',
    sunsetDate: '2025-04-01',
    reason: 'Private metafields are deprecated in favor of App Data Metafields with access controls.',
    replacement: 'Use standard Metafields with reserved app namespaces.',
    severity: 'ERROR',
  },
  {
    pattern: /\bfulfillmentOrders\s*\{[\s\S]*?\bfulfillments\b/,
    fieldOrEndpoint: 'fulfillmentOrders.fulfillments (legacy)',
    deprecatedSince: '2025-01',
    sunsetDate: '2026-01-01',
    reason: 'Replaced by FulfillmentOrderLineItem tracking.',
    replacement: 'Query lineItems directly under FulfillmentOrder.',
    severity: 'WARNING',
  },
];

export interface ScopeUsagePattern {
  resource: string;
  readPatterns: RegExp[];
  writePatterns: RegExp[];
}

export const SCOPE_USAGE_MAP: Record<string, ScopeUsagePattern> = {
  orders: {
    resource: 'Orders',
    readPatterns: [
      /\b(?:orders|order|draftOrder|draftOrders|orderLineItem|orderEdit)\b/i,
      /\/admin\/api\/[^"']*\/orders(?:\.json|\/)/i,
    ],
    writePatterns: [
      /\b(?:orderCreate|orderUpdate|orderClose|orderCancel|draftOrderCreate|draftOrderUpdate|orderEditBegin)\b/i,
      /(?:POST|PUT|DELETE)\s+['"][^'"]*\/orders/i,
    ],
  },
  products: {
    resource: 'Products',
    readPatterns: [
      /\b(?:products|product|productVariant|productVariants|collection|collections)\b/i,
      /\/admin\/api\/[^"']*\/products(?:\.json|\/)/i,
    ],
    writePatterns: [
      /\b(?:productCreate|productUpdate|productDelete|productVariantCreate|productVariantUpdate|collectionCreate)\b/i,
      /(?:POST|PUT|DELETE)\s+['"][^'"]*\/products/i,
    ],
  },
  customers: {
    resource: 'Customers',
    readPatterns: [
      /\b(?:customers|customer|customerSegment|customerSegments)\b/i,
      /\/admin\/api\/[^"']*\/customers(?:\.json|\/)/i,
    ],
    writePatterns: [
      /\b(?:customerCreate|customerUpdate|customerDelete|customerSegmentCreate)\b/i,
      /(?:POST|PUT|DELETE)\s+['"][^'"]*\/customers/i,
    ],
  },
  discounts: {
    resource: 'Discounts',
    readPatterns: [
      /\b(?:discount|discounts|discountAutomaticApp|discountCodeApp|discountNode|priceRule)\b/i,
      /\/admin\/api\/[^"']*\/price_rules(?:\.json|\/)/i,
    ],
    writePatterns: [
      /\b(?:discountAutomaticAppCreate|discountCodeAppCreate|discountAutomaticActivate|discountCodeActivate|priceRuleCreate)\b/i,
      /(?:POST|PUT|DELETE)\s+['"][^'"]*\/price_rules/i,
    ],
  },
  inventory: {
    resource: 'Inventory',
    readPatterns: [
      /\b(?:inventory|inventoryLevel|inventoryLevels|inventoryItem|inventoryItems)\b/i,
      /\/admin\/api\/[^"']*\/inventory_levels(?:\.json|\/)/i,
    ],
    writePatterns: [
      /\b(?:inventoryAdjustQuantity|inventorySetOnHandQuantities|inventoryBulkToggleActivation)\b/i,
      /(?:POST|PUT|DELETE)\s+['"][^'"]*\/inventory_levels/i,
    ],
  },
  fulfillments: {
    resource: 'Fulfillments',
    readPatterns: [
      /\b(?:fulfillment|fulfillments|fulfillmentOrder|fulfillmentOrders)\b/i,
      /\/admin\/api\/[^"']*\/fulfillments(?:\.json|\/)/i,
    ],
    writePatterns: [
      /\b(?:fulfillmentCreateV2|fulfillmentOrderAcceptFulfillmentRequest|fulfillmentOrderRejectFulfillmentRequest)\b/i,
      /(?:POST|PUT|DELETE)\s+['"][^'"]*\/fulfillments/i,
    ],
  },
  themes: {
    resource: 'Themes',
    readPatterns: [
      /\b(?:theme|themes|asset|assets)\b/i,
      /\/admin\/api\/[^"']*\/themes(?:\.json|\/)/i,
    ],
    writePatterns: [
      /\b(?:themeCreate|themePublish|themeDelete|assetUpdate)\b/i,
      /(?:POST|PUT|DELETE)\s+['"][^'"]*\/themes/i,
    ],
  },
  content: {
    resource: 'Content / Pages',
    readPatterns: [
      /\b(?:article|articles|blog|blogs|page|pages|comment|comments)\b/i,
      /\/admin\/api\/[^"']*\/pages(?:\.json|\/)/i,
    ],
    writePatterns: [
      /\b(?:articleCreate|articleUpdate|pageCreate|pageUpdate|blogCreate)\b/i,
      /(?:POST|PUT|DELETE)\s+['"][^'"]*\/pages/i,
    ],
  },
  shipping: {
    resource: 'Shipping',
    readPatterns: [
      /\b(?:carrierService|carrierServices|deliveryCustomization|shippingZone)\b/i,
      /\/admin\/api\/[^"']*\/carrier_services(?:\.json|\/)/i,
    ],
    writePatterns: [
      /\b(?:carrierServiceCreate|carrierServiceUpdate|deliveryCustomizationCreate)\b/i,
      /(?:POST|PUT|DELETE)\s+['"][^'"]*\/carrier_services/i,
    ],
  },
  metaobjects: {
    resource: 'Metaobjects',
    readPatterns: [
      /\b(?:metaobject|metaobjects|metaobjectDefinition|metaobjectDefinitions)\b/i,
    ],
    writePatterns: [
      /\b(?:metaobjectCreate|metaobjectUpdate|metaobjectDelete|metaobjectDefinitionCreate)\b/i,
    ],
  },
  translations: {
    resource: 'Translations',
    readPatterns: [
      /\b(?:translatableResource|translatableResources|translationsRegister|shopLocale)\b/i,
    ],
    writePatterns: [
      /\b(?:translationsRegister|translationsRemove)\b/i,
    ],
  },
};

export interface ReviewRule {
  id: string;
  pattern: RegExp;
  category: 'EXAGGERATED_LANGUAGE' | 'BRAND_MISUSE' | 'PROHIBITED_SECURITY' | 'CHECKOUT_BYPASS';
  severity: 'ERROR' | 'WARNING';
  title: string;
  message: string;
  remediation: string;
}

export const NON_SUPERLATIVE_EST_WORDS = new Set([
  'test', 'request', 'forest', 'honest', 'modest', 'earnest', 'manifest',
  'digest', 'guest', 'interest', 'rest', 'west', 'east', 'nest', 'pest',
  'chest', 'invest', 'suggest', 'latest', 'attest', 'protest', 'contest',
  'ingest', 'congest', 'detest', 'infest', 'molest'
]);

export const APP_STORE_REVIEW_RULES: ReviewRule[] = [
  // 1. Exaggerated / Superlative Language & NLP Rules (Shopify App Store Requirements 4.3.3 & 4.3.4)
  {
    id: 'SUPERLATIVE_THE_BEST',
    pattern: /\b(?:the\s+best|#1\b|number\s+one|world's\s+leading|most\s+popular|highest\s+rated|top[- ]rated|best[- ]selling)\b/i,
    category: 'EXAGGERATED_LANGUAGE',
    severity: 'ERROR',
    title: 'Exaggerated / Superlative Language Detected',
    message: 'Shopify App Store Guidelines (Section 4.3.3) strictly prohibit superlative claims like "#1", "the best", or "world\'s leading" in app listings, descriptions, and metadata.',
    remediation: 'Replace superlative claims with objective descriptions of your app features and benefits.',
  },
  {
    id: 'SUPERLATIVE_PERIPHRASTIC',
    pattern: /\b(?:the\s+)?most\s+(?:advanced|powerful|reliable|intuitive|comprehensive|effective|efficient|trusted|affordable|seamless|flexible|secure|innovative|intelligent|profitable|scalable|lucrative)\b/i,
    category: 'EXAGGERATED_LANGUAGE',
    severity: 'ERROR',
    title: 'Periphrastic Superlative Claim Detected',
    message: 'Claims like "most powerful", "most advanced", or "most reliable" are prohibited by Shopify App Store guidelines (Section 4.3.3).',
    remediation: 'Describe the feature functionally rather than using comparative superlatives.',
  },
  {
    id: 'SUPERLATIVE_HYPERBOLIC_ABSOLUTES',
    pattern: /\b(?:unrivaled|unmatched|unbeatable|peerless|incomparable|flawless|second[- ]to[- ]none|world[- ]class|state[- ]of[- ]the[- ]art|game[- ]changing|revolutionary|groundbreaking)\b/i,
    category: 'EXAGGERATED_LANGUAGE',
    severity: 'ERROR',
    title: 'Hyperbolic Marketing Absolute Detected',
    message: 'Absolutes such as "unrivaled", "unbeatable", or "game-changing" violate Shopify guidelines requiring factual and verifiable listing copy.',
    remediation: 'Focus on merchant workflow solutions rather than hyperbolic adjectives.',
  },
  {
    id: 'SUPERLATIVE_EXCLUSIVITY',
    pattern: /\b(?:first\s+and\s+only|the\s+only\s+app\s+that|sole\s+(?:provider|app|solution)|only\s+solution\s+(?:on|in)\s+the\s+market)\b/i,
    category: 'EXAGGERATED_LANGUAGE',
    severity: 'ERROR',
    title: 'Exclusivity Claim Detected',
    message: 'Claims of being "the only app that" or "sole provider" are prohibited unless accompanied by verifiable independent documentation.',
    remediation: 'Rephrase to highlight your app capabilities without asserting industry exclusivity.',
  },
  {
    id: 'SUPERLATIVE_SUPERIORITY_COMPARISON',
    pattern: /\b(?:outperforms?\s+(?:all|every|any\s+other)|beats?\s+(?:all|every|any\s+other)|crushes?\s+the\s+competition|leaves?\s+competitors?\s+in\s+the\s+dust)\b/i,
    category: 'EXAGGERATED_LANGUAGE',
    severity: 'ERROR',
    title: 'Comparative Superiority Claim Detected',
    message: 'Shopify App Store Guidelines (Section 4.3.3) prohibit disparaging competitors or asserting comparative superiority without independent verification.',
    remediation: 'Remove competitor comparisons and focus exclusively on the objective functionality of your application.',
  },
  {
    id: 'SUPERLATIVE_ABSOLUTE_CAPABILITY',
    pattern: /\b(?:100%\s+(?:guaranteed|success|fail[- ]safe|bulletproof)|infinitely\s+scalable|zero\s+risk|foolproof)\b/i,
    category: 'EXAGGERATED_LANGUAGE',
    severity: 'ERROR',
    title: 'Absolute / Unconditional Capability Claim Detected',
    message: 'Stating absolute performance guarantees like "bulletproof", "foolproof", or "zero risk" violates Section 4.3.4.',
    remediation: 'Qualify statements to describe expected system behavior accurately.',
  },
  {
    id: 'UNSUBSTANTIATED_GUARANTEE',
    pattern: /\b(?:guaranteed\s+(?:results|100%?|success|sales|increase|growth|roi)|risk[- ]free\s+guarantee|100%\s+free\s+forever|money[- ]back\s+guarantee)\b/i,
    category: 'EXAGGERATED_LANGUAGE',
    severity: 'ERROR',
    title: 'Unsubstantiated Guarantee Detected',
    message: 'Shopify forbids promising guarantees or risk-free results without verifiable third-party certification.',
    remediation: 'Remove guarantee phrasing. Focus on how the tool assists merchants.',
  },
  {
    id: 'NUMERICAL_CONVERSION_CLAIM',
    pattern: /\b(?:(?:double|triple|quadruple|10x|5x|2x)\s+(?:your\s+)?(?:sales|conversion|revenue|profit|aov)|(?:boost|increase|grow)\s+(?:sales|revenue|conversion)\s+by\s+\d+%?)/i,
    category: 'EXAGGERATED_LANGUAGE',
    severity: 'WARNING',
    title: 'Unverifiable Numerical Sales Claim',
    message: 'Claiming exact percentage increases (e.g. "boost sales by 50%" or "10x conversion") in app listing or onboarding text triggers review rejection under Section 4.3.3.',
    remediation: 'Reword claims to describe the mechanism (e.g. "Optimize checkout flow to streamline orders") rather than promising specific statistical results.',
  },

  // 2. Direct Theme Liquid Overwrite (Shopify App Store Requirement 5.1.1)
  {
    id: 'THEME_LIQUID_OVERWRITE',
    pattern: /\/admin\/api\/[^"']*\/assets\.json\?asset(?:%5B|\[)key(?:%5D|\])=layout(?:%2F|\/)theme\.liquid/i,
    category: 'PROHIBITED_SECURITY',
    severity: 'ERROR',
    title: 'Direct Theme Code Modification Prohibited',
    message: 'Directly modifying `layout/theme.liquid` via the Asset API is strictly forbidden. Apps must use Theme App Extensions.',
    remediation: 'Migrate storefront code to Theme App Extensions (app embed blocks).',
  },

  // 3. Prohibited Hardcoded Secrets (Shopify Security Requirement 3.1)
  {
    id: 'HARDCODED_ADMIN_TOKEN',
    pattern: /\bshpat_[a-fA-F0-9]{32}\b/,
    category: 'PROHIBITED_SECURITY',
    severity: 'ERROR',
    title: 'Hardcoded Shopify Admin Access Token Detected',
    message: 'Committing raw `shpat_` tokens violates Shopify security requirements and causes immediate app rejection or account suspension.',
    remediation: 'Move all access tokens to secure server-side environment variables.',
  },
  {
    id: 'HARDCODED_CUSTOM_TOKEN',
    pattern: /\bshpca_[a-fA-F0-9]{32}\b/,
    category: 'PROHIBITED_SECURITY',
    severity: 'ERROR',
    title: 'Hardcoded Custom App Access Token Detected',
    message: 'Raw `shpca_` access token committed in codebase.',
    remediation: 'Never commit tokens to version control. Use secure secret management.',
  },

  // 4. External Checkout / Billing Bypass (Shopify Requirements 1.1.2 & 1.2.1)
  {
    id: 'CHECKOUT_BYPASS_DETECTED',
    pattern: /\b(?:checkout\.stripe\.com|paypal\.com\/cgi-bin\/webscr|buy\.lemonsqueezy\.com)\b/i,
    category: 'CHECKOUT_BYPASS',
    severity: 'ERROR',
    title: 'Off-Platform Checkout or Billing Bypass Detected',
    message: 'Shopify forbids routing merchants or buyers to external checkout or billing processors (Section 1.1.2 & 1.2.1). Apps must use Shopify Checkout and the Shopify Billing API.',
    remediation: 'Replace external payment links with the Shopify Billing API (AppSubscriptionCreate / AppPurchaseOneTimeCreate).',
  },
];
