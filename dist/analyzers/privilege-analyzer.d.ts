import { EdgeGuardianConfig, PrivilegeUsageResult } from '../types/index.js';
export declare class PrivilegeAnalyzer {
    /**
     * Analyzes an application codebase to verify that all access scopes requested
     * in shopify.app.toml are actively used. Flagging unused scopes protects developers
     * from App Store rejection under the Shopify Principle of Least Privilege (Section 3.2).
     */
    analyze(projectRoot: string, scopesRequested: string[], config?: EdgeGuardianConfig): PrivilegeUsageResult;
    private collectSourceFiles;
}
