/**
 * N0VA1O Schema Modifiers — pre-LLM redaction of dangerous parameters.
 *
 * Executed before tool definitions are exposed to the LLM. Prevents privilege
 * escalation by hiding dangerous fields, capping numerical values, and
 * masking PII in responses.
 *
 * Spec §4.2: Schema Modifiers
 */
import { createHash } from "node:crypto";

export interface SchemaModifierContext {
  role: string;
  workspaceId: string;
  provider: string;
  tool: string;
  isDestructive: boolean;
}

export interface ModifierResult {
  /** Whether the tool should be visible to the LLM at all */
  visible: boolean;
  /** Modified input schema with dangerous fields removed */
  inputSchema: Record<string, unknown>;
  /** Fields that were redacted (for audit) */
  redactedFields: string[];
  /** Fields that were value-capped (for audit) */
  cappedFields: string[];
}

/** Fields that should never be visible to an LLM */
const DANGEROUS_FIELDS: Record<string, string[]> = {
  "*": ["delete_account", "modify_billing", "transfer_ownership", "api_secret", "private_key", "root_password"],
  github: ["delete_repository", "force_push"],
  stripe: ["create_charge", "refund"],
  slack: ["kick_user", "delete_channel"],
  jira: ["delete_project", "delete_issue"],
  hubspot: ["delete_contact", "delete_company"],
  shopify: ["delete_product", "cancel_order"],
};

/** Fields with numerical caps per role */
const VALUE_CAPS: Record<string, Record<string, number>> = {
  stripe: { amount: 500000 }, // $5,000 max for non-owners
  shopify: { quantity: 100 },
  jira: { maxResults: 50 },
};

/** PII field patterns that should be masked in responses */
const PII_PATTERNS = [
  { pattern: /email/i, mask: "***@***.com" },
  { pattern: /phone/i, mask: "***-***-****" },
  { pattern: /ssn|social_security/i, mask: "***-**-****" },
  { pattern: /credit_card|card_number/i, mask: "****-****-****-****" },
  { pattern: /password|secret|token/i, mask: "[REDACTED]" },
];

/**
 * Apply schema modifiers to a tool definition before exposing it to the LLM.
 * Hides dangerous fields, caps numerical values, and masks PII.
 */
export function applySchemaModifiers(
  inputSchema: Record<string, unknown>,
  ctx: SchemaModifierContext,
): ModifierResult {
  const redactedFields: string[] = [];
  const cappedFields: string[] = [];

  // Deep clone the schema
  const modified = JSON.parse(JSON.stringify(inputSchema)) as Record<string, unknown>;

  // 1. Field redaction — remove dangerous fields
  const dangerous = [...(DANGEROUS_FIELDS["*"] ?? []), ...(DANGEROUS_FIELDS[ctx.provider] ?? [])];
  const properties = (modified.properties ?? {}) as Record<string, unknown>;

  for (const field of dangerous) {
    if (field in properties) {
      delete properties[field];
      redactedFields.push(field);
    }
  }

  // 2. Value capping — limit numerical parameters based on role
  const caps = VALUE_CAPS[ctx.provider] ?? {};
  for (const [field, maxVal] of Object.entries(caps)) {
    const prop = properties[field] as Record<string, unknown> | undefined;
    if (prop && (prop.type === "number" || prop.type === "integer")) {
      if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
        prop.maximum = maxVal;
        prop.description = `${prop.description ?? ""} (capped at ${maxVal} for ${ctx.role})`;
        cappedFields.push(field);
      }
    }
  }

  // 3. Hide destructive tools from non-owner roles
  let visible = true;
  if (ctx.isDestructive && ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    visible = false;
  }

  return { visible, inputSchema: modified, redactedFields, cappedFields };
}

/**
 * Mask PII in a response object before returning it to the LLM.
 */
export function maskPiiInResponse(data: unknown): unknown {
  if (typeof data === "string") {
    for (const { pattern, mask } of PII_PATTERNS) {
      if (pattern.test(data)) return mask;
    }
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(maskPiiInResponse);
  }
  if (data && typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const matchedPattern = PII_PATTERNS.find((p) => p.pattern.test(key));
      if (matchedPattern && typeof value === "string") {
        result[key] = matchedPattern.mask;
      } else {
        result[key] = maskPiiInResponse(value);
      }
    }
    return result;
  }
  return data;
}

/** Generate a content hash for integrity verification */
export function contentHash(data: unknown): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16);
}
