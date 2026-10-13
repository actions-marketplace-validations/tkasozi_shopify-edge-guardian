#!/usr/bin/env node
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const index_js_1 = require("../index.js");
function parseArgs(args) {
    let command = 'check';
    let commandArg = undefined;
    let targetPath = process.cwd();
    let failOnWarning = false;
    let jsonOutput = false;
    let enableAi = false;
    let outputFile = null;
    let configPath = undefined;
    let licenseKey = undefined;
    let i = 0;
    if (args.length > 0 && ['check', 'activate', 'login', 'status', 'certify'].includes(args[0])) {
        command = args[0];
        i = 1;
        if (['activate', 'login'].includes(command) && i < args.length && !args[i].startsWith('-')) {
            commandArg = args[i++];
        }
    }
    for (; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--fail-on-warning') {
            failOnWarning = true;
        }
        else if (arg === '--json') {
            jsonOutput = true;
        }
        else if (arg === '--ai') {
            enableAi = true;
        }
        else if (arg === '--output' || arg === '-o') {
            if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                outputFile = args[++i];
            }
        }
        else if (arg === '--config' || arg === '-c') {
            if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                configPath = args[++i];
            }
        }
        else if (arg === '--license' || arg === '-l') {
            if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                licenseKey = args[++i];
            }
        }
        else if (!arg.startsWith('-') && arg !== 'check') {
            targetPath = path.resolve(arg);
        }
    }
    return { command, commandArg, targetPath, failOnWarning, jsonOutput, enableAi, outputFile, configPath, licenseKey };
}
async function main() {
    try {
        const args = process.argv.slice(2);
        const { command, commandArg, targetPath, failOnWarning, jsonOutput, enableAi, outputFile, configPath, licenseKey } = parseArgs(args);
        // 1. Handle "activate" / "login"
        if (command === 'activate' || command === 'login') {
            const key = commandArg || licenseKey;
            if (!key) {
                console.error('\n❌  Please provide a license key: `shopify-edge-guardian activate eg_live_...`\n');
                process.exit(1);
            }
            index_js_1.LicenseManager.saveLocalLicenseKey(key);
            const status = await index_js_1.LicenseManager.verifyLicense({ licenseKey: key });
            if (status.valid) {
                console.log(`\n✅  Edge Guardian license activated successfully!`);
                console.log(`🛡️   Tier: ${status.tier}`);
                if (status.customerEmail)
                    console.log(`📧  Account: ${status.customerEmail}`);
                if (status.expiresAt)
                    console.log(`📅  Valid until: ${status.expiresAt}\n`);
            }
            else {
                console.warn(`\n⚠️   License key saved, but verification reported: ${status.warning || 'Pending validation'}\n`);
            }
            process.exit(0);
        }
        // 2. Handle "status"
        if (command === 'status') {
            const status = await index_js_1.LicenseManager.verifyLicense({ licenseKey });
            console.log('\n🛡️  Shopify Edge Guardian License Status:');
            console.log(`- Tier: ${status.tier}`);
            console.log(`- Active: ${status.valid ? '✅  Yes' : '❌  No (Community Free Edition)'}`);
            if (status.licenseKey)
                console.log(`- Key: ${status.licenseKey.slice(0, 10)}...`);
            if (status.expiresAt)
                console.log(`- Expiration: ${status.expiresAt}`);
            console.log('- Feature Entitlements:');
            console.log(`  • Core Compliance & Deprecation Linters: ${status.features.coreLinters ? '✅' : '❌'}`);
            console.log(`  • AI Semantic Listing Audit: ${status.features.aiSemanticReview ? '✅' : '🔒 (Pro / Agency)'}`);
            console.log(`  • Wasm Edge Performance Simulation: ${status.features.wasmEdgeProfiler ? '✅' : '❌'}`);
            console.log(`  • Multi-App Fleet Dashboard Sync: ${status.features.fleetDashboardSync ? '✅' : '🔒 (Agency Fleet)'}`);
            console.log(`  • Official App Store Certification Dossier: ${status.features.officialCertification ? '✅' : '🔒 (Pro / Agency)'}\n`);
            if (!status.valid) {
                console.log('🚀  To upgrade or get a license key: https://billing.endptsec.com/checkout/shopify-edge-guardian\n');
            }
            process.exit(0);
        }
        // 3. Handle "certify" (App Store Submission Dossier)
        if (command === 'certify') {
            const guardian = new index_js_1.ShopifyEdgeGuardian();
            const report = await guardian.runAuditAsync(targetPath, { enableAi: true, configPath, licenseKey });
            const dossierPath = path.join(targetPath, 'SHOPIFY_APP_STORE_CERTIFICATION.md');
            const dossierContent = `# 🛡️  Shopify App Store Pre-Flight Readiness Certification\n\n` +
                `**Generated by Shopify Edge Guardian on ${new Date().toISOString()}**\n\n` +
                `### Verification Status: ${report.passed ? '🟢 PASSED & CERTIFIED' : '🔴 ACTION REQUIRED'}\n\n` +
                report.summaryMarkdown;
            fs.writeFileSync(dossierPath, dossierContent, 'utf-8');
            console.log(`\n✅  Shopify App Store Certification dossier generated: ${dossierPath}`);
            if (!report.passed) {
                console.error(`❌  Violations must be resolved before submitting to Shopify App Store.\n`);
                process.exit(1);
            }
            process.exit(0);
        }
        // 4. Default: "check" audit execution
        const guardian = new index_js_1.ShopifyEdgeGuardian();
        const resolvedKey = index_js_1.LicenseManager.resolveLicenseKey(licenseKey);
        const licenseStatus = index_js_1.LicenseManager.verifyLicenseSync(resolvedKey || undefined);
        const shouldRunAi = enableAi || (licenseStatus.valid && licenseStatus.features.aiSemanticReview);
        const report = shouldRunAi
            ? await guardian.runAuditAsync(targetPath, { enableAi: true, configPath, licenseKey: resolvedKey || undefined })
            : guardian.runAudit(targetPath, { configPath, licenseKey: resolvedKey || undefined });
        if (outputFile) {
            const outDir = path.dirname(path.resolve(outputFile));
            if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
            }
            fs.writeFileSync(outputFile, report.summaryMarkdown, 'utf-8');
        }
        if (jsonOutput) {
            console.log(JSON.stringify(report, null, 2));
        }
        else {
            console.log(report.summaryMarkdown);
        }
        if (!report.passed) {
            process.exit(1);
        }
        if (failOnWarning && report.totalWarnings > 0) {
            console.error(`\n❌  Failed due to ${report.totalWarnings} warning(s) with --fail-on-warning enabled.\n`);
            process.exit(1);
        }
        process.exit(0);
    }
    catch (err) {
        console.error(`\n❌  Error running Shopify Edge Guardian: ${err.message}\n`);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=index.js.map