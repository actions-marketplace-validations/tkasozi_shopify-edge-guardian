import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PrivilegeAnalyzer } from '../src/analyzers/privilege-analyzer.js';

describe('PrivilegeAnalyzer (Principle of Least Privilege)', () => {
  const analyzer = new PrivilegeAnalyzer();
  const testRoot = path.resolve(__dirname, '../fixtures/temp-privilege-test');

  beforeAll(() => {
    if (!fs.existsSync(testRoot)) {
      fs.mkdirSync(testRoot, { recursive: true });
    }

    // Project A: Active matching discount queries and mutations
    const dirA = path.join(testRoot, 'active-app');
    fs.mkdirSync(path.join(dirA, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirA, 'src', 'discounts.ts'),
      `export const createDiscount = 'mutation { discountAutomaticAppCreate(...) { id } }';
       export const getDiscount = 'query { discountNode(...) { id } }';`
    );

    // Project B: Overprivileged Write (Requests write_products, but only reads products)
    const dirB = path.join(testRoot, 'read-only-app');
    fs.mkdirSync(path.join(dirB, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirB, 'src', 'catalog.ts'),
      `export const fetchProducts = 'query { products(first: 10) { edges { node { id title } } } }';`
    );

    // Project C: Completely Unused Scope (Requests write_orders, but no order operations exist)
    const dirC = path.join(testRoot, 'unused-app');
    fs.mkdirSync(path.join(dirC, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(dirC, 'src', 'index.ts'),
      `console.log("App running cleanly without relevant business logic");`
    );
  });

  afterAll(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('passes cleanly when requested scopes match active operations in codebase', () => {
    const dirA = path.join(testRoot, 'active-app');
    const result = analyzer.analyze(dirA, ['read_discounts', 'write_discounts']);

    expect(result.passed).toBe(true);
    expect(result.unusedScopes).toHaveLength(0);
    expect(result.overprivilegedWrites).toHaveLength(0);
    expect(result.usedScopes).toContain('read_discounts');
    expect(result.usedScopes).toContain('write_discounts');
  });

  it('flags unused scopes when declared scopes have zero codebase usage', () => {
    const dirC = path.join(testRoot, 'unused-app');
    const result = analyzer.analyze(dirC, ['write_orders', 'read_customers']);

    expect(result.unusedScopes).toContain('write_orders');
    expect(result.unusedScopes).toContain('read_customers');
    expect(result.findings.some((f) => f.id === 'UNUSED_PRIVILEGE_WRITE_ORDERS')).toBe(true);
    expect(result.findings.some((f) => f.id === 'UNUSED_PRIVILEGE_READ_CUSTOMERS')).toBe(true);
  });

  it('assigns ERROR severity to high-risk unused scopes like write_orders or read_all_orders', () => {
    const dirC = path.join(testRoot, 'unused-app');
    const result = analyzer.analyze(dirC, ['write_orders']);

    const orderFinding = result.findings.find((f) => f.id === 'UNUSED_PRIVILEGE_WRITE_ORDERS');
    expect(orderFinding).toBeDefined();
    expect(orderFinding?.severity).toBe('ERROR');
    expect(result.passed).toBe(false);
  });

  it('flags overprivileged write scopes when only read queries are present in the codebase', () => {
    const dirB = path.join(testRoot, 'read-only-app');
    const result = analyzer.analyze(dirB, ['write_products']);

    expect(result.overprivilegedWrites).toContain('write_products');
    const writeFinding = result.findings.find((f) => f.id === 'OVERPRIVILEGED_WRITE_WRITE_PRODUCTS');
    expect(writeFinding).toBeDefined();
    expect(writeFinding?.severity).toBe('WARNING');
    expect(writeFinding?.remediation).toContain('read_products');
  });

  it('handles empty scopes gracefully', () => {
    const dirA = path.join(testRoot, 'active-app');
    const result = analyzer.analyze(dirA, []);

    expect(result.passed).toBe(true);
    expect(result.unusedScopes).toHaveLength(0);
    expect(result.findings).toHaveLength(0);
  });
});
