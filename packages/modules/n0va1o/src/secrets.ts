/**
 * N0VA1O Secretless Execution — core platform (spec §2.1).
 *
 * Enforces that credentials NEVER appear in model context, sandbox logs, or
 * exported artifacts. The gateway mediates all token use; this module provides
 * the enforcement primitives: secret detection, scrubbing from any output, and
 * rotation tracking so credentials rotate according to policy.
 */

export const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._\-]{12,}/gi,
  /\b(?:sk|pk)_[A-Za-z0-9]{8,}/g,
  /\b[A-Za-z0-9]{20,64}\b/g,
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
];

/** Detect whether a string contains any secret material. */
export function containsSecret(value: string): boolean {
  if (!value) return false;
  return SECRET_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(value);
  });
}

/**
 * Scrub all secret material from an arbitrary value. Recurses into objects,
 * arrays, and strings. Returns a sanitized deep copy safe for logs, exports,
 * and LLM context.
 */
export function scrubSecrets(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubSecrets(v);
    }
    return out;
  }
  return value;
}

/** Scrub a single string, replacing every secret span with <secret-redacted>. */
export function scrubString(value: string): string {
  let out = value;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "<secret-redacted>");
  }
  return out;
}

/** Names of fields that should always be treated as secrets regardless of value. */
const SECRET_FIELD_NAMES = new Set([
  "token", "accessToken", "refreshToken", "password", "secret",
  "apiKey", "api_key", "privateKey", "private_key", "credential",
  "authorization", "auth", "cookie", "session",
]);

/**
 * Redact the values of known-secret fields in an object. This catches secrets
 * that don't match patterns (e.g. short keys) by field name.
 */
export function redactSecretFields(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(redactSecretFields);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELD_NAMES.has(k.toLowerCase())) {
        out[k] = "<secret-redacted>";
      } else {
        out[k] = redactSecretFields(v);
      }
    }
    return out;
  }
  return value;
}

export interface RotationStatus {
  connectionId: string;
  lastRotated: string;
  expiresAt: string | null;
  daysUntilExpiry: number;
  rotationDue: boolean;
}

/**
 * Compute rotation status for a connection. Rotation is due when the credential
 * is within `rotationWindowDays` of expiry or has exceeded `maxAgeDays`.
 */
export function rotationStatus(opts: {
  connectionId: string;
  lastRotated: Date | string;
  expiresAt: Date | string | null;
  rotationWindowDays?: number;
  maxAgeDays?: number;
  now?: Date;
}): RotationStatus {
  const now = opts.now ?? new Date();
  const lastRotated = new Date(opts.lastRotated);
  const expiresAt = opts.expiresAt ? new Date(opts.expiresAt) : null;
  const windowDays = opts.rotationWindowDays ?? 3;
  const maxAge = opts.maxAgeDays ?? 15;

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilExpiry = expiresAt ? (expiresAt.getTime() - now.getTime()) / msPerDay : Number.POSITIVE_INFINITY;
  const ageDays = (now.getTime() - lastRotated.getTime()) / msPerDay;

  return {
    connectionId: opts.connectionId,
    lastRotated: lastRotated.toISOString(),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    daysUntilExpiry: Math.round(daysUntilExpiry * 10) / 10,
    rotationDue: daysUntilExpiry <= windowDays || ageDays >= maxAge,
  };
}
