export interface LicenseRecord {
    key: string;
    customerEmail: string;
    tier: 'PRO' | 'AGENCY_FLEET';
    status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED';
    createdAt: string;
    expiresAt: string;
    orderId?: string;
}
/**
 * Serverless / Edge Handler for Edge Guardian Commercial Licensing.
 * Can be deployed to Cloudflare Workers, Vercel, Supabase Functions, or Node.js.
 */
export declare class LicenseServerHandler {
    /**
     * Generates a cryptographically secure Edge Guardian license key.
     */
    static generateLicenseKey(tier: 'PRO' | 'AGENCY_FLEET'): string;
    /**
     * Verifies the HMAC-SHA256 signature of an incoming Lemon Squeezy webhook payload.
     * Uses crypto.timingSafeEqual to prevent timing attacks.
     */
    static verifyLemonSqueezySignature(rawBody: string | Buffer, signatureHex: string, secret: string): boolean;
    /**
     * Verifies the HMAC-SHA256 signature of an incoming Stripe webhook payload.
     * Parses Stripe signature header (t=...,v1=...) and checks against replay attacks.
     */
    static verifyStripeSignature(rawBody: string | Buffer, signatureHeader: string, secret: string, toleranceSeconds?: number): boolean;
    /**
     * Processes incoming Lemon Squeezy billing webhooks.
     */
    static handleLemonSqueezyWebhook(payload: any): {
        action: string;
        license?: LicenseRecord;
    };
    /**
     * Processes incoming Stripe billing webhooks.
     */
    static handleStripeWebhook(event: {
        type: string;
        data: {
            object: any;
        };
    }): {
        action: string;
        license?: LicenseRecord;
    };
}
