import { applySchemaModifiers, maskPiiInResponse } from "./schema-modifiers";
import { runAuthOptimizer, runRateLimitPredictor, runErrorClassifier, getPluginStatus } from "./plugins";
import { requiresHitlReview, signDecision } from "./hitl";

let pass = 0, fail = 0;
const assert = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };

// Schema Modifiers
const schema = { type: "object", properties: { name: { type: "string" }, delete_account: { type: "boolean" }, amount: { type: "number" } } } as Record<string, unknown>;
const result = applySchemaModifiers(schema, { role: "MEMBER", workspaceId: "ws1", provider: "stripe", tool: "create_charge", isDestructive: false });
const props = (result.inputSchema.properties ?? {}) as Record<string, unknown>;
assert(!("delete_account" in props), "dangerous field redacted");
assert(result.redactedFields.includes("delete_account"), "redacted field tracked");
assert((props.amount as Record<string, unknown> | undefined)?.maximum === 500000, "amount capped for non-owner");

// PII masking
const masked = maskPiiInResponse({ email: "john@example.com", name: "John", phone: "555-1234" });
assert((masked as any).email === "***@***.com", "email masked");
assert((masked as any).name === "John", "non-PII preserved");

// Plugins
const authResult = runAuthOptimizer(new Date(Date.now() + 5 * 60000));
assert(authResult.shouldRefresh === true, "auth optimizer triggers refresh");

const rateResult = runRateLimitPredictor([429, 429, 200, 429, 200]);
assert(rateResult.shouldThrottle === true, "rate limit predictor detects throttling");

const errResult = runErrorClassifier(429, "Rate limited");
assert(errResult.retryable === true && errResult.category === "rate_limit", "error classifier works");

// HITL
assert(requiresHitlReview(0.9, true) === true, "high risk requires HITL");
assert(requiresHitlReview(0.1, false) === false, "low risk skips HITL");
assert(signDecision("room1", true, "admin").length === 32, "decision signature generated");

// Plugin status
const status = getPluginStatus();
assert(status.length === 8, "8 plugin slots");

console.log(`ENHANCEMENT TESTS: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
