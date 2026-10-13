export interface WasmSimulationOutcome {
    compileTimeMs: number;
    instantiationTimeMs: number;
    executionTimeMs: number;
    totalLatencyMs: number;
    memoryBytes: number;
    memoryPages: number;
    exportedSymbols: string[];
    status: 'SUCCESS' | 'TRAPPED' | 'COMPILED_ONLY' | 'NOT_APPLICABLE';
    trapMessage?: string;
}
export declare class WasmRuntimeSimulator {
    /**
     * Performs in-process native WebAssembly compilation, instantiation,
     * symbol discovery, and execution simulation on compiled Shopify Function binaries.
     */
    static simulate(wasmBuffer: Buffer): WasmSimulationOutcome;
}
