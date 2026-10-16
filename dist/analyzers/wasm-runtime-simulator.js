"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WasmRuntimeSimulator = void 0;
class WasmRuntimeSimulator {
    /**
     * Performs in-process native WebAssembly compilation, instantiation,
     * symbol discovery, and execution simulation on compiled Shopify Function binaries.
     */
    static simulate(wasmBuffer) {
        // 1. Measure Compilation Time
        const compileStart = performance.now();
        let mod;
        try {
            const arrayBuffer = wasmBuffer.buffer.slice(wasmBuffer.byteOffset, wasmBuffer.byteOffset + wasmBuffer.byteLength);
            mod = new WebAssembly.Module(arrayBuffer);
        }
        catch (err) {
            return {
                compileTimeMs: 0,
                instantiationTimeMs: 0,
                executionTimeMs: 0,
                totalLatencyMs: 0,
                memoryBytes: 0,
                memoryPages: 0,
                exportedSymbols: [],
                status: 'COMPILED_ONLY',
                trapMessage: `Compilation failed: ${err.message}`,
            };
        }
        const compileTimeMs = Number((performance.now() - compileStart).toFixed(3));
        // 2. Discover Imports and Build Mock Host Environment
        const imports = WebAssembly.Module.imports(mod);
        const exportsList = WebAssembly.Module.exports(mod);
        const exportedSymbols = exportsList.map((e) => e.name);
        const importObj = {};
        for (const imp of imports) {
            if (!importObj[imp.module]) {
                importObj[imp.module] = {};
            }
            if (imp.kind === 'function') {
                importObj[imp.module][imp.name] = (...args) => {
                    if (imp.name.endsWith('_str') ||
                        imp.name.endsWith('_prop') ||
                        imp.name.endsWith('_get') ||
                        imp.name.endsWith('_index') ||
                        imp.name.endsWith('_object') ||
                        imp.name.endsWith('_array')) {
                        return 0n;
                    }
                    return 0;
                };
            }
            else if (imp.kind === 'memory') {
                importObj[imp.module][imp.name] = new WebAssembly.Memory({ initial: 10, maximum: 100 });
            }
            else if (imp.kind === 'table') {
                importObj[imp.module][imp.name] = new WebAssembly.Table({ initial: 10, element: 'anyfunc' });
            }
            else if (imp.kind === 'global') {
                importObj[imp.module][imp.name] = new WebAssembly.Global({ value: 'i32', mutable: true }, 0);
            }
        }
        // Standard WASI snapshot preview1 stubs
        if (!importObj['wasi_snapshot_preview1']) {
            importObj['wasi_snapshot_preview1'] = {};
        }
        const wasi = importObj['wasi_snapshot_preview1'];
        wasi['proc_exit'] = wasi['proc_exit'] || ((code) => code);
        wasi['fd_write'] = wasi['fd_write'] || (() => 0);
        wasi['fd_read'] = wasi['fd_read'] || (() => 0);
        wasi['fd_close'] = wasi['fd_close'] || (() => 0);
        wasi['fd_seek'] = wasi['fd_seek'] || (() => 0);
        wasi['environ_get'] = wasi['environ_get'] || (() => 0);
        wasi['environ_sizes_get'] = wasi['environ_sizes_get'] || (() => 0);
        wasi['clock_time_get'] = wasi['clock_time_get'] || (() => 0);
        wasi['random_get'] = wasi['random_get'] || (() => 0);
        // 3. Measure Instantiation Time
        const instStart = performance.now();
        let instance;
        try {
            instance = new WebAssembly.Instance(mod, importObj);
        }
        catch (err) {
            return {
                compileTimeMs,
                instantiationTimeMs: Number((performance.now() - instStart).toFixed(3)),
                executionTimeMs: 0,
                totalLatencyMs: compileTimeMs,
                memoryBytes: 0,
                memoryPages: 0,
                exportedSymbols,
                status: 'COMPILED_ONLY',
                trapMessage: `Instantiation error: ${err.message}`,
            };
        }
        const instantiationTimeMs = Number((performance.now() - instStart).toFixed(3));
        // Inspect Memory Allocation
        let memoryBytes = 0;
        let memoryPages = 0;
        const memExport = instance.exports.memory;
        if (memExport && memExport.buffer) {
            memoryBytes = memExport.buffer.byteLength;
            memoryPages = Math.floor(memoryBytes / 65536);
        }
        // 4. Measure Execution Latency
        let executionTimeMs = 0;
        let status = 'SUCCESS';
        let trapMessage;
        const entryPointName = ['run', '_start', 'main', 'default'].find((n) => typeof instance.exports[n] === 'function');
        if (entryPointName) {
            const entryFn = instance.exports[entryPointName];
            // Warm up and take minimum execution latency across multiple samples
            // to eliminate cold-start V8 JIT compilation and virtual machine runner jitter
            let minExecutionMs = Infinity;
            const iterations = 5;
            for (let i = 0; i < iterations; i++) {
                const execStart = performance.now();
                try {
                    entryFn();
                    status = 'SUCCESS';
                }
                catch (err) {
                    status = 'TRAPPED';
                    trapMessage = err.message || 'Execution trapped';
                }
                const iterationMs = performance.now() - execStart;
                if (iterationMs < minExecutionMs) {
                    minExecutionMs = iterationMs;
                }
            }
            executionTimeMs = Number(minExecutionMs.toFixed(3));
        }
        const totalLatencyMs = Number((instantiationTimeMs + executionTimeMs).toFixed(3));
        return {
            compileTimeMs,
            instantiationTimeMs,
            executionTimeMs,
            totalLatencyMs,
            memoryBytes,
            memoryPages,
            exportedSymbols,
            status,
            trapMessage,
        };
    }
}
exports.WasmRuntimeSimulator = WasmRuntimeSimulator;
//# sourceMappingURL=wasm-runtime-simulator.js.map