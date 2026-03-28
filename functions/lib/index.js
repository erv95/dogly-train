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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserAccount = exports.checkBoostExpiration = exports.onReviewWrite = exports.activateBoost = exports.stripeWebhook = exports.createCheckoutSession = void 0;
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
// Payments (Stripe)
var payments_1 = require("./payments");
Object.defineProperty(exports, "createCheckoutSession", { enumerable: true, get: function () { return payments_1.createCheckoutSession; } });
Object.defineProperty(exports, "stripeWebhook", { enumerable: true, get: function () { return payments_1.stripeWebhook; } });
// Coins & Boost
var coins_1 = require("./coins");
Object.defineProperty(exports, "activateBoost", { enumerable: true, get: function () { return coins_1.activateBoost; } });
// Reviews
var reviews_1 = require("./reviews");
Object.defineProperty(exports, "onReviewWrite", { enumerable: true, get: function () { return reviews_1.onReviewWrite; } });
// Admin & GDPR
var admin_1 = require("./admin");
Object.defineProperty(exports, "checkBoostExpiration", { enumerable: true, get: function () { return admin_1.checkBoostExpiration; } });
Object.defineProperty(exports, "deleteUserAccount", { enumerable: true, get: function () { return admin_1.deleteUserAccount; } });
//# sourceMappingURL=index.js.map