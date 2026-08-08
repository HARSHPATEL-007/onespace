export type SensitivityLevel =
  "public" | "internal" | "confidential" | "restricted";

export interface RedactionRule {
  pattern: RegExp;
  sensitivity: SensitivityLevel;
  action: "mask" | "summarize" | "remove";
  replacement: string;
}

export class RiskAdaptiveRedaction {
  private rules: RedactionRule[] = [
    {
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      sensitivity: "restricted",
      action: "mask",
      replacement: "***-**-****",
    },
    {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      sensitivity: "confidential",
      action: "mask",
      replacement: "[EMAIL_REDACTED]",
    },
    {
      pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      sensitivity: "restricted",
      action: "mask",
      replacement: "****-****-****-****",
    },
    {
      pattern: /\b(password|secret|token|key)\s*[:=]\s*\S+/gi,
      sensitivity: "restricted",
      action: "remove",
      replacement: "[CREDENTIAL_REMOVED]",
    },
  ];

  redact(
    text: string,
    maxSensitivity: SensitivityLevel = "confidential",
  ): string {
    const levels: Record<SensitivityLevel, number> = {
      public: 0,
      internal: 1,
      confidential: 2,
      restricted: 3,
    };
    const maxLevel = levels[maxSensitivity];

    let result = text;
    for (const rule of this.rules) {
      if (levels[rule.sensitivity] <= maxLevel) {
        result = result.replace(rule.pattern, rule.replacement);
      }
    }
    return result;
  }

  addRule(rule: RedactionRule): void {
    this.rules.push(rule);
  }
}
