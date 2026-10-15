export type Severity = 'ERROR' | 'WARNING' | 'INFO';
export type RuleOverride = 'off' | 'warning' | 'error' | 'info';
export interface EdgeGuardianConfig {
    /**
     * File paths or glob patterns to ignore across all scans.
     * e.g. ["RELEASE_NOTES.md", "docs/**", "tests/**"]
     */
    ignore?: string[];
    /**
     * Rule overrides mapping rule ID to desired status or severity.
     * e.g. { "SUPERLATIVE_ABSOLUTE_CAPABILITY": "off", "WASM_BINARY_NOT_FOUND": "off" }
     */
    rules?: Record<string, RuleOverride>;
    /**
     * WebAssembly profiling settings
     */
    wasm?: {
        /**
         * Set to false if the project does not use Rust Shopify Functions
         * (suppresses "No compiled .wasm binary found" notice).
         */
        required?: boolean;
        wasmPath?: string;
    };
    /**
     * Application primary category for category-specific Built for Shopify audits.
     * e.g. "discounts", "subscriptions", "returns_exchanges", "forms", "carrier_services", "general".
     * If omitted, dynamically detected from shopify.app.toml, scopes, and extensions.
     */
    category?: AppCategory;
    /**
     * AI Review Evaluator settings
     */
    ai?: {
        enabled?: boolean;
        apiKey?: string;
        endpoint?: string;
        model?: string;
    };
}
export type OfficialShopifyCategory = 'ads' | 'affiliates' | 'analytics' | 'carrier_services' | 'discounts' | 'email_marketing' | 'forms' | 'fulfillment_services' | 'invoices_receipts' | 'product_bundles' | 'product_reviews' | 'returns_exchanges' | 'sms_marketing' | 'subscriptions';
export type AppCategory = OfficialShopifyCategory | 'orders' | 'shipping' | 'payments' | 'general' | string;
export interface BfsScorecardMetric {
    id: string;
    name: string;
    section: 'PERFORMANCE' | 'DESIGN_FUNCTIONALITY' | 'CATEGORY_SPECIFIC' | 'MERCHANT_UTILITY';
    status: 'PASSED' | 'FAILED' | 'WARNING' | 'POST_LAUNCH_PENDING' | 'SKIPPED';
    detail: string;
    isAutomatedCodeGate: boolean;
}
export interface BuiltForShopifyScorecard {
    overallEligibleForReview: boolean;
    detectedCategory: AppCategory;
    categoryRulesApplied: boolean;
    metrics: BfsScorecardMetric[];
    automatedGatesPassed: number;
    automatedGatesTotal: number;
    merchantUtilityGatesPending: number;
    findings?: Finding[];
}
export interface Finding {
    id: string;
    category: 'COMPLIANCE' | 'DEPRECATION' | 'WASM_PERFORMANCE' | 'BFS_CANARY' | 'PRIVILEGE_LEAST' | 'APP_STORE_REVIEW' | 'CATEGORY_CRITERIA' | 'BUILT_FOR_SHOPIFY';
    severity: Severity;
    title: string;
    message: string;
    file?: string;
    line?: number;
    column?: number;
    matchedPhrase?: string;
    lineContent?: string;
    snippet?: string;
    remediation?: string;
}
export interface ComplianceResult {
    passed: boolean;
    hasGdprCustomersDataRequest: boolean;
    hasGdprCustomersRedact: boolean;
    hasGdprShopRedact: boolean;
    embeddedConfigured: boolean;
    scopesRequested: string[];
    scopeBloatDetected: boolean;
    unnecessaryScopes: string[];
    findings: Finding[];
}
export interface PrivilegeUsageResult {
    passed: boolean;
    scopesRequested: string[];
    usedScopes: string[];
    unusedScopes: string[];
    overprivilegedWrites: string[];
    findings: Finding[];
}
export interface ReviewRequirementsResult {
    passed: boolean;
    exaggeratedLanguageFound: boolean;
    brandMisuseFound: boolean;
    insecurePatternsFound: boolean;
    findings: Finding[];
}
export interface DeprecationItem {
    fieldOrEndpoint: string;
    deprecatedSince: string;
    sunsetDate: string;
    reason: string;
    replacement?: string;
    file: string;
    line: number;
    lineContent?: string;
    matchedPhrase?: string;
}
export interface DeprecationResult {
    passed: boolean;
    deprecatedItemsCount: number;
    items: DeprecationItem[];
    findings: Finding[];
}
export interface WasmProfileResult {
    passed: boolean;
    filePath: string;
    sizeBytes: number;
    budgetBytes: number;
    sizeFormatted: string;
    estimatedExecutionMs: number;
    executionBudgetMs: number;
    hasOptimizedLto: boolean;
    findings: Finding[];
    compileTimeMs?: number;
    instantiationTimeMs?: number;
    executionTimeMs?: number;
    totalLatencyMs?: number;
    memoryBytes?: number;
    memoryPages?: number;
    exportedSymbols?: string[];
    simulationStatus?: 'SUCCESS' | 'TRAPPED' | 'COMPILED_ONLY' | 'NOT_APPLICABLE';
}
export interface BfsCanaryResult {
    passed: boolean;
    overallScore: number;
    adminLatencyMs: number;
    latencyThresholdMs: number;
    webhookResponsive: boolean;
    appBridgeVersion: string;
    isCompliantWithBfs: boolean;
    findings: Finding[];
}
export interface GuardianReport {
    timestamp: string;
    passed: boolean;
    totalErrors: number;
    totalWarnings: number;
    category?: AppCategory;
    compliance: ComplianceResult;
    privilegeUsage?: PrivilegeUsageResult;
    reviewRequirements?: ReviewRequirementsResult;
    deprecation: DeprecationResult;
    wasmProfile?: WasmProfileResult;
    bfsCanary?: BfsCanaryResult;
    bfsScorecard?: BuiltForShopifyScorecard;
    summaryMarkdown: string;
}
export interface FleetAppRecord {
    appId: string;
    name: string;
    handle: string;
    clientStore: string;
    apiVersion: string;
    bfsBadgeActive: boolean;
    activeDeprecations: number;
    lastWasmSizeBytes?: number;
    lastCheckedAt: string;
    status: 'HEALTHY' | 'ACTION_REQUIRED' | 'AT_RISK';
}
