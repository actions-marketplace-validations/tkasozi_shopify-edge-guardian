import * as fs from 'fs';
import * as path from 'path';
import { EdgeGuardianConfig, Finding, WasmProfileResult } from '../types/index.js';
import { SHOPIFY_PERFORMANCE_LIMITS } from '../rules/shopify-rules.js';
import { ConfigLoader } from '../config/config-loader.js';

export class WasmProfiler {
  /**
   * Analyzes a compiled Shopify Function .wasm file or workspace
   * for binary size, LTO configuration, and estimated edge runtime.
   */
  public profile(wasmPathOrWorkspace: string, config?: EdgeGuardianConfig): WasmProfileResult {
    let findings: Finding[] = [];
    let wasmFilePath = wasmPathOrWorkspace;

    if (config?.wasm?.wasmPath) {
      wasmFilePath = path.isAbsolute(config.wasm.wasmPath)
        ? config.wasm.wasmPath
        : path.join(wasmPathOrWorkspace, config.wasm.wasmPath);
    }

    if (fs.existsSync(wasmFilePath)) {
      const stats = fs.statSync(wasmFilePath);
      if (stats.isDirectory()) {
        const found = this.findWasmFile(wasmFilePath);
        if (found) {
          wasmFilePath = found;
        }
      }
    }

    if (!fs.existsSync(wasmFilePath) || !wasmFilePath.endsWith('.wasm')) {
      const isRequired = config?.wasm?.required;
      const hasRust = this.hasRustProject(wasmPathOrWorkspace);

      // Only report WASM_BINARY_NOT_FOUND if explicitly required or if a Rust Cargo.toml project is detected
      if (isRequired === true || (isRequired === undefined && hasRust)) {
        findings.push({
          id: 'WASM_BINARY_NOT_FOUND',
          category: 'WASM_PERFORMANCE',
          severity: 'INFO',
          title: 'No Compiled .wasm Binary Found',
          message: `Could not locate a .wasm file at ${wasmFilePath}. Ensure 'cargo build --target wasm32-unknown-unknown --release' was executed.`,
          remediation: 'Build your Rust Shopify Function to enable edge performance verification.',
        });
      }

      findings = ConfigLoader.applyRuleOverrides(findings, config?.rules);

      return {
        passed: !findings.some((f) => f.severity === 'ERROR'),
        filePath: wasmFilePath,
        sizeBytes: 0,
        budgetBytes: SHOPIFY_PERFORMANCE_LIMITS.WASM_SIZE_BUDGET_BYTES,
        sizeFormatted: '0 KB',
        estimatedExecutionMs: 0,
        executionBudgetMs: SHOPIFY_PERFORMANCE_LIMITS.WASM_EXECUTION_BUDGET_MS,
        hasOptimizedLto: false,
        findings,
      };
    }

    const wasmStats = fs.statSync(wasmFilePath);
    const sizeBytes = wasmStats.size;
    const sizeFormatted = `${(sizeBytes / 1024).toFixed(2)} KB`;

    // 1. Verify WebAssembly Magic Header (\0asm\1\0\0\0)
    let isValidWasmHeader = false;
    if (sizeBytes >= 8) {
      try {
        const fd = fs.openSync(wasmFilePath, 'r');
        const headerBuffer = Buffer.alloc(8);
        fs.readSync(fd, headerBuffer, 0, 8, 0);
        fs.closeSync(fd);
        const expectedHeader = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
        isValidWasmHeader = headerBuffer.equals(expectedHeader);
      } catch {
        isValidWasmHeader = false;
      }
    }

    if (!isValidWasmHeader) {
      findings.push({
        id: 'WASM_INVALID_BINARY_HEADER',
        category: 'WASM_PERFORMANCE',
        severity: 'ERROR',
        title: 'Corrupted or Non-Wasm File Detected',
        message: `File at ${wasmFilePath} is not a valid WebAssembly binary (missing '\\0asm' magic header).`,
        file: wasmFilePath,
        remediation: 'Recompile your Shopify Function using the wasm32-unknown-unknown Rust target.',
      });
    }

    // 2. Binary Size Threshold Checks
    if (sizeBytes > SHOPIFY_PERFORMANCE_LIMITS.WASM_SIZE_BUDGET_BYTES) {
      findings.push({
        id: 'WASM_SIZE_EXCEEDS_SHOPIFY_BUDGET',
        category: 'WASM_PERFORMANCE',
        severity: 'ERROR',
        title: 'Wasm Binary Exceeds Shopify 256 KB Limit',
        message: `Compiled binary is ${sizeFormatted}, exceeding Shopify's maximum limit of 256 KB. Shopify will reject or abort this Function during checkout.`,
        file: wasmFilePath,
        remediation: "Enable `lto = true`, `opt-level = 'z'`, `codegen-units = 1`, and run `wasm-opt -Oz`.",
      });
    } else if (sizeBytes > SHOPIFY_PERFORMANCE_LIMITS.WASM_SIZE_WARNING_BYTES) {
      findings.push({
        id: 'WASM_SIZE_APPROACHING_LIMIT',
        category: 'WASM_PERFORMANCE',
        severity: 'WARNING',
        title: 'Wasm Binary Approaching 256 KB Ceiling',
        message: `Compiled binary is ${sizeFormatted} (approaching 200 KB warning threshold).`,
        file: wasmFilePath,
        remediation: "Audit Cargo dependencies to ensure heavy crates (like regex or full serde) are minimized.",
      });
    }

    // 3. Cargo.toml LTO and Optimization Check (Specifically scoped to [profile.release])
    const cargoPath = this.findCargoToml(wasmFilePath);
    let hasOptimizedLto = false;

    if (cargoPath && fs.existsSync(cargoPath)) {
      const cargoContent = fs.readFileSync(cargoPath, 'utf-8');
      const releaseProfileMatch = /\[profile\.release\]([\s\S]*?)(?:\[profile|\n\[|$)/i.exec(cargoContent);
      const releaseSection = releaseProfileMatch ? releaseProfileMatch[1] : '';

      const hasLto = /lto\s*=\s*(true|["']fat["']|["']thin["'])/i.test(releaseSection);
      const hasOptLevelZ = /opt-level\s*=\s*["']?z["']?/i.test(releaseSection);

      hasOptimizedLto = hasLto && hasOptLevelZ;

      if (!hasLto) {
        findings.push({
          id: 'CARGO_LTO_NOT_ENABLED',
          category: 'WASM_PERFORMANCE',
          severity: 'WARNING',
          title: 'Link-Time Optimization (LTO) Disabled in [profile.release]',
          message: 'Compiling without LTO in [profile.release] significantly inflates binary size and slows Function initialization.',
          file: cargoPath,
          remediation: 'Add `[profile.release] lto = true` to your root Cargo.toml.',
        });
      }
    }

    // 4. Execution Time Estimation & 5.0ms Cutoff Enforcement
    // Module instantiation and function invocation scales with binary size and symbols.
    const estimatedExecutionMs = Number(
      (0.4 + (sizeBytes / (256 * 1024)) * 0.8).toFixed(2)
    );

    if (estimatedExecutionMs > SHOPIFY_PERFORMANCE_LIMITS.WASM_EXECUTION_BUDGET_MS) {
      findings.push({
        id: 'WASM_EXECUTION_BUDGET_EXCEEDED',
        category: 'WASM_PERFORMANCE',
        severity: 'ERROR',
        title: `Estimated Edge Runtime Exceeds Shopify 5.0ms Cutoff (${estimatedExecutionMs}ms)`,
        message: `Shopify Functions have a hard 5.0ms execution ceiling. Binaries with estimated runtime of ${estimatedExecutionMs}ms will cause checkout timeouts and silent failures.`,
        file: wasmFilePath,
        remediation: 'Optimize data structures, eliminate heavy heap allocations, and reduce binary size.',
      });
    } else if (estimatedExecutionMs > SHOPIFY_PERFORMANCE_LIMITS.WASM_EXECUTION_TARGET_MS) {
      findings.push({
        id: 'WASM_EXECUTION_LATENCY_HIGH',
        category: 'WASM_PERFORMANCE',
        severity: 'WARNING',
        title: `Estimated Edge Runtime Approaching Target (${estimatedExecutionMs}ms > 1.5ms)`,
        message: 'Best practices for checkout functions recommend < 1.5ms edge runtime.',
        file: wasmFilePath,
      });
    }

    findings = ConfigLoader.applyRuleOverrides(findings, config?.rules);
    const passed = !findings.some((f) => f.severity === 'ERROR');

    return {
      passed,
      filePath: wasmFilePath,
      sizeBytes,
      budgetBytes: SHOPIFY_PERFORMANCE_LIMITS.WASM_SIZE_BUDGET_BYTES,
      sizeFormatted,
      estimatedExecutionMs,
      executionBudgetMs: SHOPIFY_PERFORMANCE_LIMITS.WASM_EXECUTION_BUDGET_MS,
      hasOptimizedLto,
      findings,
    };
  }

  private hasRustProject(dirOrFile: string): boolean {
    if (!fs.existsSync(dirOrFile)) return false;
    let startDir = dirOrFile;
    try {
      const stats = fs.statSync(dirOrFile);
      startDir = stats.isDirectory() ? dirOrFile : path.dirname(dirOrFile);
    } catch {
      return false;
    }

    if (fs.existsSync(path.join(startDir, 'Cargo.toml'))) {
      return true;
    }

    const extensionsDir = path.join(startDir, 'extensions');
    if (fs.existsSync(extensionsDir)) {
      try {
        const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && fs.existsSync(path.join(extensionsDir, entry.name, 'Cargo.toml'))) {
            return true;
          }
        }
      } catch {
        // Ignore
      }
    }

    return false;
  }

  private findWasmFile(startDir: string): string | null {
    const candidates = [
      path.join(startDir, 'target', 'wasm32-unknown-unknown', 'release'),
      path.join(startDir, 'extensions'),
      startDir,
    ];

    for (const cDir of candidates) {
      if (fs.existsSync(cDir)) {
        const found = this.searchWasmRecursive(cDir, 3);
        if (found) return found;
      }
    }

    return null;
  }

  private searchWasmRecursive(dir: string, depth: number): string | null {
    if (depth <= 0) return null;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.wasm')) {
        return fullPath;
      } else if (entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)) {
        const nested = this.searchWasmRecursive(fullPath, depth - 1);
        if (nested) return nested;
      }
    }
    return null;
  }

  private findCargoToml(wasmPath: string): string | null {
    let currentDir = path.dirname(wasmPath);
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(currentDir, 'Cargo.toml');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      currentDir = path.dirname(currentDir);
    }
    return null;
  }
}
