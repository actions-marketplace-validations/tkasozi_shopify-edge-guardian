import { AiEvaluatorConfig } from './analyzers/review-analyzer.js';
import { EdgeGuardianConfig, GuardianReport } from './types/index.js';
export * from './types/index.js';
export * from './rules/shopify-rules.js';
export { ComplianceAnalyzer } from './analyzers/compliance-analyzer.js';
export { DeprecationAnalyzer } from './analyzers/deprecation-analyzer.js';
export { WasmProfiler } from './analyzers/wasm-profiler.js';
export { BfsCanary } from './analyzers/bfs-canary.js';
export { BfsAnalyzer } from './analyzers/bfs-analyzer.js';
export { PrivilegeAnalyzer } from './analyzers/privilege-analyzer.js';
export { ReviewAnalyzer, PluggableAiEvaluator, AiEvaluatorConfig } from './analyzers/review-analyzer.js';
export { FleetManager } from './fleet/fleet-manager.js';
export { MarkdownReporter } from './reporter/markdown-reporter.js';
export { ConfigLoader, CONFIG_FILE_CANDIDATES } from './config/config-loader.js';
export { AppDetector, DetectedAppInfo } from './utils/app-detector.js';
export { SlackAlerter, SlackAlerterOptions } from './notifications/slack-alerter.js';
export { AiProjectThrottle, ThrottleOptions } from './utils/ai-throttle.js';
export declare class ShopifyEdgeGuardian {
    private complianceAnalyzer;
    private deprecationAnalyzer;
    private wasmProfiler;
    private privilegeAnalyzer;
    private reviewAnalyzer;
    private bfsAnalyzer;
    private reporter;
    /**
     * Runs a complete pre-flight and CI audit on a Shopify App project:
     * 1. GDPR Privacy & App Bridge Compliance
     * 2. Principle of Least Privilege & Unused Scope Auditing
     * 3. App Store Review Blockers & Listing Quality Linter
     * 4. Quarterly GraphQL & REST API Deprecations
     * 5. Rust WebAssembly Edge Performance Profile (256KB, 5.0ms)
     */
    runAudit(projectRoot: string, options?: {
        config?: EdgeGuardianConfig;
        configPath?: string;
    }): GuardianReport;
    /**
     * Runs an asynchronous audit with optional pluggable AI evaluation on marketing copy.
     */
    runAuditAsync(projectRoot: string, options?: {
        enableAi?: boolean;
        aiConfig?: AiEvaluatorConfig;
        config?: EdgeGuardianConfig;
        configPath?: string;
    }): Promise<GuardianReport>;
}
