import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DeprecationAnalyzer } from '../src/analyzers/deprecation-analyzer.js';

describe('DeprecationAnalyzer', () => {
  const analyzer = new DeprecationAnalyzer();
  const fixturesDir = path.resolve(__dirname, '../fixtures');
  const tempTestDir = path.resolve(__dirname, '../fixtures/temp-deprecations');

  beforeAll(() => {
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true });
    }

    // File 1: Consecutive deprecations on adjacent lines (tests Blocker 2 stateful /g bug)
    fs.writeFileSync(
      path.join(tempTestDir, 'consecutive.ts'),
      `const q1 = "privateMetafields";
const q2 = "privateMetafields";
const q3 = "privateMetafields";
`
    );

    // File 2: Standard multiline formatted GraphQL query (tests Blocker 3 multiline match)
    fs.writeFileSync(
      path.join(tempTestDir, 'multiline.graphql'),
      `query GetDiscount {
  discountAutomaticApp {
    id
    title
  }
}
`
    );
  });

  afterAll(() => {
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  it('detects deprecated REST endpoints and deprecated GraphQL queries in fixtures', () => {
    const targetDir = path.join(fixturesDir, 'code-with-deprecations');
    const result = analyzer.scanDirectory(targetDir);

    expect(result.deprecatedItemsCount).toBeGreaterThan(0);
    expect(result.items.some((i) => i.fieldOrEndpoint.includes('REST Admin API'))).toBe(true);
    expect(result.items.some((i) => i.fieldOrEndpoint.includes('privateMetafields'))).toBe(true);
  });

  it('BLOCKER 2: detects ALL consecutive deprecations without skipping (eliminating stateful /g bug)', () => {
    const result = analyzer.scanDirectory(tempTestDir);
    const consecutiveMatches = result.items.filter((i) => i.fieldOrEndpoint.includes('privateMetafields'));

    // Must match all 3 lines: line 1, line 2, line 3
    expect(consecutiveMatches).toHaveLength(3);
    expect(consecutiveMatches.map((m) => m.line)).toEqual([1, 2, 3]);
  });

  it('BLOCKER 3: detects multiline formatted GraphQL queries across newlines', () => {
    const result = analyzer.scanDirectory(tempTestDir);
    const multilineMatch = result.items.find((i) => i.fieldOrEndpoint.includes('discountAutomaticApp.title'));

    expect(multilineMatch).toBeDefined();
    expect(multilineMatch?.line).toBe(2);
  });

  it('passes cleanly for modern clean GraphQL queries', () => {
    const targetDir = path.join(fixturesDir, 'code-clean');
    const result = analyzer.scanDirectory(targetDir);

    expect(result.passed).toBe(true);
    expect(result.deprecatedItemsCount).toBe(0);
  });

  it('parses runtime X-Shopify-API-Deprecated-Reason headers', () => {
    const header = 'https://shopify.dev/api/release-notes/2024-10#rest-admin-api-deprecation';
    const finding = analyzer.parseRuntimeHeader(header);

    expect(finding).not.toBeNull();
    expect(finding?.id).toBe('RUNTIME_DEPRECATION_HEADER');
    expect(finding?.severity).toBe('WARNING');
    expect(finding?.message).toContain(header);
  });

  it('never flags deprecated endpoints or GraphQL fields mentioned inside comments', () => {
    const commentsDir = path.join(fixturesDir, 'temp-deprecation-comments');
    if (!fs.existsSync(commentsDir)) {
      fs.mkdirSync(commentsDir, { recursive: true });
    }

    try {
      fs.writeFileSync(
        path.join(commentsDir, 'service.ts'),
        `// Old legacy note: formerly called fulfillmentOrder.lineItems
         /*
          * Note: privateMetafields was replaced with metafields
          */
         export const getStatus = () => "active";`
      );

      const result = analyzer.scanDirectory(commentsDir);

      expect(result.passed).toBe(true);
      expect(result.deprecatedItemsCount).toBe(0);
      expect(result.findings).toHaveLength(0);
    } finally {
      if (fs.existsSync(commentsDir)) {
        fs.rmSync(commentsDir, { recursive: true, force: true });
      }
    }
  });
});
