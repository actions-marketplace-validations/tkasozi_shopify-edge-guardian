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
exports.ComplianceAnalyzer = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const shopify_rules_js_1 = require("../rules/shopify-rules.js");
const sanitizer_js_1 = require("../utils/sanitizer.js");
const config_loader_js_1 = require("../config/config-loader.js");
class ComplianceAnalyzer {
    /**
     * Analyzes a repository root or shopify.app.toml for compliance with
     * Shopify App Store submission guidelines and Least Privilege rules.
     */
    analyze(projectRootOrConfigPath, config) {
        let findings = [];
        let configContent = '';
        let configFilePath = projectRootOrConfigPath;
        if (fs.existsSync(projectRootOrConfigPath)) {
            const stats = fs.statSync(projectRootOrConfigPath);
            if (stats.isDirectory()) {
                configFilePath = path.join(projectRootOrConfigPath, 'shopify.app.toml');
            }
        }
        if (!fs.existsSync(configFilePath)) {
            findings.push({
                id: 'CONFIG_MISSING',
                category: 'COMPLIANCE',
                severity: 'ERROR',
                title: 'shopify.app.toml Missing',
                message: `Could not locate shopify.app.toml at ${configFilePath}`,
                remediation: 'Ensure shopify.app.toml exists in your repository root.',
            });
            findings = config_loader_js_1.ConfigLoader.applyRuleOverrides(findings, config?.rules);
            return {
                passed: !findings.some((f) => f.severity === 'ERROR'),
                hasGdprCustomersDataRequest: false,
                hasGdprCustomersRedact: false,
                hasGdprShopRedact: false,
                embeddedConfigured: false,
                scopesRequested: [],
                scopeBloatDetected: false,
                unnecessaryScopes: [],
                findings,
            };
        }
        configContent = fs.readFileSync(configFilePath, 'utf-8');
        // Mask comments so commented-out lines never bypass or trigger false positive checks
        const sanitizedContent = (0, sanitizer_js_1.maskComments)(configContent, configFilePath);
        const cleanLines = sanitizedContent.split('\n');
        const configLines = configContent.split('\n');
        // 1. Check GDPR Privacy Compliance Webhooks
        const hasCustomersDataRequest = /customer_data_request_url\s*=\s*["'][^"']+["']/i.test(sanitizedContent) ||
            sanitizedContent.includes('customers/data_request');
        const hasCustomersRedact = /customer_deletion_url\s*=\s*["'][^"']+["']/i.test(sanitizedContent) ||
            sanitizedContent.includes('customers/redact');
        const hasShopRedact = /shop_deletion_url\s*=\s*["'][^"']+["']/i.test(sanitizedContent) ||
            sanitizedContent.includes('shop/redact');
        if (!hasCustomersDataRequest) {
            findings.push({
                id: 'GDPR_CUSTOMER_DATA_REQUEST_MISSING',
                category: 'COMPLIANCE',
                severity: 'ERROR',
                title: 'Mandatory GDPR Webhook Missing: customers/data_request',
                message: 'Shopify App Store requires an endpoint to handle customer data requests under GDPR/CCPA.',
                file: configFilePath,
                remediation: 'Add [webhooks.privacy_compliance] customer_data_request_url in shopify.app.toml.',
            });
        }
        if (!hasCustomersRedact) {
            findings.push({
                id: 'GDPR_CUSTOMER_REDACT_MISSING',
                category: 'COMPLIANCE',
                severity: 'ERROR',
                title: 'Mandatory GDPR Webhook Missing: customers/redact',
                message: 'Shopify App Store requires an endpoint to delete customer data upon request.',
                file: configFilePath,
                remediation: 'Add [webhooks.privacy_compliance] customer_deletion_url in shopify.app.toml.',
            });
        }
        if (!hasShopRedact) {
            findings.push({
                id: 'GDPR_SHOP_REDACT_MISSING',
                category: 'COMPLIANCE',
                severity: 'ERROR',
                title: 'Mandatory GDPR Webhook Missing: shop/redact',
                message: 'Shopify App Store requires an endpoint to delete shop data 48 hours after app uninstall.',
                file: configFilePath,
                remediation: 'Add [webhooks.privacy_compliance] shop_deletion_url in shopify.app.toml.',
            });
        }
        // 2. Embedded App Verification (Built for Shopify requirement)
        const embeddedMatch = /embedded\s*=\s*(true|false)/i.exec(sanitizedContent);
        const isEmbedded = embeddedMatch ? embeddedMatch[1].toLowerCase() === 'true' : false;
        if (!isEmbedded) {
            const embeddedLineIdx = cleanLines.findIndex((l) => /^\s*embedded\s*=/i.test(l));
            const embeddedLine = embeddedLineIdx !== -1 ? embeddedLineIdx + 1 : undefined;
            const embeddedLineContent = embeddedLineIdx !== -1 ? configLines[embeddedLineIdx].trimEnd() : undefined;
            findings.push({
                id: 'APP_NOT_EMBEDDED',
                category: 'COMPLIANCE',
                severity: 'WARNING',
                title: 'App Not Embedded in Shopify Admin',
                message: 'The "Built for Shopify" badge requires apps to be embedded via Shopify App Bridge.',
                file: configFilePath,
                line: embeddedLine,
                matchedPhrase: embeddedMatch ? embeddedMatch[0].trim() : undefined,
                lineContent: embeddedLineContent,
                remediation: 'Set `embedded = true` in shopify.app.toml and configure App Bridge 3.x.',
            });
        }
        // 3. Principle of Least Privilege: Scope Bloat Detection
        // Supports both: scopes = "a, b" and scopes = ["a", "b"]
        let rawScopes = [];
        const arrayMatch = /scopes\s*=\s*\[([\s\S]*?)\]/i.exec(sanitizedContent);
        if (arrayMatch) {
            const items = arrayMatch[1].match(/["']([^"']+)["']/g);
            if (items) {
                rawScopes = items.map((s) => s.replace(/["']/g, '').trim()).filter(Boolean);
            }
        }
        else {
            const stringMatch = /scopes\s*=\s*["']([^"']*)["']/i.exec(sanitizedContent);
            if (stringMatch) {
                rawScopes = stringMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
            }
        }
        const unnecessaryScopes = [];
        for (const scope of rawScopes) {
            if (shopify_rules_js_1.SUSPICIOUS_HIGH_RISK_SCOPES.includes(scope)) {
                unnecessaryScopes.push(scope);
                const scopeLineIdx = cleanLines.findIndex((l) => l.includes(scope));
                const scopeLine = scopeLineIdx !== -1 ? scopeLineIdx + 1 : undefined;
                const scopeLineContent = scopeLineIdx !== -1 ? configLines[scopeLineIdx].trimEnd() : undefined;
                findings.push({
                    id: `SCOPE_BLOAT_${scope.toUpperCase()}`,
                    category: 'COMPLIANCE',
                    severity: 'WARNING',
                    title: `Potential Scope Bloat: ${scope}`,
                    message: `Requesting elevated scope '${scope}' increases App Store review scrutiny and violates the Principle of Least Privilege.`,
                    file: configFilePath,
                    line: scopeLine,
                    matchedPhrase: scope,
                    lineContent: scopeLineContent,
                    remediation: `Audit if '${scope}' is strictly necessary. Remove if client-side or scoped metafields suffice.`,
                });
            }
        }
        findings = config_loader_js_1.ConfigLoader.applyRuleOverrides(findings, config?.rules);
        const passed = !findings.some((f) => f.severity === 'ERROR');
        return {
            passed,
            hasGdprCustomersDataRequest: hasCustomersDataRequest,
            hasGdprCustomersRedact: hasCustomersRedact,
            hasGdprShopRedact: hasShopRedact,
            embeddedConfigured: isEmbedded,
            scopesRequested: rawScopes,
            scopeBloatDetected: unnecessaryScopes.length > 0,
            unnecessaryScopes,
            findings,
        };
    }
}
exports.ComplianceAnalyzer = ComplianceAnalyzer;
//# sourceMappingURL=compliance-analyzer.js.map