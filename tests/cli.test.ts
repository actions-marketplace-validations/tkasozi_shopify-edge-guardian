import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { parseArgs } from '../src/cli/index.js';

describe('CLI Argument Parser (parseArgs)', () => {
  it('defaults to check command and process.cwd() when no arguments are provided', () => {
    const res = parseArgs([]);
    expect(res.command).toBe('check');
    expect(res.targetPath).toBe(process.cwd());
    expect(res.failOnWarning).toBe(false);
    expect(res.jsonOutput).toBe(false);
    expect(res.enableAi).toBe(false);
  });

  it('parses explicit check command', () => {
    const res = parseArgs(['check']);
    expect(res.command).toBe('check');
    expect(res.targetPath).toBe(process.cwd());
  });

  it('parses explicit init command', () => {
    const res = parseArgs(['init']);
    expect(res.command).toBe('init');
    expect(res.targetPath).toBe(process.cwd());
  });

  it('aliases legacy certify command to check without treating certify as a directory path', () => {
    const res = parseArgs(['certify']);
    expect(res.command).toBe('check');
    expect(res.targetPath).toBe(process.cwd());
    expect(res.targetPath).not.toContain('certify');
  });

  it('resolves valid target path when passed with or without command', () => {
    const validDir = path.resolve('fixtures/valid-app');
    const res1 = parseArgs(['check', 'fixtures/valid-app']);
    expect(res1.command).toBe('check');
    expect(res1.targetPath).toBe(validDir);

    const res2 = parseArgs(['fixtures/valid-app']);
    expect(res2.command).toBe('check');
    expect(res2.targetPath).toBe(validDir);

    const res3 = parseArgs(['certify', 'fixtures/valid-app']);
    expect(res3.command).toBe('check');
    expect(res3.targetPath).toBe(validDir);
  });

  it('throws an informative error when a non-existent path or unknown command is passed', () => {
    expect(() => parseArgs(['non_existent_folder_or_command_12345'])).toThrow(
      /Directory or command not found/i
    );
  });

  it('parses flags and option arguments correctly', () => {
    const res = parseArgs([
      'check',
      'fixtures/valid-app',
      '--fail-on-warning',
      '--json',
      '--ai',
      '--output',
      'report.md',
      '--config',
      'custom-config.json',
      '--slack-webhook',
      'https://hooks.slack.com/services/T000/B000/XXXX',
    ]);

    expect(res.command).toBe('check');
    expect(res.failOnWarning).toBe(true);
    expect(res.jsonOutput).toBe(true);
    expect(res.enableAi).toBe(true);
    expect(res.outputFile).toBe('report.md');
    expect(res.configPath).toBe('custom-config.json');
    expect(res.slackWebhook).toBe('https://hooks.slack.com/services/T000/B000/XXXX');
  });
});
