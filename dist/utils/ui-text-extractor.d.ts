export type UiSourceType = 'JSX_TEXT' | 'JSX_PROP' | 'LIQUID_TEXT' | 'LIQUID_SCHEMA' | 'LOCALE_STRING';
export interface ExtractedUiText {
    text: string;
    line: number;
    lineContent: string;
    sourceType: UiSourceType;
    file?: string;
}
/**
 * Extracts merchant- and buyer-facing UI text strings from .tsx, .jsx,
 * .liquid, and locales/*.json files while strictly omitting code identifiers,
 * imports, types, hooks, and database queries.
 */
export declare function extractUiText(content: string, filePath: string): ExtractedUiText[];
