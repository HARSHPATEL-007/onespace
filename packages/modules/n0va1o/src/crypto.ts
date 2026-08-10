/**
 * N0VA1O token encryption — AES-256-GCM with per-tenant envelope keys.
 *
 * Each workspace gets a derived encryption key (from a master secret + workspaceId).
 * Tokens are encrypted at rest so DB dumps / backups never expose plaintext credentials.
 *
 * Format: `${iv_hex}:${auth_tag_hex}:${ciphertext_hex}`
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 16;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function masterSecret(): string {
  return process.env["N0VA1O_MASTER_SECRET"] ?? process.env["AUTH_SECRET"] ?? "n0va1o-dev-master-secret-change-me";
}

/** Derive a stable 256-bit key for a workspace from the master secret. */
function deriveKey(workspaceId: string): Buffer {
  const salt = createHash("sha256").update(`n0va1o:${workspaceId}`).digest();
  return scryptSync(masterSecret(), salt, KEY_BYTES);
}

export function encryptToken(plaintext: string, workspaceId: string): string {
  const key = deriveKey(workspaceId);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(envelope: string, workspaceId: string): string {
  const key = deriveKey(workspaceId);
  const parts = envelope.split(":");
  if (parts.length !== 3) {
    // Legacy fallback: token stored plaintext (migration path)
    return envelope;
  }
  const ivHex = parts[0]!;
  const tagHex = parts[1]!;
  const cipherHex = parts[2]!;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(cipherHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Generate a PKCE code verifier + challenge pair for OAuth flows. */
export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Generate a signed OAuth state token (HMAC-SHA256) that can be verified without DB storage. */
export function signState(workspaceId: string, provider: string, nonce: string): string {
  const payload = `${workspaceId}|${provider}|${nonce}`;
  const sig = createHash("sha256").update(`${masterSecret()}:${payload}`).digest("hex").slice(0, 32);
  return `${payload}|${sig}`;
}

export function verifyState(state: string): { valid: boolean; workspaceId: string; provider: string; nonce: string } {
  const parts = state.split("|");
  if (parts.length !== 4) return { valid: false, workspaceId: "", provider: "", nonce: "" };
  const workspaceId = parts[0] ?? "";
  const provider = parts[1] ?? "";
  const nonce = parts[2] ?? "";
  const sig = parts[3] ?? "";
  const expected = createHash("sha256").update(`${masterSecret()}:${workspaceId}|${provider}|${nonce}`).digest("hex").slice(0, 32);
  const valid = timingSafeCompare(sig, expected);
  return { valid, workspaceId, provider, nonce };
}

function timingSafeCompare(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  let result = 0;
  for (let i = 0; i < ba.length; i++) result |= ba[i]! ^ bb[i]!;
  return result === 0;
}
