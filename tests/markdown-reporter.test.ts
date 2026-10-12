import { describe, it, expect } from 'vitest';
import { MarkdownReporter } from '../src/reporter/markdown-reporter.js';
import { GuardianReport } from '../src/types/index.js';

describe('MarkdownReporter (Actionable Violation Formatting)', () => {
  const reporter = new MarkdownReporter();

  it('renders offending line, matched phrase, and syntax code blocks in report', () => {
    const mockReport: GuardianReport = {
      timestamp: '2026-10-12T00:00:00.000Z',
      passed: false,
      totalErrors: 1,
      totalWarnings: 1,
      compliance: {
        passed: true,
        hasGdprCustomersDataRequest: true,
        hasGdprCustomersRedact: true,
        hasGdprShopRedact: true,
        embeddedConfigured: true,
        scopesRequested: ['read_products'],
        scopeBloatDetected: false,
        unnecessaryScopes: [],
        findings: [],
      },
      deprecation: {
        passed: true,
        deprecatedItemsCount: 1,
        items: [
          {
            fieldOrEndpoint: 'fulfillmentOrder.lineItems',
            deprecatedSince: '2024-04',
            sunsetDate: '2025-04-01',
            reason: 'Use lineItems connection',
            replacement: 'lineItems(first: 50)',
            file: 'src/fulfillment.ts',
            line: 42,
            lineContent: 'const items = order.fulfillmentOrder.lineItems;',
            matchedPhrase: 'fulfillmentOrder.lineItems',
          },
        ],
        findings: [
          {
            id: 'DEPRECATED_2024-04_42',
            category: 'DEPRECATION',
            severity: 'WARNING',
            title: 'Deprecated Shopify API: fulfillmentOrder.lineItems',
            message: 'Use lineItems connection (Sunset: 2025-04-01)',
            file: 'src/fulfillment.ts',
            line: 42,
            matchedPhrase: 'fulfillmentOrder.lineItems',
            lineContent: 'const items = order.fulfillmentOrder.lineItems;',
            remediation: 'lineItems(first: 50)',
          },
        ],
      },
      reviewRequirements: {
        passed: false,
        exaggeratedLanguageFound: true,
        brandMisuseFound: false,
        insecurePatternsFound: false,
        findings: [
          {
            id: 'SUPERLATIVE_THE_BEST',
            category: 'APP_STORE_REVIEW',
            severity: 'ERROR',
            title: 'Prohibited Superlative Claim "the best"',
            message: 'Violates Section 4.3.3. (Matched: "the best")',
            file: 'locales/en.json',
            line: 14,
            matchedPhrase: 'the best',
            lineContent: '  "description": "We are the best checkout app",',
            remediation: 'Replace with objective description.',
          },
        ],
      },
      summaryMarkdown: '',
    };

    const output = reporter.generate(mockReport);

    expect(output).toContain('Shopify Edge Guardian: Merge Blocked');
    expect(output).toContain('*Offending Phrase / Token:* `the best`');
    expect(output).toContain('*Offending Phrase / Token:* `fulfillmentOrder.lineItems`');
    expect(output).toContain('```json');
    expect(output).toContain('14 |   "description": "We are the best checkout app",');
    expect(output).toContain('```typescript');
    expect(output).toContain('42 | const items = order.fulfillmentOrder.lineItems;');
    expect(output).toContain('<code>const items = order.fulfillmentOrder.lineItems;</code>');
    expect(output).toContain('https://github.com/marketplace/actions/shopify-edge-guardian');
  });
});
