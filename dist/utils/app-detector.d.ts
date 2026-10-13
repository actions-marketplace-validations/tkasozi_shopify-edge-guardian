export interface DetectedAppInfo {
    appId: string;
    name: string;
    handle?: string;
    repository?: string;
    source: 'shopify.app.toml' | 'env' | 'package.json' | 'directory';
}
export declare class AppDetector {
    /**
     * Deterministically resolves Shopify application identity.
     * Primary key: `client_id` in shopify.app.toml (immutable Shopify Partners ID).
     * Secondary fallback: GITHUB_REPOSITORY (org/repo) or package.json name.
     */
    static detect(projectRoot?: string): DetectedAppInfo;
}
