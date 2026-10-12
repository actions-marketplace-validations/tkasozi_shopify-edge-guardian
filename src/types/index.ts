export type Severity = 'ERROR' | 'WARNING' | 'INFO';

export interface Finding {
  id: string;
  category: 'COMPLIANCE' | 'DEPRECATION' | 'WASM_PERFORMANCE' | 'BFS_CANARY' | 'PRIVILEGE_LEAST' | 'APP_STORE_REVIEW';
  severity: Severity;
  title: string;
  message: string;
  file?: string;
  line?: number;
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
