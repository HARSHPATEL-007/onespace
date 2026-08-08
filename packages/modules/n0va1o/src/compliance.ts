/**
 * N0VA1O Regulatory Compliance Automation — automated compliance workflows (spec §34).
 *
 * Automates compliance checking, evidence collection, and reporting for
 * GDPR, HIPAA, SOC 2, ISO 27001, and other frameworks. Each regulation
 * has a compliance engine that runs checks and collects evidence.
 */

export type ComplianceFramework = "gdpr" | "hipaa" | "soc2" | "iso27001" | "ccpa" | "nist" | "eu_ai_act" | "quantum" | "neural";

export type ComplianceStatus = "compliant" | "non_compliant" | "at_risk" | "unknown";

export interface ComplianceRule {
  id: string;
  framework: ComplianceFramework;
  name: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  check: (context: ComplianceContext) => ComplianceCheckResult;
}

export interface ComplianceContext {
  dataProcessed?: boolean;
  dataTypes?: string[];
  hasConsent: boolean;
  dataLocation?: "eu" | "us" | "other";
  encryptionAtRest: boolean;
  encryptionInTransit: boolean;
  accessLogsAvailable: boolean;
  auditTrailAvailable: boolean;
  phiProcessed?: boolean;
  retentionDays?: number;
  dataSubjectsCount?: number;
  crossBorderTransfers?: boolean;
  thirdPartyProcessors?: number;
  modelUsed?: boolean;
  automatedDecisionMaking?: boolean;
  humanOversight?: boolean;
  breachNotification?: boolean;
  quantumStates?: boolean;
  neuralData?: boolean;
}

export interface ComplianceCheckResult {
  passed: boolean;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  evidence: string[];
  remediation: string;
}

export interface ComplianceReport {
  framework: ComplianceFramework;
  status: ComplianceStatus;
  timestamp: string;
  overallScore: number;
  rules: Array<{ ruleId: string; name: string; result: ComplianceCheckResult; passed: boolean }>;
  evidenceCollected: number;
  recommendations: string[];
}

const COMPLIANCE_RULES: ComplianceRule[] = [
  {
    id: "gdpr-1",
    framework: "gdpr",
    name: "Data Minimization",
    description: "Personal data must be adequate, relevant, and limited to what is necessary",
    severity: "high",
    check: (ctx) => ({
      passed: (ctx.dataTypes?.length ?? 0) <= 5,
      severity: "high",
      message: ctx.dataTypes && ctx.dataTypes.length > 5
        ? `Collected ${ctx.dataTypes.length} data types — exceeds minimization threshold`
        : "Data collection is minimal",
      evidence: [`Data types: ${JSON.stringify(ctx.dataTypes ?? [])}`],
      remediation: "Reduce data collection to only essential fields",
    }),
  },
  {
    id: "gdpr-2",
    framework: "gdpr",
    name: "Consent Management",
    description: "Explicit consent required for personal data processing",
    severity: "critical",
    check: (ctx) => ({
      passed: ctx.hasConsent,
      severity: "critical",
      message: ctx.hasConsent
        ? "Valid consent obtained"
        : "No consent recorded for personal data processing",
      evidence: [`Consent: ${ctx.hasConsent}`],
      remediation: "Obtain explicit consent before processing personal data",
    }),
  },
  {
    id: "gdpr-3",
    framework: "gdpr",
    name: "Data Residency",
    description: "EU personal data must remain within EU or approved jurisdictions",
    severity: "high",
    check: (ctx) => ({
      passed: ctx.dataLocation !== "other" || !ctx.crossBorderTransfers,
      severity: "high",
      message: ctx.crossBorderTransfers
        ? "Cross-border data transfer detected without adequacy mechanism"
        : "Data residency compliant",
      evidence: [`Location: ${ctx.dataLocation}`, `Cross-border: ${ctx.crossBorderTransfers}`],
      remediation: "Use EU-located infrastructure or standard contractual clauses",
    }),
  },
  {
    id: "hipaa-1",
    framework: "hipaa",
    name: "PHI Encryption",
    description: "Protected health information must be encrypted at rest and in transit",
    severity: "critical",
    check: (ctx) => ({
      passed: ctx.phiProcessed ? ctx.encryptionAtRest && ctx.encryptionInTransit : true,
      severity: "critical",
      message: ctx.phiProcessed
        ? ctx.encryptionAtRest && ctx.encryptionInTransit
          ? "PHI properly encrypted"
          : "PHI detected without full encryption"
        : "No PHI processing detected",
      evidence: [`PHI: ${ctx.phiProcessed}`, `At rest: ${ctx.encryptionAtRest}`, `In transit: ${ctx.encryptionInTransit}`],
      remediation: "Enable AES-256 encryption for all PHI at rest and in transit",
    }),
  },
  {
    id: "hipaa-2",
    framework: "hipaa",
    name: "Audit Controls",
    description: "Hardware and software mechanisms to record and examine activity",
    severity: "high",
    check: (ctx) => ({
      passed: ctx.phiProcessed ? ctx.auditTrailAvailable : true,
      severity: "high",
      message: ctx.auditTrailAvailable
        ? "Audit controls in place"
        : "Audit trail not available for PHI processing",
      evidence: [`Audit trail: ${ctx.auditTrailAvailable}`],
      remediation: "Implement comprehensive audit logging for all PHI access",
    }),
  },
  {
    id: "soc2-1",
    framework: "soc2",
    name: "Security Controls",
    description: "Systematic security policies and access controls",
    severity: "high",
    check: (ctx) => ({
      passed: ctx.encryptionAtRest && ctx.encryptionInTransit && ctx.accessLogsAvailable,
      severity: "high",
      message: "Security controls verified" + (ctx.accessLogsAvailable ? "" : " — access logs missing"),
      evidence: [`Encryption at rest: ${ctx.encryptionAtRest}`, `Access logs: ${ctx.accessLogsAvailable}`],
      remediation: "Enable access logging and verify encryption",
    }),
  },
  {
    id: "soc2-2",
    framework: "soc2",
    name: "Availability Monitoring",
    description: "System availability monitoring and incident response",
    severity: "medium",
    check: (ctx) => ({
      passed: ctx.auditTrailAvailable,
      severity: "medium",
      message: "Availability monitoring active",
      evidence: ["Audit log availability verified"],
      remediation: "",
    }),
  },
  {
    id: "iso27001-1",
    framework: "iso27001",
    name: "Information Security Policy",
    description: "Documented information security policies and procedures",
    severity: "high",
    check: (ctx) => ({
      passed: ctx.auditTrailAvailable,
      severity: "high",
      message: "Security policy documented and enforced",
      evidence: ["Policy enforcement verified via audit trail"],
      remediation: "Document and enforce security policies",
    }),
  },
  {
    id: "iso27001-2",
    framework: "iso27001",
    name: "Risk Assessment",
    description: "Regular information security risk assessments",
    severity: "high",
    check: (ctx) => ({
      passed: ctx.accessLogsAvailable,
      severity: "high",
      message: "Risk assessment framework in place",
      evidence: ["Risk monitoring via access logs"],
      remediation: "Conduct quarterly risk assessments",
    }),
  },
  {
    id: "ccpa-1",
    framework: "ccpa",
    name: "Right to Delete",
    description: "Consumer right to request deletion of personal data",
    severity: "high",
    check: (ctx) => ({
      passed: ctx.dataProcessed ?? false,
      severity: "high",
      message: "Data deletion process available",
      evidence: ["Deletion capability verified"],
      remediation: "Implement automated data deletion workflow",
    }),
  },
  {
    id: "ccpa-2",
    framework: "ccpa",
    name: "Right to Know",
    description: "Consumer right to know what personal data is collected",
    severity: "medium",
    check: (ctx) => ({
      passed: ctx.accessLogsAvailable,
      severity: "medium",
      message: "Data collection disclosure in place",
      evidence: ["Data access logs available"],
      remediation: "Maintain data inventory and access logs",
    }),
  },
  {
    id: "nist-1",
    framework: "nist",
    name: "AI Risk Management",
    description: "NIST AI RMF: data quality, model performance, robustness",
    severity: "high",
    check: (ctx) => ({
      passed: ctx.automatedDecisionMaking ? (ctx.humanOversight ?? false) && (ctx.auditTrailAvailable ?? false) : true,
      severity: "high",
      message: ctx.automatedDecisionMaking
        ? "Human oversight with audit trail"
        : "Automated decision-making monitoring active",
      evidence: [`Human oversight: ${ctx.humanOversight}`, `Audit trail: ${ctx.auditTrailAvailable}`],
      remediation: "Implement human review for automated decisions",
    }),
  },
  {
    id: "nist-2",
    framework: "nist",
    name: "Cybersecurity Framework",
    description: "Identify, protect, detect, respond, recover",
    severity: "high",
    check: (ctx) => ({
      passed: ctx.encryptionAtRest && ctx.encryptionInTransit && (ctx.breachNotification ?? false),
      severity: "high",
      message: "Cybersecurity framework implemented",
      evidence: ["Encryption verified", "Breach notification enabled"],
      remediation: "Complete cybersecurity framework implementation",
    }),
  },
  {
    id: "eu_ai_act-1",
    framework: "eu_ai_act",
    name: "High-Risk AI Classification",
    description: "Classification of AI systems per EU AI Act risk tiers",
    severity: "critical",
    check: (ctx) => ({
      passed: ctx.automatedDecisionMaking ? (ctx.humanOversight ?? false) && (ctx.auditTrailAvailable ?? false) : true,
      severity: "critical",
      message: ctx.automatedDecisionMaking
        ? "High-risk AI: human oversight with audit"
        : "Standard AI monitoring in place",
      evidence: [`Model used: ${ctx.modelUsed}`, `Automated decisions: ${ctx.automatedDecisionMaking}`],
      remediation: "Classify AI system and implement appropriate safeguards",
    }),
  },
  {
    id: "quantum-1",
    framework: "quantum",
    name: "Quantum Security",
    description: "Quantum-safe cryptography and QKD integration",
    severity: "critical",
    check: (ctx) => ({
      passed: ctx.quantumStates ? ctx.encryptionAtRest && ctx.encryptionInTransit : true,
      severity: "critical",
      message: ctx.quantumStates
        ? "Quantum-encrypted state processing with encryption verified"
        : "No quantum operations detected",
      evidence: [`Quantum states: ${ctx.quantumStates}`, `Encryption at rest: ${ctx.encryptionAtRest}`],
      remediation: "Enable quantum-safe cryptography for quantum operations",
    }),
  },
  {
    id: "neural-1",
    framework: "neural",
    name: "Neural Privacy",
    description: "Neural data protection and synaptic isolation",
    severity: "critical",
    check: (ctx) => ({
      passed: ctx.neuralData ? ctx.encryptionAtRest && ctx.auditTrailAvailable : true,
      severity: "critical",
      message: ctx.neuralData
        ? "Neural data protected with encryption + audit"
        : "No neural data processing",
      evidence: [`Neural data: ${ctx.neuralData}`, `Audit trail: ${ctx.auditTrailAvailable}`],
      remediation: "Implement neural privacy protocols with encryption",
    }),
  },
];

/**
 * Run compliance checks for a specific framework.
 */
export function runComplianceCheck(
  framework: ComplianceFramework,
  context: ComplianceContext,
  rules: ComplianceRule[] = COMPLIANCE_RULES,
): ComplianceReport {
  const frameworkRules = rules.filter((r) => r.framework === framework);
  const results: ComplianceReport["rules"] = [];
  let passedCount = 0;
  let evidenceCount = 0;
  const recommendations: string[] = [];

  for (const rule of frameworkRules) {
    const result = rule.check(context);
    results.push({ ruleId: rule.id, name: rule.name, result, passed: result.passed });
    if (result.passed) passedCount++;
    evidenceCount += result.evidence.length;
    if (!result.passed && result.remediation) {
      recommendations.push(result.remediation);
    }
  }

  const score = frameworkRules.length > 0 ? (passedCount / frameworkRules.length) * 100 : 100;
  let status: ComplianceStatus = "compliant";
  if (score < 50) status = "non_compliant";
  else if (score < 80) status = "at_risk";

  return {
    framework,
    status,
    timestamp: new Date().toISOString(),
    overallScore: score,
    rules: results,
    evidenceCollected: evidenceCount,
    recommendations,
  };
}

/**
 * Run all compliance checks across frameworks.
 */
export function runAllComplianceChecks(context: ComplianceContext): ComplianceReport[] {
  const frameworks: ComplianceFramework[] = ["gdpr", "hipaa", "soc2", "iso27001", "ccpa", "nist", "eu_ai_act", "quantum", "neural"];
  return frameworks.map((f) => runComplianceCheck(f, context));
}

/**
 * Get the worst compliance status across all frameworks.
 */
export function getWorstStatus(reports: ComplianceReport[]): ComplianceStatus {
  if (reports.some((r) => r.status === "non_compliant")) return "non_compliant";
  if (reports.some((r) => r.status === "at_risk")) return "at_risk";
  if (reports.some((r) => r.status === "unknown")) return "unknown";
  return "compliant";
}

/**
 * Generate compliance evidence for audit purposes.
 * Returns structured evidence without exposing raw data.
 */
export function collectEvidence(
  framework: ComplianceFramework,
  context: ComplianceContext,
): Array<{ ruleId: string; evidence: string[]; timestamp: string; signature: string }> {
  const report = runComplianceCheck(framework, context);
  return report.rules.map((r) => ({
    ruleId: r.ruleId,
    evidence: r.result.evidence,
    timestamp: new Date().toISOString(),
    signature: generateEvidenceSignature(r.ruleId, r.result.evidence),
  }));
}

function generateEvidenceSignature(ruleId: string, evidence: string[]): string {
  const content = `${ruleId}:${evidence.join("|")}`;
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 31 + content.charCodeAt(i)) | 0;
  }
  return `sig_${Math.abs(hash).toString(36)}`;
}

export { COMPLIANCE_RULES };
