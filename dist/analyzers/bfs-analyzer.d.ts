import { BuiltForShopifyScorecard, EdgeGuardianConfig, Finding } from '../types/index.js';
export declare class BfsAnalyzer {
    /**
     * Evaluates a Shopify application against the complete Built for Shopify (BFS)
     * criteria matrix from the Shopify Partner Dashboard:
     * 1. Performance (Core Web Vitals & Storefront Speed)
     * 2. Design and Functionality (Embedded, Session Tokens, App Bridge v4, No Asset API, Polaris)
     * 3. Category-Specific Criteria (Dynamically evaluated, e.g. Discounts: No Draft Orders, Native APIs)
     * 4. Merchant Utility (Post-launch partner milestones)
     */
    analyze(projectRoot: string, config?: EdgeGuardianConfig): {
        scorecard: BuiltForShopifyScorecard;
        findings: Finding[];
    };
    private collectSourceFiles;
    private collectAssetFiles;
    private findOffendingLocation;
}
