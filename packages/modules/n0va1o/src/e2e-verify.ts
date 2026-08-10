/**
 * End-to-end verification — run with: npx tsx src/e2e-verify.ts
 */
import { encryptToken, decryptToken, generatePKCE, signState, verifyState } from "./crypto";
import { compileRecipe, validateRecipe, recipeIdFor } from "./recipe-compiler";
import { registerTrigger, processWebhookEvent, verifyWebhookSignature, generateTriggerId } from "./triggers";
import { ADAPTERS } from "./adapters";

let pass = 0, fail = 0;
const assert = (cond: boolean, msg: string) => { if (cond) { pass++; } else { fail++; console.log("FAIL:", msg); } };

async function main() {
  // 1. Crypto: encryption roundtrip
  const enc = encryptToken("sk-test-12345", "ws-abc");
  const dec = decryptToken(enc, "ws-abc");
  assert(dec === "sk-test-12345", "encryption roundtrip");

  // 2. Crypto: different workspace = different ciphertext
  const enc2 = encryptToken("sk-test-12345", "ws-xyz");
  assert(enc !== enc2, "different workspace = different ciphertext");

  // 3. Crypto: wrong workspace fails to decrypt (throws)
  let threw = false;
  try { decryptToken(enc, "ws-wrong"); } catch { threw = true; }
  assert(threw === true, "wrong workspace throws on decryption");

  // 4. Crypto: PKCE
  const pkce = generatePKCE();
  assert(pkce.verifier.length > 30, "PKCE verifier length");
  assert(pkce.challenge.length > 30, "PKCE challenge length");
  assert(pkce.verifier !== pkce.challenge, "PKCE verifier != challenge");

  // 5. Crypto: signed state
  const state = signState("ws-123", "github", "nonce456");
  const verified = verifyState(state);
  assert(verified.valid === true, "state verification");
  assert(verified.workspaceId === "ws-123", "state workspaceId");
  assert(verified.provider === "github", "state provider");

  // 6. Crypto: tampered state rejected
  const tampered = state.slice(0, -4) + "dead";
  assert(verifyState(tampered).valid === false, "tampered state rejected");

  // 7. Recipe compiler
  const recipe = compileRecipe("Test Recipe", "A test", [
    { provider: "github", tool: "list_repos", input: { owner: "octocat" }, output: { ok: true, message: "ok" }, latencyMs: 100 },
    { provider: "slack", tool: "post_message", input: { channel: "general", text: "hi" }, output: { ok: true, message: "sent" }, latencyMs: 50 },
  ]);
  assert(recipe.steps.length === 2, "recipe steps count");
  assert(recipe.name === "Test Recipe", "recipe name");

  // 8. Recipe validation
  const valid = validateRecipe(recipe);
  assert(valid.valid === true, "recipe validation passes");

  // 9. Recipe with invalid adapter
  const badRecipe = compileRecipe("Bad", "x", [
    { provider: "nonexistent", tool: "noop", input: {}, output: { ok: true, message: "" }, latencyMs: 0 },
  ]);
  assert(validateRecipe(badRecipe).valid === false, "invalid recipe detected");

  // 10. Recipe ID determinism
  const id1 = recipeIdFor("test", recipe.steps);
  const id2 = recipeIdFor("test", recipe.steps);
  assert(id1 === id2, "recipe ID deterministic");

  // 11. Triggers: register and fire
  const triggerId = generateTriggerId();
  registerTrigger({
    id: triggerId, workspaceId: "ws-test", provider: "github", eventType: "push",
    steps: [{ provider: "slack", tool: "post_message", input: { channel: "#eng", text: "Push!" } }],
    enabled: true,
  });
  const results = await processWebhookEvent("ws-test", {
    provider: "github", eventType: "push", payload: { ref: "main" }, timestamp: new Date(),
  });
  assert(results.length === 1, "trigger fired");
  assert(results[0].fired === true, "trigger result fired");

  // 12. Triggers: webhook signature verification
  const { createHmac } = await import("node:crypto");
  const secret = "whsec_test123";
  const body = '{"event":"test"}';
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  assert(verifyWebhookSignature(secret, body, sig) === true, "webhook signature valid");
  assert(verifyWebhookSignature(secret, body, "bad") === false, "webhook signature invalid");

  // 13. Adapter count
  assert(Object.keys(ADAPTERS).length >= 50, "adapter count >= 50");

  // 14. Provider diversity
  const providers = new Set(Object.keys(ADAPTERS).map(k => k.split(":")[0]));
  assert(providers.size >= 25, "provider diversity >= 25");

  console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
  console.log(`ADAPTERS: ${Object.keys(ADAPTERS).length} endpoints across ${providers.size} providers`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
