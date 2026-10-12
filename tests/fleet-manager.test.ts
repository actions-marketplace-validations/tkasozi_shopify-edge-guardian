import { describe, it, expect } from 'vitest';
import { FleetManager } from '../src/fleet/fleet-manager.js';

describe('FleetManager', () => {
  it('aggregates multi-app agency client status correctly', () => {
    const fleet = new FleetManager();

    fleet.registerApp({
      appId: 'app-1',
      name: 'Client Alpha Wholesale',
      handle: 'client-alpha',
      clientStore: 'alpha-gear.myshopify.com',
      apiVersion: '2026-04',
      bfsBadgeActive: true,
      activeDeprecations: 0,
      lastWasmSizeBytes: 140 * 1024,
      lastCheckedAt: new Date().toISOString(),
      status: 'HEALTHY',
    });

    fleet.registerApp({
      appId: 'app-2',
      name: 'Client Beta Checkout Guard',
      handle: 'client-beta',
      clientStore: 'beta-beauty.myshopify.com',
      apiVersion: '2024-10', // Approaching deprecation
      bfsBadgeActive: false,
      activeDeprecations: 2,
      lastWasmSizeBytes: 270 * 1024, // Exceeds budget
      lastCheckedAt: new Date().toISOString(),
      status: 'AT_RISK',
    });

    const summary = fleet.getFleetSummary();

    expect(summary.totalApps).toBe(2);
    expect(summary.healthyCount).toBe(1);
    expect(summary.atRiskCount).toBe(1);
    expect(summary.totalActiveDeprecations).toBe(2);
    expect(summary.averageWasmSizeKb).toBeGreaterThan(150);

    const report = fleet.generateAgencyMarkdownReport();
    expect(report).toContain('Client Alpha Wholesale');
    expect(report).toContain('Client Beta Checkout Guard');
    expect(report).toContain('🟢  Healthy');
    expect(report).toContain('🔴  AT RISK');
  });
});
