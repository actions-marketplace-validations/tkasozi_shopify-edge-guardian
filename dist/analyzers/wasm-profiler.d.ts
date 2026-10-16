import { EdgeGuardianConfig, WasmProfileResult } from '../types/index.js';
export declare class WasmProfiler {
    /**
     * Analyzes a compiled Shopify Function .wasm file or workspace
     * for binary size, LTO configuration, and estimated edge runtime.
     */
    profile(wasmPathOrWorkspace: string, config?: EdgeGuardianConfig): WasmProfileResult;
    private hasRustProject;
    private findWasmFile;
    private searchWasmRecursive;
    private findCargoToml;
}
