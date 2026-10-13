import * as fs from 'fs';
import * as path from 'path';
import { EdgeGuardianConfig, Finding, ReviewRequirementsResult } from '../types/index.js';
import { APP_STORE_REVIEW_RULES, NON_SUPERLATIVE_EST_WORDS } from '../rules/shopify-rules.js';
import {
  DEFAULT_REVIEW_IGNORED_DIRS,
  DEFAULT_REVIEW_IGNORED_FILES,
  isIgnoredFile,
  maskComments,
  matchesIgnore,
} from '../utils/sanitizer.js';
import { ConfigLoader } from '../config/config-loader.js';

export class ReviewAnalyzer {
  /**
   * Scans configuration files, listing copy, and source code against official
   * Shopify App Store Review requirements that trigger immediate rejection:
   * 1. Exaggerated / Superlative Language & Unsubstantiated Guarantees (Section 4.3.3 & 4.3.4)
   * 2. Shopify Brand Misuse in App Name (Section 4.1.2)
   * 3. Direct Theme Liquid Overwrite (Section 5.1.1)
   * 4. Hardcoded Access Tokens & API Secrets (Section 3.1)
   * 5. External Checkout & Billing Bypasses (Section 1.1.2 & 1.2.1)
   */
  public analyze(projectRoot: string, config?: EdgeGuardianConfig): ReviewRequirementsResult {
    let findings: Finding[] = [];
    let exaggeratedLanguageFound = false;
    let brandMisuseFound = false;
    let insecurePatternsFound = false;

    // 1. Audit App Name in shopify.app.toml for Brand Misuse
    const configPath = path.join(projectRoot, 'shopify.app.toml');
    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const cleanConfig = maskComments(configContent, configPath);
        const nameMatch = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(cleanConfig);

        if (nameMatch) {
          const appName = nameMatch[1].trim();
          const normalized = appName.toLowerCase();

          // Reject apps leading with "Shopify" or containing "Shopify" not formatted as "for Shopify"
          const startsWithShopify = /^shopify\b/i.test(normalized);
          const hasShopifyWithoutFor = /\bshopify\b/i.test(normalized) && !/\bfor\s+shopify$/i.test(normalized);

          if (startsWithShopify || hasShopifyWithoutFor) {
            brandMisuseFound = true;
            const configLines = configContent.split('\n');
            const cleanLines = cleanConfig.split('\n');
            const nameLineIndex = cleanLines.findIndex((l) => /^\s*name\s*=/i.test(l));
            const lineNumber = nameLineIndex !== -1 ? nameLineIndex + 1 : 1;
            const lineContent = nameLineIndex !== -1 ? configLines[nameLineIndex].trimEnd() : undefined;

            findings.push({
              id: 'APP_NAME_BRAND_MISUSE',
              category: 'APP_STORE_REVIEW',
              severity: 'ERROR',
              title: `Shopify Trademark Misuse in App Name: "${appName}"`,
              message: `App name "${appName}" violates Shopify Brand Guidelines (Section 4.1.2). Apps cannot lead with "Shopify" or include Shopify trademarks unless formatted with the "for Shopify" suffix (e.g. "Edge Orders for Shopify").`,
              file: configPath,
              line: lineNumber,
              matchedPhrase: appName,
              lineContent,
              remediation: `Rename app to "${appName.replace(/^shopify\s+/i, '')} for Shopify" in shopify.app.toml and Partner Dashboard.`,
            });
          }
        }
      } catch {
        // Handled elsewhere
      }
    }

    // 2. Scan Text, Listing, and Source Files for Review Blockers
    const filesToScan = this.collectFilesToScan(projectRoot, [], config?.ignore, projectRoot);

    for (const file of filesToScan) {
      let content = '';
      try {
        content = fs.readFileSync(file, 'utf-8');
      } catch {
        continue;
      }

      const relPath = path.relative(projectRoot, file);
      const ext = path.extname(file).toLowerCase();
      const isMarketingOrConfig = ['.toml', '.md', '.txt', '.json', '.html'].includes(ext);

      // Mask comments in searchable content to prevent false positives in comments
      const searchableContent = maskComments(content, file);

      // (A) Rule-based matching
      for (const rule of APP_STORE_REVIEW_RULES) {
        // Exaggerated language and brand misuse are strictly evaluated on marketing/config files
        // to prevent false positives on code identifiers (e.g. findBestOption)
        if (rule.category === 'EXAGGERATED_LANGUAGE' && !isMarketingOrConfig) {
          continue;
        }

        // Strip global flag and create isolated regex
        const flags = rule.pattern.flags.replace('g', '') + 'g';
        const regex = new RegExp(rule.pattern.source, flags);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(searchableContent)) !== null) {
          const prefix = searchableContent.slice(0, match.index);
          const lineNumber = prefix.split('\n').length;
          const lines = content.split('\n');
          const lineContent = lines[lineNumber - 1]?.trimEnd() || '';

          if (rule.category === 'EXAGGERATED_LANGUAGE') {
            exaggeratedLanguageFound = true;
          } else if (rule.category === 'BRAND_MISUSE') {
            brandMisuseFound = true;
          } else {
            insecurePatternsFound = true;
          }

          findings.push({
            id: rule.id,
            category: 'APP_STORE_REVIEW',
            severity: rule.severity,
            title: rule.title,
            message: `${rule.message} (Matched: "${match[0]}")`,
            file: relPath,
            line: lineNumber,
            matchedPhrase: match[0],
            lineContent,
            remediation: rule.remediation,
          });

          // Only report first instance per rule per file to keep output actionable
          break;
        }
      }

      // (B) Morphological NLP scan for superlative -est inflections in marketing files
      if (isMarketingOrConfig) {
        const estMatches = searchableContent.match(/\b([a-zA-Z]{4,}est)\b/g);
        if (estMatches) {
          for (const rawWord of estMatches) {
            const word = rawWord.toLowerCase();
            if (!NON_SUPERLATIVE_EST_WORDS.has(word)) {
              exaggeratedLanguageFound = true;
              const idx = searchableContent.indexOf(rawWord);
              const lineNumber = idx !== -1 ? searchableContent.slice(0, idx).split('\n').length : 1;
              const lines = content.split('\n');
              const lineContent = lines[lineNumber - 1]?.trimEnd() || '';

              findings.push({
                id: `SUPERLATIVE_MORPHOLOGICAL_${word.toUpperCase()}`,
                category: 'APP_STORE_REVIEW',
                severity: 'ERROR',
                title: `Morphological Superlative Detected: "${rawWord}"`,
                message: `The superlative claim "${rawWord}" in listing copy violates Shopify App Store guidelines (Section 4.3.3) prohibiting non-verifiable comparative claims.`,
                file: relPath,
                line: lineNumber,
                matchedPhrase: rawWord,
                lineContent,
                remediation: `Replace "${rawWord}" with an objective description of your app speed or capability.`,
              });
              break;
            }
          }
        }
      }
    }

    findings = ConfigLoader.applyRuleOverrides(findings, config?.rules);
    exaggeratedLanguageFound = findings.some(
      (f) => f.category === 'APP_STORE_REVIEW' && (f.id.startsWith('SUPERLATIVE_') || f.id.startsWith('UNSUBSTANTIATED_') || f.id === 'NUMERICAL_CONVERSION_CLAIM')
    );
    brandMisuseFound = findings.some((f) => f.id === 'APP_NAME_BRAND_MISUSE' || f.id.startsWith('BRAND_'));
    insecurePatternsFound = findings.some((f) =>
      ['THEME_LIQUID_OVERWRITE', 'HARDCODED_ADMIN_TOKEN', 'HARDCODED_CUSTOM_TOKEN', 'CHECKOUT_BYPASS_DETECTED'].includes(f.id)
    );

    const passed = !findings.some((f) => f.severity === 'ERROR');

    return {
      passed,
      exaggeratedLanguageFound,
      brandMisuseFound,
      insecurePatternsFound,
      findings,
    };
  }

  public aiEvaluator = new PluggableAiEvaluator();

  /**
   * Performs review requirements audit and additionally invokes the pluggable
   * AI evaluator on listing documentation/markdown files if enabled or configured.
   */
  public async analyzeAsync(
    projectRoot: string,
    optionsOrAiConfig?: AiEvaluatorConfig | { aiConfig?: AiEvaluatorConfig; config?: EdgeGuardianConfig }
  ): Promise<ReviewRequirementsResult> {
    const aiConfig =
      optionsOrAiConfig && ('apiKey' in optionsOrAiConfig || 'mockResponse' in optionsOrAiConfig || 'enabled' in optionsOrAiConfig)
        ? (optionsOrAiConfig as AiEvaluatorConfig)
        : (optionsOrAiConfig as { aiConfig?: AiEvaluatorConfig; config?: EdgeGuardianConfig })?.aiConfig;

    const config =
      optionsOrAiConfig && 'config' in optionsOrAiConfig
        ? (optionsOrAiConfig as { aiConfig?: AiEvaluatorConfig; config?: EdgeGuardianConfig }).config
        : undefined;

    const result = this.analyze(projectRoot, config);
    if (!this.aiEvaluator.isAvailable(aiConfig)) {
      return result;
    }

    const marketingFiles = this.collectFilesToScan(projectRoot, [], config?.ignore, projectRoot).filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ['.md', '.txt', '.json'].includes(ext);
    });

    for (const file of marketingFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const aiResult = await this.aiEvaluator.evaluateText(content, {
          file: path.relative(projectRoot, file),
          config: aiConfig,
        });

        if (aiResult.findings.length > 0) {
          result.exaggeratedLanguageFound = true;
          result.findings.push(...aiResult.findings);
        }
      } catch {
        // Skip unreadable files
      }
    }

    result.findings = ConfigLoader.applyRuleOverrides(result.findings, config?.rules);
    result.passed = !result.findings.some((f) => f.severity === 'ERROR');
    return result;
  }

  private collectFilesToScan(
    dir: string,
    fileList: string[] = [],
    customIgnores?: string[],
    projectRoot: string = dir
  ): string[] {
    if (!fs.existsSync(dir)) return fileList;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return fileList;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const lowerName = entry.name.toLowerCase();

      if (entry.isDirectory()) {
        if (
          DEFAULT_REVIEW_IGNORED_DIRS.has(lowerName) ||
          matchesIgnore(fullPath, projectRoot, customIgnores)
        ) {
          continue;
        }
        this.collectFilesToScan(fullPath, fileList, customIgnores, projectRoot);
      } else if (entry.isFile()) {
        if (
          isIgnoredFile(fullPath, customIgnores, projectRoot) ||
          DEFAULT_REVIEW_IGNORED_FILES.has(lowerName) ||
          matchesIgnore(fullPath, projectRoot, customIgnores)
        ) {
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        // Check configs, markdown, listings, and code
        if (['.toml', '.md', '.txt', '.json', '.ts', '.tsx', '.js', '.jsx', '.liquid'].includes(ext)) {
          fileList.push(fullPath);
        }
      }
    }

    return fileList;
  }
}

export interface AiEvaluatorConfig {
  apiKey?: string;
  endpoint?: string;
  cloudEndpoint?: string;
  licenseKey?: string;
  model?: string;
  timeoutMs?: number;
  enabled?: boolean;
  mockResponse?: {
    hasViolations: boolean;
    violations: Array<{
      phrase: string;
      reason: string;
      severity?: 'ERROR' | 'WARNING';
      remediation?: string;
    }>;
  };
}

export class PluggableAiEvaluator {
  private defaultCloudEndpoint = 'https://billing.endptsec.com';
  private defaultEndpoint = 'https://api.openai.com/v1/chat/completions';
  private defaultModel = 'gpt-4o-mini';
  private defaultTimeoutMs = 6000;

  /**
   * Checks if an AI provider or Cloud AI Fulfillment via license key is available.
   */
  public isAvailable(config?: AiEvaluatorConfig): boolean {
    if (config?.mockResponse) return true;
    if (config?.enabled === false) return false;
    const licenseKey = config?.licenseKey || process.env.GUARDIAN_LICENSE_KEY || process.env.EDGE_GUARDIAN_KEY;
    if (licenseKey && licenseKey.trim().length > 0) return true;
    const key = config?.apiKey || process.env.GUARDIAN_AI_KEY || process.env.OPENAI_API_KEY;
    return Boolean(key && key.trim().length > 0);
  }

  /**
   * Evaluates text content using Cloud AI fulfillment or local LLM against Shopify App Store Guidelines.
   */
  public async evaluateText(
    text: string,
    options: { file?: string; config?: AiEvaluatorConfig } = {}
  ): Promise<{
    claims: Array<{ phrase: string; reason: string; severity: 'ERROR' | 'WARNING'; remediation: string }>;
    findings: Finding[];
    error?: string;
    provider?: string;
  }> {
    const config = options.config;
    const file = options.file;

    // Deterministic mock evaluation support for tests / offline CI
    if (config?.mockResponse) {
      const claims = config.mockResponse.violations.map((v) => ({
        phrase: v.phrase,
        reason: v.reason,
        severity: (v.severity || 'ERROR') as 'ERROR' | 'WARNING',
        remediation: v.remediation || 'Replace with factual, verifiable feature description.',
      }));

      const lines = text.split('\n');
      const findings: Finding[] = claims.map((c, idx) => {
        let lineNum: number | undefined;
        let lineContent: string | undefined;
        const phraseIdx = text.toLowerCase().indexOf(c.phrase.toLowerCase());
        if (phraseIdx !== -1) {
          lineNum = text.slice(0, phraseIdx).split('\n').length;
          lineContent = lines[lineNum - 1]?.trimEnd();
        }

        return {
          id: `AI_SUPERLATIVE_CLAIM_${idx + 1}`,
          category: 'APP_STORE_REVIEW',
          severity: c.severity,
          title: `AI Detected Superlative / Exaggerated Claim: "${c.phrase}"`,
          message: `${c.reason} (Shopify Guidelines Section 4.3.3 / 4.3.4)`,
          file,
          line: lineNum,
          matchedPhrase: c.phrase,
          lineContent,
          remediation: c.remediation,
        };
      });

      return { claims, findings };
    }

    if (!this.isAvailable(config)) {
      return { claims: [], findings: [] };
    }

    const licenseKey = config?.licenseKey || process.env.GUARDIAN_LICENSE_KEY || process.env.EDGE_GUARDIAN_KEY;
    const cloudBase = config?.cloudEndpoint || process.env.GUARDIAN_API_ENDPOINT || this.defaultCloudEndpoint;
    const timeoutMs = config?.timeoutMs || this.defaultTimeoutMs;

    // 1. Cloud AI Fulfillment via Active License Key (Zero merchant setup required)
    if (licenseKey && licenseKey.trim().length > 0) {
      try {
        const response = await fetch(`${cloudBase}/v1/ai/review`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Shopify-Edge-Guardian-CLI',
          },
          body: JSON.stringify({
            licenseKey: licenseKey.trim(),
            text,
            filePath: file,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) {
          const data = (await response.json()) as any;
          return {
            claims: data.claims || [],
            findings: data.findings || [],
            provider: data.provider || 'cloud/edge-guardian-ai',
          };
        }
      } catch {
        // Fall through to local API key if configured
      }
    }

    // 2. Direct LLM fallback if user provides personal API key
    const apiKey = config?.apiKey || process.env.GUARDIAN_AI_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { claims: [], findings: [] };
    }

    const endpoint = config?.endpoint || process.env.GUARDIAN_AI_ENDPOINT || this.defaultEndpoint;
    const model = config?.model || process.env.GUARDIAN_AI_MODEL || this.defaultModel;

    const systemPrompt = `You are a Senior Shopify App Store Review Auditor enforcing Section 4.3.3 (Superlative & Exaggerated Claims) and Section 4.3.4 (Unsubstantiated Guarantees & Exclusivity).
Analyze the provided app listing copy, markdown description, or text.
Detect:
1. Superlative marketing claims ("#1", "the best", "world's leading", "most powerful", "unmatched").
2. Unverifiable statistical claims ("boost sales by 50%", "double your revenue").
3. Implied superiority or exclusivity claims ("leaves competitors behind", "the only app that...").
4. Unsubstantiated guarantees ("100% risk free", "guaranteed results").

Respond ONLY with valid JSON matching:
{
  "hasViolations": boolean,
  "violations": [
    {
      "phrase": "exact quote from text",
      "reason": "explanation citing Section 4.3.3 or 4.3.4",
      "severity": "ERROR" or "WARNING",
      "remediation": "suggested factual rewrite"
    }
  ]
}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Audit this Shopify app listing text:\n\n"""\n${text.slice(0, 4000)}\n"""` },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        return {
          claims: [],
          findings: [],
          error: `AI provider HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as any;
      const rawContent = data?.choices?.[0]?.message?.content || '{}';
      const cleaned = rawContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(cleaned);

      const claims = (parsed.violations || []).map((v: any) => ({
        phrase: v.phrase,
        reason: v.reason,
        severity: (v.severity || 'ERROR') as 'ERROR' | 'WARNING',
        remediation: v.remediation || 'Replace with factual, verifiable feature description.',
      }));

      const lines = text.split('\n');
      const findings: Finding[] = claims.map((c: any, idx: number) => {
        let lineNum: number | undefined;
        let lineContent: string | undefined;
        const phraseIdx = text.toLowerCase().indexOf(c.phrase.toLowerCase());
        if (phraseIdx !== -1) {
          lineNum = text.slice(0, phraseIdx).split('\n').length;
          lineContent = lines[lineNum - 1]?.trimEnd();
        }

        return {
          id: `AI_SUPERLATIVE_CLAIM_${idx + 1}`,
          category: 'APP_STORE_REVIEW',
          severity: c.severity,
          title: `AI Detected Superlative / Exaggerated Claim: "${c.phrase}"`,
          message: `${c.reason} (Shopify Guidelines Section 4.3.3 / 4.3.4)`,
          file,
          line: lineNum,
          matchedPhrase: c.phrase,
          lineContent,
          remediation: c.remediation,
        };
      });

      return { claims, findings };
    } catch (err: any) {
      return {
        claims: [],
        findings: [],
        error: `AI evaluation call failed: ${err.message}`,
      };
    }
  }
}
