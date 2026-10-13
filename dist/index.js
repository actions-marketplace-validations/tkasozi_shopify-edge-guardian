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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShopifyEdgeGuardian = exports.SlackAlerter = exports.AppDetector = exports.LicenseManager = exports.CONFIG_FILE_CANDIDATES = exports.ConfigLoader = exports.MarkdownReporter = exports.FleetManager = exports.PluggableAiEvaluator = exports.ReviewAnalyzer = exports.PrivilegeAnalyzer = exports.BfsCanary = exports.WasmProfiler = exports.DeprecationAnalyzer = exports.ComplianceAnalyzer = void 0;
const compliance_analyzer_js_1 = require("./analyzers/compliance-analyzer.js");
const deprecation_analyzer_js_1 = require("./analyzers/deprecation-analyzer.js");
const wasm_profiler_js_1 = require("./analyzers/wasm-profiler.js");
const privilege_analyzer_js_1 = require("./analyzers/privilege-analyzer.js");
const review_analyzer_js_1 = require("./analyzers/review-analyzer.js");
const markdown_reporter_js_1 = require("./reporter/markdown-reporter.js");
const config_loader_js_1 = require("./config/config-loader.js");
const license_manager_js_1 = require("./licensing/license-manager.js");
__exportStar(require("./types/index.js"), exports);
__exportStar(require("./rules/shopify-rules.js"), exports);
var compliance_analyzer_js_2 = require("./analyzers/compliance-analyzer.js");
Object.defineProperty(exports, "ComplianceAnalyzer", { enumerable: true, get: function () { return compliance_analyzer_js_2.ComplianceAnalyzer; } });
var deprecation_analyzer_js_2 = require("./analyzers/deprecation-analyzer.js");
Object.defineProperty(exports, "DeprecationAnalyzer", { enumerable: true, get: function () { return deprecation_analyzer_js_2.DeprecationAnalyzer; } });
var wasm_profiler_js_2 = require("./analyzers/wasm-profiler.js");
Object.defineProperty(exports, "WasmProfiler", { enumerable: true, get: function () { return wasm_profiler_js_2.WasmProfiler; } });
var bfs_canary_js_1 = require("./analyzers/bfs-canary.js");
Object.defineProperty(exports, "BfsCanary", { enumerable: true, get: function () { return bfs_canary_js_1.BfsCanary; } });
var privilege_analyzer_js_2 = require("./analyzers/privilege-analyzer.js");
Object.defineProperty(exports, "PrivilegeAnalyzer", { enumerable: true, get: function () { return privilege_analyzer_js_2.PrivilegeAnalyzer; } });
var review_analyzer_js_2 = require("./analyzers/review-analyzer.js");
Object.defineProperty(exports, "ReviewAnalyzer", { enumerable: true, get: function () { return review_analyzer_js_2.ReviewAnalyzer; } });
Object.defineProperty(exports, "PluggableAiEvaluator", { enumerable: true, get: function () { return review_analyzer_js_2.PluggableAiEvaluator; } });
var fleet_manager_js_1 = require("./fleet/fleet-manager.js");
Object.defineProperty(exports, "FleetManager", { enumerable: true, get: function () { return fleet_manager_js_1.FleetManager; } });
var markdown_reporter_js_2 = require("./reporter/markdown-reporter.js");
Object.defineProperty(exports, "MarkdownReporter", { enumerable: true, get: function () { return markdown_reporter_js_2.MarkdownReporter; } });
var config_loader_js_2 = require("./config/config-loader.js");
Object.defineProperty(exports, "ConfigLoader", { enumerable: true, get: function () { return config_loader_js_2.ConfigLoader; } });
Object.defineProperty(exports, "CONFIG_FILE_CANDIDATES", { enumerable: true, get: function () { return config_loader_js_2.CONFIG_FILE_CANDIDATES; } });
var license_manager_js_2 = require("./licensing/license-manager.js");
Object.defineProperty(exports, "LicenseManager", { enumerable: true, get: function () { return license_manager_js_2.LicenseManager; } });
var app_detector_js_1 = require("./utils/app-detector.js");
Object.defineProperty(exports, "AppDetector", { enumerable: true, get: function () { return app_detector_js_1.AppDetector; } });
var slack_alerter_js_1 = require("./notifications/slack-alerter.js");
Object.defineProperty(exports, "SlackAlerter", { enumerable: true, get: function () { return slack_alerter_js_1.SlackAlerter; } });
class ShopifyEdgeGuardian {
    complianceAnalyzer = new compliance_analyzer_js_1.ComplianceAnalyzer();
    deprecationAnalyzer = new deprecation_analyzer_js_1.DeprecationAnalyzer();
    wasmProfiler = new wasm_profiler_js_1.WasmProfiler();
    privilegeAnalyzer = new privilege_analyzer_js_1.PrivilegeAnalyzer();
    reviewAnalyzer = new review_analyzer_js_1.ReviewAnalyzer();
    reporter = new markdown_reporter_js_1.MarkdownReporter();
    /**
     * Runs a complete pre-flight and CI audit on a Shopify App project:
     * 1. GDPR Privacy & App Bridge Compliance
     * 2. Principle of Least Privilege & Unused Scope Auditing
     * 3. App Store Review Blockers & Listing Quality Linter
     * 4. Quarterly GraphQL & REST API Deprecations
     * 5. Rust WebAssembly Edge Performance Profile (256KB, 5.0ms)
     */
    runAudit(projectRoot, options) {
        const config = options?.config || config_loader_js_1.ConfigLoader.loadConfig(projectRoot, options?.configPath);
        const license = license_manager_js_1.LicenseManager.verifyLicenseSync(options?.licenseKey || config.licenseKey);
        const compliance = this.complianceAnalyzer.analyze(projectRoot, config);
        const privilegeUsage = this.privilegeAnalyzer.analyze(projectRoot, compliance.scopesRequested, config);
        const reviewRequirements = this.reviewAnalyzer.analyze(projectRoot, config);
        const deprecation = this.deprecationAnalyzer.scanDirectory(projectRoot, config);
        const wasmProfile = this.wasmProfiler.profile(projectRoot, config);
        const totalErrors = compliance.findings.filter((f) => f.severity === 'ERROR').length +
            privilegeUsage.findings.filter((f) => f.severity === 'ERROR').length +
            reviewRequirements.findings.filter((f) => f.severity === 'ERROR').length +
            deprecation.findings.filter((f) => f.severity === 'ERROR').length +
            wasmProfile.findings.filter((f) => f.severity === 'ERROR').length;
        const totalWarnings = compliance.findings.filter((f) => f.severity === 'WARNING').length +
            privilegeUsage.findings.filter((f) => f.severity === 'WARNING').length +
            reviewRequirements.findings.filter((f) => f.severity === 'WARNING').length +
            deprecation.findings.filter((f) => f.severity === 'WARNING').length +
            wasmProfile.findings.filter((f) => f.severity === 'WARNING').length;
        const passed = totalErrors === 0;
        const partialReport = {
            timestamp: new Date().toISOString(),
            passed,
            totalErrors,
            totalWarnings,
            compliance,
            privilegeUsage,
            reviewRequirements,
            deprecation,
            wasmProfile,
            license,
        };
        const summaryMarkdown = this.reporter.generate({
            ...partialReport,
            summaryMarkdown: '',
        });
        return {
            ...partialReport,
            summaryMarkdown,
        };
    }
    /**
     * Runs an asynchronous audit with optional pluggable AI evaluation on marketing copy.
     */
    async runAuditAsync(projectRoot, options) {
        const config = options?.config || config_loader_js_1.ConfigLoader.loadConfig(projectRoot, options?.configPath);
        const license = await license_manager_js_1.LicenseManager.verifyLicense({
            licenseKey: options?.licenseKey || config.licenseKey,
            projectRoot,
        });
        const compliance = this.complianceAnalyzer.analyze(projectRoot, config);
        const privilegeUsage = this.privilegeAnalyzer.analyze(projectRoot, compliance.scopesRequested, config);
        const effectiveLicenseKey = options?.licenseKey || config.licenseKey || process.env.GUARDIAN_LICENSE_KEY;
        const reviewRequirements = await this.reviewAnalyzer.analyzeAsync(projectRoot, {
            aiConfig: {
                ...options?.aiConfig,
                licenseKey: effectiveLicenseKey,
            },
            config,
        });
        const deprecation = this.deprecationAnalyzer.scanDirectory(projectRoot, config);
        const wasmProfile = this.wasmProfiler.profile(projectRoot, config);
        const totalErrors = compliance.findings.filter((f) => f.severity === 'ERROR').length +
            privilegeUsage.findings.filter((f) => f.severity === 'ERROR').length +
            reviewRequirements.findings.filter((f) => f.severity === 'ERROR').length +
            deprecation.findings.filter((f) => f.severity === 'ERROR').length +
            wasmProfile.findings.filter((f) => f.severity === 'ERROR').length;
        const totalWarnings = compliance.findings.filter((f) => f.severity === 'WARNING').length +
            privilegeUsage.findings.filter((f) => f.severity === 'WARNING').length +
            reviewRequirements.findings.filter((f) => f.severity === 'WARNING').length +
            deprecation.findings.filter((f) => f.severity === 'WARNING').length +
            wasmProfile.findings.filter((f) => f.severity === 'WARNING').length;
        const passed = totalErrors === 0;
        const partialReport = {
            timestamp: new Date().toISOString(),
            passed,
            totalErrors,
            totalWarnings,
            compliance,
            privilegeUsage,
            reviewRequirements,
            deprecation,
            wasmProfile,
            license,
        };
        const summaryMarkdown = this.reporter.generate({
            ...partialReport,
            summaryMarkdown: '',
        });
        return {
            ...partialReport,
            summaryMarkdown,
        };
    }
}
exports.ShopifyEdgeGuardian = ShopifyEdgeGuardian;
//# sourceMappingURL=index.js.map