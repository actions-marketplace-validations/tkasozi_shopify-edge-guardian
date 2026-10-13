import { ComplianceResult, EdgeGuardianConfig } from '../types/index.js';
export declare class ComplianceAnalyzer {
    /**
     * Analyzes a repository root or shopify.app.toml for compliance with
     * Shopify App Store submission guidelines and Least Privilege rules.
     */
    analyze(projectRootOrConfigPath: string, config?: EdgeGuardianConfig): ComplianceResult;
}
