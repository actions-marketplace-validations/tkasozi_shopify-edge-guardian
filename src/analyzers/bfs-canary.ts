import { BfsCanaryResult, Finding } from '../types/index.js';
import { SHOPIFY_PERFORMANCE_LIMITS } from '../rules/shopify-rules.js';

export interface BfsTargetConfig {
  appUrl: string;
  adminPath?: string;
  webhooksPath?: string;
  expectedAppBridgeVersion?: string;
}

export class BfsCanary {
  /**
   * Evaluates an app's live staging or production deployment against
   * the rigorous "Built for Shopify" (BFS) quality requirements.
   */
  public async evaluate(config: BfsTargetConfig): Promise<BfsCanaryResult> {
    const findings: Finding[] = [];
    let score = 100;
    let adminLatencyMs = 0;
    let webhookResponsive = false;

    // 1. SSRF & Scheme Validation
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(config.appUrl);
    } catch {
      findings.push({
        id: 'BFS_INVALID_URL',
        category: 'BFS_CANARY',
        severity: 'ERROR',
        title: 'Invalid Application URL',
        message: `The provided appUrl '${config.appUrl}' is not a valid URL.`,
        remediation: 'Provide a valid HTTPS URL (e.g. https://my-app.example.com).',
      });
      return {
        passed: false,
        overallScore: 0,
        adminLatencyMs: 0,
        latencyThresholdMs: SHOPIFY_PERFORMANCE_LIMITS.BFS_ADMIN_LATENCY_MAX_MS,
        webhookResponsive: false,
        appBridgeVersion: config.expectedAppBridgeVersion || 'App Bridge 3.x',
        isCompliantWithBfs: false,
        findings,
      };
    }

    if (parsedUrl.protocol !== 'https:') {
      findings.push({
        id: 'BFS_HTTPS_REQUIRED',
        category: 'BFS_CANARY',
        severity: 'ERROR',
        title: 'HTTPS Scheme Required for Built for Shopify',
        message: `App URL uses insecure protocol '${parsedUrl.protocol}'. Shopify strictly requires HTTPS.`,
        remediation: 'Configure a valid TLS certificate and serve over HTTPS.',
      });
      score -= 50;
    }

    // SSRF Filter: Block internal cloud metadata and loopback addresses
    const hostname = parsedUrl.hostname.toLowerCase();
    const isInternalOrMetadata =
      hostname === '169.254.169.254' ||
      hostname === 'metadata.google.internal' ||
      hostname === '127.0.0.1' ||
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local');

    if (isInternalOrMetadata) {
      findings.push({
        id: 'BFS_SSRF_PROHIBITED',
        category: 'BFS_CANARY',
        severity: 'ERROR',
        title: 'Target Address Blocked (Internal/Metadata Network)',
        message: `Probing internal or link-local address '${hostname}' is prohibited to prevent SSRF vulnerabilities.`,
        remediation: 'Specify a public HTTPS staging or production deployment URL.',
      });
      return {
        passed: false,
        overallScore: 0,
        adminLatencyMs: 0,
        latencyThresholdMs: SHOPIFY_PERFORMANCE_LIMITS.BFS_ADMIN_LATENCY_MAX_MS,
        webhookResponsive: false,
        appBridgeVersion: config.expectedAppBridgeVersion || 'App Bridge 3.x',
        isCompliantWithBfs: false,
        findings,
      };
    }

    // Safe URL concatenation with normalized slashes
    const appUrl = config.appUrl.replace(/\/+$/, '');
    const adminPath = (config.adminPath || '/app').startsWith('/') ? (config.adminPath || '/app') : `/${config.adminPath}`;
    const webhooksPath = (config.webhooksPath || '/webhooks').startsWith('/') ? (config.webhooksPath || '/webhooks') : `/${config.webhooksPath}`;
    const adminUrl = `${appUrl}${adminPath}`;
    const webhooksUrl = `${appUrl}${webhooksPath}`;

    // 2. Audit Admin Route: Status Code & Latency (< 500ms BFS threshold)
    try {
      const startTime = Date.now();
      const res = await fetch(adminUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'ShopifyEdgeGuardian-Canary/1.0' },
        redirect: 'manual', // Detect App Bridge OAuth redirect
        signal: AbortSignal.timeout(5000), // 5s timeout prevents CI hang
      });

      adminLatencyMs = Date.now() - startTime;

      // Status Code Validation: Must be 200 OK or 302/307 OAuth redirect
      if (res.status >= 400) {
        score -= 50;
        findings.push({
          id: 'BFS_ADMIN_ROUTE_HTTP_ERROR',
          category: 'BFS_CANARY',
          severity: 'ERROR',
          title: `Admin Embedded Route Returned HTTP ${res.status}`,
          message: `The embedded route at ${adminUrl} returned HTTP status ${res.status}. Expected 200 OK or 302 OAuth redirect.`,
          remediation: 'Verify server logs and ensure your app handles session authentication without throwing 500 errors.',
        });
      } else if (![200, 302, 307].includes(res.status)) {
        score -= 20;
        findings.push({
          id: 'BFS_ADMIN_ROUTE_UNEXPECTED_STATUS',
          category: 'BFS_CANARY',
          severity: 'WARNING',
          title: `Admin Embedded Route Returned HTTP ${res.status}`,
          message: `The embedded route returned HTTP ${res.status}, which is non-standard for Shopify App Bridge routes.`,
        });
      }

      if (adminLatencyMs > SHOPIFY_PERFORMANCE_LIMITS.BFS_ADMIN_LATENCY_MAX_MS) {
        score -= 25;
        findings.push({
          id: 'BFS_LATENCY_SLOW',
          category: 'BFS_CANARY',
          severity: 'WARNING',
          title: `Admin Response Latency Exceeds BFS Threshold (${adminLatencyMs}ms > 500ms)`,
          message: `Shopify's 'Built for Shopify' badge requires sub-500ms initial response times. Current: ${adminLatencyMs}ms.`,
          remediation: 'Implement edge caching, SSR streaming, or migrate database reads to App Metafields.',
        });
      }

      // Check if security headers are present
      const frameAncestors = res.headers.get('content-security-policy') || '';
      if (!frameAncestors.includes('admin.shopify.com')) {
        score -= 15;
        findings.push({
          id: 'BFS_CSP_FRAME_ANCESTORS_MISSING',
          category: 'BFS_CANARY',
          severity: 'WARNING',
          title: 'Missing admin.shopify.com in Content-Security-Policy',
          message: 'Shopify embedded apps require frame-ancestors to permit embedding in the modern Shopify Admin.',
          remediation: "Set Content-Security-Policy: frame-ancestors https://admin.shopify.com https://[shop].myshopify.com;",
        });
      }
    } catch (err: any) {
      score -= 50;
      findings.push({
        id: 'BFS_ENDPOINT_UNREACHABLE',
        category: 'BFS_CANARY',
        severity: 'ERROR',
        title: 'App Embedded Route Failed Health Probe',
        message: `Failed to probe ${adminUrl}: ${err.message}`,
        remediation: 'Ensure the application server is deployed, responsive within 5s, and accessible via public HTTPS.',
      });
    }

    // 3. Webhook Responsiveness Probe (POST probe to webhooks endpoint)
    try {
      const webhookRes = await fetch(webhooksUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'test/canary',
          'X-Shopify-Hmac-Sha256': 'mock_probe_hmac',
        },
        body: JSON.stringify({ test: true }),
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      // A properly configured Shopify webhook endpoint should respond with 200, 401, or 403 (HMAC rejection)
      // but NOT 404 Not Found or 500 Server Error
      if ([200, 400, 401, 403].includes(webhookRes.status)) {
        webhookResponsive = true;
      } else {
        score -= 20;
        findings.push({
          id: 'BFS_WEBHOOK_STATUS_INVALID',
          category: 'BFS_CANARY',
          severity: 'ERROR',
          title: `Webhook Endpoint Returned HTTP ${webhookRes.status}`,
          message: `The webhooks route at ${webhooksUrl} returned ${webhookRes.status}. Expected 200 or 401 unauthorized.`,
          remediation: 'Verify your webhook route handler catches requests without throwing uncaught 500 errors.',
        });
      }
    } catch (err: any) {
      score -= 30;
      findings.push({
        id: 'BFS_WEBHOOK_ROUTE_UNREACHABLE',
        category: 'BFS_CANARY',
        severity: 'ERROR',
        title: 'Webhook Endpoint Unreachable',
        message: `Failed to reach webhook handler at ${webhooksUrl}: ${err.message}`,
        remediation: 'Ensure webhook routes are registered, responsive within 5s, and operational.',
      });
    }

    const isCompliant = score >= 75 && !findings.some((f) => f.severity === 'ERROR');

    return {
      passed: isCompliant,
      overallScore: Math.max(0, score),
      adminLatencyMs,
      latencyThresholdMs: SHOPIFY_PERFORMANCE_LIMITS.BFS_ADMIN_LATENCY_MAX_MS,
      webhookResponsive,
      appBridgeVersion: config.expectedAppBridgeVersion || 'App Bridge 3.x / App Bridge Next',
      isCompliantWithBfs: isCompliant,
      findings,
    };
  }
}
