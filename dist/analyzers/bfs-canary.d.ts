import { BfsCanaryResult } from '../types/index.js';
export interface BfsTargetConfig {
    appUrl: string;
    adminPath?: string;
    webhooksPath?: string;
    expectedAppBridgeVersion?: string;
}
export declare class BfsCanary {
    /**
     * Evaluates an app's live staging or production deployment against
     * the rigorous "Built for Shopify" (BFS) quality requirements.
     */
    evaluate(config: BfsTargetConfig): Promise<BfsCanaryResult>;
}
