import { GuardianReport } from '../types/index.js';

export class MarkdownReporter {
  /**
   * Generates a GitHub Pull Request comment or CI summary report in markdown.
   */
  public generate(report: GuardianReport): string {
    const statusEmoji = report.passed ? '✅' : '❌';
    const statusTitle = report.passed
      ? 'Shopify Edge Guardian: All Pre-Flight Checks Passed'
      : 'Shopify Edge Guardian: Merge Blocked (Violations Detected)';

    let md = `## ${statusEmoji}  ${statusTitle}\n\n`;
    md += `*Audited at: ${report.timestamp} | Errors: **${report.totalErrors}** | Warnings: **${report.totalWarnings}***\n\n`;

    // 1. Compliance Summary Table
    md += `### 1. App Store & GDPR Compliance\n`;
    md += `- **GDPR \`customers/data_request\`:** ${report.compliance.hasGdprCustomersDataRequest ? '✅  Found' : '❌  Missing'}\n`;
    md += `- **GDPR \`customers/redact\`:** ${report.compliance.hasGdprCustomersRedact ? '✅  Found' : '❌  Missing'}\n`;
    md += `- **GDPR \`shop/redact\`:** ${report.compliance.hasGdprShopRedact ? '✅  Found' : '❌  Missing'}\n`;
    md += `- **Embedded App Bridge:** ${report.compliance.embeddedConfigured ? '✅  Configured' : '⚠️  Disabled'}\n`;
    md += `- **Principle of Least Privilege:** ${report.compliance.scopeBloatDetected ? '⚠️  Scope Bloat Detected' : '✅  Verified'}\n\n`;

    // 2. Privilege Usage & Least Privilege Summary
    if (report.privilegeUsage) {
      md += `### 2. Principle of Least Privilege & Scope Auditing\n`;
      if (report.privilegeUsage.unusedScopes.length === 0 && report.privilegeUsage.overprivilegedWrites.length === 0) {
        md += `✅  All requested access scopes are actively used in the codebase.\n\n`;
      } else {
        if (report.privilegeUsage.unusedScopes.length > 0) {
          md += `⚠️  **Unused Requested Scopes Detected:** \`${report.privilegeUsage.unusedScopes.join(', ')}\`\n`;
        }
        if (report.privilegeUsage.overprivilegedWrites.length > 0) {
          md += `🟡  **Overprivileged Write Scopes (Only Reads Detected):** \`${report.privilegeUsage.overprivilegedWrites.join(', ')}\`\n`;
        }
        md += `\n`;
      }
    }

    // 3. App Store Review Requirements & Listing Quality
    if (report.reviewRequirements) {
      md += `### 3. App Store Review & Listing Compliance\n`;
      if (report.reviewRequirements.passed && !report.reviewRequirements.exaggeratedLanguageFound && !report.reviewRequirements.brandMisuseFound) {
        md += `✅  Listing metadata and code patterns comply with Shopify App Store Review requirements.\n\n`;
      } else {
        if (report.reviewRequirements.brandMisuseFound) {
          md += `🔴  **Shopify Brand Misuse Detected:** App name violates Section 4.1.2 naming guidelines.\n`;
        }
        if (report.reviewRequirements.exaggeratedLanguageFound) {
          md += `🔴  **Exaggerated / Superlative Language Detected:** Contains prohibited claims under Section 4.3.3.\n`;
        }
        if (report.reviewRequirements.insecurePatternsFound) {
          md += `🔴  **Prohibited Security Patterns Detected:** Secrets or direct theme overwrites detected.\n`;
        }
        md += `\n`;
      }
    }

    // 4. API Deprecation Summary
    md += `### 4. Quarterly GraphQL API Deprecations\n`;
    if (report.deprecation.deprecatedItemsCount === 0) {
      md += `✅  Zero deprecated Shopify API calls detected in checked files.\n\n`;
    } else {
      md += `⚠️  **${report.deprecation.deprecatedItemsCount} Deprecated API Calls Detected:**\n\n`;
      md += `| Field / Endpoint | Deprecated Since | Sunset Date | Location & Offending Call | Remediation |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;
      for (const item of report.deprecation.items) {
        const lineSnippet = item.lineContent ? `<br><code>${this.escapeHtml(item.lineContent.trim())}</code>` : '';
        md += `| \`${item.fieldOrEndpoint}\` | ${item.deprecatedSince} | **${item.sunsetDate}** | \`${item.file}:${item.line}\`${lineSnippet} | ${item.replacement || 'Update API'} |\n`;
      }
      md += `\n`;
    }

    // 5. Wasm Performance Profile
    if (report.wasmProfile && report.wasmProfile.sizeBytes > 0) {
      const wasmStatus = report.wasmProfile.passed ? '✅  Passed' : '❌  Failed';
      md += `### 5. Rust Wasm Edge Performance Profile\n`;
      md += `- **Binary Size:** \`${report.wasmProfile.sizeFormatted}\` / \`256 KB\` budget (${wasmStatus})\n`;
      md += `- **Estimated Edge Latency:** \`${report.wasmProfile.estimatedExecutionMs}ms\` / \`5.0ms\` hard cutoff (Target: < 1.5ms)\n`;
      md += `- **Link-Time Optimization (LTO):** ${report.wasmProfile.hasOptimizedLto ? '✅  Optimized' : '⚠️  Unoptimized'}\n\n`;
    }

    // 6. Detailed Actionable Findings
    const allFindings = [
      ...report.compliance.findings,
      ...(report.privilegeUsage?.findings || []),
      ...(report.reviewRequirements?.findings || []),
      ...report.deprecation.findings,
      ...(report.wasmProfile?.findings || []),
      ...(report.bfsCanary?.findings || []),
    ];

    if (allFindings.length > 0) {
      md += `### 6. Required Action Items\n\n`;
      for (const f of allFindings) {
        const icon = f.severity === 'ERROR' ? '🔴  **ERROR**' : f.severity === 'WARNING' ? '🟡  **WARNING**' : 'ℹ️  **INFO**';
        md += `- ${icon}: **${f.title}**\n`;
        if (f.file) {
          md += `  - *Location:* \`${f.file}${f.line ? `:${f.line}` : ''}\`\n`;
        }
        if (f.matchedPhrase) {
          md += `  - *Offending Phrase / Token:* \`${f.matchedPhrase}\`\n`;
        }
        if (f.lineContent) {
          const lang = this.detectLanguage(f.file || '');
          md += `  - *Offending Code:*\n`;
          md += `    \`\`\`${lang}\n`;
          md += `    ${f.line ? `${f.line} | ` : ''}${f.lineContent}\n`;
          md += `    \`\`\`\n`;
        }
        md += `  - *Issue:* ${f.message}\n`;
        if (f.remediation) {
          md += `  - *Fix:* ${f.remediation}\n`;
        }
      }
      md += `\n`;
    }

    md += `---\n*Automated gatekeeper report generated by [Shopify Edge Guardian](https://github.com/marketplace/actions/shopify-edge-guardian)*\n`;
    return md;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private detectLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'toml':
        return 'toml';
      case 'json':
        return 'json';
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
      case 'mjs':
      case 'cjs':
        return 'typescript';
      case 'graphql':
      case 'gql':
        return 'graphql';
      case 'liquid':
        return 'liquid';
      case 'md':
      case 'markdown':
        return 'markdown';
      case 'html':
        return 'html';
      default:
        return 'text';
    }
  }
}
