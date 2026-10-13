import { DeprecationItem, LicenseStatus } from '../types/index.js';
import { DetectedAppInfo } from '../utils/app-detector.js';
export interface SlackAlerterOptions {
    webhookUrl?: string;
    appInfo: DetectedAppInfo;
    deprecations: DeprecationItem[];
    apiVersion?: string;
    license?: LicenseStatus;
}
export declare class SlackAlerter {
    /**
     * Dispatches a Slack Block Kit alert when Shopify API deprecations are detected.
     * Resolves webhook from explicit parameter, env var SLACK_WEBHOOK_URL, or license status telemetry.
     */
    static dispatchDeprecationAlert(options: SlackAlerterOptions): Promise<{
        delivered: boolean;
        error?: string;
    }>;
}
