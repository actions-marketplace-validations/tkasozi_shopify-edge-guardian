import * as fs from 'fs';
import * as path from 'path';
import { DeprecationItem, DeprecationResult, Finding } from '../types/index.js';
import { KNOWN_DEPRECATIONS } from '../rules/shopify-rules.js';

export class DeprecationAnalyzer {
  /**
   * Scans a directory or file list for deprecated GraphQL queries,
   * legacy REST calls, and deprecated schema types.
   */
  public scanDirectory(dirPath: string): DeprecationResult {
    const findings: Finding[] = [];
    const items: DeprecationItem[] = [];

    const files = this.collectSourceFiles(dirPath);

    for (const file of files) {
      let content = '';
      try {
        content = fs.readFileSync(file, 'utf-8');
      } catch {
        continue; // Skip unreadable files
      }

      for (const deprecation of KNOWN_DEPRECATIONS) {
        // Create an isolated local regex with global matching to find all matches in this file
        const flags = deprecation.pattern.flags.replace('g', '') + 'g';
        const regex = new RegExp(deprecation.pattern.source, flags);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(content)) !== null) {
          const prefix = content.slice(0, match.index);
          const lineNumber = prefix.split('\n').length;

          const item: DeprecationItem = {
            fieldOrEndpoint: deprecation.fieldOrEndpoint,
            deprecatedSince: deprecation.deprecatedSince,
            sunsetDate: deprecation.sunsetDate,
            reason: deprecation.reason,
            replacement: deprecation.replacement,
            file: path.relative(dirPath, file),
            line: lineNumber,
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
            remediation: deprecation.replacement,
          });

          // Prevent zero-width infinite loop
          if (match.index === regex.lastIndex) {
            regex.lastIndex++;
          }
        }
      }
    }

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
  public parseRuntimeHeader(headerValue: string): Finding | null {
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

  private collectSourceFiles(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return fileList; // Permission denied or inaccessible directory
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', 'target'].includes(entry.name)) {
          continue;
        }
        this.collectSourceFiles(fullPath, fileList);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx', '.graphql', '.gql'].includes(ext)) {
          fileList.push(fullPath);
        }
      }
    }

    return fileList;
  }
}
