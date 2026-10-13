import { ComplianceAnalyzer } from './analyzers/compliance-analyzer.js';
import { DeprecationAnalyzer } from './analyzers/deprecation-analyzer.js';
import { WasmProfiler } from './analyzers/wasm-profiler.js';
import { BfsCanary } from './analyzers/bfs-canary.js';
import { PrivilegeAnalyzer } from './analyzers/privilege-analyzer.js';
import { ReviewAnalyzer, AiEvaluatorConfig } from './analyzers/review-analyzer.js';
import { FleetManager } from './fleet/fleet-manager.js';
import { MarkdownReporter } from './reporter/markdown-reporter.js';
import { EdgeGuardianConfig, GuardianReport } from './types/index.js';
import { ConfigLoader } from './config/config-loader.js';
import { LicenseManager } from './licensing/license-manager.js';

export * from './types/index.js';
export * from './rules/shopify-rules.js';
export { ComplianceAnalyzer } from './analyzers/compliance-analyzer.js';
export { DeprecationAnalyzer } from './analyzers/deprecation-analyzer.js';
export { WasmProfiler } from './analyzers/wasm-profiler.js';
export { BfsCanary } from './analyzers/bfs-canary.js';
export { PrivilegeAnalyzer } from './analyzers/privilege-analyzer.js';
export { ReviewAnalyzer, PluggableAiEvaluator, AiEvaluatorConfig } from './analyzers/review-analyzer.js';
export { FleetManager } from './fleet/fleet-manager.js';
export { MarkdownReporter } from './reporter/markdown-reporter.js';
export { ConfigLoader, CONFIG_FILE_CANDIDATES } from './config/config-loader.js';
export { LicenseManager } from './licensing/license-manager.js';
export { AppDetector, DetectedAppInfo } from './utils/app-detector.js';
export { SlackAlerter, SlackAlerterOptions } from './notifications/slack-alerter.js';

export class ShopifyEdgeGuardian {
  private complianceAnalyzer = new ComplianceAnalyzer();
  private deprecationAnalyzer = new DeprecationAnalyzer();
  private wasmProfiler = new WasmProfiler();
  private privilegeAnalyzer = new PrivilegeAnalyzer();
  private reviewAnalyzer = new ReviewAnalyzer();
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
    options?: { config?: EdgeGuardianConfig; configPath?: string; licenseKey?: string }
  ): GuardianReport {
    const config = options?.config || ConfigLoader.loadConfig(projectRoot, options?.configPath);
    const license = LicenseManager.verifyLicenseSync(options?.licenseKey || config.licenseKey);

    const compliance = this.complianceAnalyzer.analyze(projectRoot, config);
    const privilegeUsage = this.privilegeAnalyzer.analyze(projectRoot, compliance.scopesRequested, config);
    const reviewRequirements = this.reviewAnalyzer.analyze(projectRoot, config);
    const deprecation = this.deprecationAnalyzer.scanDirectory(projectRoot, config);
    const wasmProfile = this.wasmProfiler.profile(projectRoot, config);

    const totalErrors =
      compliance.findings.filter((f) => f.severity === 'ERROR').length +
      privilegeUsage.findings.filter((f) => f.severity === 'ERROR').length +
      reviewRequirements.findings.filter((f) => f.severity === 'ERROR').length +
      deprecation.findings.filter((f) => f.severity === 'ERROR').length +
      wasmProfile.findings.filter((f) => f.severity === 'ERROR').length;

    const totalWarnings =
      compliance.findings.filter((f) => f.severity === 'WARNING').length +
      privilegeUsage.findings.filter((f) => f.severity === 'WARNING').length +
      reviewRequirements.findings.filter((f) => f.severity === 'WARNING').length +
      deprecation.findings.filter((f) => f.severity === 'WARNING').length +
      wasmProfile.findings.filter((f) => f.severity === 'WARNING').length;

    const passed = totalErrors === 0;

    const partialReport: Omit<GuardianReport, 'summaryMarkdown'> = {
      timestamp: new Date().toISOString(),
      passed,
      totalErrors,
      totalWarnings,
      compliance,
      privilegeUsage,
      reviewRequirements,
      deprecation,
      wasmProfile,
      license,
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
      licenseKey?: string;
    }
  ): Promise<GuardianReport> {
    const config = options?.config || ConfigLoader.loadConfig(projectRoot, options?.configPath);
    const license = await LicenseManager.verifyLicense({
      licenseKey: options?.licenseKey || config.licenseKey,
      projectRoot,
    });

    const compliance = this.complianceAnalyzer.analyze(projectRoot, config);
    const privilegeUsage = this.privilegeAnalyzer.analyze(projectRoot, compliance.scopesRequested, config);
    const effectiveLicenseKey = options?.licenseKey || config.licenseKey || process.env.GUARDIAN_LICENSE_KEY;
    const reviewRequirements = await this.reviewAnalyzer.analyzeAsync(projectRoot, {
      aiConfig: {
        ...options?.aiConfig,
        licenseKey: effectiveLicenseKey,
      },
      config,
    });
    const deprecation = this.deprecationAnalyzer.scanDirectory(projectRoot, config);
    const wasmProfile = this.wasmProfiler.profile(projectRoot, config);

    const totalErrors =
      compliance.findings.filter((f) => f.severity === 'ERROR').length +
      privilegeUsage.findings.filter((f) => f.severity === 'ERROR').length +
      reviewRequirements.findings.filter((f) => f.severity === 'ERROR').length +
      deprecation.findings.filter((f) => f.severity === 'ERROR').length +
      wasmProfile.findings.filter((f) => f.severity === 'ERROR').length;

    const totalWarnings =
      compliance.findings.filter((f) => f.severity === 'WARNING').length +
      privilegeUsage.findings.filter((f) => f.severity === 'WARNING').length +
      reviewRequirements.findings.filter((f) => f.severity === 'WARNING').length +
      deprecation.findings.filter((f) => f.severity === 'WARNING').length +
      wasmProfile.findings.filter((f) => f.severity === 'WARNING').length;

    const passed = totalErrors === 0;

    const partialReport: Omit<GuardianReport, 'summaryMarkdown'> = {
      timestamp: new Date().toISOString(),
      passed,
      totalErrors,
      totalWarnings,
      compliance,
      privilegeUsage,
      reviewRequirements,
      deprecation,
      wasmProfile,
      license,
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
