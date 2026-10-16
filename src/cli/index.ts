#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { ShopifyEdgeGuardian, AppDetector, SlackAlerter } from '../index.js';

export function parseArgs(args: string[]) {
  let command = 'check';
  let targetPath = process.cwd();
  let failOnWarning = false;
  let jsonOutput = false;
  let enableAi = false;
  let outputFile: string | null = null;
  let configPath: string | undefined = undefined;
  let slackWebhook: string | undefined = undefined;

  let i = 0;
  if (args.length > 0 && ['check', 'init', 'certify'].includes(args[0])) {
    command = args[0] === 'certify' ? 'check' : args[0];
    i = 1;
  }

  for (; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--fail-on-warning') {
      failOnWarning = true;
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--ai') {
      enableAi = true;
    } else if (arg === '--slack-webhook') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        slackWebhook = args[++i];
      }
    } else if (arg === '--output' || arg === '-o') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        outputFile = args[++i];
      }
    } else if (arg === '--config' || arg === '-c') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        configPath = args[++i];
      }
    } else if (!arg.startsWith('-') && arg !== 'check' && arg !== 'certify') {
      const resolved = path.resolve(arg);
      if (fs.existsSync(resolved)) {
        targetPath = resolved;
      } else {
        throw new Error(`Directory or command not found: "${arg}". Usage: shopify-edge-guardian [check|init] [path] [options]`);
      }
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
    const guardian = new ShopifyEdgeGuardian();
    const report = enableAi
      ? await guardian.runAuditAsync(targetPath, { enableAi: true, configPath })
      : guardian.runAudit(targetPath, { configPath });

    // Dispatch Slack deprecation alert if deprecations detected and webhook provided
    if (report.deprecation && report.deprecation.items.length > 0 && slackWebhook) {
      const appInfo = AppDetector.detect(targetPath);
      const slackRes = await SlackAlerter.dispatchDeprecationAlert({
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
    } else {
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
  } catch (err: any) {
    console.error(`\n❌  Error running Shopify Edge Guardian: ${err.message}\n`);
    process.exitCode = 1;
  }
}

main();
