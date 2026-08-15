export const MODULE = "approvals";

export const REQUEST_TYPES = {
  PO_APPROVAL: "PO_APPROVAL",
  INVOICE_APPROVAL: "INVOICE_APPROVAL",
  EXPENSE_APPROVAL: "EXPENSE_APPROVAL",
  PAYMENT_RELEASE: "PAYMENT_RELEASE",
  VENDOR_ONBOARDING: "VENDOR_ONBOARDING",
  ACCESS_REQUEST: "ACCESS_REQUEST",
  BUDGET_EXCEPTION: "BUDGET_EXCEPTION",
  JOURNAL_ENTRY: "JOURNAL_ENTRY",
  GENERAL: "GENERAL",
} as const;

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  PO_APPROVAL: "Purchase order",
  INVOICE_APPROVAL: "Invoice approval",
  EXPENSE_APPROVAL: "Expense approval",
  PAYMENT_RELEASE: "Payment release",
  VENDOR_ONBOARDING: "Vendor onboarding",
  ACCESS_REQUEST: "Access request",
  BUDGET_EXCEPTION: "Budget exception",
  JOURNAL_ENTRY: "Journal entry",
  GENERAL: "General approval",
};

export const STATUS = {
  DETECTED: "DETECTED",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;

export const ERP_SYNC = {
  NOT_SYNCED: "NOT_SYNCED",
  PENDING_SYNC: "PENDING_SYNC",
  SYNCED: "SYNCED",
  SYNC_FAILED: "SYNC_FAILED",
} as const;

export const DOWNSTREAM = {
  NONE: "NONE",
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export const ERP_PROVIDERS = {
  MOCK: "MOCK",
  XERO: "XERO",
  QUICKBOOKS: "QUICKBOOKS",
} as const;

export const AUDIT_ACTION = {
  DETECTED: "DETECTED",
  RAISED: "RAISED",
  ROUTED: "ROUTED",
  ESCALATED: "ESCALATED",
  REMINDED: "REMINDED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  REQUEST_INFO: "REQUEST_INFO",
  INFO_PROVIDED: "INFO_PROVIDED",
  COMMENTED: "COMMENTED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  REASSIGNED: "REASSIGNED",
  ERP_WRITE_BACK: "ERP_WRITE_BACK",
  ERP_SYNC_FAILED: "ERP_SYNC_FAILED",
  ERP_SYNC_RETRIED: "ERP_SYNC_RETRIED",
  DOWNSTREAM_TRIGGERED: "DOWNSTREAM_TRIGGERED",
  DOWNSTREAM_FAILED: "DOWNSTREAM_FAILED",
} as const;

/** Decision values used by decide() and carried in events. */
export const DECISION = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  REQUEST_INFO: "REQUEST_INFO",
} as const;

export const MAX_SYNC_ATTEMPTS = 5;

/** Detection: explicit approval intent phrases, grouped by request type. */
export const INTENT_PATTERNS: Record<string, Array<{ re: RegExp; weight: number }>> = {
  PO_APPROVAL: [
    { re: /\b(?:please\s+)?(?:approve|sign\s*[- ]off|release|authorize)\b.{0,60}\b(?:po|purchase\s+order|order)\b/i, weight: 0.8 },
    { re: /\bpo\s*(?:#|no\.?|number)?\s*\d+/i, weight: 0.6 },
    { re: /\bpurchase\s+order\b/i, weight: 0.5 },
    { re: /\b(?:release|place|issue)\s+(?:the\s+)?(?:po|order)\b/i, weight: 0.7 },
  ],
  INVOICE_APPROVAL: [
    { re: /\b(?:please\s+)?(?:approve|sign\s*[- ]off|authorize|pay)\b.{0,60}\b(?:invoice|bill)\b/i, weight: 0.8 },
    { re: /\binvoice\s*(?:#|no\.?|number)?\s*\d+/i, weight: 0.6 },
    { re: /\binvoice\b.{0,80}\b(?:approv|sign\s*[- ]off|pay)/i, weight: 0.7 },
  ],
  EXPENSE_APPROVAL: [
    { re: /\b(?:please\s+)?(?:approve|reimburse|sign\s*[- ]off)\b.{0,60}\b(?:expense|reimbursement|receipts?)\b/i, weight: 0.75 },
    { re: /\bexpense\s*(?:report|claim)\b/i, weight: 0.55 },
  ],
  PAYMENT_RELEASE: [
    { re: /\b(?:approve|authorize|release)\b.{0,60}\b(?:payment|pay\s+run|wire|transfer)\b/i, weight: 0.8 },
    { re: /\bpay\s+(?:the\s+)?(?:vendor|supplier|invoice)\b/i, weight: 0.6 },
  ],
  VENDOR_ONBOARDING: [
    { re: /\b(?:approve|authorize)\b.{0,60}\b(?:vendor|supplier)\b/i, weight: 0.7 },
    { re: /\bnew\s+vendor\b/i, weight: 0.55 },
    { re: /\bvendor\s+onboarding\b/i, weight: 0.7 },
  ],
  ACCESS_REQUEST: [
    { re: /\b(?:please\s+)?(?:approve|grant|authorize)\b.{0,60}\b(?:access|permission|role|group)\b/i, weight: 0.75 },
    { re: /\brequest(?:ing|s)?\s+access\b/i, weight: 0.55 },
    { re: /\baccess\s+request\b/i, weight: 0.6 },
  ],
  BUDGET_EXCEPTION: [
    { re: /\bbudget\s+exception\b/i, weight: 0.8 },
    { re: /\b(?:over|exceed|above)\b.{0,40}\bbudget\b/i, weight: 0.6 },
    { re: /\bbudget\b.{0,60}\b(?:approve|sign\s*[- ]off|variance)\b/i, weight: 0.6 },
  ],
  JOURNAL_ENTRY: [
    { re: /\b(?:approve|post|authorize)\b.{0,60}\bjournal\s+entry\b/i, weight: 0.75 },
    { re: /\bjournal\s+entry\b.{0,60}\b(?:approv|post)\b/i, weight: 0.7 },
  ],
  GENERAL: [
    { re: /\b(?:please\s+)?approve\b/i, weight: 0.55 },
    { re: /\bneeds?\s+(?:your\s+)?(?:approval|sign\s*[- ]off|signoff)\b/i, weight: 0.6 },
    { re: /\brequires?\s+approval\b/i, weight: 0.55 },
  ],
};

/** Money matcher — $ amounts, with or without cents/thousands separators. */
export const MONEY_RE = /\$\s*([0-9][0-9,]*)(?:\.([0-9]{2}))?/;

/** ERP-status phrases (invoice changed/paid, PO status) — extra evidence signal. */
export const ERP_STATUS_RE = /\b(?:invoice|po|payment)\b.{0,50}\b(?:status|changed|updated|paid|overdue|posted)\b/i;

/** Cost-center hint from channel topic/name, e.g. "cost center: eng" or "[cc=eng]". */
export const COST_CENTER_RE = /(?:cost\s*center|cc)\s*[:=]\s*([a-z0-9_-]+)/i;
