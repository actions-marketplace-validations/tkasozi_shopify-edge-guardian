export type Severity = 'ERROR' | 'WARNING' | 'INFO';

export type RuleOverride = 'off' | 'warning' | 'error' | 'info';

export type LicenseTier = 'COMMUNITY' | 'PRO' | 'AGENCY_FLEET';

export interface LicenseStatus {
  tier: LicenseTier;
  valid: boolean;
  licenseKey?: string;
  customerEmail?: string;
  expiresAt?: string;
  features: {
    coreLinters: boolean;
    aiSemanticReview: boolean;
    wasmEdgeProfiler: boolean;
    fleetDashboardSync: boolean;
    autoRemediation: boolean;
    officialCertification: boolean;
  };
  warning?: string;
}

export interface EdgeGuardianConfig {
  /**
   * Edge Guardian License Key for Pro / Agency Fleet tiers.
   * Can also be set via GUARDIAN_LICENSE_KEY environment variable.
   */
  licenseKey?: string;

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
   * AI Review Evaluator settings
   */
  ai?: {
    enabled?: boolean;
    apiKey?: string;
    endpoint?: string;
    model?: string;
  };
}

export interface Finding {
  id: string;
  category: 'COMPLIANCE' | 'DEPRECATION' | 'WASM_PERFORMANCE' | 'BFS_CANARY' | 'PRIVILEGE_LEAST' | 'APP_STORE_REVIEW';
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
  budgetBytes: number; // Shopify 256KB max threshold
  sizeFormatted: string;
  estimatedExecutionMs: number;
  executionBudgetMs: number; // Shopify 5ms hard limit
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
  overallScore: number; // 0-100
  adminLatencyMs: number;
  latencyThresholdMs: number; // e.g. < 500ms
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
  compliance: ComplianceResult;
  privilegeUsage?: PrivilegeUsageResult;
  reviewRequirements?: ReviewRequirementsResult;
  deprecation: DeprecationResult;
  wasmProfile?: WasmProfileResult;
  bfsCanary?: BfsCanaryResult;
  license?: LicenseStatus;
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
