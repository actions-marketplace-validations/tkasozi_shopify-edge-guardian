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
exports.AiProjectThrottle = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const crypto = __importStar(require("crypto"));
class AiProjectThrottle {
    windowMs;
    maxRequests;
    cooldownMs;
    cacheTtlMs;
    storageDir;
    constructor(options) {
        this.windowMs = options?.windowMs ?? 10 * 60 * 1000; // 10 minutes
        this.maxRequests = options?.maxRequests ?? 5; // 5 requests per 10m
        this.cooldownMs = options?.cooldownMs ?? 2000; // 2s cooldown
        this.cacheTtlMs = options?.cacheTtlMs ?? 24 * 60 * 60 * 1000; // 24 hours
        this.storageDir = options?.storageDir ?? path.join(os.tmpdir(), 'shopify-edge-guardian-ai');
    }
    /**
     * Derives a safe filesystem-friendly hash from the project key or directory path.
     */
    getStoragePath(projectKey) {
        const key = (projectKey && projectKey.trim().length > 0) ? projectKey.trim() : 'default-project';
        const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
        return path.join(this.storageDir, `throttle-${hash}.json`);
    }
    /**
     * Checks if a request is allowed by rate limiting and cooldown rules.
     */
    canMakeRequest(projectKey) {
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
    recordRequest(projectKey) {
        const state = this.loadState(projectKey);
        const now = Date.now();
        state.requests = state.requests.filter((ts) => now - ts < this.windowMs);
        state.requests.push(now);
        this.saveState(state, projectKey);
    }
    /**
     * Computes a SHA-256 hash of the normalized input text.
     */
    computeTextHash(text) {
        return crypto.createHash('sha256').update(text.trim()).digest('hex');
    }
    /**
     * Retrieves cached AI result for identical content if within the 24-hour TTL.
     */
    getCachedResult(text, projectKey) {
        const state = this.loadState(projectKey);
        const hash = this.computeTextHash(text);
        const entry = state.cache[hash];
        if (!entry)
            return null;
        const now = Date.now();
        if (now - entry.timestamp > this.cacheTtlMs) {
            delete state.cache[hash];
            this.saveState(state, projectKey);
            return null;
        }
        return entry.result;
    }
    /**
     * Caches an AI evaluation result indexed by SHA-256 text hash.
     */
    setCachedResult(text, result, projectKey) {
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
    prune(projectKey) {
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
    loadState(projectKey) {
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
        }
        catch {
            // In case of corrupt file or permission error, reset state safely
        }
        return { requests: [], cache: {} };
    }
    saveState(state, projectKey) {
        const filePath = this.getStoragePath(projectKey);
        try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify(state), 'utf-8');
        }
        catch {
            // Best-effort cache persistence; never fail execution on tempfs write errors
        }
    }
}
exports.AiProjectThrottle = AiProjectThrottle;
//# sourceMappingURL=ai-throttle.js.map