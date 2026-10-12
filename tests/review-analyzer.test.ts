import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ReviewAnalyzer } from '../src/analyzers/review-analyzer.js';

describe('ReviewAnalyzer (Shopify App Store Review Blockers)', () => {
  const analyzer = new ReviewAnalyzer();
  const testRoot = path.resolve(__dirname, '../fixtures/temp-review-test');

  beforeAll(() => {
    if (!fs.existsSync(testRoot)) {
      fs.mkdirSync(testRoot, { recursive: true });
    }

    // App 1: Brand Misuse (Starts with "Shopify")
    const dirBrand = path.join(testRoot, 'brand-misuse-app');
    fs.mkdirSync(dirBrand, { recursive: true });
    fs.writeFileSync(
      path.join(dirBrand, 'shopify.app.toml'),
      `name = "Shopify Fast Cart"\nembedded = true\n`
    );

    // App 2: Exaggerated Superlative Language & Guarantees
    const dirExaggerated = path.join(testRoot, 'exaggerated-app');
    fs.mkdirSync(dirExaggerated, { recursive: true });
    fs.writeFileSync(
      path.join(dirExaggerated, 'shopify.app.toml'),
      `name = "Fast Cart for Shopify"\nembedded = true\n`
    );
    fs.writeFileSync(
      path.join(dirExaggerated, 'README.md'),
      `# Fast Cart\nThe best and #1 cart optimizer in the world! Guaranteed 100% sales increase. Boost sales by 50%!`
    );

    // App 3: Hardcoded Access Token and Direct Theme Overwrite
    const dirInsecure = path.join(testRoot, 'insecure-app');
    fs.mkdirSync(dirInsecure, { recursive: true });
    fs.writeFileSync(
      path.join(dirInsecure, 'shopify.app.toml'),
      `name = "Security Check App for Shopify"\nembedded = true\n`
    );
    fs.writeFileSync(
      path.join(dirInsecure, 'bad-script.ts'),
      `const token = "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";
       const endpoint = "/admin/api/2024-10/assets.json?asset[key]=layout/theme.liquid";`
    );

    // App 4: Clean Compliant App
    const dirClean = path.join(testRoot, 'clean-app');
    fs.mkdirSync(dirClean, { recursive: true });
    fs.writeFileSync(
      path.join(dirClean, 'shopify.app.toml'),
      `name = "Compliant Tool for Shopify"\nembedded = true\n`
    );
    fs.writeFileSync(
      path.join(dirClean, 'README.md'),
      `# Compliant Tool\nHelps merchants manage bulk orders with custom automations.`
    );
  });

  afterAll(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('detects Shopify Brand Misuse when app name starts with "Shopify"', () => {
    const dirBrand = path.join(testRoot, 'brand-misuse-app');
    const result = analyzer.analyze(dirBrand);

    expect(result.brandMisuseFound).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.id === 'APP_NAME_BRAND_MISUSE')).toBe(true);
  });

  it('detects exaggerated claims: "#1", "the best", and unsubstantiated guarantees', () => {
    const dirExaggerated = path.join(testRoot, 'exaggerated-app');
    const result = analyzer.analyze(dirExaggerated);

    expect(result.exaggeratedLanguageFound).toBe(true);
    expect(result.findings.some((f) => f.id === 'SUPERLATIVE_THE_BEST')).toBe(true);
    expect(result.findings.some((f) => f.id === 'UNSUBSTANTIATED_GUARANTEE')).toBe(true);
    expect(result.findings.some((f) => f.id === 'NUMERICAL_CONVERSION_CLAIM')).toBe(true);
  });

  it('detects hardcoded access tokens and prohibited direct theme.liquid overwrites', () => {
    const dirInsecure = path.join(testRoot, 'insecure-app');
    const result = analyzer.analyze(dirInsecure);

    expect(result.insecurePatternsFound).toBe(true);
    expect(result.findings.some((f) => f.id === 'HARDCODED_ADMIN_TOKEN')).toBe(true);
    expect(result.findings.some((f) => f.id === 'THEME_LIQUID_OVERWRITE')).toBe(true);
  });

  it('detects morphological -est inflections (e.g. fastest, easiest) while ignoring stoplist words (test, request)', () => {
    // App 5: Morphological inflection
    const dirMorph = path.join(testRoot, 'morph-app');
    fs.mkdirSync(dirMorph, { recursive: true });
    fs.writeFileSync(
      path.join(dirMorph, 'shopify.app.toml'),
      `name = "Speed Tool for Shopify"\nembedded = true\n`
    );
    fs.writeFileSync(
      path.join(dirMorph, 'README.md'),
      `# Speed Tool\nThe fastest checkout with the easiest setup for merchants. This test request works.`
    );

    const result = analyzer.analyze(dirMorph);
    expect(result.exaggeratedLanguageFound).toBe(true);
    expect(result.findings.some((f) => f.id === 'SUPERLATIVE_MORPHOLOGICAL_FASTEST')).toBe(true);
  });

  it('passes cleanly for compliant app names and factual documentation with technical terms', () => {
    const dirClean = path.join(testRoot, 'clean-app');
    // Ensure clean app contains stoplist words: test, request, forest, latest
    fs.writeFileSync(
      path.join(dirClean, 'README.md'),
      `# Compliant Tool\nHelps merchants handle every customer request and unit test with the latest API version.`
    );
    const result = analyzer.analyze(dirClean);

    expect(result.passed).toBe(true);
    expect(result.brandMisuseFound).toBe(false);
    expect(result.exaggeratedLanguageFound).toBe(false);
    expect(result.insecurePatternsFound).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  it('pluggable AI evaluator evaluates marketing copy and detects subtle claims when enabled', async () => {
    const dirClean = path.join(testRoot, 'clean-app');

    const resultWithAi = await analyzer.analyzeAsync(dirClean, {
      mockResponse: {
        hasViolations: true,
        violations: [
          {
            phrase: 'leaves competing solutions in the dust',
            reason: 'Implied competitive superiority claim prohibited by Section 4.3.3',
            severity: 'ERROR',
            remediation: 'Remove competitor comparison.',
          },
        ],
      },
    });

    expect(resultWithAi.passed).toBe(false);
    expect(resultWithAi.exaggeratedLanguageFound).toBe(true);
    expect(resultWithAi.findings.some((f) => f.id === 'AI_SUPERLATIVE_CLAIM_1')).toBe(true);
    expect(resultWithAi.findings.some((f) => f.message.includes('Section 4.3.3'))).toBe(true);
  });

  it('pluggable AI evaluator gracefully skips when unconfigured without failing the audit', async () => {
    const dirClean = path.join(testRoot, 'clean-app');
    const resultNoAi = await analyzer.analyzeAsync(dirClean, { enabled: false });

    expect(resultNoAi.passed).toBe(true);
    expect(resultNoAi.findings).toHaveLength(0);
  });

  it('never flags false positives inside comments (.toml, .ts, .md) or lockfiles', () => {
    const dirComments = path.join(testRoot, 'comments-and-lockfile-app');
    fs.mkdirSync(dirComments, { recursive: true });

    // .toml with commented-out brand misuse and superlatives
    fs.writeFileSync(
      path.join(dirComments, 'shopify.app.toml'),
      `# name = "Shopify Pro Cart"\n# #1 rated in the world\nname = "Pro Cart for Shopify"\nembedded = true\n`
    );

    // Lockfiles that must be completely ignored
    fs.writeFileSync(
      path.join(dirComments, 'package-lock.json'),
      `{ "name": "shopify-edge-guardian", "description": "the best and #1 fastest app" }`
    );
    fs.writeFileSync(
      path.join(dirComments, 'yarn.lock'),
      `# yarn lockfile v1\nshopify-bad-package:\n  version "1.0.0"\n`
    );

    // Source code with superlatives, secrets, and theme overwrites inside comments only
    fs.writeFileSync(
      path.join(dirComments, 'script.ts'),
      `// The best and #1 app in the world
       // const token = "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";
       /*
        * const endpoint = "/admin/api/2024-10/assets.json?asset[key]=layout/theme.liquid";
        * fastest checkout in existence
        */
       export const calculateDiscount = (total: number) => total * 0.9;
      `
    );

    // Markdown with HTML comment
    fs.writeFileSync(
      path.join(dirComments, 'README.md'),
      `# Pro Cart\n<!-- The #1 fastest cart in Shopify ecosystem -->\nClean description of app.`
    );

    const result = analyzer.analyze(dirComments);

    expect(result.passed).toBe(true);
    expect(result.brandMisuseFound).toBe(false);
    expect(result.exaggeratedLanguageFound).toBe(false);
    expect(result.insecurePatternsFound).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  it('ignores RELEASE_NOTES.md, CHANGELOG.md, and test directories by default', () => {
    const dirReleaseNotes = path.join(testRoot, 'release-notes-app');
    fs.mkdirSync(dirReleaseNotes, { recursive: true });

    fs.writeFileSync(
      path.join(dirReleaseNotes, 'shopify.app.toml'),
      `name = "Release Tool for Shopify"\nembedded = true\n`
    );

    // RELEASE_NOTES.md with phrases that would normally trigger rules if in marketing copy
    fs.writeFileSync(
      path.join(dirReleaseNotes, 'RELEASE_NOTES.md'),
      `# Release Notes v1.0.0\nAll 14 automated unit tests passed with 100% success:\nWe built the fastest parser.`
    );

    // CHANGELOG.md
    fs.writeFileSync(
      path.join(dirReleaseNotes, 'CHANGELOG.md'),
      `# Changelog\n- Added #1 optimization algorithm.`
    );

    // Clean README.md
    fs.writeFileSync(
      path.join(dirReleaseNotes, 'README.md'),
      `# Release Tool\nAutomates store synchronization.`
    );

    const result = analyzer.analyze(dirReleaseNotes);

    expect(result.passed).toBe(true);
    expect(result.exaggeratedLanguageFound).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  it('does not flag engineering statements like "tests passed with 100% success"', () => {
    const dirEngSuccess = path.join(testRoot, 'eng-success-app');
    fs.mkdirSync(dirEngSuccess, { recursive: true });

    fs.writeFileSync(
      path.join(dirEngSuccess, 'shopify.app.toml'),
      `name = "Test Tracker for Shopify"\nembedded = true\n`
    );

    fs.writeFileSync(
      path.join(dirEngSuccess, 'README.md'),
      `# Test Tracker\nAll 14 automated unit tests passed with 100% success: CI integration verified.`
    );

    const result = analyzer.analyze(dirEngSuccess);

    expect(result.passed).toBe(true);
    expect(result.exaggeratedLanguageFound).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  it('respects custom ignore patterns and rule overrides in EdgeGuardianConfig', () => {
    const dirConfigApp = path.join(testRoot, 'custom-config-app');
    fs.mkdirSync(dirConfigApp, { recursive: true });

    fs.writeFileSync(
      path.join(dirConfigApp, 'shopify.app.toml'),
      `name = "Custom App for Shopify"\nembedded = true\n`
    );

    fs.writeFileSync(
      path.join(dirConfigApp, 'marketing-draft.md'),
      `# Draft\nThis is the #1 tool in the world.`
    );

    fs.writeFileSync(
      path.join(dirConfigApp, 'README.md'),
      `# Custom App\nGuaranteed 100% results.`
    );

    // 1. Without ignore or rule overrides, both files trigger errors
    const unconfigured = analyzer.analyze(dirConfigApp);
    expect(unconfigured.passed).toBe(false);
    expect(unconfigured.findings.length).toBeGreaterThanOrEqual(2);

    // 2. With ignore on marketing-draft.md and rule override for UNSUBSTANTIATED_GUARANTEE
    const configured = analyzer.analyze(dirConfigApp, {
      ignore: ['marketing-draft.md'],
      rules: {
        UNSUBSTANTIATED_GUARANTEE: 'off',
      },
    });

    expect(configured.passed).toBe(true);
    expect(configured.findings).toHaveLength(0);
  });
});
