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
    let targetPath = process.cwd();
    let failOnWarning = false;
    let jsonOutput = false;
    let enableAi = false;
    let outputFile = null;
    let configPath = undefined;
    let slackWebhook = undefined;
    let i = 0;
    if (args.length > 0 && ['check', 'init'].includes(args[0])) {
        command = args[0];
        i = 1;
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
        else if (arg === '--slack-webhook') {
            if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                slackWebhook = args[++i];
            }
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
        else if (!arg.startsWith('-') && arg !== 'check') {
            targetPath = path.resolve(arg);
        }
    }
    return { command, targetPath, failOnWarning, jsonOutput, enableAi, outputFile, configPath, slackWebhook };
}
async function main() {
    try {
        const args = process.argv.slice(2);
        const { command, targetPath, failOnWarning, jsonOutput, enableAi, outputFile, configPath, slackWebhook } = parseArgs(args);
        // 1. Handle "init" (Scaffold .guardianrc.json)
        if (command === 'init') {
            const targetConfig = path.join(targetPath, '.guardianrc.json');
            if (fs.existsSync(targetConfig)) {
                console.log(`\n⚠️  Configuration file already exists: ${targetConfig}\n`);
                process.exit(0);
            }
            const initialConfig = {
                $schema: 'https://raw.githubusercontent.com/marketplace/actions/shopify-edge-guardian/main/schema.json',
                ignore: ['tests/**', 'docs/**', 'CHANGELOG.md'],
                rules: {},
                wasm: {
                    required: false,
                },
            };
            fs.writeFileSync(targetConfig, JSON.stringify(initialConfig, null, 2), 'utf-8');
            console.log(`\n✅  Created default Shopify Edge Guardian configuration: ${targetConfig}\n`);
            process.exit(0);
        }
        // 2. Default: "check" audit execution
        const guardian = new index_js_1.ShopifyEdgeGuardian();
        const report = enableAi
            ? await guardian.runAuditAsync(targetPath, { enableAi: true, configPath })
            : guardian.runAudit(targetPath, { configPath });
        // Dispatch Slack deprecation alert if deprecations detected and webhook provided
        if (report.deprecation && report.deprecation.items.length > 0 && slackWebhook) {
            const appInfo = index_js_1.AppDetector.detect(targetPath);
            const slackRes = await index_js_1.SlackAlerter.dispatchDeprecationAlert({
                webhookUrl: slackWebhook,
                appInfo,
                deprecations: report.deprecation.items,
            });
            if (slackRes.delivered) {
                console.log(`💬  Deprecation alert dispatched to Slack channel for ${appInfo.name}.`);
            }
        }
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
            process.exitCode = 1;
            return;
        }
        if (failOnWarning && report.totalWarnings > 0) {
            console.error(`\n❌  Failed due to ${report.totalWarnings} warning(s) with --fail-on-warning enabled.\n`);
            process.exitCode = 1;
            return;
        }
        process.exitCode = 0;
    }
    catch (err) {
        console.error(`\n❌  Error running Shopify Edge Guardian: ${err.message}\n`);
        process.exitCode = 1;
    }
}
main();
//# sourceMappingURL=index.js.map