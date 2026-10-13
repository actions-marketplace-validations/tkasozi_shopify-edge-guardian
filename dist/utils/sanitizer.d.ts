/**
 * Standard lockfiles and generated dependency files that must never
 * trigger false positive violations (superlative claims, security warnings, deprecations).
 */
export declare const IGNORED_LOCKFILES: Set<string>;
/**
 * Developer documentation, changelogs, release notes, and contributor files
 * that are internal to engineering and must never be evaluated as merchant-facing listing copy.
 */
export declare const DEFAULT_REVIEW_IGNORED_FILES: Set<string>;
/**
 * Standard developer and testing directories that are excluded from marketing copy analysis.
 */
export declare const DEFAULT_REVIEW_IGNORED_DIRS: Set<string>;
/**
 * Converts a glob pattern (e.g. "docs/**", "*.test.ts", "RELEASE_NOTES.md") into a RegExp.
 */
export declare function globToRegex(glob: string): RegExp;
/**
 * Tests whether a given file path matches any custom ignore glob or filename.
 */
export declare function matchesIgnore(filePath: string, projectRoot?: string, patterns?: string[]): boolean;
/**
 * Checks whether a given file path should be completely excluded from scanning.
 */
export declare function isIgnoredFile(filePath: string, customIgnores?: string[], projectRoot?: string): boolean;
/**
 * Masks comments across various programming and markup languages by replacing
 * comment characters with spaces while preserving newlines and exact character offsets.
 *
 * This ensures:
 * 1. False positives inside comments are completely eliminated.
 * 2. Exact file line and column numbers remain 100% synchronized with the original source.
 */
export declare function maskComments(content: string, filePathOrExt: string): string;
