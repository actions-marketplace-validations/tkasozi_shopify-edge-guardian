"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownReporter = void 0;
class MarkdownReporter {
    /**
     * Generates a GitHub Pull Request comment or CI summary report in markdown.
     */
    generate(report) {
        const statusEmoji = report.passed ? '✅' : '❌';
        const statusTitle = report.passed
            ? 'Shopify Edge Guardian: Automated Technical Pre-Flight Checks Passed'
            : 'Shopify Edge Guardian: Merge Blocked (Violations Detected)';
        let md = `## ${statusEmoji}  ${statusTitle}\n\n`;
        md += `*Audited at: ${report.timestamp} | Errors: **${report.totalErrors}** | Warnings: **${report.totalWarnings}***\n\n`;
        // Sober Reality Notice for Passing Runs
        if (report.passed) {
            md += `> ⚠️  **Sober Commercial Reality Notice (Zero Vanity Metrics):**\n`;
            md += `> • **Automated Code Gates:** Passed (0 errors, 0 review blockers). Conforms to Shopify API and App Bridge standards.\n`;
            md += `> • **Human Review Requirement:** Automated CI passes do **not** guarantee Shopify App Store approval. Shopify reviewers conduct manual end-to-end QA of merchant onboarding, installation, and configuration.\n`;
            md += `> • **Built for Shopify Badge Notice:** The BFS badge is **not granted at launch**. It requires post-launch marketplace validation (50+ active paid installs, 5+ reviews, 4.0+ rating).\n\n`;
        }
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
            }
            else {
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
            }
            else {
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
        }
        else {
            md += `⚠️  **${report.deprecation.deprecatedItemsCount} Deprecated API Calls Detected:**\n\n`;
            md += `| Field / Endpoint | Deprecated Since | Sunset Date | Location & Offending Call | Remediation |\n`;
            md += `| :--- | :--- | :--- | :--- | :--- |\n`;
            for (const item of report.deprecation.items) {
                const lineSnippet = item.lineContent ? `<br><code>${this.escapeHtml(item.lineContent.trim())}</code>` : '';
                md += `| \`${item.fieldOrEndpoint}\` | ${item.deprecatedSince} | **${item.sunsetDate}** | \`${item.file}:${item.line}\`${lineSnippet} | ${item.replacement || 'Update API'} |\n`;
            }
            md += `\n`;
        }
        // 5. Built for Shopify (BFS) Readiness Scorecard
        if (report.bfsScorecard) {
            md += `### 5. Built for Shopify (BFS) Readiness Scorecard\n`;
            md += `*Primary App Category: **${report.bfsScorecard.detectedCategory.toUpperCase()}** | Automated Gates: **${report.bfsScorecard.automatedGatesPassed}/${report.bfsScorecard.automatedGatesTotal} Passed** | Post-Launch Milestones: **${report.bfsScorecard.merchantUtilityGatesPending} Pending***\n\n`;
            md += `| Category / Criteria | Status | Detail |\n`;
            md += `| :--- | :--- | :--- |\n`;
            const sections = [
                { key: 'PERFORMANCE', title: 'Performance Criteria' },
                { key: 'DESIGN_FUNCTIONALITY', title: 'Design and Functionality' },
                { key: 'CATEGORY_SPECIFIC', title: `Category-Specific (${report.bfsScorecard.detectedCategory})` },
                { key: 'MERCHANT_UTILITY', title: 'Merchant Utility (Post-Launch Milestones)' },
            ];
            for (const sec of sections) {
                md += `| **${sec.title}** | | |\n`;
                const secMetrics = report.bfsScorecard.metrics.filter((m) => m.section === sec.key);
                for (const m of secMetrics) {
                    const statusIcon = m.status === 'PASSED'
                        ? '✅  Passed'
                        : m.status === 'FAILED'
                            ? '🔴  Failed'
                            : m.status === 'WARNING'
                                ? '🟡  Warning'
                                : m.status === 'SKIPPED'
                                    ? '⏭️  Skipped'
                                    : '⏳  Pending';
                    md += `| • ${m.name} | ${statusIcon} | ${m.detail} |\n`;
                }
            }
            md += `\n`;
        }
        // 6. Wasm Performance Profile
        if (report.wasmProfile && report.wasmProfile.sizeBytes > 0) {
            const wasmStatus = report.wasmProfile.passed ? '✅  Passed' : '❌  Failed';
            md += `### 6. Rust Wasm Edge Performance Profile\n`;
            md += `- **Binary Size:** \`${report.wasmProfile.sizeFormatted}\` / \`256 KB\` budget (${wasmStatus})\n`;
            md += `- **Simulated Edge Latency:** \`${report.wasmProfile.estimatedExecutionMs}ms\` / \`5.0ms\` hard cutoff (Target: < 1.5ms)\n`;
            if (report.wasmProfile.compileTimeMs !== undefined && report.wasmProfile.executionTimeMs !== undefined) {
                md += `  • *V8 Compile Time:* \`${report.wasmProfile.compileTimeMs}ms\` | *Instantiation:* \`${report.wasmProfile.instantiationTimeMs}ms\` | *Execution:* \`${report.wasmProfile.executionTimeMs}ms\`\n`;
            }
            if (report.wasmProfile.memoryBytes) {
                const memKb = (report.wasmProfile.memoryBytes / 1024).toFixed(1);
                md += `- **Sandboxed Memory Footprint:** \`${memKb} KB\` (${report.wasmProfile.memoryPages} pages)\n`;
            }
            md += `- **Link-Time Optimization (LTO):** ${report.wasmProfile.hasOptimizedLto ? '✅  Optimized' : '⚠️  Unoptimized'}\n\n`;
        }
        // 7. Detailed Actionable Findings
        const allFindings = [
            ...report.compliance.findings,
            ...(report.privilegeUsage?.findings || []),
            ...(report.reviewRequirements?.findings || []),
            ...report.deprecation.findings,
            ...(report.wasmProfile?.findings || []),
            ...(report.bfsCanary?.findings || []),
            ...(report.bfsScorecard?.findings || []),
        ];
        // Deduplicate findings by key so identical issues are never shown twice
        const seenFindingKeys = new Set();
        const uniqueFindings = [];
        for (const f of allFindings) {
            const normFile = f.file ? f.file.replace(/\\/g, '/').toLowerCase() : '';
            const key = `${f.id}:${normFile}:${f.line || ''}`;
            if (!seenFindingKeys.has(key)) {
                seenFindingKeys.add(key);
                uniqueFindings.push(f);
            }
        }
        if (uniqueFindings.length > 0) {
            md += `### 7. Required Action Items\n\n`;
            for (const f of uniqueFindings) {
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
    escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    detectLanguage(filename) {
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
exports.MarkdownReporter = MarkdownReporter;
//# sourceMappingURL=markdown-reporter.js.map