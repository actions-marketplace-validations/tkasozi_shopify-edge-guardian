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
exports.PrivilegeAnalyzer = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const shopify_rules_js_1 = require("../rules/shopify-rules.js");
const sanitizer_js_1 = require("../utils/sanitizer.js");
const config_loader_js_1 = require("../config/config-loader.js");
class PrivilegeAnalyzer {
    /**
     * Analyzes an application codebase to verify that all access scopes requested
     * in shopify.app.toml are actively used. Flagging unused scopes protects developers
     * from App Store rejection under the Shopify Principle of Least Privilege (Section 3.2).
     */
    analyze(projectRoot, scopesRequested, config) {
        let findings = [];
        const usedScopes = [];
        const unusedScopes = [];
        const overprivilegedWrites = [];
        if (!scopesRequested || scopesRequested.length === 0) {
            return {
                passed: true,
                scopesRequested: [],
                usedScopes: [],
                unusedScopes: [],
                overprivilegedWrites: [],
                findings: [],
            };
        }
        // Collect all source files
        const sourceFiles = this.collectSourceFiles(projectRoot, [], config?.ignore, projectRoot);
        const fileContents = [];
        for (const file of sourceFiles) {
            try {
                const rawContent = fs.readFileSync(file, 'utf-8');
                // Mask comments so comments in code never count as real API usage
                const cleanContent = (0, sanitizer_js_1.maskComments)(rawContent, file);
                fileContents.push({ path: path.relative(projectRoot, file), content: cleanContent });
            }
            catch {
                // Skip unreadable files
            }
        }
        // Evaluate each requested scope
        for (const scope of scopesRequested) {
            // Parse action and resource: e.g. "write_products" -> action: "write", resource: "products"
            // or "read_all_orders" -> resource: "orders"
            const normalized = scope.toLowerCase().trim();
            let resourceKey = '';
            let isWrite = normalized.startsWith('write_');
            if (normalized === 'read_all_orders') {
                resourceKey = 'orders';
            }
            else if (normalized.startsWith('read_')) {
                resourceKey = normalized.replace(/^read_/, '');
            }
            else if (normalized.startsWith('write_')) {
                resourceKey = normalized.replace(/^write_/, '');
            }
            else {
                resourceKey = normalized;
            }
            const patternConfig = shopify_rules_js_1.SCOPE_USAGE_MAP[resourceKey];
            if (!patternConfig) {
                // If scope is not in our standard map (custom scope or extension scope), treat as used to avoid false positives
                usedScopes.push(scope);
                continue;
            }
            let readDetected = false;
            let writeDetected = false;
            let matchedFile = '';
            let matchedLine;
            let matchedLineContent;
            let matchedPhrase;
            for (const { path: relPath, content } of fileContents) {
                // Check read patterns
                if (!readDetected) {
                    for (const pattern of patternConfig.readPatterns) {
                        const m = pattern.exec(content);
                        if (m) {
                            readDetected = true;
                            matchedFile = relPath;
                            const idx = m.index;
                            matchedLine = content.slice(0, idx).split('\n').length;
                            const lines = content.split('\n');
                            matchedLineContent = lines[matchedLine - 1]?.trimEnd();
                            matchedPhrase = m[0];
                            break;
                        }
                    }
                }
                // Check write patterns
                if (!writeDetected) {
                    for (const pattern of patternConfig.writePatterns) {
                        if (pattern.test(content)) {
                            writeDetected = true;
                            matchedFile = relPath;
                            break;
                        }
                    }
                }
                if (readDetected && (!isWrite || writeDetected)) {
                    break;
                }
            }
            const isUsed = readDetected || writeDetected;
            if (!isUsed) {
                unusedScopes.push(scope);
                const isHighRisk = shopify_rules_js_1.SUSPICIOUS_HIGH_RISK_SCOPES.includes(scope);
                const configPath = path.join(projectRoot, 'shopify.app.toml');
                let configLine;
                let configLineContent;
                if (fs.existsSync(configPath)) {
                    try {
                        const rawConfig = fs.readFileSync(configPath, 'utf-8');
                        const cleanConfig = (0, sanitizer_js_1.maskComments)(rawConfig, configPath);
                        const cleanLines = cleanConfig.split('\n');
                        const originalLines = rawConfig.split('\n');
                        const idx = cleanLines.findIndex((l) => l.includes(scope));
                        if (idx !== -1) {
                            configLine = idx + 1;
                            configLineContent = originalLines[idx].trimEnd();
                        }
                    }
                    catch {
                        // Ignore read errors
                    }
                }
                findings.push({
                    id: `UNUSED_PRIVILEGE_${scope.toUpperCase()}`,
                    category: 'PRIVILEGE_LEAST',
                    severity: isHighRisk ? 'ERROR' : 'WARNING',
                    title: `Unused Elevated Privilege: '${scope}'`,
                    message: `The scope '${scope}' is declared in shopify.app.toml, but zero corresponding API queries, mutations, or endpoints were detected in source files. Shopify requires strict Principle of Least Privilege (Requirement 3.2) and will reject apps requesting unused scopes.`,
                    file: 'shopify.app.toml',
                    line: configLine,
                    matchedPhrase: scope,
                    lineContent: configLineContent,
                    remediation: `Remove '${scope}' from shopify.app.toml or implement the required ${patternConfig.resource} operations.`,
                });
            }
            else {
                usedScopes.push(scope);
                // Check for Write over-privilege: requested write_*, but only read queries found
                if (isWrite && !writeDetected && readDetected) {
                    overprivilegedWrites.push(scope);
                    findings.push({
                        id: `OVERPRIVILEGED_WRITE_${scope.toUpperCase()}`,
                        category: 'PRIVILEGE_LEAST',
                        severity: 'WARNING',
                        title: `Potential Over-Privileging: '${scope}' (Only Read Detected)`,
                        message: `Scope '${scope}' requests write/mutation access, but only read operations on ${patternConfig.resource} were detected in codebase (e.g. in ${matchedFile}).`,
                        file: matchedFile,
                        line: matchedLine,
                        matchedPhrase: matchedPhrase || scope,
                        lineContent: matchedLineContent,
                        remediation: `Downgrade scope to 'read_${resourceKey}' to minimize merchant install friction and reduce App Store review scrutiny.`,
                    });
                }
            }
        }
        findings = config_loader_js_1.ConfigLoader.applyRuleOverrides(findings, config?.rules);
        const passed = !findings.some((f) => f.severity === 'ERROR');
        return {
            passed,
            scopesRequested,
            usedScopes,
            unusedScopes,
            overprivilegedWrites,
            findings,
        };
    }
    collectSourceFiles(dir, fileList = [], customIgnores, projectRoot = dir) {
        if (!fs.existsSync(dir))
            return fileList;
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return fileList;
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const lowerName = entry.name.toLowerCase();
            if (entry.isDirectory()) {
                if (['node_modules', '.git', 'dist', 'build', 'target', '.next', '.cache', 'fixtures', 'test', 'tests', '__tests__', 'spec', 'specs', '.agents'].includes(lowerName) ||
                    (0, sanitizer_js_1.matchesIgnore)(fullPath, projectRoot, customIgnores)) {
                    continue;
                }
                this.collectSourceFiles(fullPath, fileList, customIgnores, projectRoot);
            }
            else if (entry.isFile()) {
                if ((0, sanitizer_js_1.isIgnoredFile)(fullPath, customIgnores, projectRoot) ||
                    (0, sanitizer_js_1.matchesIgnore)(fullPath, projectRoot, customIgnores)) {
                    continue;
                }
                const ext = path.extname(entry.name).toLowerCase();
                if (['.ts', '.tsx', '.js', '.jsx', '.graphql', '.gql', '.mjs', '.cjs', '.liquid', '.vue', '.svelte', '.rb', '.py', '.php'].includes(ext)) {
                    fileList.push(fullPath);
                }
            }
        }
        return fileList;
    }
}
exports.PrivilegeAnalyzer = PrivilegeAnalyzer;
//# sourceMappingURL=privilege-analyzer.js.map