import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LicenseStatus, LicenseTier } from '../types/index.js';
import { AppDetector } from '../utils/app-detector.js';

export interface LicenseVerifyOptions {
  licenseKey?: string;
  endpoint?: string;
  timeoutMs?: number;
  skipNetwork?: boolean;
  projectRoot?: string;
  appId?: string;
  appName?: string;
  repository?: string;
}

export class LicenseManager {
  private static defaultEndpoint = 'https://billing.endptsec.com';
  private static defaultTimeoutMs = 2500;

  /**
   * Resolves the active license key from CLI flag, config, env vars, or local storage.
   */
  public static resolveLicenseKey(explicitKey?: string, configKey?: string): string | null {
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
  public static async verifyLicense(options: LicenseVerifyOptions = {}): Promise<LicenseStatus> {
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

    // Resolve app telemetry for slot quota enforcement
    const appInfo = AppDetector.detect(options.projectRoot || '.');
    const appId = options.appId || appInfo.appId;
    const appName = options.appName || appInfo.name;
    const repository = options.repository || appInfo.repository;

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
          projectId: 'shopify-edge-guardian',
          appId,
          appName,
          repository,
          timestamp: new Date().toISOString(),
          nodeVersion: process.version,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const verifiedStatus: LicenseStatus = {
          tier: data.tier || offlineTier,
          valid: true,
          licenseKey,
          customerEmail: data.customerEmail,
          expiresAt: data.expiresAt,
          features: this.getTierFeatures(data.tier || offlineTier),
          warning: data.warning,
          slotsUsed: data.slotsUsed,
          slotsTotal: data.slotsTotal,
          appId: data.appId || appId,
          slackWebhookUrl: data.slackWebhookUrl,
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
    } catch {
      // Network timeout or unreachable license server: Fail-Open for legitimate key format
      // In CI, never block a customer's build due to a transient network glitch
      const fallbackStatus = this.buildActiveStatus(
        licenseKey,
        offlineTier,
        'Offline Grace: License server temporarily unreachable; active entitlements granted.'
      );
      return fallbackStatus;
    }

    return this.buildActiveStatus(licenseKey, offlineTier);
  }

  /**
   * Synchronous quick status for fast CLI execution paths.
   */
  public static verifyLicenseSync(licenseKey?: string): LicenseStatus {
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
  public static detectTierFromKey(key: string): LicenseTier | null {
    if (/^eg_agency_[a-fA-F0-9]{24,32}$/.test(key)) {
      return 'AGENCY_FLEET';
    }
    if (/^eg_live_[a-fA-F0-9]{24,32}$/.test(key) || /^eg_test_[a-fA-F0-9]{24,32}$/.test(key)) {
      return 'PRO';
    }
    return null;
  }

  public static getCommunityStatus(): LicenseStatus {
    return {
      tier: 'COMMUNITY',
      valid: false,
      features: this.getCommunityFeatures(),
    };
  }

  public static getTierFeatures(tier: LicenseTier) {
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

  private static getCommunityFeatures() {
    return {
      coreLinters: true,
      aiSemanticReview: false,
      wasmEdgeProfiler: true,
      fleetDashboardSync: false,
      autoRemediation: false,
      officialCertification: false,
    };
  }

  private static buildActiveStatus(key: string, tier: LicenseTier, warning?: string): LicenseStatus {
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
  public static saveLocalLicenseKey(key: string): void {
    const configDir = path.join(os.homedir(), '.edgeguardian');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const configFile = path.join(configDir, 'config.json');
    const existing = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf-8')) : {};
    existing.licenseKey = key;
    fs.writeFileSync(configFile, JSON.stringify(existing, null, 2), 'utf-8');
  }

  public static getLocalStoredLicenseKey(): string | null {
    try {
      const configFile = path.join(os.homedir(), '.edgeguardian', 'config.json');
      if (fs.existsSync(configFile)) {
        const parsed = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        return parsed.licenseKey || null;
      }
    } catch {
      // Ignore
    }
    return null;
  }

  private static getCacheFilePath(): string {
    return path.join(os.homedir(), '.edgeguardian', 'license-cache.json');
  }

  private static readCachedLicense(key: string): LicenseStatus | null {
    try {
      const cachePath = this.getCacheFilePath();
      if (fs.existsSync(cachePath)) {
        const raw = fs.readFileSync(cachePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.key === key && parsed.cachedAt && Date.now() - parsed.cachedAt < 24 * 60 * 60 * 1000) {
          return parsed.status as LicenseStatus;
        }
      }
    } catch {
      // Ignore
    }
    return null;
  }

  private static writeCachedLicense(key: string, status: LicenseStatus): void {
    try {
      const configDir = path.join(os.homedir(), '.edgeguardian');
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(
        this.getCacheFilePath(),
        JSON.stringify({ key, cachedAt: Date.now(), status }, null, 2),
        'utf-8'
      );
    } catch {
      // Ignore
    }
  }
}
