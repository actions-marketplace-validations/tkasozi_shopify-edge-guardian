#!/usr/bin/env node
export declare function parseArgs(args: string[]): {
    command: string;
    targetPath: string;
    failOnWarning: boolean;
    jsonOutput: boolean;
    enableAi: boolean;
    outputFile: string | null;
    configPath: string | undefined;
    slackWebhook: string | undefined;
};
