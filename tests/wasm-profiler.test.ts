import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WasmProfiler } from '../src/analyzers/wasm-profiler.js';

describe('WasmProfiler', () => {
  const profiler = new WasmProfiler();
  const tempDir = path.resolve(__dirname, '../fixtures/temp-wasm');

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 1. Valid optimized wasm (120 KB) with valid magic header
    const validWasmPath = path.join(tempDir, 'valid.wasm');
    const validBuffer = Buffer.alloc(120 * 1024);
    validBuffer.set([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00], 0);
    fs.writeFileSync(validWasmPath, validBuffer);

    // 2. Oversized wasm (310 KB > 256 KB) with valid magic header
    const oversizedWasmPath = path.join(tempDir, 'oversized.wasm');
    const oversizedBuffer = Buffer.alloc(310 * 1024);
    oversizedBuffer.set([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00], 0);
    fs.writeFileSync(oversizedWasmPath, oversizedBuffer);

    // 3. Huge wasm (1.6 MB) that exceeds 5.0ms estimated edge execution
    const hugeWasmPath = path.join(tempDir, 'huge.wasm');
    const hugeBuffer = Buffer.alloc(1600 * 1024);
    hugeBuffer.set([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00], 0);
    fs.writeFileSync(hugeWasmPath, hugeBuffer);

    // 4. Non-Wasm fake text file named fake.wasm (Blocker 7)
    const fakeWasmPath = path.join(tempDir, 'fake.wasm');
    fs.writeFileSync(fakeWasmPath, 'Hello world! This is just plain text, not a wasm binary.');

    // 5. Cargo.toml with LTO in [profile.release]
    const cargoTomlPath = path.join(tempDir, 'Cargo.toml');
    fs.writeFileSync(
      cargoTomlPath,
      `[package]
name = "test-function"
version = "0.1.0"
edition = "2021"

[profile.dev]
opt-level = 0
lto = false

[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
`
    );

    // 6. Cargo.toml with LTO only in [profile.dev] (Defect 1)
    const unoptimizedCargoPath = path.join(tempDir, 'unoptimized-cargo');
    fs.mkdirSync(unoptimizedCargoPath, { recursive: true });
    fs.writeFileSync(
      path.join(unoptimizedCargoPath, 'Cargo.toml'),
      `[package]
name = "bad-function"
version = "0.1.0"

[profile.dev]
lto = true # Dev only!

[profile.release]
opt-level = 3
lto = false
`
    );
    const unoptWasmPath = path.join(unoptimizedCargoPath, 'unopt.wasm');
    const unoptBuffer = Buffer.alloc(50 * 1024);
    unoptBuffer.set([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00], 0);
    fs.writeFileSync(unoptWasmPath, unoptBuffer);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('profiles valid wasm within budget and verifies LTO in [profile.release]', () => {
    const validWasm = path.join(tempDir, 'valid.wasm');
    const result = profiler.profile(validWasm);

    expect(result.passed).toBe(true);
    expect(result.sizeBytes).toBe(120 * 1024);
    expect(result.hasOptimizedLto).toBe(true);
    expect(result.estimatedExecutionMs).toBeLessThan(5.0);
    expect(result.findings.filter((f) => f.severity === 'ERROR')).toHaveLength(0);
  });

  it('flags oversized wasm binary exceeding 256 KB limit', () => {
    const oversizedWasm = path.join(tempDir, 'oversized.wasm');
    const result = profiler.profile(oversizedWasm);

    expect(result.passed).toBe(false);
    expect(result.sizeBytes).toBe(310 * 1024);
    expect(result.findings.some((f) => f.id === 'WASM_SIZE_EXCEEDS_SHOPIFY_BUDGET')).toBe(true);
  });

  it('BLOCKER 6: enforces 5.0ms execution cutoff on oversized binaries', () => {
    const hugeWasm = path.join(tempDir, 'huge.wasm');
    const result = profiler.profile(hugeWasm);

    expect(result.passed).toBe(false);
    expect(result.estimatedExecutionMs).toBeGreaterThan(5.0);
    expect(result.findings.some((f) => f.id === 'WASM_EXECUTION_BUDGET_EXCEEDED')).toBe(true);
  });

  it('BLOCKER 7: rejects non-wasm files missing \\0asm magic header', () => {
    const fakeWasm = path.join(tempDir, 'fake.wasm');
    const result = profiler.profile(fakeWasm);

    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.id === 'WASM_INVALID_BINARY_HEADER')).toBe(true);
  });

  it('DEFECT 1: isolates [profile.release] and flags when LTO is only in [profile.dev]', () => {
    const unoptWasm = path.join(tempDir, 'unoptimized-cargo', 'unopt.wasm');
    const result = profiler.profile(unoptWasm);

    expect(result.hasOptimizedLto).toBe(false);
    expect(result.findings.some((f) => f.id === 'CARGO_LTO_NOT_ENABLED')).toBe(true);
  });

  it('gracefully handles missing wasm binary', () => {
    const nonExistent = path.join(tempDir, 'missing.wasm');
    const result = profiler.profile(nonExistent);

    expect(result.passed).toBe(true);
    expect(result.sizeBytes).toBe(0);
  });
});
