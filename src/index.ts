import { ComplianceAnalyzer } from './analyzers/compliance-analyzer.js';
import { DeprecationAnalyzer } from './analyzers/deprecation-analyzer.js';
import { WasmProfiler } from './analyzers/wasm-profiler.js';
import { BfsCanary } from './analyzers/bfs-canary.js';
import { BfsAnalyzer } from './analyzers/bfs-analyzer.js';
import { PrivilegeAnalyzer } from './analyzers/privilege-analyzer.js';
import { ReviewAnalyzer, AiEvaluatorConfig } from './analyzers/review-analyzer.js';
import { FleetManager } from './fleet/fleet-manager.js';
import { MarkdownReporter } from './reporter/markdown-reporter.js';
import { EdgeGuardianConfig, GuardianReport } from './types/index.js';
import { ConfigLoader } from './config/config-loader.js';
import { AppDetector } from './utils/app-detector.js';

export * from './types/index.js';
export * from './rules/shopify-rules.js';
export { ComplianceAnalyzer } from './analyzers/compliance-analyzer.js';
export { DeprecationAnalyzer } from './analyzers/deprecation-analyzer.js';
export { WasmProfiler } from './analyzers/wasm-profiler.js';
export { BfsCanary } from './analyzers/bfs-canary.js';
export { BfsAnalyzer } from './analyzers/bfs-analyzer.js';
export { PrivilegeAnalyzer } from './analyzers/privilege-analyzer.js';
export { ReviewAnalyzer, PluggableAiEvaluator, AiEvaluatorConfig } from './analyzers/review-analyzer.js';
export { FleetManager } from './fleet/fleet-manager.js';
export { MarkdownReporter } from './reporter/markdown-reporter.js';
export { ConfigLoader, CONFIG_FILE_CANDIDATES } from './config/config-loader.js';
export { AppDetector, DetectedAppInfo } from './utils/app-detector.js';
export { SlackAlerter, SlackAlerterOptions } from './notifications/slack-alerter.js';
export { AiProjectThrottle, ThrottleOptions } from './utils/ai-throttle.js';

export class ShopifyEdgeGuardian {
  private complianceAnalyzer = new ComplianceAnalyzer();
  private deprecationAnalyzer = new DeprecationAnalyzer();
  private wasmProfiler = new WasmProfiler();
  private privilegeAnalyzer = new PrivilegeAnalyzer();
  private reviewAnalyzer = new ReviewAnalyzer();
  private bfsAnalyzer = new BfsAnalyzer();
  private reporter = new MarkdownReporter();

  /**
   * Runs a complete pre-flight and CI audit on a Shopify App project:
   * 1. GDPR Privacy & App Bridge Compliance
   * 2. Principle of Least Privilege & Unused Scope Auditing
   * 3. App Store Review Blockers & Listing Quality Linter
   * 4. Quarterly GraphQL & REST API Deprecations
   * 5. Rust WebAssembly Edge Performance Profile (256KB, 5.0ms)
   */
  public runAudit(
    projectRoot: string,
    options?: { config?: EdgeGuardianConfig; configPath?: string }
  ): GuardianReport {
    const config = options?.config || ConfigLoader.loadConfig(projectRoot, options?.configPath);

    const compliance = this.complianceAnalyzer.analyze(projectRoot, config);
    const privilegeUsage = this.privilegeAnalyzer.analyze(projectRoot, compliance.scopesRequested, config);
    const reviewRequirements = this.reviewAnalyzer.analyze(projectRoot, config);
    const deprecation = this.deprecationAnalyzer.scanDirectory(projectRoot, config);
    const wasmProfile = this.wasmProfiler.profile(projectRoot, config);
    const category = AppDetector.detectCategory(projectRoot, config);
    const bfsAnalysis = this.bfsAnalyzer.analyze(projectRoot, config);

    const rawFindings = [
      ...compliance.findings,
      ...privilegeUsage.findings,
      ...reviewRequirements.findings,
      ...deprecation.findings,
      ...wasmProfile.findings,
      ...bfsAnalysis.findings,
    ];

    const seenErrorKeys = new Set<string>();
    let totalErrors = 0;
    for (const f of rawFindings) {
      if (f.severity === 'ERROR') {
        const normFile = f.file ? f.file.replace(/\\/g, '/').toLowerCase() : '';
        const key = `${f.id}:${normFile}:${f.line || ''}`;
        if (!seenErrorKeys.has(key)) {
          seenErrorKeys.add(key);
          totalErrors++;
        }
      }
    }

    const seenWarningKeys = new Set<string>();
    let totalWarnings = 0;
    for (const f of rawFindings) {
      if (f.severity === 'WARNING') {
        const normFile = f.file ? f.file.replace(/\\/g, '/').toLowerCase() : '';
        const key = `${f.id}:${normFile}:${f.line || ''}`;
        if (!seenWarningKeys.has(key)) {
          seenWarningKeys.add(key);
          totalWarnings++;
        }
      }
    }

    const passed = totalErrors === 0;

    const partialReport: Omit<GuardianReport, 'summaryMarkdown'> = {
      timestamp: new Date().toISOString(),
      passed,
      totalErrors,
      totalWarnings,
      category,
      compliance,
      privilegeUsage,
      reviewRequirements,
      deprecation,
      wasmProfile,
      bfsScorecard: {
        ...bfsAnalysis.scorecard,
        findings: bfsAnalysis.findings,
      },
    };

    const summaryMarkdown = this.reporter.generate({
      ...partialReport,
      summaryMarkdown: '',
    });

    return {
      ...partialReport,
      summaryMarkdown,
    };
  }

  /**
   * Runs an asynchronous audit with optional pluggable AI evaluation on marketing copy.
   */
  public async runAuditAsync(
    projectRoot: string,
    options?: {
      enableAi?: boolean;
      aiConfig?: AiEvaluatorConfig;
      config?: EdgeGuardianConfig;
      configPath?: string;
    }
  ): Promise<GuardianReport> {
    const config = options?.config || ConfigLoader.loadConfig(projectRoot, options?.configPath);

    const compliance = this.complianceAnalyzer.analyze(projectRoot, config);
    const privilegeUsage = this.privilegeAnalyzer.analyze(projectRoot, compliance.scopesRequested, config);
    const reviewRequirements = await this.reviewAnalyzer.analyzeAsync(projectRoot, {
      aiConfig: options?.aiConfig,
      config,
    });
    const deprecation = this.deprecationAnalyzer.scanDirectory(projectRoot, config);
    const wasmProfile = this.wasmProfiler.profile(projectRoot, config);
    const category = AppDetector.detectCategory(projectRoot, config);
    const bfsAnalysis = this.bfsAnalyzer.analyze(projectRoot, config);

    const rawFindings = [
      ...compliance.findings,
      ...privilegeUsage.findings,
      ...reviewRequirements.findings,
      ...deprecation.findings,
      ...wasmProfile.findings,
      ...bfsAnalysis.findings,
    ];

    const seenErrorKeys = new Set<string>();
    let totalErrors = 0;
    for (const f of rawFindings) {
      if (f.severity === 'ERROR') {
        const normFile = f.file ? f.file.replace(/\\/g, '/').toLowerCase() : '';
        const key = `${f.id}:${normFile}:${f.line || ''}`;
        if (!seenErrorKeys.has(key)) {
          seenErrorKeys.add(key);
          totalErrors++;
        }
      }
    }

    const seenWarningKeys = new Set<string>();
    let totalWarnings = 0;
    for (const f of rawFindings) {
      if (f.severity === 'WARNING') {
        const normFile = f.file ? f.file.replace(/\\/g, '/').toLowerCase() : '';
        const key = `${f.id}:${normFile}:${f.line || ''}`;
        if (!seenWarningKeys.has(key)) {
          seenWarningKeys.add(key);
          totalWarnings++;
        }
      }
    }

    const passed = totalErrors === 0;

    const partialReport: Omit<GuardianReport, 'summaryMarkdown'> = {
      timestamp: new Date().toISOString(),
      passed,
      totalErrors,
      totalWarnings,
      category,
      compliance,
      privilegeUsage,
      reviewRequirements,
      deprecation,
      wasmProfile,
      bfsScorecard: {
        ...bfsAnalysis.scorecard,
        findings: bfsAnalysis.findings,
      },
    };

    const summaryMarkdown = this.reporter.generate({
      ...partialReport,
      summaryMarkdown: '',
    });

    return {
      ...partialReport,
      summaryMarkdown,
    };
  }
}
