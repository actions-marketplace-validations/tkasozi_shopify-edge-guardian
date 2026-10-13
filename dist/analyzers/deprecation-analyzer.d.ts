import { DeprecationResult, EdgeGuardianConfig, Finding } from '../types/index.js';
export declare class DeprecationAnalyzer {
    /**
     * Scans a directory or file list for deprecated GraphQL queries,
     * legacy REST calls, and deprecated schema types.
     */
    scanDirectory(dirPath: string, config?: EdgeGuardianConfig): DeprecationResult;
    /**
     * Parses runtime HTTP response headers (e.g. from production telemetry logs)
     * to catch active deprecation warnings from Shopify's servers.
     */
    parseRuntimeHeader(headerValue: string): Finding | null;
    private collectSourceFiles;
}
