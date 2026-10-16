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
exports.AppDetector = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const sanitizer_js_1 = require("./sanitizer.js");
class AppDetector {
    /**
     * Deterministically resolves Shopify application identity.
     * Primary key: `client_id` in shopify.app.toml (immutable Shopify Partners ID).
     * Secondary fallback: GITHUB_REPOSITORY (org/repo) or package.json name.
     */
    static detect(projectRoot = '.', config) {
        const resolvedRoot = path.resolve(projectRoot);
        const repoFromEnv = process.env.GITHUB_REPOSITORY?.trim() || undefined;
        const category = this.detectCategory(resolvedRoot, config);
        // 1. Inspect shopify.app.toml or shopify.app.*.toml
        const tomlCandidates = ['shopify.app.toml'];
        try {
            if (fs.existsSync(resolvedRoot)) {
                const files = fs.readdirSync(resolvedRoot);
                for (const file of files) {
                    if (file.startsWith('shopify.app.') && file.endsWith('.toml') && file !== 'shopify.app.toml') {
                        tomlCandidates.push(file);
                    }
                }
            }
        }
        catch { }
        for (const candidate of tomlCandidates) {
            const candidatePath = path.join(resolvedRoot, candidate);
            if (fs.existsSync(candidatePath)) {
                try {
                    const raw = fs.readFileSync(candidatePath, 'utf-8');
                    const content = (0, sanitizer_js_1.maskComments)(raw, candidatePath);
                    const clientIdMatch = content.match(/client_id\s*=\s*["']([^"']+)["']/i);
                    const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/i);
                    const handleMatch = content.match(/handle\s*=\s*["']([^"']+)["']/i);
                    const clientId = clientIdMatch ? clientIdMatch[1].trim() : undefined;
                    const appName = nameMatch ? nameMatch[1].trim() : undefined;
                    const handle = handleMatch ? handleMatch[1].trim() : undefined;
                    if (clientId || appName) {
                        return {
                            appId: clientId || repoFromEnv || appName || path.basename(resolvedRoot),
                            name: appName || clientId || path.basename(resolvedRoot),
                            handle,
                            repository: repoFromEnv,
                            category,
                            source: 'shopify.app.toml',
                        };
                    }
                }
                catch { }
            }
        }
        // 2. Check Environment Variables
        const envClientId = process.env.SHOPIFY_APP_CLIENT_ID?.trim();
        const envAppName = process.env.SHOPIFY_APP_NAME?.trim();
        if (envClientId || (repoFromEnv && envAppName)) {
            return {
                appId: envClientId || repoFromEnv || 'shopify-app',
                name: envAppName || envClientId || repoFromEnv || 'Shopify Application',
                repository: repoFromEnv,
                category,
                source: 'env',
            };
        }
        // 3. Inspect package.json
        const packageJsonPath = path.join(resolvedRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                if (pkg.name) {
                    return {
                        appId: repoFromEnv || pkg.name,
                        name: pkg.name,
                        repository: repoFromEnv,
                        category,
                        source: 'package.json',
                    };
                }
            }
            catch { }
        }
        // 4. Fallback to folder name / repo
        const fallbackName = repoFromEnv || path.basename(resolvedRoot);
        return {
            appId: fallbackName,
            name: fallbackName,
            repository: repoFromEnv,
            category,
            source: 'directory',
        };
    }
    /**
     * Dynamically resolves the primary application category:
     * Maps to Shopify Section 5 Category-Specific Requirements:
     * 'discounts', 'subscriptions', 'returns_exchanges', 'product_bundles',
     * 'product_reviews', 'forms', 'invoices_receipts', 'carrier_services',
     * 'fulfillment_services', 'email_marketing', 'sms_marketing',
     * 'ads', 'affiliates', 'analytics', or 'general' ('orders', 'shipping', 'payments').
     */
    static detectCategory(projectRoot = '.', config) {
        // 1. Explicit configuration takes precedence
        if (config?.category) {
            return config.category;
        }
        const resolvedRoot = path.resolve(projectRoot);
        // 2. Inspect shopify.app.toml or shopify.app.*.toml
        const tomlCandidates = ['shopify.app.toml'];
        try {
            if (fs.existsSync(resolvedRoot)) {
                const files = fs.readdirSync(resolvedRoot);
                for (const file of files) {
                    if (file.startsWith('shopify.app.') && file.endsWith('.toml') && file !== 'shopify.app.toml') {
                        tomlCandidates.push(file);
                    }
                }
            }
        }
        catch { }
        let tomlContent = '';
        for (const candidate of tomlCandidates) {
            const candidatePath = path.join(resolvedRoot, candidate);
            if (fs.existsSync(candidatePath)) {
                try {
                    const raw = fs.readFileSync(candidatePath, 'utf-8');
                    tomlContent = (0, sanitizer_js_1.maskComments)(raw, candidatePath);
                    break;
                }
                catch { }
            }
        }
        const scopesMatch = tomlContent.match(/scopes\s*=\s*(?:"([^"]*)"|\[([\s\S]*?)\])/i);
        const scopesStr = (scopesMatch ? (scopesMatch[1] || scopesMatch[2] || '') : '').toLowerCase();
        const hasDiscountScope = scopesStr.includes('discount');
        const hasSubscriptionScope = scopesStr.includes('subscription');
        const hasReturnScope = scopesStr.includes('return');
        const hasFulfillmentScope = scopesStr.includes('fulfillment');
        const hasDeliveryScope = scopesStr.includes('delivery') || scopesStr.includes('shipping') || scopesStr.includes('carrier');
        const hasPaymentScope = scopesStr.includes('payment');
        const hasOrderScope = scopesStr.includes('order');
        const hasPixelScope = scopesStr.includes('pixel');
        // 3. Inspect extensions directory
        const extensionsDir = path.join(resolvedRoot, 'extensions');
        let hasDiscountExtension = false;
        let hasSubscriptionExtension = false;
        let hasBundlesExtension = false;
        let hasReturnsExtension = false;
        let hasReviewsExtension = false;
        let hasInvoicesExtension = false;
        let hasWebPixelExtension = false;
        let hasDeliveryExtension = false;
        let hasPaymentExtension = false;
        if (fs.existsSync(extensionsDir)) {
            try {
                const extFolders = fs.readdirSync(extensionsDir);
                for (const folder of extFolders) {
                    const extPath = path.join(extensionsDir, folder);
                    if (fs.existsSync(extPath) && fs.statSync(extPath).isDirectory()) {
                        const extTomlPath = path.join(extPath, 'shopify.extension.toml');
                        if (fs.existsSync(extTomlPath)) {
                            const extToml = fs.readFileSync(extTomlPath, 'utf-8').toLowerCase();
                            if (extToml.includes('discount'))
                                hasDiscountExtension = true;
                            if (extToml.includes('subscription') || extToml.includes('customer-account.order-index.block.render'))
                                hasSubscriptionExtension = true;
                            if (extToml.includes('cart_transform') || extToml.includes('cart-transform') || extToml.includes('bundle'))
                                hasBundlesExtension = true;
                            if (extToml.includes('return') || extToml.includes('exchange'))
                                hasReturnsExtension = true;
                            if (extToml.includes('flow') && (extToml.includes('review') || extToml.includes('rating')))
                                hasReviewsExtension = true;
                            if (extToml.includes('admin.order-details.action') || extToml.includes('admin.order-index.action'))
                                hasInvoicesExtension = true;
                            if (extToml.includes('web_pixel') || extToml.includes('analytics.publish'))
                                hasWebPixelExtension = true;
                            if (extToml.includes('delivery') || extToml.includes('shipping') || extToml.includes('carrier'))
                                hasDeliveryExtension = true;
                            if (extToml.includes('payment'))
                                hasPaymentExtension = true;
                        }
                    }
                }
            }
            catch { }
        }
        // 4. Inspect app name & handle
        const nameMatch = tomlContent.match(/name\s*=\s*["']([^"']+)["']/i);
        const handleMatch = tomlContent.match(/handle\s*=\s*["']([^"']+)["']/i);
        const nameOrHandle = `${nameMatch ? nameMatch[1] : ''} ${handleMatch ? handleMatch[1] : ''} ${path.basename(resolvedRoot)}`.toLowerCase();
        // 5. Categorization logic according to Shopify Section 5 Taxonomy
        // 5.1 Subscriptions (Section 5.14)
        if (hasSubscriptionExtension || hasSubscriptionScope || /\b(subscription|subscriptions|recurring|recharge|autoship|subscribe)\b/i.test(nameOrHandle)) {
            return 'subscriptions';
        }
        // 5.2 Product Bundles (Section 5.10)
        if (hasBundlesExtension || /\b(bundle|bundler|bundles|multipack|mix[- ]and[- ]match|bundle-builder)\b/i.test(nameOrHandle)) {
            return 'product_bundles';
        }
        // 5.3 Returns and Exchanges (Section 5.12)
        if (hasReturnsExtension || hasReturnScope || /\b(return|returns|exchange|exchanges|rma|reverse-logistics|returns-portal)\b/i.test(nameOrHandle)) {
            return 'returns_exchanges';
        }
        // 5.4 Invoices & Receipts (Section 5.9)
        if (hasInvoicesExtension || /\b(invoice|invoices|receipt|receipts|packing[- ]slip|pdf[- ]print)\b/i.test(nameOrHandle)) {
            return 'invoices_receipts';
        }
        // 5.5 Product Reviews (Section 5.11)
        if (hasReviewsExtension || /\b(review|reviews|rating|ratings|testimonial|ugc)\b/i.test(nameOrHandle)) {
            return 'product_reviews';
        }
        // 5.6 Forms (Section 5.7)
        if (/\b(form|forms|survey|quiz|popup|lead[- ]capture)\b/i.test(nameOrHandle)) {
            return 'forms';
        }
        // 5.7 Discounts (Section 5.5)
        if (hasDiscountExtension || (hasDiscountScope && !hasDeliveryScope && !hasPaymentScope && !hasOrderScope) || /\b(discount|discounts|wholesale|coupon|promo|bogo)\b/i.test(nameOrHandle)) {
            return 'discounts';
        }
        // 5.8 Email Marketing (Section 5.6)
        if (/\b(email|newsletter|abandoned[- ]cart[- ]email)\b/i.test(nameOrHandle)) {
            return 'email_marketing';
        }
        // 5.9 SMS Marketing (Section 5.13)
        if (/\b(sms|text[- ]marketing|sms[- ]notifications)\b/i.test(nameOrHandle)) {
            return 'sms_marketing';
        }
        // 5.10 Ads (Section 5.1)
        if (/\b(ad|ads|adwords|tiktok[- ]ads|meta[- ]ads|facebook[- ]pixel)\b/i.test(nameOrHandle)) {
            return 'ads';
        }
        // 5.11 Affiliates (Section 5.2)
        if (/\b(affiliate|affiliates|referral|partner[- ]rewards)\b/i.test(nameOrHandle)) {
            return 'affiliates';
        }
        // 5.12 Analytics (Section 5.3)
        if (hasWebPixelExtension || hasPixelScope || /\b(analytics|heatmaps|visitor[- ]tracking)\b/i.test(nameOrHandle)) {
            return 'analytics';
        }
        // 5.13 Fulfillment Services (Section 5.8)
        if (hasFulfillmentScope || /\b(fulfillment|3pl|warehouse)\b/i.test(nameOrHandle)) {
            return 'fulfillment_services';
        }
        // 5.14 Carrier Services / Shipping (Section 5.4)
        if (/\b(carrier|postage|freight)\b/i.test(nameOrHandle)) {
            return 'carrier_services';
        }
        if (hasDeliveryExtension || hasDeliveryScope || /\b(shipping|delivery)\b/i.test(nameOrHandle)) {
            return 'shipping';
        }
        // Backward compatibility for generic categories
        if (hasPaymentExtension || hasPaymentScope || /\b(payment|checkout-payment|gateway)\b/i.test(nameOrHandle)) {
            return 'payments';
        }
        if (hasOrderScope || /\b(order|orders|draft[-_]?orders)\b/i.test(nameOrHandle)) {
            return 'orders';
        }
        return 'general';
    }
}
exports.AppDetector = AppDetector;
//# sourceMappingURL=app-detector.js.map