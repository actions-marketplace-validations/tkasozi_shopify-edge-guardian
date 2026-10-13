"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractUiText = extractUiText;
const path = __importStar(require("path"));
const sanitizer_js_1 = require("./sanitizer.js");
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
function extractUiText(content, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const lowerPath = filePath.replace(/\\/g, '/').toLowerCase();
    const results = [];
    if (['.tsx', '.jsx'].includes(ext)) {
        extractFromJsx(content, filePath, results);
    }
    else if (ext === '.liquid') {
        extractFromLiquid(content, filePath, results);
    }
    else if (ext === '.json' && (lowerPath.includes('/locales/') || lowerPath.includes('\\locales\\') || lowerPath.endsWith('schema.json'))) {
        extractFromLocaleJson(content, filePath, results);
    }
    return results;
}
/**
 * Extracts JSX Text nodes and UI display props from React/Polaris/Remix files.
 */
function extractFromJsx(content, filePath, results) {
    const clean = (0, sanitizer_js_1.maskComments)(content, filePath);
    const lines = content.split('\n');
    // 1. Extract JSX Text Nodes: text between > and <
    // Matches e.g. <Text>The #1 Wholesale App</Text> or <h1>Best Deals</h1>
    const jsxTextRegex = />([^<>{}\r\n]{3,})</g;
    let match;
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
function extractFromLiquid(content, filePath, results) {
    const clean = (0, sanitizer_js_1.maskComments)(content, filePath);
    const lines = content.split('\n');
    // 1. Schema JSON extraction: {% schema %} ... {% endschema %}
    const schemaRegex = /{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/g;
    let schemaMatch;
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
        }
        catch {
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
function extractFromLocaleJson(content, filePath, results) {
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
    }
    catch {
        // Malformed JSON skipped
    }
}
/**
 * Recursively traverses a JSON object and invokes callback for all string values.
 */
function extractStringsFromJson(obj, cb, currentKey = '') {
    if (!obj || typeof obj !== 'object')
        return;
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') {
            cb(v, k);
        }
        else if (typeof v === 'object') {
            extractStringsFromJson(v, cb, k);
        }
    }
}
/**
 * Validates whether an extracted string is plausible merchant- or buyer-facing UI text.
 */
function isValidUiText(str) {
    if (!str || str.length < 3)
        return false;
    // Ignore code identifiers or reserved words
    if (IGNORED_SNIPPETS.has(str.toLowerCase()))
        return false;
    // Must contain at least one alphabetic character
    if (!/[a-zA-Z]/.test(str))
        return false;
    // Ignore file paths or URLs
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('/') || str.startsWith('./')) {
        return false;
    }
    // Ignore CSS units or Tailwind-like classes
    if (/^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(str))
        return false;
    return true;
}
//# sourceMappingURL=ui-text-extractor.js.map