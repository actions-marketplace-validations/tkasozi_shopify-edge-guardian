import * as fs from 'fs';
import * as path from 'path';

export interface DetectedAppInfo {
  appId: string;
  name: string;
  handle?: string;
  repository?: string;
  source: 'shopify.app.toml' | 'env' | 'package.json' | 'directory';
}

export class AppDetector {
  /**
   * Deterministically resolves Shopify application identity.
   * Primary key: `client_id` in shopify.app.toml (immutable Shopify Partners ID).
   * Secondary fallback: GITHUB_REPOSITORY (org/repo) or package.json name.
   */
  public static detect(projectRoot: string = '.'): DetectedAppInfo {
    const resolvedRoot = path.resolve(projectRoot);
    const repoFromEnv = process.env.GITHUB_REPOSITORY?.trim() || undefined;

    // 1. Inspect shopify.app.toml or shopify.app.*.toml
    const tomlCandidates = ['shopify.app.toml'];
    try {
      if (fs.existsSync(resolvedRoot)) {
        const files = fs.readdirSync(resolvedRoot);
        for (const file of files) {
          if (file.startsWith('shopify.app.') && file.endsWith('.toml') && file !== 'shopify.app.toml') {
            tomlCandidates.push(file);
          }
        }
      }
    } catch {}

    for (const candidate of tomlCandidates) {
      const candidatePath = path.join(resolvedRoot, candidate);
      if (fs.existsSync(candidatePath)) {
        try {
          const content = fs.readFileSync(candidatePath, 'utf-8');
          const clientIdMatch = content.match(/client_id\s*=\s*["']([^"']+)["']/i);
          const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/i);
          const handleMatch = content.match(/handle\s*=\s*["']([^"']+)["']/i);

          const clientId = clientIdMatch ? clientIdMatch[1].trim() : undefined;
          const appName = nameMatch ? nameMatch[1].trim() : undefined;
          const handle = handleMatch ? handleMatch[1].trim() : undefined;

          if (clientId || appName) {
            return {
              appId: clientId || repoFromEnv || appName || path.basename(resolvedRoot),
              name: appName || clientId || path.basename(resolvedRoot),
              handle,
              repository: repoFromEnv,
              source: 'shopify.app.toml',
            };
          }
        } catch {}
      }
    }

    // 2. Check Environment Variables
    const envClientId = process.env.SHOPIFY_APP_CLIENT_ID?.trim();
    const envAppName = process.env.SHOPIFY_APP_NAME?.trim();
    if (envClientId || (repoFromEnv && envAppName)) {
      return {
        appId: envClientId || repoFromEnv || 'shopify-app',
        name: envAppName || envClientId || repoFromEnv || 'Shopify Application',
        repository: repoFromEnv,
        source: 'env',
      };
    }

    // 3. Inspect package.json
    const packageJsonPath = path.join(resolvedRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (pkg.name) {
          return {
            appId: repoFromEnv || pkg.name,
            name: pkg.name,
            repository: repoFromEnv,
            source: 'package.json',
          };
        }
      } catch {}
    }

    // 4. Fallback to folder name / repo
    const fallbackName = repoFromEnv || path.basename(resolvedRoot);
    return {
      appId: fallbackName,
      name: fallbackName,
      repository: repoFromEnv,
      source: 'directory',
    };
  }
}
