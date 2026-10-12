#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { ShopifyEdgeGuardian } from '../index.js';

function parseArgs(args: string[]) {
  let targetPath = process.cwd();
  let failOnWarning = false;
  let jsonOutput = false;
  let enableAi = false;
  let outputFile: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--fail-on-warning') {
      failOnWarning = true;
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--ai') {
      enableAi = true;
    } else if (arg === '--output' || arg === '-o') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        outputFile = args[++i];
      }
    } else if (!arg.startsWith('-') && arg !== 'check') {
      targetPath = path.resolve(arg);
    }
  }

  return { targetPath, failOnWarning, jsonOutput, enableAi, outputFile };
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const { targetPath, failOnWarning, jsonOutput, enableAi, outputFile } = parseArgs(args);

    const guardian = new ShopifyEdgeGuardian();
    const report = enableAi
      ? await guardian.runAuditAsync(targetPath, { enableAi: true })
      : guardian.runAudit(targetPath);

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
      process.exit(1);
    }

    if (failOnWarning && report.totalWarnings > 0) {
      console.error(`\n❌  Failed due to ${report.totalWarnings} warning(s) with --fail-on-warning enabled.\n`);
      process.exit(1);
    }

    process.exit(0);
  } catch (err: any) {
    console.error(`\n❌  Error running Shopify Edge Guardian: ${err.message}\n`);
    process.exit(1);
  }
}

main();
