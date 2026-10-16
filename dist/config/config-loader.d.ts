import { EdgeGuardianConfig, Finding, RuleOverride } from '../types/index.js';
export declare const CONFIG_FILE_CANDIDATES: string[];
export declare class ConfigLoader {
    /**
     * Loads EdgeGuardian configuration from a custom path, a dedicated
     * configuration file in the project root, or the [edge_guardian] section
     * in shopify.app.toml.
     */
    static loadConfig(projectRoot: string, customConfigPath?: string): EdgeGuardianConfig;
    /**
     * Parses a dedicated JSON configuration file (supports comments via maskComments).
     */
    static parseConfigFile(filePath: string): EdgeGuardianConfig;
    /**
     * Parses the [edge_guardian] or [edge-guardian] section from shopify.app.toml.
     */
    static parseTomlConfig(tomlPath: string): EdgeGuardianConfig | null;
    /**
     * Filters and adjusts finding severities based on configured rule overrides.
     */
    static applyRuleOverrides(findings: Finding[], rules?: Record<string, RuleOverride>): Finding[];
}
