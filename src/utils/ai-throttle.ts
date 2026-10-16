import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export interface ThrottleState {
  requests: number[];
  cache: Record<string, { result: any; timestamp: number }>;
}

export interface ThrottleOptions {
  windowMs?: number;      // Default: 10 minutes (600,000 ms)
  maxRequests?: number;   // Default: 5 requests per window
  cooldownMs?: number;    // Default: 2000 ms between requests
  cacheTtlMs?: number;    // Default: 24 hours (86,400,000 ms)
  storageDir?: string;    // Default: os.tmpdir()/shopify-edge-guardian-ai
}

export class AiProjectThrottle {
  private windowMs: number;
  private maxRequests: number;
  private cooldownMs: number;
  private cacheTtlMs: number;
  private storageDir: string;

  constructor(options?: ThrottleOptions) {
    this.windowMs = options?.windowMs ?? 10 * 60 * 1000; // 10 minutes
    this.maxRequests = options?.maxRequests ?? 5;         // 5 requests per 10m
    this.cooldownMs = options?.cooldownMs ?? 2000;        // 2s cooldown
    this.cacheTtlMs = options?.cacheTtlMs ?? 24 * 60 * 60 * 1000; // 24 hours
    this.storageDir = options?.storageDir ?? path.join(os.tmpdir(), 'shopify-edge-guardian-ai');
  }

  /**
   * Derives a safe filesystem-friendly hash from the project key or directory path.
   */
  public getStoragePath(projectKey?: string): string {
    const key = (projectKey && projectKey.trim().length > 0) ? projectKey.trim() : 'default-project';
    const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
    return path.join(this.storageDir, `throttle-${hash}.json`);
  }

  /**
   * Checks if a request is allowed by rate limiting and cooldown rules.
   */
  public canMakeRequest(projectKey?: string): { allowed: boolean; reason?: string } {
    const state = this.loadState(projectKey);
    const now = Date.now();
    const activeRequests = state.requests.filter((ts) => now - ts < this.windowMs);

    if (activeRequests.length >= this.maxRequests) {
      const oldestActive = activeRequests[0];
      const waitMinutes = Math.ceil((this.windowMs - (now - oldestActive)) / 60000);
      return {
        allowed: false,
        reason: `Rate limit reached for free AI evaluation (max ${this.maxRequests} requests per 10m). Please wait ~${waitMinutes}m or configure BYOK OPENAI_API_KEY.`,
      };
    }

    if (activeRequests.length > 0) {
      const lastRequest = activeRequests[activeRequests.length - 1];
      if (now - lastRequest < this.cooldownMs) {
        return {
          allowed: false,
          reason: `AI request cooldown active (minimum ${this.cooldownMs / 1000}s between calls).`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Records a dispatched request timestamp.
   */
  public recordRequest(projectKey?: string): void {
    const state = this.loadState(projectKey);
    const now = Date.now();
    state.requests = state.requests.filter((ts) => now - ts < this.windowMs);
    state.requests.push(now);
    this.saveState(state, projectKey);
  }

  /**
   * Computes a SHA-256 hash of the normalized input text.
   */
  public computeTextHash(text: string): string {
    return crypto.createHash('sha256').update(text.trim()).digest('hex');
  }

  /**
   * Retrieves cached AI result for identical content if within the 24-hour TTL.
   */
  public getCachedResult<T = any>(text: string, projectKey?: string): T | null {
    const state = this.loadState(projectKey);
    const hash = this.computeTextHash(text);
    const entry = state.cache[hash];

    if (!entry) return null;
    const now = Date.now();
    if (now - entry.timestamp > this.cacheTtlMs) {
      delete state.cache[hash];
      this.saveState(state, projectKey);
      return null;
    }

    return entry.result as T;
  }

  /**
   * Caches an AI evaluation result indexed by SHA-256 text hash.
   */
  public setCachedResult(text: string, result: any, projectKey?: string): void {
    const state = this.loadState(projectKey);
    const hash = this.computeTextHash(text);
    state.cache[hash] = {
      result,
      timestamp: Date.now(),
    };
    this.saveState(state, projectKey);
  }

  /**
   * Cleans up expired cache items and requests older than the window.
   */
  public prune(projectKey?: string): void {
    const state = this.loadState(projectKey);
    const now = Date.now();
    state.requests = state.requests.filter((ts) => now - ts < this.windowMs);

    for (const [hash, entry] of Object.entries(state.cache)) {
      if (now - entry.timestamp > this.cacheTtlMs) {
        delete state.cache[hash];
      }
    }

    this.saveState(state, projectKey);
  }

  private loadState(projectKey?: string): ThrottleState {
    const filePath = this.getStoragePath(projectKey);
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          requests: Array.isArray(parsed.requests) ? parsed.requests : [],
          cache: typeof parsed.cache === 'object' && parsed.cache !== null ? parsed.cache : {},
        };
      }
    } catch {
      // In case of corrupt file or permission error, reset state safely
    }

    return { requests: [], cache: {} };
  }

  private saveState(state: ThrottleState, projectKey?: string): void {
    const filePath = this.getStoragePath(projectKey);
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(state), 'utf-8');
    } catch {
      // Best-effort cache persistence; never fail execution on tempfs write errors
    }
  }
}
