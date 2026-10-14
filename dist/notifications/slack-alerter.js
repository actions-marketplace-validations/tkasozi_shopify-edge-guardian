"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlackAlerter = void 0;
class SlackAlerter {
    /**
     * Dispatches a Slack Block Kit alert when Shopify API deprecations are detected.
     * Resolves webhook from explicit parameter, env var SLACK_WEBHOOK_URL, or license status telemetry.
     */
    static async dispatchDeprecationAlert(options) {
        const webhookUrl = options.webhookUrl ||
            process.env.SLACK_WEBHOOK_URL ||
            options.license?.slackWebhookUrl;
        if (options.license && options.license.tier !== 'AGENCY_FLEET') {
            return {
                delivered: false,
                error: 'Real-time Slack / Discord Deprecation Alerts require an Agency Fleet license tier ($149/mo).',
            };
        }
        if (!webhookUrl) {
            return { delivered: false, error: 'No Slack or Discord webhook URL configured' };
        }
        const isSlack = webhookUrl.startsWith('https://hooks.slack.com/');
        const isDiscord = webhookUrl.startsWith('https://discord.com/api/webhooks/') ||
            webhookUrl.startsWith('https://discordapp.com/api/webhooks/');
        if (!isSlack && !isDiscord) {
            return {
                delivered: false,
                error: 'Invalid incoming webhook URL. Must begin with https://hooks.slack.com/ or https://discord.com/api/webhooks/',
            };
        }
        const targetUrl = isDiscord && !webhookUrl.endsWith('/slack')
            ? `${webhookUrl}/slack`
            : webhookUrl;
        if (!options.deprecations || options.deprecations.length === 0) {
            return { delivered: false, error: 'No deprecations to report' };
        }
        const { appInfo, deprecations } = options;
        const blocks = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `🚨 Shopify API Deprecation Alert: ${appInfo.name}`,
                    emoji: true,
                },
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*App ID / Client ID:*\n\`${appInfo.appId}\``,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Repository:*\n\`${appInfo.repository || 'N/A'}\``,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Deprecations Found:*\n*${deprecations.length}* deprecated call(s)`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Target API Version:*\n\`${options.apiVersion || 'Quarterly Release'}\``,
                    },
                ],
            },
            { type: 'divider' },
        ];
        // Surface first 5 deprecations in detail
        for (const dep of deprecations.slice(0, 5)) {
            let desc = `*Field / Endpoint:* \`${dep.fieldOrEndpoint}\`\n`;
            desc += `*Sunset Date:* *${dep.sunsetDate}* (Deprecated since: ${dep.deprecatedSince})\n`;
            if (dep.file) {
                desc += `*Location:* \`${dep.file}${dep.line ? `:${dep.line}` : ''}\`\n`;
            }
            if (dep.replacement) {
                desc += `*Recommended Fix:* ${dep.replacement}`;
            }
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: desc,
                },
            });
        }
        if (deprecations.length > 5) {
            blocks.push({
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `_...and ${deprecations.length - 5} additional deprecated calls detected in audit scan._`,
                    },
                ],
            });
        }
        const fleetPortalUrl = 'https://billing.endptsec.com/fleet';
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `🛡️ Sent by *Shopify Edge Guardian* • <${fleetPortalUrl}|Manage Agency Fleet>`,
                },
            ],
        });
        try {
            const res = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `🚨 Shopify API Deprecation Alert: ${deprecations.length} deprecated call(s) detected in ${appInfo.name}`,
                    blocks,
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                return { delivered: false, error: `Slack HTTP ${res.status}: ${text}` };
            }
            return { delivered: true };
        }
        catch (err) {
            return { delivered: false, error: err.message };
        }
    }
}
exports.SlackAlerter = SlackAlerter;
//# sourceMappingURL=slack-alerter.js.map