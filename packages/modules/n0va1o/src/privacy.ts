/**
 * N0VA1O Privacy Classification — core platform (spec §2.3).
 *
 * Files, fields, messages, and tool outputs carry privacy classification labels.
 * The system uses these labels to drive redaction, truncation, masking, or
 * quarantine before content reaches the LLM or external integrations.
 */

export type PrivacyLabel = "public" | "internal" | "confidential" | "restricted";

export const PRIVACY_RANK: Record<PrivacyLabel, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

export interface ClassifiedContent {
  content: string;
  label: PrivacyLabel;
  /** Whether this content was quarantined (blocked from LLM/external). */
  quarantined: boolean;
  /** Actions applied during classification. */
  actions: PrivacyAction[];
}

export type PrivacyAction = "none" | "redacted" | "truncated" | "masked" | "quarantined" | "truncated+masked";

export interface ClassificationRule {
  label: PrivacyLabel;
  /** Maximum length before truncation. */
  maxLength?: number;
  /** Whether this label triggers quarantine. */
  quarantine?: boolean;
  /** Whether this label triggers masking. */
  mask?: boolean;
}

export const DEFAULT_CLASSIFICATION: Record<PrivacyLabel, ClassificationRule> = {
  public: { label: "public" },
  internal: { label: "internal", maxLength: 50000 },
  confidential: { label: "confidential", maxLength: 10000, mask: true },
  restricted: { label: "restricted", maxLength: 2000, mask: true, quarantine: true },
};

/**
 * Classify and protect content according to its privacy label. Returns the
 * protected content plus the actions taken. Content labeled "restricted" is
 * quarantined by default and never reaches the LLM.
 */
export function classifyContent(
  content: string,
  label: PrivacyLabel,
  rules: Record<PrivacyLabel, ClassificationRule> = DEFAULT_CLASSIFICATION,
): ClassifiedContent {
  const rule = rules[label];
  const actions: PrivacyAction[] = ["none"];
  let output = content;

  if (rule.maxLength && output.length > rule.maxLength) {
    output = output.slice(0, rule.maxLength) + `...[truncated ${content.length - rule.maxLength} chars]`;
    actions[0] = "truncated";
  }

  if (rule.mask) {
    output = applyMasking(output, label);
    actions[0] = actions[0] === "none" ? "masked" : "truncated+masked";
  }

  const quarantined = rule.quarantine === true;
  if (quarantined) {
    actions.push("quarantined");
  }

  return { content: output, label, quarantined, actions };
}

function applyMasking(content: string, label: PrivacyLabel): string {
  let masked = content;
  // Mask emails.
  masked = masked.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/g, "<email>");
  // Mask potential identifiers.
  if (label === "restricted") {
    masked = masked.replace(new RegExp("\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b", "g"), "<token-id>");
    masked = masked.replace(new RegExp("\\b\\d{3}-\\d{2}-\\d{4}\\b", "g"), "<pii>");
  }
  return masked;
}

/** Whether content with this label may be sent to the LLM context. */
export function canReachLLM(label: PrivacyLabel): boolean {
  return label !== "restricted";
}

/** Whether content with this label may be included in external integrations. */
export function canReachExternal(label: PrivacyLabel): boolean {
  return label === "public" || label === "internal";
}

/** Coerce an unknown string label to a valid PrivacyLabel. */
export function normalizeLabel(label: string | undefined | null): PrivacyLabel {
  const v = (label ?? "internal").toLowerCase();
  if (v === "public" || v === "internal" || v === "confidential" || v === "restricted") {
    return v;
  }
  return "internal";
}
