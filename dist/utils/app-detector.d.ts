import { AppCategory, EdgeGuardianConfig } from '../types/index.js';
export interface DetectedAppInfo {
    appId: string;
    name: string;
    handle?: string;
    repository?: string;
    category?: AppCategory;
    source: 'shopify.app.toml' | 'env' | 'package.json' | 'directory';
}
export declare class AppDetector {
    /**
     * Deterministically resolves Shopify application identity.
     * Primary key: `client_id` in shopify.app.toml (immutable Shopify Partners ID).
     * Secondary fallback: GITHUB_REPOSITORY (org/repo) or package.json name.
     */
    static detect(projectRoot?: string, config?: EdgeGuardianConfig): DetectedAppInfo;
    /**
     * Dynamically resolves the primary application category:
     * Maps to Shopify Section 5 Category-Specific Requirements:
     * 'discounts', 'subscriptions', 'returns_exchanges', 'product_bundles',
     * 'product_reviews', 'forms', 'invoices_receipts', 'carrier_services',
     * 'fulfillment_services', 'email_marketing', 'sms_marketing',
     * 'ads', 'affiliates', 'analytics', or 'general' ('orders', 'shipping', 'payments').
     */
    static detectCategory(projectRoot?: string, config?: EdgeGuardianConfig): AppCategory;
}
