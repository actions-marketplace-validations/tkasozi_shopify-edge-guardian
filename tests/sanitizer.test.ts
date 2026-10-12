import { describe, it, expect } from 'vitest';
import { isIgnoredFile, maskComments } from '../src/utils/sanitizer.js';

describe('Sanitizer Utility (Lockfile & Comment False Positive Prevention)', () => {
  it('correctly identifies lockfiles and minified files to ignore', () => {
    expect(isIgnoredFile('package-lock.json')).toBe(true);
    expect(isIgnoredFile('yarn.lock')).toBe(true);
    expect(isIgnoredFile('pnpm-lock.yaml')).toBe(true);
    expect(isIgnoredFile('Cargo.lock')).toBe(true);
    expect(isIgnoredFile('bun.lockb')).toBe(true);
    expect(isIgnoredFile('vendor/some.lock')).toBe(true);
    expect(isIgnoredFile('dist/bundle.min.js')).toBe(true);
    expect(isIgnoredFile('dist/bundle.js.map')).toBe(true);

    expect(isIgnoredFile('shopify.app.toml')).toBe(false);
    expect(isIgnoredFile('package.json')).toBe(false);
    expect(isIgnoredFile('src/index.ts')).toBe(false);
    expect(isIgnoredFile('README.md')).toBe(false);
  });

  it('masks hash comments in TOML while preserving strings containing hash symbols', () => {
    const tomlContent = `
# #1 rated cart optimizer in the world
name = "My App for Shopify" # inline comment: fastest app
url = "https://example.com#section"
# scopes = "read_all_orders"
scopes = "read_products"
`;

    const masked = maskComments(tomlContent, 'shopify.app.toml');

    expect(masked).not.toContain('#1 rated');
    expect(masked).not.toContain('fastest app');
    expect(masked).not.toContain('read_all_orders');
    expect(masked).toContain('name = "My App for Shopify"');
    expect(masked).toContain('url = "https://example.com#section"');
    expect(masked).toContain('scopes = "read_products"');

    // Verify exact length and line count preservation
    expect(masked.length).toBe(tomlContent.length);
    expect(masked.split('\n').length).toBe(tomlContent.split('\n').length);
  });

  it('masks single-line and multi-line comments in TypeScript / JavaScript', () => {
    const tsContent = `
// The best app in the world!
const app = "Shopify App";
/*
 * Guaranteed 100% boost in revenue
 * fulfillmentOrder.lineItems
 */
const query = "fulfillmentOrder.id";
`;

    const masked = maskComments(tsContent, 'service.ts');

    expect(masked).not.toContain('The best app');
    expect(masked).not.toContain('Guaranteed 100%');
    expect(masked).not.toContain('fulfillmentOrder.lineItems');
    expect(masked).toContain('const app = "Shopify App";');
    expect(masked).toContain('const query = "fulfillmentOrder.id";');

    expect(masked.length).toBe(tsContent.length);
    expect(masked.split('\n').length).toBe(tsContent.split('\n').length);
  });

  it('masks HTML / Markdown comments in markdown and html files', () => {
    const mdContent = `
# Title
<!-- #1 most popular app in Shopify App Store -->
Description of compliant app.
`;

    const masked = maskComments(mdContent, 'README.md');

    expect(masked).not.toContain('#1 most popular');
    expect(masked).toContain('Description of compliant app.');
    expect(masked.length).toBe(mdContent.length);
    expect(masked.split('\n').length).toBe(mdContent.split('\n').length);
  });

  it('masks Liquid comments in theme / liquid files', () => {
    const liquidContent = `
{% comment %}
  Guaranteed 100% speed increase
{% endcomment %}
<div>{{ product.title }}</div>
`;

    const masked = maskComments(liquidContent, 'snippet.liquid');

    expect(masked).not.toContain('Guaranteed 100%');
    expect(masked).toContain('<div>{{ product.title }}</div>');
    expect(masked.length).toBe(liquidContent.length);
    expect(masked.split('\n').length).toBe(liquidContent.split('\n').length);
  });
});
