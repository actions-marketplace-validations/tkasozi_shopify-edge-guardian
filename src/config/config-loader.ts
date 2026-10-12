import * as fs from 'fs';
import * as path from 'path';
import { EdgeGuardianConfig, Finding, RuleOverride } from '../types/index.js';
import { maskComments } from '../utils/sanitizer.js';

export const CONFIG_FILE_CANDIDATES = [
  '.edgeguardianrc.json',
  '.edgeguardian.json',
  'edge-guardian.json',
  'edgeguardian.config.json',
  '.edgeguardianrc',
];

export class ConfigLoader {
  /**
   * Loads EdgeGuardian configuration from a custom path, a dedicated
   * configuration file in the project root, or the [edge_guardian] section
   * in shopify.app.toml.
   */
  public static loadConfig(projectRoot: string, customConfigPath?: string): EdgeGuardianConfig {
    if (customConfigPath) {
      const resolved = path.isAbsolute(customConfigPath)
        ? customConfigPath
        : path.join(projectRoot, customConfigPath);
      if (fs.existsSync(resolved)) {
        return this.parseConfigFile(resolved);
      }
    }

    // 1. Check dedicated JSON config files
    for (const candidate of CONFIG_FILE_CANDIDATES) {
      const fullPath = path.join(projectRoot, candidate);
      if (fs.existsSync(fullPath)) {
        return this.parseConfigFile(fullPath);
      }
    }

    // 2. Check shopify.app.toml [edge_guardian] section
    const tomlPath = path.join(projectRoot, 'shopify.app.toml');
    if (fs.existsSync(tomlPath)) {
      const tomlConfig = this.parseTomlConfig(tomlPath);
      if (tomlConfig) {
        return tomlConfig;
      }
    }

    return {};
  }

  /**
   * Parses a dedicated JSON configuration file (supports comments via maskComments).
   */
  public static parseConfigFile(filePath: string): EdgeGuardianConfig {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const sanitized = maskComments(raw, '.jsonc');
      return JSON.parse(sanitized) as EdgeGuardianConfig;
    } catch {
      return {};
    }
  }

  /**
   * Parses the [edge_guardian] or [edge-guardian] section from shopify.app.toml.
   */
  public static parseTomlConfig(tomlPath: string): EdgeGuardianConfig | null {
    try {
      const raw = fs.readFileSync(tomlPath, 'utf-8');
      const sanitized = maskComments(raw, tomlPath);

      const hasGuardianSection = /\[(?:edge_guardian|edge-guardian)/i.test(sanitized);
      if (!hasGuardianSection) {
        return null;
      }

      const config: EdgeGuardianConfig = {};

      // Match [edge_guardian] or [edge-guardian] base block
      const sectionMatch = /\[(?:edge_guardian|edge-guardian)\]([\s\S]*?)(?=\n\[|$)/i.exec(sanitized);
      if (sectionMatch) {
        const sectionText = sectionMatch[1];
        const ignoreMatch = /ignore\s*=\s*\[([\s\S]*?)\]/i.exec(sectionText);
        if (ignoreMatch) {
          const items = ignoreMatch[1].match(/["']([^"']+)["']/g);
          if (items) {
            config.ignore = items.map((i) => i.replace(/["']/g, '').trim()).filter(Boolean);
          }
        }

        const directWasmMatch = /wasm\.required\s*=\s*(true|false)/i.exec(sectionText);
        if (directWasmMatch) {
          config.wasm = { required: directWasmMatch[1].toLowerCase() === 'true' };
        }
      }

      // Parse wasm settings: [edge_guardian.wasm] or [edge-guardian.wasm]
      const wasmSectionMatch = /\[(?:edge_guardian|edge-guardian)\.wasm\]([\s\S]*?)(?=\n\[|$)/i.exec(sanitized);
      if (wasmSectionMatch) {
        const reqMatch = /required\s*=\s*(true|false)/i.exec(wasmSectionMatch[1]);
        if (reqMatch) {
          config.wasm = { ...(config.wasm || {}), required: reqMatch[1].toLowerCase() === 'true' };
        }
      }

      // Parse rule overrides: [edge_guardian.rules] or [edge-guardian.rules]
      const rulesSectionMatch = /\[(?:edge_guardian|edge-guardian)\.rules\]([\s\S]*?)(?=\n\[|$)/i.exec(sanitized);
      if (rulesSectionMatch) {
        const rules: Record<string, RuleOverride> = {};
        const lines = rulesSectionMatch[1].split('\n');
        for (const line of lines) {
          const match = /^\s*([A-Za-z0-9_-]+)\s*=\s*["'](off|warning|error|info)["']/i.exec(line);
          if (match) {
            rules[match[1]] = match[2].toLowerCase() as RuleOverride;
          }
        }
        if (Object.keys(rules).length > 0) {
          config.rules = rules;
        }
      }

      return config;
    } catch {
      return null;
    }
  }

  /**
   * Filters and adjusts finding severities based on configured rule overrides.
   */
  public static applyRuleOverrides(findings: Finding[], rules?: Record<string, RuleOverride>): Finding[] {
    if (!rules || Object.keys(rules).length === 0) {
      return findings;
    }

    const adjusted: Finding[] = [];

    for (const finding of findings) {
      const override = rules[finding.id];
      if (override === 'off') {
        continue; // Rule disabled by project configuration
      }

      if (override === 'error') {
        adjusted.push({ ...finding, severity: 'ERROR' });
      } else if (override === 'warning') {
        adjusted.push({ ...finding, severity: 'WARNING' });
      } else if (override === 'info') {
        adjusted.push({ ...finding, severity: 'INFO' });
      } else {
        adjusted.push(finding);
      }
    }

    return adjusted;
  }
}
