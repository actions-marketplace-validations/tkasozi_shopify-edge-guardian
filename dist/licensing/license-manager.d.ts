import { LicenseStatus, LicenseTier } from '../types/index.js';
export interface LicenseVerifyOptions {
    licenseKey?: string;
    endpoint?: string;
    timeoutMs?: number;
    skipNetwork?: boolean;
}
export declare class LicenseManager {
    private static defaultEndpoint;
    private static defaultTimeoutMs;
    /**
     * Resolves the active license key from CLI flag, config, env vars, or local storage.
     */
    static resolveLicenseKey(explicitKey?: string, configKey?: string): string | null;
    /**
     * Verifies the license key remotely with local cache and graceful offline fallback.
     */
    static verifyLicense(options?: LicenseVerifyOptions): Promise<LicenseStatus>;
    /**
     * Synchronous quick status for fast CLI execution paths.
     */
    static verifyLicenseSync(licenseKey?: string): LicenseStatus;
    /**
     * Detects license tier from key prefix and structure.
     */
    static detectTierFromKey(key: string): LicenseTier | null;
    static getCommunityStatus(): LicenseStatus;
    static getTierFeatures(tier: LicenseTier): {
        coreLinters: boolean;
        aiSemanticReview: boolean;
        wasmEdgeProfiler: boolean;
        fleetDashboardSync: boolean;
        autoRemediation: boolean;
        officialCertification: boolean;
    };
    private static getCommunityFeatures;
    private static buildActiveStatus;
    /**
     * Storage helpers for local user directory (~/.edgeguardian/config.json).
     */
    static saveLocalLicenseKey(key: string): void;
    static getLocalStoredLicenseKey(): string | null;
    private static getCacheFilePath;
    private static readCachedLicense;
    private static writeCachedLicense;
}
