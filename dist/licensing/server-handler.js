"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseServerHandler = void 0;
const crypto = __importStar(require("crypto"));
/**
 * Serverless / Edge Handler for Edge Guardian Commercial Licensing.
 * Can be deployed to Cloudflare Workers, Vercel, Supabase Functions, or Node.js.
 */
class LicenseServerHandler {
    /**
     * Generates a cryptographically secure Edge Guardian license key.
     */
    static generateLicenseKey(tier) {
        const prefix = tier === 'AGENCY_FLEET' ? 'eg_agency_' : 'eg_live_';
        const randomHex = crypto.randomBytes(16).toString('hex');
        return `${prefix}${randomHex}`;
    }
    /**
     * Verifies the HMAC-SHA256 signature of an incoming Lemon Squeezy webhook payload.
     * Uses crypto.timingSafeEqual to prevent timing attacks.
     */
    static verifyLemonSqueezySignature(rawBody, signatureHex, secret) {
        if (!rawBody || !signatureHex || !secret)
            return false;
        try {
            const hmac = crypto.createHmac('sha256', secret);
            hmac.update(rawBody);
            const digest = hmac.digest('hex');
            const sigBuf = Buffer.from(signatureHex, 'hex');
            const digestBuf = Buffer.from(digest, 'hex');
            if (sigBuf.length !== digestBuf.length) {
                return false;
            }
            return crypto.timingSafeEqual(sigBuf, digestBuf);
        }
        catch {
            return false;
        }
    }
    /**
     * Verifies the HMAC-SHA256 signature of an incoming Stripe webhook payload.
     * Parses Stripe signature header (t=...,v1=...) and checks against replay attacks.
     */
    static verifyStripeSignature(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
        if (!rawBody || !signatureHeader || !secret)
            return false;
        try {
            const items = signatureHeader.split(',');
            let timestamp = '';
            const signatures = [];
            for (const item of items) {
                const [key, value] = item.trim().split('=');
                if (key === 't') {
                    timestamp = value;
                }
                else if (key === 'v1') {
                    signatures.push(value);
                }
            }
            if (!timestamp || signatures.length === 0) {
                return false;
            }
            // Check for timestamp replay attack
            const timestampSec = parseInt(timestamp, 10);
            const nowSec = Math.floor(Date.now() / 1000);
            if (Math.abs(nowSec - timestampSec) > toleranceSeconds) {
                return false;
            }
            const payload = `${timestamp}.${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8')}`;
            const hmac = crypto.createHmac('sha256', secret);
            hmac.update(payload);
            const expectedDigest = hmac.digest('hex');
            const expectedBuf = Buffer.from(expectedDigest, 'hex');
            for (const sig of signatures) {
                const sigBuf = Buffer.from(sig, 'hex');
                if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
                    return true;
                }
            }
            return false;
        }
        catch {
            return false;
        }
    }
    /**
     * Processes incoming Lemon Squeezy billing webhooks.
     */
    static handleLemonSqueezyWebhook(payload) {
        const eventName = payload?.meta?.event_name;
        const customData = payload?.meta?.custom_data || {};
        const email = payload?.data?.attributes?.user_email || 'customer@example.com';
        const variantName = (payload?.data?.attributes?.variant_name || '').toLowerCase();
        const isAgency = variantName.includes('agency') || customData.tier === 'agency';
        const tier = isAgency ? 'AGENCY_FLEET' : 'PRO';
        if (eventName === 'order_created' || eventName === 'subscription_created') {
            const key = this.generateLicenseKey(tier);
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 365); // 1 year default
            const record = {
                key,
                customerEmail: email,
                tier,
                status: 'ACTIVE',
                createdAt: new Date().toISOString(),
                expiresAt: expiresAt.toISOString(),
                orderId: String(payload?.data?.id || ''),
            };
            return { action: 'LICENSE_GENERATED', license: record };
        }
        if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
            return { action: 'SUBSCRIPTION_TERMINATED' };
        }
        return { action: 'IGNORED' };
    }
    /**
     * Processes incoming Stripe billing webhooks.
     */
    static handleStripeWebhook(event) {
        const obj = event.data.object;
        if (event.type === 'checkout.session.completed' || event.type === 'customer.subscription.created') {
            const email = obj.customer_email || obj.customer_details?.email || 'customer@example.com';
            const isAgency = obj.amount_total >= 14000; // e.g. $149 tier
            const tier = isAgency ? 'AGENCY_FLEET' : 'PRO';
            const key = this.generateLicenseKey(tier);
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 365);
            const record = {
                key,
                customerEmail: email,
                tier,
                status: 'ACTIVE',
                createdAt: new Date().toISOString(),
                expiresAt: expiresAt.toISOString(),
                orderId: obj.id,
            };
            return { action: 'LICENSE_GENERATED', license: record };
        }
        return { action: 'IGNORED' };
    }
}
exports.LicenseServerHandler = LicenseServerHandler;
//# sourceMappingURL=server-handler.js.map