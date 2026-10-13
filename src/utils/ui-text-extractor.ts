import * as path from 'path';
import { maskComments } from './sanitizer.js';

export type UiSourceType =
  | 'JSX_TEXT'
  | 'JSX_PROP'
  | 'LIQUID_TEXT'
  | 'LIQUID_SCHEMA'
  | 'LOCALE_STRING';

export interface ExtractedUiText {
  text: string;
  line: number;
  lineContent: string;
  sourceType: UiSourceType;
  file?: string;
}

const UI_PROP_NAMES = new Set([
  'title',
  'subtitle',
  'heading',
  'description',
  'content',
  'label',
  'helptext',
  'placeholder',
  'message',
  'error',
  'tooltip',
  'actiontext',
  'buttontext',
]);

const IGNORED_SNIPPETS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'void',
  'object',
  'string',
  'number',
  'boolean',
  'any',
  'unknown',
  'never',
]);

/**
 * Extracts merchant- and buyer-facing UI text strings from .tsx, .jsx,
 * .liquid, and locales/*.json files while strictly omitting code identifiers,
 * imports, types, hooks, and database queries.
 */
export function extractUiText(content: string, filePath: string): ExtractedUiText[] {
  const ext = path.extname(filePath).toLowerCase();
  const lowerPath = filePath.replace(/\\/g, '/').toLowerCase();
  const results: ExtractedUiText[] = [];

  if (['.tsx', '.jsx'].includes(ext)) {
    extractFromJsx(content, filePath, results);
  } else if (ext === '.liquid') {
    extractFromLiquid(content, filePath, results);
  } else if (ext === '.json' && (lowerPath.includes('/locales/') || lowerPath.includes('\\locales\\') || lowerPath.endsWith('schema.json'))) {
    extractFromLocaleJson(content, filePath, results);
  }

  return results;
}

/**
 * Extracts JSX Text nodes and UI display props from React/Polaris/Remix files.
 */
function extractFromJsx(content: string, filePath: string, results: ExtractedUiText[]): void {
  const clean = maskComments(content, filePath);
  const lines = content.split('\n');

  // 1. Extract JSX Text Nodes: text between > and <
  // Matches e.g. <Text>The #1 Wholesale App</Text> or <h1>Best Deals</h1>
  const jsxTextRegex = />([^<>{}\r\n]{3,})</g;
  let match: RegExpExecArray | null;

  while ((match = jsxTextRegex.exec(clean)) !== null) {
    const raw = match[1].trim();
    if (isValidUiText(raw)) {
      const matchIdx = match.index + 1; // skip leading '>'
      const line = content.slice(0, matchIdx).split('\n').length;
      results.push({
        text: raw,
        line,
        lineContent: lines[line - 1]?.trimEnd() || '',
        sourceType: 'JSX_TEXT',
        file: filePath,
      });
    }
  }

  // 2. Extract Display Attributes / Props:
  // title="...", subtitle="...", description="...", label="...", helpText="...", content="..."
  // Handles title="string" and title={'string'}
  const propRegex = /\b([a-zA-Z]+)\s*=\s*(?:["']([^"'\r\n]{3,})["']|\{\s*["']([^"'\r\n]{3,})["']\s*\})/g;

  while ((match = propRegex.exec(clean)) !== null) {
    const propName = match[1].toLowerCase();
    const val = (match[2] || match[3] || '').trim();

    if (UI_PROP_NAMES.has(propName) && isValidUiText(val)) {
      const line = content.slice(0, match.index).split('\n').length;
      results.push({
        text: val,
        line,
        lineContent: lines[line - 1]?.trimEnd() || '',
        sourceType: 'JSX_PROP',
        file: filePath,
      });
    }
  }

  // 3. Extract Polaris Action Props: e.g. primaryAction={{ content: 'The Best Plan' }}
  const actionContentRegex = /\bcontent\s*:\s*["']([^"'\r\n]{3,})["']/g;
  while ((match = actionContentRegex.exec(clean)) !== null) {
    const val = match[1].trim();
    if (isValidUiText(val)) {
      const line = content.slice(0, match.index).split('\n').length;
      results.push({
        text: val,
        line,
        lineContent: lines[line - 1]?.trimEnd() || '',
        sourceType: 'JSX_PROP',
        file: filePath,
      });
    }
  }
}

/**
 * Extracts user-facing template text and Theme Editor schemas from .liquid files.
 */
function extractFromLiquid(content: string, filePath: string, results: ExtractedUiText[]): void {
  const clean = maskComments(content, filePath);
  const lines = content.split('\n');

  // 1. Schema JSON extraction: {% schema %} ... {% endschema %}
  const schemaRegex = /{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/g;
  let schemaMatch: RegExpExecArray | null;

  while ((schemaMatch = schemaRegex.exec(clean)) !== null) {
    const jsonStr = schemaMatch[1];
    const schemaStartLine = content.slice(0, schemaMatch.index).split('\n').length;
    try {
      const parsed = JSON.parse(jsonStr);
      extractStringsFromJson(parsed, (text, key) => {
        if (isValidUiText(text) && ['name', 'label', 'info', 'default', 'tagline'].includes(key.toLowerCase())) {
          // Locate line in schema block
          const lineOffset = jsonStr.slice(0, jsonStr.indexOf(text)).split('\n').length - 1;
          const line = schemaStartLine + Math.max(0, lineOffset);
          results.push({
            text,
            line,
            lineContent: lines[line - 1]?.trimEnd() || '',
            sourceType: 'LIQUID_SCHEMA',
            file: filePath,
          });
        }
      });
    } catch {
      // Malformed schema handled by Liquid linter
    }
  }

  // 2. Text outside Liquid tags: strip {% ... %} and {{ ... }}
  const textWithoutTags = clean
    .replace(/{%[\s\S]*?%}/g, (m) => ' '.repeat(m.length))
    .replace(/{{[\s\S]*?}}/g, (m) => ' '.repeat(m.length));

  // Find standalone text lines or HTML content
  const textLines = textWithoutTags.split('\n');
  for (let idx = 0; idx < textLines.length; idx++) {
    const rawLine = textLines[idx].replace(/<[^>]+>/g, ' ').trim();
    if (isValidUiText(rawLine) && !rawLine.startsWith('{') && !rawLine.startsWith('(')) {
      results.push({
        text: rawLine,
        line: idx + 1,
        lineContent: lines[idx]?.trimEnd() || '',
        sourceType: 'LIQUID_TEXT',
        file: filePath,
      });
    }
  }
}

/**
 * Extracts leaf translation strings from locale JSON files.
 */
function extractFromLocaleJson(content: string, filePath: string, results: ExtractedUiText[]): void {
  const lines = content.split('\n');
  try {
    const parsed = JSON.parse(content);
    extractStringsFromJson(parsed, (text) => {
      if (isValidUiText(text)) {
        // Locate line of string in JSON file
        const lineIdx = lines.findIndex((l) => l.includes(`"${text}"`));
        const line = lineIdx !== -1 ? lineIdx + 1 : 1;
        results.push({
          text,
          line,
          lineContent: lines[line - 1]?.trimEnd() || '',
          sourceType: 'LOCALE_STRING',
          file: filePath,
        });
      }
    });
  } catch {
    // Malformed JSON skipped
  }
}

/**
 * Recursively traverses a JSON object and invokes callback for all string values.
 */
function extractStringsFromJson(obj: any, cb: (value: string, key: string) => void, currentKey: string = ''): void {
  if (!obj || typeof obj !== 'object') return;

  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      cb(v, k);
    } else if (typeof v === 'object') {
      extractStringsFromJson(v, cb, k);
    }
  }
}

/**
 * Validates whether an extracted string is plausible merchant- or buyer-facing UI text.
 */
function isValidUiText(str: string): boolean {
  if (!str || str.length < 3) return false;
  // Ignore code identifiers or reserved words
  if (IGNORED_SNIPPETS.has(str.toLowerCase())) return false;
  // Must contain at least one alphabetic character
  if (!/[a-zA-Z]/.test(str)) return false;
  // Ignore file paths or URLs
  if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('/') || str.startsWith('./')) {
    return false;
  }
  // Ignore CSS units or Tailwind-like classes
  if (/^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(str)) return false;

  return true;
}
