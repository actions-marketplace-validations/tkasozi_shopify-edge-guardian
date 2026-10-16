import { FleetAppRecord } from '../types/index.js';
export interface FleetSummary {
    totalApps: number;
    healthyCount: number;
    actionRequiredCount: number;
    atRiskCount: number;
    totalActiveDeprecations: number;
    averageWasmSizeKb: number;
    apps: FleetAppRecord[];
}
export declare class FleetManager {
    private apps;
    /**
     * Registers or updates a client application in the agency fleet registry.
     */
    registerApp(record: FleetAppRecord): void;
    /**
     * Returns a complete fleet status overview for agency leadership.
     */
    getFleetSummary(): FleetSummary;
    /**
     * Generates a clean Markdown report summarizing agency client fleet status.
     */
    generateAgencyMarkdownReport(): string;
}
