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
exports.DeprecationAnalyzer = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const shopify_rules_js_1 = require("../rules/shopify-rules.js");
const sanitizer_js_1 = require("../utils/sanitizer.js");
const config_loader_js_1 = require("../config/config-loader.js");
class DeprecationAnalyzer {
    /**
     * Scans a directory or file list for deprecated GraphQL queries,
     * legacy REST calls, and deprecated schema types.
     */
    scanDirectory(dirPath, config) {
        let findings = [];
        const items = [];
        const files = this.collectSourceFiles(dirPath, [], config?.ignore, dirPath);
        for (const file of files) {
            let content = '';
            try {
                content = fs.readFileSync(file, 'utf-8');
            }
            catch {
                continue; // Skip unreadable files
            }
            // Mask comments in searchable content to prevent false positives from comments
            const searchableContent = (0, sanitizer_js_1.maskComments)(content, file);
            for (const deprecation of shopify_rules_js_1.KNOWN_DEPRECATIONS) {
                // Create an isolated local regex with global matching to find all matches in this file
                const flags = deprecation.pattern.flags.replace('g', '') + 'g';
                const regex = new RegExp(deprecation.pattern.source, flags);
                let match;
                while ((match = regex.exec(searchableContent)) !== null) {
                    const prefix = searchableContent.slice(0, match.index);
                    const lineNumber = prefix.split('\n').length;
                    const lines = content.split('\n');
                    const lineContent = lines[lineNumber - 1]?.trimEnd() || '';
                    const item = {
                        fieldOrEndpoint: deprecation.fieldOrEndpoint,
                        deprecatedSince: deprecation.deprecatedSince,
                        sunsetDate: deprecation.sunsetDate,
                        reason: deprecation.reason,
                        replacement: deprecation.replacement,
                        file: path.relative(dirPath, file),
                        line: lineNumber,
                        lineContent,
                        matchedPhrase: match[0],
                    };
                    items.push(item);
                    findings.push({
                        id: `DEPRECATED_${deprecation.deprecatedSince}_${lineNumber}`,
                        category: 'DEPRECATION',
                        severity: deprecation.severity,
                        title: `Deprecated Shopify API: ${deprecation.fieldOrEndpoint}`,
                        message: `${deprecation.reason} (Sunset: ${deprecation.sunsetDate})`,
                        file: item.file,
                        line: item.line,
                        matchedPhrase: match[0],
                        lineContent,
                        remediation: deprecation.replacement,
                    });
                    // Prevent zero-width infinite loop
                    if (match.index === regex.lastIndex) {
                        regex.lastIndex++;
                    }
                }
            }
        }
        findings = config_loader_js_1.ConfigLoader.applyRuleOverrides(findings, config?.rules);
        const passed = !findings.some((f) => f.severity === 'ERROR');
        return {
            passed,
            deprecatedItemsCount: items.length,
            items,
            findings,
        };
    }
    /**
     * Parses runtime HTTP response headers (e.g. from production telemetry logs)
     * to catch active deprecation warnings from Shopify's servers.
     */
    parseRuntimeHeader(headerValue) {
        if (!headerValue || headerValue.trim().length === 0) {
            return null;
        }
        return {
            id: 'RUNTIME_DEPRECATION_HEADER',
            category: 'DEPRECATION',
            severity: 'WARNING',
            title: 'Active X-Shopify-API-Deprecated-Reason Header Detected',
            message: `Shopify responded with deprecation warning: "${headerValue}". Update this call before the API version sunsets.`,
            remediation: 'Inspect recent GraphQL query calls in the associated trace and replace deprecated fields.',
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
            return fileList; // Permission denied or inaccessible directory
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
                if (['.ts', '.tsx', '.js', '.jsx', '.graphql', '.gql'].includes(ext)) {
                    fileList.push(fullPath);
                }
            }
        }
        return fileList;
    }
}
exports.DeprecationAnalyzer = DeprecationAnalyzer;
//# sourceMappingURL=deprecation-analyzer.js.map