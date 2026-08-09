export { MailService, type MailFolder, type MailUnreadCounts, type MailStatus, type MailThreadView, type AiSuggestion } from "./server";
export { MailApp, type MailThread } from "./components";
export { getMailAgentTools, executeMailAgentTool } from "./agents";
export { MailProtocolEngine, defaultInboundConfig, defaultOutboundConfig } from "./protocols";
export { StorageEngine, BlobStorage, SearchEngine, CacheLayer, DeduplicationEngine } from "./storage";
export { SecurityPipeline, SpfEvaluator, DkimEngine, DmarcEvaluator, AntiSpamClassifier, AntivirusEngine, ContentSanitizer, ReputationEngine } from "./security";
export { WebhookEngine, SmtpRelayService, ApiKeyManager, restEndpoints, graphqlSchema } from "./api";
export { AdminEngine, AuditLogger, LegalHoldManager, RetentionPolicyEngine, ExportEngine, RbacEngine, systemRoles } from "./admin";
export { AiEngine, ThreadSummarizer, SmartReplyEngine, PhishingDetector, SemanticSearchEngine, ContentAnalyzer } from "./ai";
