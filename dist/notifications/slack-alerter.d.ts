import { DeprecationItem } from '../types/index.js';
import { DetectedAppInfo } from '../utils/app-detector.js';
export interface SlackAlerterOptions {
    webhookUrl?: string;
    appInfo: DetectedAppInfo;
    deprecations: DeprecationItem[];
    apiVersion?: string;
}
export declare class SlackAlerter {
    /**
     * Dispatches a Slack Block Kit alert when Shopify API deprecations are detected.
     * Resolves webhook from explicit parameter or env var SLACK_WEBHOOK_URL.
     */
    static dispatchDeprecationAlert(options: SlackAlerterOptions): Promise<{
        delivered: boolean;
        error?: string;
    }>;
}
