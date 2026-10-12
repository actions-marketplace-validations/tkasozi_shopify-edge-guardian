import * as path from 'path';

/**
 * Standard lockfiles and generated dependency files that must never
 * trigger false positive violations (superlative claims, security warnings, deprecations).
 */
export const IGNORED_LOCKFILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'cargo.lock',
  'composer.lock',
  'pipfile.lock',
  'poetry.lock',
  'gemfile.lock',
  'shrinkwrap.json',
]);

/**
 * Checks whether a given file path should be completely excluded from scanning.
 */
export function isIgnoredFile(filePath: string): boolean {
  const baseName = path.basename(filePath).toLowerCase();

  if (IGNORED_LOCKFILES.has(baseName)) {
    return true;
  }

  if (baseName.endsWith('.lock')) {
    return true;
  }

  // Minified bundles, source maps, and binary build artifacts
  if (baseName.endsWith('.min.js') || baseName.endsWith('.min.css') || baseName.endsWith('.map')) {
    return true;
  }

  return false;
}

/**
 * Masks comments across various programming and markup languages by replacing
 * comment characters with spaces while preserving newlines and exact character offsets.
 *
 * This ensures:
 * 1. False positives inside comments are completely eliminated.
 * 2. Exact file line and column numbers remain 100% synchronized with the original source.
 */
export function maskComments(content: string, filePathOrExt: string): string {
  const ext = filePathOrExt.startsWith('.')
    ? filePathOrExt.toLowerCase()
    : path.extname(filePathOrExt).toLowerCase();

  const isHashCommentType = ['.toml', '.yaml', '.yml', '.py', '.rb', '.sh', '.bash', '.zsh'].includes(ext);
  const isCStyleType = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.rs', '.jsonc'].includes(ext);
  const isHtmlOrMd = ['.html', '.md', '.markdown'].includes(ext);
  const isLiquid = ext === '.liquid';

  if (!isHashCommentType && !isCStyleType && !isHtmlOrMd && !isLiquid) {
    return content;
  }

  const chars = content.split('');
  const len = chars.length;
  let i = 0;

  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;

  while (i < len) {
    const ch = chars[i];
    const nextCh = i + 1 < len ? chars[i + 1] : '';

    // Handle string literal boundaries (skip escaped quotes)
    if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      if (ch === "'" && !isHtmlOrMd && !isLiquid) {
        inSingleQuote = true;
        i++;
        continue;
      } else if (ch === '"') {
        inDoubleQuote = true;
        i++;
        continue;
      } else if (ch === '`' && isCStyleType) {
        inBacktick = true;
        i++;
        continue;
      }
    } else if (inSingleQuote) {
      if (ch === '\\' && i + 1 < len) {
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingleQuote = false;
      }
      i++;
      continue;
    } else if (inDoubleQuote) {
      if (ch === '\\' && i + 1 < len) {
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = false;
      }
      i++;
      continue;
    } else if (inBacktick) {
      if (ch === '\\' && i + 1 < len) {
        i += 2;
        continue;
      }
      if (ch === '`') {
        inBacktick = false;
      }
      i++;
      continue;
    }

    // 1. Hash comments: # (TOML, YAML, Python, Ruby, Shell)
    if (isHashCommentType && ch === '#') {
      while (i < len && chars[i] !== '\n') {
        if (chars[i] !== '\r') {
          chars[i] = ' ';
        }
        i++;
      }
      continue;
    }

    // 2. Liquid comments: {% comment %} ... {% endcomment %} or {% # inline %}
    if (isLiquid && ch === '{' && nextCh === '%') {
      const rest = content.slice(i);
      const inlineMatch = /^{%\s*#[\s\S]*?%}/.exec(rest);
      if (inlineMatch) {
        const matchLen = inlineMatch[0].length;
        for (let k = 0; k < matchLen; k++) {
          if (chars[i + k] !== '\n' && chars[i + k] !== '\r') {
            chars[i + k] = ' ';
          }
        }
        i += matchLen;
        continue;
      }

      const blockMatch = /^{%\s*comment\s*%}[\s\S]*?{%\s*endcomment\s*%}/.exec(rest);
      if (blockMatch) {
        const matchLen = blockMatch[0].length;
        for (let k = 0; k < matchLen; k++) {
          if (chars[i + k] !== '\n' && chars[i + k] !== '\r') {
            chars[i + k] = ' ';
          }
        }
        i += matchLen;
        continue;
      }
    }

    // 3. HTML / Markdown comments: <!-- ... -->
    if ((isHtmlOrMd || isLiquid) && ch === '<' && nextCh === '!' && content.slice(i, i + 4) === '<!--') {
      const endIdx = content.indexOf('-->', i + 4);
      const limit = endIdx !== -1 ? endIdx + 3 : len;
      while (i < limit) {
        if (chars[i] !== '\n' && chars[i] !== '\r') {
          chars[i] = ' ';
        }
        i++;
      }
      continue;
    }

    // 4. C-Style single-line comments: // ...
    if (isCStyleType && ch === '/' && nextCh === '/') {
      while (i < len && chars[i] !== '\n') {
        if (chars[i] !== '\r') {
          chars[i] = ' ';
        }
        i++;
      }
      continue;
    }

    // 5. C-Style multi-line comments: /* ... */
    if (isCStyleType && ch === '/' && nextCh === '*') {
      chars[i] = ' ';
      chars[i + 1] = ' ';
      i += 2;
      while (i < len) {
        if (chars[i] === '*' && i + 1 < len && chars[i + 1] === '/') {
          chars[i] = ' ';
          chars[i + 1] = ' ';
          i += 2;
          break;
        }
        if (chars[i] !== '\n' && chars[i] !== '\r') {
          chars[i] = ' ';
        }
        i++;
      }
      continue;
    }

    i++;
  }

  return chars.join('');
}
