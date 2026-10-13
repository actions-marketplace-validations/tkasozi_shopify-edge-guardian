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
exports.AppDetector = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class AppDetector {
    /**
     * Deterministically resolves Shopify application identity.
     * Primary key: `client_id` in shopify.app.toml (immutable Shopify Partners ID).
     * Secondary fallback: GITHUB_REPOSITORY (org/repo) or package.json name.
     */
    static detect(projectRoot = '.') {
        const resolvedRoot = path.resolve(projectRoot);
        const repoFromEnv = process.env.GITHUB_REPOSITORY?.trim() || undefined;
        // 1. Inspect shopify.app.toml or shopify.app.*.toml
        const tomlCandidates = ['shopify.app.toml'];
        try {
            if (fs.existsSync(resolvedRoot)) {
                const files = fs.readdirSync(resolvedRoot);
                for (const file of files) {
                    if (file.startsWith('shopify.app.') && file.endsWith('.toml') && file !== 'shopify.app.toml') {
                        tomlCandidates.push(file);
                    }
                }
            }
        }
        catch { }
        for (const candidate of tomlCandidates) {
            const candidatePath = path.join(resolvedRoot, candidate);
            if (fs.existsSync(candidatePath)) {
                try {
                    const content = fs.readFileSync(candidatePath, 'utf-8');
                    const clientIdMatch = content.match(/client_id\s*=\s*["']([^"']+)["']/i);
                    const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/i);
                    const handleMatch = content.match(/handle\s*=\s*["']([^"']+)["']/i);
                    const clientId = clientIdMatch ? clientIdMatch[1].trim() : undefined;
                    const appName = nameMatch ? nameMatch[1].trim() : undefined;
                    const handle = handleMatch ? handleMatch[1].trim() : undefined;
                    if (clientId || appName) {
                        return {
                            appId: clientId || repoFromEnv || appName || path.basename(resolvedRoot),
                            name: appName || clientId || path.basename(resolvedRoot),
                            handle,
                            repository: repoFromEnv,
                            source: 'shopify.app.toml',
                        };
                    }
                }
                catch { }
            }
        }
        // 2. Check Environment Variables
        const envClientId = process.env.SHOPIFY_APP_CLIENT_ID?.trim();
        const envAppName = process.env.SHOPIFY_APP_NAME?.trim();
        if (envClientId || (repoFromEnv && envAppName)) {
            return {
                appId: envClientId || repoFromEnv || 'shopify-app',
                name: envAppName || envClientId || repoFromEnv || 'Shopify Application',
                repository: repoFromEnv,
                source: 'env',
            };
        }
        // 3. Inspect package.json
        const packageJsonPath = path.join(resolvedRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                if (pkg.name) {
                    return {
                        appId: repoFromEnv || pkg.name,
                        name: pkg.name,
                        repository: repoFromEnv,
                        source: 'package.json',
                    };
                }
            }
            catch { }
        }
        // 4. Fallback to folder name / repo
        const fallbackName = repoFromEnv || path.basename(resolvedRoot);
        return {
            appId: fallbackName,
            name: fallbackName,
            repository: repoFromEnv,
            source: 'directory',
        };
    }
}
exports.AppDetector = AppDetector;
//# sourceMappingURL=app-detector.js.map