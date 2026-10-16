import { AppCategory } from '../types/index.js';
export declare const SHOPIFY_PERFORMANCE_LIMITS: {
    WASM_SIZE_BUDGET_BYTES: number;
    WASM_SIZE_WARNING_BYTES: number;
    WASM_EXECUTION_BUDGET_MS: number;
    WASM_EXECUTION_TARGET_MS: number;
    BFS_ADMIN_LATENCY_MAX_MS: number;
};
export declare const MANDATORY_GDPR_WEBHOOKS: string[];
export declare const SUSPICIOUS_HIGH_RISK_SCOPES: string[];
export interface KnownDeprecation {
    pattern: RegExp;
    fieldOrEndpoint: string;
    deprecatedSince: string;
    sunsetDate: string;
    reason: string;
    replacement: string;
    severity: 'ERROR' | 'WARNING';
}
export declare const KNOWN_DEPRECATIONS: KnownDeprecation[];
export interface ScopeUsagePattern {
    resource: string;
    readPatterns: RegExp[];
    writePatterns: RegExp[];
}
export declare const SCOPE_USAGE_MAP: Record<string, ScopeUsagePattern>;
export interface ReviewRule {
    id: string;
    pattern: RegExp;
    category: 'EXAGGERATED_LANGUAGE' | 'BRAND_MISUSE' | 'PROHIBITED_SECURITY' | 'CHECKOUT_BYPASS';
    severity: 'ERROR' | 'WARNING';
    title: string;
    message: string;
    remediation: string;
}
export declare const NON_SUPERLATIVE_EST_WORDS: Set<string>;
export declare const APP_STORE_REVIEW_RULES: ReviewRule[];
export interface CategoryReviewRule {
    id: string;
    category: AppCategory;
    pattern: RegExp;
    severity: 'ERROR' | 'WARNING';
    title: string;
    message: string;
    remediation: string;
}
export declare const CATEGORY_SPECIFIC_RULES: CategoryReviewRule[];
