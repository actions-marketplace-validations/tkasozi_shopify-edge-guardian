import { ComplianceAnalyzer } from './analyzers/compliance-analyzer.js';
import { DeprecationAnalyzer } from './analyzers/deprecation-analyzer.js';
import { WasmProfiler } from './analyzers/wasm-profiler.js';
import { BfsCanary } from './analyzers/bfs-canary.js';
import { PrivilegeAnalyzer } from './analyzers/privilege-analyzer.js';
import { ReviewAnalyzer } from './analyzers/review-analyzer.js';
import { FleetManager } from './fleet/fleet-manager.js';
import { MarkdownReporter } from './reporter/markdown-reporter.js';
import { GuardianReport } from './types/index.js';

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
  public runAudit(projectRoot: string): GuardianReport {
    const compliance = this.complianceAnalyzer.analyze(projectRoot);
    const privilegeUsage = this.privilegeAnalyzer.analyze(projectRoot, compliance.scopesRequested);
    const reviewRequirements = this.reviewAnalyzer.analyze(projectRoot);
    const deprecation = this.deprecationAnalyzer.scanDirectory(projectRoot);
    const wasmProfile = this.wasmProfiler.profile(projectRoot);

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
    options?: { enableAi?: boolean; aiConfig?: import('./analyzers/review-analyzer.js').AiEvaluatorConfig }
  ): Promise<GuardianReport> {
    const compliance = this.complianceAnalyzer.analyze(projectRoot);
    const privilegeUsage = this.privilegeAnalyzer.analyze(projectRoot, compliance.scopesRequested);
    const reviewRequirements = await this.reviewAnalyzer.analyzeAsync(projectRoot, options?.aiConfig);
    const deprecation = this.deprecationAnalyzer.scanDirectory(projectRoot);
    const wasmProfile = this.wasmProfiler.profile(projectRoot);

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
