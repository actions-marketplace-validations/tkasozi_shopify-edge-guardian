"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
class LicenseManager {
    static defaultEndpoint = 'https://billing.endptsec.com';
    static defaultTimeoutMs = 2500;
    /**
     * Resolves the active license key from CLI flag, config, env vars, or local storage.
     */
    static resolveLicenseKey(explicitKey, configKey) {
        if (explicitKey && explicitKey.trim().length > 0) {
            return explicitKey.trim();
        }
        if (configKey && configKey.trim().length > 0) {
            return configKey.trim();
        }
        const envKey = process.env.GUARDIAN_LICENSE_KEY || process.env.EDGE_GUARDIAN_KEY;
        if (envKey && envKey.trim().length > 0) {
            return envKey.trim();
        }
        const storedKey = this.getLocalStoredLicenseKey();
        if (storedKey && storedKey.trim().length > 0) {
            return storedKey.trim();
        }
        return null;
    }
    /**
     * Verifies the license key remotely with local cache and graceful offline fallback.
     */
    static async verifyLicense(options = {}) {
        const licenseKey = options.licenseKey || this.resolveLicenseKey();
        if (!licenseKey) {
            return this.getCommunityStatus();
        }
        // Check offline / format validation
        const offlineTier = this.detectTierFromKey(licenseKey);
        if (!offlineTier) {
            return {
                tier: 'COMMUNITY',
                valid: false,
                licenseKey,
                features: this.getCommunityFeatures(),
                warning: 'Invalid license key format. Keys must begin with eg_live_, eg_agency_, or eg_test_.',
            };
        }
        // Check local valid cache (24 hours)
        const cached = this.readCachedLicense(licenseKey);
        if (cached && !options.skipNetwork) {
            return cached;
        }
        if (options.skipNetwork) {
            return this.buildActiveStatus(licenseKey, offlineTier, 'Cached / Offline Validation');
        }
        const endpoint = options.endpoint || process.env.GUARDIAN_API_ENDPOINT || this.defaultEndpoint;
        const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
        try {
            const response = await fetch(`${endpoint}/v1/licenses/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Shopify-Edge-Guardian-CLI',
                },
                body: JSON.stringify({
                    licenseKey,
                    timestamp: new Date().toISOString(),
                    nodeVersion: process.version,
                }),
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (response.ok) {
                const data = (await response.json());
                const verifiedStatus = {
                    tier: data.tier || offlineTier,
                    valid: true,
                    licenseKey,
                    customerEmail: data.customerEmail,
                    expiresAt: data.expiresAt,
                    features: this.getTierFeatures(data.tier || offlineTier),
                };
                this.writeCachedLicense(licenseKey, verifiedStatus);
                return verifiedStatus;
            }
            if (response.status === 401 || response.status === 403) {
                return {
                    tier: 'COMMUNITY',
                    valid: false,
                    licenseKey,
                    features: this.getCommunityFeatures(),
                    warning: 'License key is expired, revoked, or invalid. Please check your subscription.',
                };
            }
        }
        catch {
            // Network timeout or unreachable license server: Fail-Open for legitimate key format
            // In CI, never block a customer's build due to a transient network glitch
            const fallbackStatus = this.buildActiveStatus(licenseKey, offlineTier, 'Offline Grace: License server temporarily unreachable; active entitlements granted.');
            return fallbackStatus;
        }
        return this.buildActiveStatus(licenseKey, offlineTier);
    }
    /**
     * Synchronous quick status for fast CLI execution paths.
     */
    static verifyLicenseSync(licenseKey) {
        const key = licenseKey || this.resolveLicenseKey();
        if (!key) {
            return this.getCommunityStatus();
        }
        const tier = this.detectTierFromKey(key);
        if (!tier) {
            return {
                tier: 'COMMUNITY',
                valid: false,
                licenseKey: key,
                features: this.getCommunityFeatures(),
                warning: 'Invalid license key format.',
            };
        }
        return this.buildActiveStatus(key, tier);
    }
    /**
     * Detects license tier from key prefix and structure.
     */
    static detectTierFromKey(key) {
        if (/^eg_agency_[a-fA-F0-9]{24,32}$/.test(key)) {
            return 'AGENCY_FLEET';
        }
        if (/^eg_live_[a-fA-F0-9]{24,32}$/.test(key) || /^eg_test_[a-fA-F0-9]{24,32}$/.test(key)) {
            return 'PRO';
        }
        return null;
    }
    static getCommunityStatus() {
        return {
            tier: 'COMMUNITY',
            valid: false,
            features: this.getCommunityFeatures(),
        };
    }
    static getTierFeatures(tier) {
        if (tier === 'AGENCY_FLEET') {
            return {
                coreLinters: true,
                aiSemanticReview: true,
                wasmEdgeProfiler: true,
                fleetDashboardSync: true,
                autoRemediation: true,
                officialCertification: true,
            };
        }
        if (tier === 'PRO') {
            return {
                coreLinters: true,
                aiSemanticReview: true,
                wasmEdgeProfiler: true,
                fleetDashboardSync: false,
                autoRemediation: true,
                officialCertification: true,
            };
        }
        return this.getCommunityFeatures();
    }
    static getCommunityFeatures() {
        return {
            coreLinters: true,
            aiSemanticReview: false,
            wasmEdgeProfiler: true,
            fleetDashboardSync: false,
            autoRemediation: false,
            officialCertification: false,
        };
    }
    static buildActiveStatus(key, tier, warning) {
        return {
            tier,
            valid: true,
            licenseKey: key,
            features: this.getTierFeatures(tier),
            warning,
        };
    }
    /**
     * Storage helpers for local user directory (~/.edgeguardian/config.json).
     */
    static saveLocalLicenseKey(key) {
        const configDir = path.join(os.homedir(), '.edgeguardian');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        const configFile = path.join(configDir, 'config.json');
        const existing = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf-8')) : {};
        existing.licenseKey = key;
        fs.writeFileSync(configFile, JSON.stringify(existing, null, 2), 'utf-8');
    }
    static getLocalStoredLicenseKey() {
        try {
            const configFile = path.join(os.homedir(), '.edgeguardian', 'config.json');
            if (fs.existsSync(configFile)) {
                const parsed = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
                return parsed.licenseKey || null;
            }
        }
        catch {
            // Ignore
        }
        return null;
    }
    static getCacheFilePath() {
        return path.join(os.homedir(), '.edgeguardian', 'license-cache.json');
    }
    static readCachedLicense(key) {
        try {
            const cachePath = this.getCacheFilePath();
            if (fs.existsSync(cachePath)) {
                const raw = fs.readFileSync(cachePath, 'utf-8');
                const parsed = JSON.parse(raw);
                if (parsed.key === key && parsed.cachedAt && Date.now() - parsed.cachedAt < 24 * 60 * 60 * 1000) {
                    return parsed.status;
                }
            }
        }
        catch {
            // Ignore
        }
        return null;
    }
    static writeCachedLicense(key, status) {
        try {
            const configDir = path.join(os.homedir(), '.edgeguardian');
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            fs.writeFileSync(this.getCacheFilePath(), JSON.stringify({ key, cachedAt: Date.now(), status }, null, 2), 'utf-8');
        }
        catch {
            // Ignore
        }
    }
}
exports.LicenseManager = LicenseManager;
//# sourceMappingURL=license-manager.js.map