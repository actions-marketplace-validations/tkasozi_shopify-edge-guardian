import { EdgeGuardianConfig, Finding, ReviewRequirementsResult } from '../types/index.js';
import { AiProjectThrottle, ThrottleOptions } from '../utils/ai-throttle.js';
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
    projectKey?: string;
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
    throttle: AiProjectThrottle;
    constructor(options?: {
        throttle?: AiProjectThrottle;
        throttleOptions?: ThrottleOptions;
    });
    /**
     * Checks if an AI provider or free cloud evaluation tier is available.
     */
    isAvailable(config?: AiEvaluatorConfig): boolean;
    /**
     * Evaluates text content using user-provided API key, default cloud endpoint, or mock against Shopify App Store Guidelines.
     * Gracefully falls back if cloud AI is throttled or offline so CI builds never fail.
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
    /**
     * Sanitizes and redacts access tokens and secrets before sending to AI endpoints.
     */
    sanitizeForAi(text: string): string;
    private evaluateWithCloudEndpoint;
    private evaluateWithOpenAi;
}
