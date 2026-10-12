import { describe, it, expect, vi } from 'vitest';
import { BfsCanary } from '../src/analyzers/bfs-canary.js';

describe('BfsCanary', () => {
  const canary = new BfsCanary();

  it('evaluates healthy responsive endpoint as BFS compliant', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts: any) => {
      if (opts?.method === 'GET') {
        return Promise.resolve({
          status: 200,
          headers: new Headers({
            'content-security-policy': 'frame-ancestors https://admin.shopify.com https://test.myshopify.com;',
          }),
        });
      } else if (opts?.method === 'POST') {
        return Promise.resolve({
          status: 401,
          headers: new Headers(),
        });
      }
      return Promise.resolve({ status: 200, headers: new Headers() });
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await canary.evaluate({
      appUrl: 'https://compliant-app.example.com',
    });

    expect(result.passed).toBe(true);
    expect(result.isCompliantWithBfs).toBe(true);
    expect(result.webhookResponsive).toBe(true);
    expect(result.overallScore).toBeGreaterThanOrEqual(75);

    vi.unstubAllGlobals();
  });

  it('BLOCKER 1: flags HTTP 500 crashes as non-compliant and merges blocked', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts: any) => {
      if (opts?.method === 'GET') {
        return Promise.resolve({
          status: 500, // Broken internal server error
          headers: new Headers({
            'content-security-policy': 'frame-ancestors https://admin.shopify.com;',
          }),
        });
      }
      return Promise.resolve({ status: 200, headers: new Headers() });
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await canary.evaluate({
      appUrl: 'https://broken-app.example.com',
    });

    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.id === 'BFS_ADMIN_ROUTE_HTTP_ERROR')).toBe(true);

    vi.unstubAllGlobals();
  });

  it('BLOCKER 5: blocks SSRF targets and insecure non-HTTPS protocols', async () => {
    // 1. SSRF Cloud Metadata IP
    const ssrfResult = await canary.evaluate({
      appUrl: 'https://169.254.169.254/latest/meta-data',
    });
    expect(ssrfResult.passed).toBe(false);
    expect(ssrfResult.findings.some((f) => f.id === 'BFS_SSRF_PROHIBITED')).toBe(true);

    // 2. Insecure HTTP protocol
    const httpResult = await canary.evaluate({
      appUrl: 'http://my-unencrypted-app.example.com',
    });
    expect(httpResult.passed).toBe(false);
    expect(httpResult.findings.some((f) => f.id === 'BFS_HTTPS_REQUIRED')).toBe(true);
  });
});
