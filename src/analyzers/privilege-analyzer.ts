import * as fs from 'fs';
import * as path from 'path';
import { Finding, PrivilegeUsageResult } from '../types/index.js';
import { SCOPE_USAGE_MAP, SUSPICIOUS_HIGH_RISK_SCOPES } from '../rules/shopify-rules.js';

export class PrivilegeAnalyzer {
  /**
   * Analyzes an application codebase to verify that all access scopes requested
   * in shopify.app.toml are actively used. Flagging unused scopes protects developers
   * from App Store rejection under the Shopify Principle of Least Privilege (Section 3.2).
   */
  public analyze(projectRoot: string, scopesRequested: string[]): PrivilegeUsageResult {
    const findings: Finding[] = [];
    const usedScopes: string[] = [];
    const unusedScopes: string[] = [];
    const overprivilegedWrites: string[] = [];

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
    const sourceFiles = this.collectSourceFiles(projectRoot);
    const fileContents: { path: string; content: string }[] = [];

    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        fileContents.push({ path: path.relative(projectRoot, file), content });
      } catch {
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
      } else if (normalized.startsWith('read_')) {
        resourceKey = normalized.replace(/^read_/, '');
      } else if (normalized.startsWith('write_')) {
        resourceKey = normalized.replace(/^write_/, '');
      } else {
        resourceKey = normalized;
      }

      const patternConfig = SCOPE_USAGE_MAP[resourceKey];

      if (!patternConfig) {
        // If scope is not in our standard map (custom scope or extension scope), treat as used to avoid false positives
        usedScopes.push(scope);
        continue;
      }

      let readDetected = false;
      let writeDetected = false;
      let matchedFile = '';

      for (const { path: relPath, content } of fileContents) {
        // Check read patterns
        if (!readDetected) {
          for (const pattern of patternConfig.readPatterns) {
            if (pattern.test(content)) {
              readDetected = true;
              matchedFile = relPath;
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
        const isHighRisk = SUSPICIOUS_HIGH_RISK_SCOPES.includes(scope);

        findings.push({
          id: `UNUSED_PRIVILEGE_${scope.toUpperCase()}`,
          category: 'PRIVILEGE_LEAST',
          severity: isHighRisk ? 'ERROR' : 'WARNING',
          title: `Unused Elevated Privilege: '${scope}'`,
          message: `The scope '${scope}' is declared in shopify.app.toml, but zero corresponding API queries, mutations, or endpoints were detected in source files. Shopify requires strict Principle of Least Privilege (Requirement 3.2) and will reject apps requesting unused scopes.`,
          remediation: `Remove '${scope}' from shopify.app.toml or implement the required ${patternConfig.resource} operations.`,
        });
      } else {
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
            remediation: `Downgrade scope to 'read_${resourceKey}' to minimize merchant install friction and reduce App Store review scrutiny.`,
          });
        }
      }
    }

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

  private collectSourceFiles(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return fileList;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', 'target', '.next', '.cache'].includes(entry.name)) {
          continue;
        }
        this.collectSourceFiles(fullPath, fileList);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx', '.graphql', '.gql', '.mjs', '.cjs', '.liquid', '.vue', '.svelte', '.rb', '.py', '.php'].includes(ext)) {
          fileList.push(fullPath);
        }
      }
    }

    return fileList;
  }
}
