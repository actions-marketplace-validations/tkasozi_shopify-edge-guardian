export interface ThrottleState {
    requests: number[];
    cache: Record<string, {
        result: any;
        timestamp: number;
    }>;
}
export interface ThrottleOptions {
    windowMs?: number;
    maxRequests?: number;
    cooldownMs?: number;
    cacheTtlMs?: number;
    storageDir?: string;
}
export declare class AiProjectThrottle {
    private windowMs;
    private maxRequests;
    private cooldownMs;
    private cacheTtlMs;
    private storageDir;
    constructor(options?: ThrottleOptions);
    /**
     * Derives a safe filesystem-friendly hash from the project key or directory path.
     */
    getStoragePath(projectKey?: string): string;
    /**
     * Checks if a request is allowed by rate limiting and cooldown rules.
     */
    canMakeRequest(projectKey?: string): {
        allowed: boolean;
        reason?: string;
    };
    /**
     * Records a dispatched request timestamp.
     */
    recordRequest(projectKey?: string): void;
    /**
     * Computes a SHA-256 hash of the normalized input text.
     */
    computeTextHash(text: string): string;
    /**
     * Retrieves cached AI result for identical content if within the 24-hour TTL.
     */
    getCachedResult<T = any>(text: string, projectKey?: string): T | null;
    /**
     * Caches an AI evaluation result indexed by SHA-256 text hash.
     */
    setCachedResult(text: string, result: any, projectKey?: string): void;
    /**
     * Cleans up expired cache items and requests older than the window.
     */
    prune(projectKey?: string): void;
    private loadState;
    private saveState;
}
