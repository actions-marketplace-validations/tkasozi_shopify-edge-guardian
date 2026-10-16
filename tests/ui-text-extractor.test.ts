import { describe, it, expect } from 'vitest';
import { extractUiText } from '../src/utils/ui-text-extractor.js';

describe('UiTextExtractor (JSX, Liquid & Locale Text Extraction)', () => {
  it('extracts JSX text nodes and display props from React/Polaris components', () => {
    const tsxCode = `
      import React from 'react';
      import { Page, Banner, Text, Button } from '@shopify/polaris';

      // This is a comment: <Text>#1 best app</Text>
      export default function PricingPage() {
        const findBestDiscount = () => { return 10; };
        return (
          <Page title="Wholesale Pricing Tiers">
            <Banner title="Guaranteed to increase store revenue by 30%" tone="info">
              <Text as="p">The #1 wholesale discount manager on Shopify</Text>
            </Banner>
            <Button primaryAction={{ content: "Upgrade to Pro" }}>Click</Button>
          </Page>
        );
      }
    `;

    const extracted = extractUiText(tsxCode, 'app/routes/pricing.tsx');
    const texts = extracted.map((e) => e.text);

    // Should extract user-facing UI text
    expect(texts).toContain('Wholesale Pricing Tiers');
    expect(texts).toContain('Guaranteed to increase store revenue by 30%');
    expect(texts).toContain('The #1 wholesale discount manager on Shopify');
    expect(texts).toContain('Upgrade to Pro');

    // Should NOT extract comments or code identifiers
    expect(texts.some((t) => t.includes('#1 best app'))).toBe(false);
    expect(texts.some((t) => t.includes('findBestDiscount'))).toBe(false);
    expect(texts.some((t) => t.includes('import React'))).toBe(false);
  });

  it('extracts Liquid storefront text and theme editor schema definitions', () => {
    const liquidCode = `
      {% comment %} Prohibited claims in comment should be ignored {% endcomment %}
      <div class="wholesale-banner">
        <h2>Wholesale B2B Tier Pricing Table</h2>
        <p>Save up to 40% on bulk variant orders</p>
      </div>

      {% schema %}
      {
        "name": "B2B Wholesale Table",
        "tagline": "The ultimate volume discount block",
        "settings": [
          {
            "type": "text",
            "id": "heading",
            "label": "Table Heading",
            "default": "Volume Pricing Breakdown"
          }
        ]
      }
      {% endschema %}
    `;

    const extracted = extractUiText(liquidCode, 'extensions/blocks/tier_table.liquid');
    const texts = extracted.map((e) => e.text);

    expect(texts).toContain('Wholesale B2B Tier Pricing Table');
    expect(texts).toContain('Save up to 40% on bulk variant orders');
    expect(texts).toContain('B2B Wholesale Table');
    expect(texts).toContain('The ultimate volume discount block');
    expect(texts).toContain('Table Heading');
    expect(texts).toContain('Volume Pricing Breakdown');

    // Should NOT extract comments
    expect(texts.some((t) => t.includes('Prohibited claims in comment'))).toBe(false);
  });

  it('extracts leaf translation strings from locales/en.default.json', () => {
    const localeJson = JSON.stringify({
      general: {
        title: 'Wholesale Discount Pro',
        welcome: 'Welcome to your wholesale manager',
      },
      pricing: {
        banner: '100% money-back guarantee on enterprise plans',
      },
    }, null, 2);

    const extracted = extractUiText(localeJson, 'extensions/locales/en.default.json');
    const texts = extracted.map((e) => e.text);

    expect(texts).toContain('Wholesale Discount Pro');
    expect(texts).toContain('Welcome to your wholesale manager');
    expect(texts).toContain('100% money-back guarantee on enterprise plans');
  });
});
