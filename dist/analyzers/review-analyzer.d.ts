import { EdgeGuardianConfig, Finding, ReviewRequirementsResult } from '../types/index.js';
export declare class ReviewAnalyzer {
    /**
     * Scans configuration files, listing copy, and source code against official
     * Shopify App Store Review requirements that trigger immediate rejection:
     * 1. Exaggerated / Superlative Language & Unsubstantiated Guarantees (Section 4.3.3 & 4.3.4)
     * 2. Shopify Brand Misuse in App Name (Section 4.1.2)
     * 3. Direct Theme Liquid Overwrite (Section 5.1.1)
     * 4. Hardcoded Access Tokens & API Secrets (Section 3.1)
     * 5. External Checkout & Billing Bypasses (Section 1.1.2 & 1.2.1)
     */
    analyze(projectRoot: string, config?: EdgeGuardianConfig): ReviewRequirementsResult;
    aiEvaluator: PluggableAiEvaluator;
    /**
     * Performs review requirements audit and additionally invokes the pluggable
     * AI evaluator on listing documentation/markdown files if enabled or configured.
     */
    analyzeAsync(projectRoot: string, optionsOrAiConfig?: AiEvaluatorConfig | {
        aiConfig?: AiEvaluatorConfig;
        config?: EdgeGuardianConfig;
    }): Promise<ReviewRequirementsResult>;
    private collectFilesToScan;
}
export interface AiEvaluatorConfig {
    apiKey?: string;
    endpoint?: string;
    cloudEndpoint?: string;
    licenseKey?: string;
    model?: string;
    timeoutMs?: number;
    enabled?: boolean;
    mockResponse?: {
        hasViolations: boolean;
        violations: Array<{
            phrase: string;
            reason: string;
            severity?: 'ERROR' | 'WARNING';
            remediation?: string;
        }>;
    };
}
export declare class PluggableAiEvaluator {
    private defaultCloudEndpoint;
    private defaultEndpoint;
    private defaultModel;
    private defaultTimeoutMs;
    /**
     * Checks if an AI provider or Cloud AI Fulfillment via license key is available.
     */
    isAvailable(config?: AiEvaluatorConfig): boolean;
    /**
     * Evaluates text content using Cloud AI fulfillment or local LLM against Shopify App Store Guidelines.
     */
    evaluateText(text: string, options?: {
        file?: string;
        config?: AiEvaluatorConfig;
    }): Promise<{
        claims: Array<{
            phrase: string;
            reason: string;
            severity: 'ERROR' | 'WARNING';
            remediation: string;
        }>;
        findings: Finding[];
        error?: string;
        provider?: string;
    }>;
}
