import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AiProjectThrottle } from '../src/utils/ai-throttle.js';
import { PluggableAiEvaluator } from '../src/analyzers/review-analyzer.js';

describe('AiProjectThrottle & Cloud AI Evaluation', () => {
  const testStorageDir = path.join(os.tmpdir(), `guardian-throttle-test-${Date.now()}`);

  beforeEach(() => {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('computes deterministic SHA-256 hash for text', () => {
    const throttle = new AiProjectThrottle({ storageDir: testStorageDir });
    const hash1 = throttle.computeTextHash('The best Shopify app in the world');
    const hash2 = throttle.computeTextHash('The best Shopify app in the world');
    const hashDifferent = throttle.computeTextHash('Different content');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDifferent);
    expect(hash1).toHaveLength(64);
  });

  it('stores and retrieves cached evaluation results within 24h TTL', () => {
    const throttle = new AiProjectThrottle({
      storageDir: testStorageDir,
      cacheTtlMs: 1000, // 1 second for test
    });

    const project = 'project-alpha';
    const text = 'Guaranteed 100% boost in conversion';
    const mockResult = { claims: [{ phrase: 'Guaranteed 100%', reason: 'Unsubstantiated' }] };

    expect(throttle.getCachedResult(text, project)).toBeNull();

    throttle.setCachedResult(text, mockResult, project);
    expect(throttle.getCachedResult(text, project)).toEqual(mockResult);

    // Verify storage file exists on disk
    const storagePath = throttle.getStoragePath(project);
    expect(fs.existsSync(storagePath)).toBe(true);
  });

  it('expires cache entries after TTL', async () => {
    const throttle = new AiProjectThrottle({
      storageDir: testStorageDir,
      cacheTtlMs: 50, // 50ms TTL
    });

    const project = 'project-beta';
    const text = 'Double your revenue today';
    throttle.setCachedResult(text, { claims: [] }, project);

    expect(throttle.getCachedResult(text, project)).not.toBeNull();

    await new Promise((r) => setTimeout(r, 60));
    expect(throttle.getCachedResult(text, project)).toBeNull();
  });

  it('enforces request rate limit and cooldown per project', () => {
    const throttle = new AiProjectThrottle({
      storageDir: testStorageDir,
      maxRequests: 3,
      windowMs: 60000,
      cooldownMs: 100,
    });

    const project = 'my-project';

    // 1st request allowed
    expect(throttle.canMakeRequest(project).allowed).toBe(true);
    throttle.recordRequest(project);

    // Immediately after: blocked by cooldown
    const cooldownCheck = throttle.canMakeRequest(project);
    expect(cooldownCheck.allowed).toBe(false);
    expect(cooldownCheck.reason).toMatch(/cooldown active/i);

    // Wait past cooldown
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 150);

    // 2nd request allowed
    expect(throttle.canMakeRequest(project).allowed).toBe(true);
    throttle.recordRequest(project);

    // 3rd request (simulate another 150ms)
    vi.spyOn(Date, 'now').mockReturnValue(now + 300);
    expect(throttle.canMakeRequest(project).allowed).toBe(true);
    throttle.recordRequest(project);

    // 4th request exceeds maxRequests (3)
    vi.spyOn(Date, 'now').mockReturnValue(now + 450);
    const limitCheck = throttle.canMakeRequest(project);
    expect(limitCheck.allowed).toBe(false);
    expect(limitCheck.reason).toMatch(/rate limit reached/i);

    // A different project key is not blocked by project A's limit
    expect(throttle.canMakeRequest('different-project').allowed).toBe(true);
  });

  it('handles corrupt cache files gracefully without throwing', () => {
    const throttle = new AiProjectThrottle({ storageDir: testStorageDir });
    const project = 'corrupted-project';
    const filePath = throttle.getStoragePath(project);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{{INVALID_JSON::CORRUPT', 'utf-8');

    // Should not throw, should return null cache and allow request
    expect(throttle.getCachedResult('test text', project)).toBeNull();
    expect(throttle.canMakeRequest(project).allowed).toBe(true);
  });

  it('PluggableAiEvaluator falls back gracefully on network or cloud failure', async () => {
    const evaluator = new PluggableAiEvaluator({ throttleOptions: { storageDir: testStorageDir } });
    // Point to non-existent local port to trigger network error
    const result = await evaluator.evaluateText('The #1 most powerful discount app in the world', {
      config: {
        cloudEndpoint: 'http://127.0.0.1:59999',
        timeoutMs: 300,
        projectKey: 'test-fallback-proj',
      },
    });

    expect(result.claims).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.provider).toBe('fallback/local-deterministic');
    expect(result.error).toMatch(/unavailable|fetch failed|ECONNREFUSED/i);
  });

  it('PluggableAiEvaluator handles HTTP 429 rate-limit responses gracefully', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    }) as any;

    try {
      const evaluator = new PluggableAiEvaluator({ throttleOptions: { storageDir: testStorageDir } });
      const result = await evaluator.evaluateText('Guaranteed risk free results', {
        config: {
          projectKey: 'rate-limited-proj',
        },
      });

      expect(result.claims).toEqual([]);
      expect(result.findings).toEqual([]);
      expect(result.provider).toBe('fallback/local-deterministic');
      expect(result.error).toContain('HTTP 429');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('PluggableAiEvaluator parses cloud response and caches subsequent calls', async () => {
    const originalFetch = globalThis.fetch;
    const mockClaims = [
      {
        phrase: 'the best discount engine',
        reason: 'Superlative claim prohibited by Section 4.3.3',
        severity: 'ERROR',
        remediation: 'Replace with factual description.',
      },
    ];

    let fetchCalls = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          claims: mockClaims,
          findings: [],
          provider: 'cloud/edge-guardian-ai',
        }),
      };
    }) as any;

    try {
      const evaluator = new PluggableAiEvaluator({ throttleOptions: { storageDir: testStorageDir } });
      const textToAudit = 'We offer the best discount engine for Shopify merchants';
      const config = { projectKey: 'cache-verification-proj' };

      // First call: makes network request
      const firstResult = await evaluator.evaluateText(textToAudit, { config });
      expect(fetchCalls).toBe(1);
      expect(firstResult.claims).toHaveLength(1);
      expect(firstResult.claims[0].phrase).toBe('the best discount engine');
      expect(firstResult.findings[0].matchedPhrase).toBe('the best discount engine');

      // Second call with same text: served from cache (0 new network calls)
      const secondResult = await evaluator.evaluateText(textToAudit, { config });
      expect(fetchCalls).toBe(1);
      expect(secondResult.provider).toBe('cached/cloud');
      expect(secondResult.claims).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sanitizeForAi redacts access tokens and client secrets before sending payloads', () => {
    const evaluator = new PluggableAiEvaluator();
    const fakeToken = ['shpat', '_', '1234567890abcdef1234567890abcdef'].join('');
    const sensitive = `App description with ${fakeToken} and client_secret = "super_secret_val"`;
    const sanitized = evaluator.sanitizeForAi(sensitive);

    expect(sanitized).not.toContain(fakeToken);
    expect(sanitized).not.toContain('super_secret_val');
    expect(sanitized).toContain('[REDACTED_TOKEN]');
    expect(sanitized).toContain('client_secret = "[REDACTED]"');
  });
});
