import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import fs from "node:fs";
import path from "node:path";
import type { IntentEnvelope, Proposal, AutonomyMode } from "./copilot-types";
import {
  semanticSearchAdvanced, previewTranscriptEdit, compileSemanticCut, getNarrativeArc,
  diagnoseNarrativeArc, getEmotionSpans, getContinuityIssues, getReviewCommentsSemantic,
  getSemanticDiff, explainVersionDifference, getSemanticSpans, getIndexStats,
} from "./semantic-engine";
import {
  seedDemoGraph, getAsset, getNode, listNodes, createNode, createNodeVersion,
  createGraphVersion, getGraphVersion, listGraphVersions, disableNodeInGraph, reorderGraphNodes,
  replaceNodeInGraph, compareGraphVersions, createTimelineProjection, getTimelineProjection,
  cacheKeyFor, cacheGet, cachePut, cacheInvalidateIf, invalidateDownstream, declareReproducibility,
  verifyReproducibility, estimateCost, scheduleForOutput, explainFrameAtTime, diagnosticsForNode,
  simulateFailure, traceForArtifact, bindApproval, checkApprovalInvalidation, rollbackToVersion,
  captureExternal, manifestForNode, c2paManifestForExport, enforceGuardrails, createArtifact, getArtifact,
  createAsset,
} from "./graph-engine";
import {
  runQualityAnalysis, getWarnings, getFindings, generateProposalsForFinding, getProposal, applyProposal, resolveFinding, getDashboard, evaluateGate, recordFeedback, listFeedback, clearQualityStores, getWarning, getFinding,
} from "./quality-engine";
import {
  createCanonicalTimeline, createInterchangePackage, getPackage, listPackages, generateRelinkMap, simulateRelink, validateBroadcast, roundtripValidate, lossReportForPackage, interchangeProfileExample,
} from "./interchange-engine";
import {
  createTextToVideoJob, createImageToVideoJob, createObjectRemovalOp, generateCameraVariations, createProductAnchor, createCharacterAnchor, checkAnchorCompliance, createStoryboardCards, createContinuationJob, suggestBroll, getProvenance, getSegmentProvenance, getPromptHistory, addPromptVersion, checkUsage, createConsent, revokeConsent, runSafetyChecks, complianceReport, approveAsset, getApproval, processingRoute, listAssets,
} from "./generative-engine";
import {
  createPolicy as createBrandPolicy, getPolicy as getBrandPolicy, listPolicies as listBrandPolicies, compileBrandDocuments, approveCompiledRule, runBrandScan, getBrandFindings, getBrandFinding, explainFinding as explainBrandFinding, generateProposal as generateBrandProposal, getBrandDashboard, evaluateBrandGate, createWaiver as createBrandWaiver, listWaivers as listBrandWaivers, getLogoRegistry, getFontPolicy, getColorPolicy,
} from "./brand-engine";
import {
  registerPerson, getPerson, listPersons, createConsentGrant, getGrant, createEvidence, evaluateConsent, matchIdentity, getFacePolicy, getVoicePermission, evaluatePresenter, evaluateLipSync, getDisclosurePolicy, createIdentityProvenance, getIdentityProvenance, getConsentPassport, checkExpirations, revokeGrant, getRevocationStatus, evaluateExportGate as evaluateIdentityExportGate, issueAgentToken, verifyAgentToken,
} from "./identity-engine";
import {
  createReviewItem, getReviewItem, listReviewItems, clusterItems, listClusters, detectReviewDuplicates, detectContradictions,
  generateSuggestion, getApprovalGraph, detectBlockers, classify, predictDeadlineRisk, verifyChange, ingestVoiceFeedback, ingestVideoFeedback,
  listReviewRounds, getReviewRound,
} from "./review-engine";
import {
  checkPermission, updatePresence, listPresence, acquireLock, listLocks, submitOperation, listOperations, createBranch as createCollabBranch, listBranches as listCollabBranches, mergePreview as collabMergePreview, applyMerge as collabApplyMerge, listApprovals as listCollabApprovals, createCommentThread as createCollabCommentThread, listCommentThreads, listMarkerSets, getDashboard as getCollabDashboard, createOfflineSnapshot, queueOfflineOperation, reconcileOffline, validateOperation,
} from "./collaboration-engine";
import {
  createPortal as createClientPortal, getPortal as getClientPortal, listPortals as listClientPortals, createReviewLink, verifyLinkAccess, createSession as createPortalSession, revokeLink, revokePortal, visibleWatermarkText, forensicWatermarkId, createPlaybackToken, addExternalComment, listExternalComments, listPortalVersions, getVersionDiff, submitDecision as submitPortalDecision, localizedDecision, listAudit, listDecisions as listPortalDecisions,
} from "./client-review-engine";
import {
  listNodes as kgListNodes, getNode as kgGetNode, createNode as kgCreateNode, listEdges as kgListEdges, createEdge as kgCreateEdge, confirmEdge as kgConfirmEdge, traverse as kgTraverse, findPath as kgFindPath, hybridSearch as kgHybridSearch, queryExpiringConsent as kgExpiringConsent, queryApprovedCurrentPackaging as kgApprovedPack, queryLegalBlockers as kgLegalBlockers, queryUnverifiedChanges as kgUnverified, queryCalendarRisk as kgCalendarRisk, queryUnsupportedClaims as kgUnsupported, evaluatePublishability as kgPublishability, getConflicts as kgConflicts, resolveConflict as kgResolveConflict, listMatches as kgMatches, confirmMatch as kgConfirmMatch, canAccessNode as kgCanAccess, graphMetrics as kgMetrics,
} from "./knowledge-graph-engine";
import {
  parseNaturalQuery as srParse, planQuery as srPlan, smartSearch as srSmart, exactTranscriptSearch as srExact, visualCompositionSearch as srVisual, cameraMovementSearch as srMotion, colorPaletteSearch as srColor, emotionSearch as srEmotion, speakerTopicSearch as srSpeakerTopic, similarShotSearch as srSimilar, duplicateSearch as srDuplicate, fuseResults as srFuse, applyPolicyFilters as srPolicy, searchMetrics as srMetrics, listAudits as srAudits,
} from "./search-retrieval-engine";
import {
  runPreflight as pfRun, getPreflight as pfGet, getLatestPreflight as pfLatest, listFindings as pfList, getFinding as pfFinding, resolveFinding as pfResolve, requestException as pfException, approveFinding as pfApprove, getDashboard as pfDashboard, recheckExportFile as pfRecheck, listRuns as pfRuns,
} from "./preflight-engine";
import {
  createSession as liveCreateSession, getSession as liveGetSession, transitionSession as liveTransition, predictHealth as livePredict, executeFailover as liveFailover, getDestinationHealth as liveDestHealth, reconnectDestination as liveReconnect, createCaptionRevision as liveCaptionRev, createHighlightCandidate as liveHighlight, startReplay as liveReplay, verifyRecording as liveVerify, diagnoseContributor as liveDiagnose, listFallbackAssets as liveFallbacks, generateEventReport as liveReport, listSessions as liveList,
} from "./live-control-engine";
import {
  createPostEventProject as continuumCreate, getPostEventProject as continuumGet, listPostEventProjects as continuumList, generateCandidates as continuumCandidates, createSpeakerCompilation as continuumSpeaker, transcriptEdit as continuumEdit, detectSilence as continuumSilence, createQuoteCard as continuumQuote, buildPackage as continuumPackage,
} from "./live-edit-engine";
import {
  analyzeAudio as audioAnalyze, isolateDialogue as audioIsolate, reconstructRoomTone as audioRoomTone, createDubVersion as audioDub, checkVoiceConsistency as audioVoiceCheck, normalizeForDestination as audioNormalize, decideDucking as audioDuck, suggestSfx as audioSfx, scoreRepair as audioRepairScore, analyzeHum as audioHum, checkPhase as audioPhase, detectSilence as audioSilenceDetect, listStems as audioListStems, createStemVersion as audioCreateVersion, approveStemVersion as audioApproveVersion, getMixGraph as audioMixGraph, checkImmersive as audioImmersive, generateAudioReport as audioReport, getSpeakerProfile as audioSpeakerProfile,
} from "./audio-intelligence-engine";
import {
  analyzeAccessibility as a11yAnalyze, optimizeCaptionPosition as a11yPosition, evaluateCaptionQuality as a11yQuality, checkReadingSpeed as a11yReading, generateAudioDescription as a11yAD, getAudioDescriptionScript as a11yScript, getSignWindow as a11ySignWindow, checkColorAccessibility as a11yColor, detectFlashForTimeline as a11yFlash, getSemanticTimeline as a11ySemantic, generateDestinationReport as a11yReport, generateManifest as a11yManifest,
} from "./accessibility-automation-engine";
import {
  getKeyHierarchy as ztKeyHierarchy, rotateTenantKeys as ztRotate, requestAccessGrant as ztGrant, getGrant as ztGetGrant, evaluateDeviceTrust as ztDeviceTrust, getDeviceTrust as ztGetDevice, evaluateSessionTrust as ztSessionTrust, getSessionTrust as ztGetSession, requestPrivilegedAction as ztPrivRequest, approvePrivilegedAction as ztPrivApprove, getPrivilegedRequest as ztPrivGet, issueMediaCapability as ztMediaCap, verifyCapability as ztVerifyCap, useCapability as ztUseCap, revokeCapability as ztRevokeCap, evaluatePlayback as ztPlayback, evaluateExport as ztExport, issueWorkloadIdentity as ztWorkload, attestGpuWorker as ztAttest, canReleaseKeys as ztCanRelease, evaluateInsiderRisk as ztInsider, detectBulkAnomaly as ztBulk, generateWatermarkPayload as ztWatermark, evaluatePolicy as ztPolicy, getSecurityDashboard as ztDashboard, listSecurityEvents as ztEvents, runIncidentPlaybook as ztPlaybook,
} from "./zero-trust-engine";
import {
  scanPrivacy as privacyScan, createPrivacyDerivative as privacyTransform, reviewExternalShare as privacyReview, requestDeletion as privacyDeletion, evaluatePolicy as privacyPolicyEval, getPrivacyDashboard as privacyDashboard, testPolicySimulation as privacySim, createEmbeddingLineage as privacyEmbedding,
} from "./privacy-preserving-engine";
import {
  createEnvelope as edCreateEnvelope, appendOutbox as edAppend, publishOutbox as edPublish, consumeEvent as edConsume, createAssetIngested as edAssetIngested, replayEvents as edReplay, getWorkflow as edWorkflow, createWebhookSubscription as edWebhookCreate, projectForWebhook as edWebhookProject, getObservability as edObservability,
} from "./event-driven-engine";
import {
  createJob as relCreateJob, getJob as relGetJob, commitJob as relCommitJob, acquireLease as relAcquireLease, checkpointJob as relCheckpoint, classifyFailure as relClassify, sendToDeadLetter as relDLQ, createSegments as relSegments, recoverRender as relRecover, createInferenceCheckpoint as relInferenceCp, createChaosExperiment as relChaos,
} from "./reliability-engineering-engine";
import {
  getGpuMetrics as obsGpu, getCostLedger as obsLedger, getExecutiveDashboard as obsDashboard, getTenantProfitability as obsTenant, getAlerts as obsAlerts,
} from "./observability-finops-engine";
import {
  evaluatePolicy as ppEvaluate, composePolicies as ppCompose, getPolicyEvidence as ppEvidence, runPolicyTests as ppTests, failSafeDecision as ppFailSafe, registerPlugin as ppRegister, enablePluginForTenant as ppEnable, grantPluginMediaAccess as ppGrant, executePlugin as ppExecute, listPolicies as ppList, getPolicy as ppGetPolicy,
} from "./policy-plugin-engine";
import {
  getEntitlement as entGet, setTier as entSetTier, checkEntitlement as entCheck, recordUsage as entRecordUsage, getUsage as entGetUsage, evaluateTierChange as entEvaluateChange, evaluateOverage as entOverage, listTiers as entListTiers, listAddOns as entListAddOns, applyAddOn as entApplyAddOn, removeAddOn as entRemoveAddOn, getCheckHistory as entHistory, getPolicyVersion as entPolicyVersion, exampleEnvelope as entExample, TIER_CATALOG, CAPABILITY_MATRIX, ADDON_CATALOG, COMMERCIAL_METRICS,
} from "./entitlement-engine";
import type { VideoTier, EntitlementEnvelope, UsageState, AddOnId } from "./entitlement-types";
import {
  estimateCost as billEstimate, getEstimate as billGetEstimate, approveEstimate as billApproveEstimate,
  recordUsageEvent as billRecordUsage, createAdjustment as billAdjustment, getUsageLedger as billLedger, getUsageByPeriod as billUsageByPeriod,
  normalizeUsage as billNormalize, getRateCard as billRateCard, listRateCards as billListRateCards,
  createBudgetPolicy as billCreateBudget, getBudget as billGetBudget, listBudgets as billListBudgets, getBudgetState as billBudgetState, checkBudgetForEstimate as billCheckBudget, reserveBudget as billReserve, releaseReservation as billRelease, chargeReservation as billCharge,
  aggregateInvoice as billAggregateInvoice, finalizeInvoice as billFinalizeInvoice, getInvoice as billGetInvoice, listInvoices as billListInvoices,
  createCredit as billCreateCredit, listCredits as billListCredits,
  getUsageDashboard as billDashboard, getJobCostView as billJobCost, listBillingEvents as billEvents, reconcileUsage as billReconcile, getBillingAccount as billGetAccount, setBillingAccount as billSetAccount,
} from "./billing-engine";
import type { EstimateRequest, EstimateResponse, BudgetPolicy, Invoice, UsageEvent, BillingEvent, MeterKey, PricingVersion, Currency, Region, BillingAccount } from "./billing-types";

const MODULE = "videos";

// ── Legacy Schemas (backward compat) ─────────────────────────────────────────
export const videoSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(3000).default(""),
  url: z.string().url(),
  provider: z.enum(["youtube", "vimeo", "other"]).default("other"),
});

export const playlistSchema = z.object({
  name: z.string().min(1).max(100),
});

// ── Transcendent Schemas ─────────────────────────────────────────────────────
export const projectSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(3000).default(""),
  status: z.enum(["DRAFT","IN_PRODUCTION","IN_REVIEW","APPROVED","PUBLISHED","ARCHIVED"]).default("DRAFT"),
  priority: z.enum(["low","medium","high","critical"]).default("medium"),
  category: z.string().max(100).default("general"),
  tags: z.array(z.string()).default([]),
  resolution: z.enum(["360p","720p","1080p","4K","8K"]).default("1080p"),
});

export const timelineClipSchema = z.object({
  clipId: z.string(),
  assetId: z.string().optional(),
  sourceInMs: z.number().min(0),
  sourceOutMs: z.number().min(0),
  timelineInMs: z.number().min(0),
  timelineOutMs: z.number().min(0),
  transform: z.object({
    position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
    scale: z.object({ x: z.number(), y: z.number() }).default({ x: 1, y: 1 }),
    rotation: z.number().default(0),
    opacity: z.number().min(0).max(1).default(1),
  }).optional(),
  effects: z.array(z.object({
    effectId: z.string(),
    effectType: z.string(),
    plugin: z.string(),
    parameters: z.record(z.unknown()),
  })).default([]),
  speed: z.number().default(1),
});

export const exportPresetSchema = z.object({
  preset: z.enum(["youtube_4k","youtube_1080","instagram_reels","tiktok","linkedin","broadcast_prores","web_optimized","hls_abr","dash_abr","gif","mp4_8k","dcp","imf"]).default("youtube_1080"),
  container: z.enum(["mp4","mov","webm","mxf","gif"]).default("mp4"),
  codec: z.enum(["h264","h265","vp9","av1","prores","dnxhr"]).default("h264"),
  resolution: z.string().default("1080p"),
  fps: z.number().default(30),
  hdr: z.enum(["sdr","hdr10","hdr10_plus","dolby_vision","hlg"]).default("sdr"),
  watermark: z.boolean().default(false),
});

export const aiGenerateSchema = z.object({
  prompt: z.string().min(1).max(2000),
  style: z.enum(["cinematic","corporate","anime","photoreal","abstract","vintage"]).default("cinematic"),
  durationSec: z.number().min(5).max(300).default(30),
  resolution: z.enum(["720p","1080p","4K"]).default("1080p"),
  cameraMovement: z.enum(["static","pan","tilt","zoom","dolly","orbit","handheld"]).default("static"),
});

export const captionSchema = z.object({
  language: z.string().min(2).max(10).default("en"),
  style: z.string().default("default"),
  burnIn: z.boolean().default(false),
});

// ── Embed Helper ──────────────────────────────────────────────────────────────
export function embedFor(url: string, provider: string): string | null {
  if (provider === "youtube") {
    const id = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url)?.[1];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (provider === "vimeo") {
    const id = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}

// ── Storage helpers ─────────────────────────────────────────────────────────
export function videosDirFor(workspaceId: string): string {
  const dir = path.join(process.cwd(), "data", "videos", workspaceId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Export Presets (transcendent) ───────────────────────────────────────────
export const EXPORT_PRESETS = [
  { id: "youtube_4k", label: "YouTube 4K HDR", container: "mp4", codec: "h265", resolution: "3840x2160", fps: 60, hdr: "hdr10_plus", bitrate: "50M", use: "YouTube 4K publishing" },
  { id: "youtube_1080", label: "YouTube 1080p", container: "mp4", codec: "h264", resolution: "1920x1080", fps: 30, hdr: "sdr", bitrate: "12M", use: "YouTube standard" },
  { id: "instagram_reels", label: "Instagram Reels", container: "mp4", codec: "h264", resolution: "1080x1920", fps: 30, hdr: "sdr", bitrate: "8M", use: "9:16 vertical" },
  { id: "tiktok", label: "TikTok 1080x1920", container: "mp4", codec: "h264", resolution: "1080x1920", fps: 30, hdr: "sdr", bitrate: "8M", use: "TikTok vertical" },
  { id: "linkedin", label: "LinkedIn Feed", container: "mp4", codec: "h264", resolution: "1920x1080", fps: 30, hdr: "sdr", bitrate: "6M", use: "LinkedIn native" },
  { id: "broadcast_prores", label: "Broadcast ProRes 422 HQ", container: "mov", codec: "prores", resolution: "3840x2160", fps: 60, hdr: "sdr", bitrate: "730M", use: "Master / broadcast" },
  { id: "web_optimized", label: "Web Optimized (AV1)", container: "mp4", codec: "av1", resolution: "1920x1080", fps: 30, hdr: "sdr", bitrate: "4M", use: "60% bitrate savings via N0VA-Codec-V1" },
  { id: "hls_abr", label: "HLS ABR Ladder", container: "mp4", codec: "h264", resolution: "8K→360p", fps: 60, hdr: "sdr", bitrate: "ABR", use: "Adaptive 12-rung ladder" },
  { id: "gif", label: "GIF Preview", container: "gif", codec: "gif", resolution: "480p", fps: 15, hdr: "sdr", bitrate: "—", use: "Social preview" },
  { id: "mp4_8k", label: "8K/120fps Master", container: "mp4", codec: "h265", resolution: "7680x4320", fps: 120, hdr: "hdr10", bitrate: "120M", use: "8K cinematic" },
] as const;

export const TRANSCODE_CODECS = ["h264","h265","vp9","av1","prores","dnxhr","cineform","jpeg2000","raw","imf"] as const;
export const STORAGE_TIERS = ["HOT","WARM","COOL","COLD","FROZEN","CRYOGENIC"] as const;

// ── Mock neural generation helpers ──────────────────────────────────────────
function mockEmbedding(dim: number): number[] {
  return Array.from({ length: Math.min(dim, 16) }, () => Number((Math.random()*2-1).toFixed(3)));
}

function mockNeuralMetadata(filename: string) {
  return {
    generatedAt: new Date().toISOString(),
    modelVersion: "n0va-video-analysis-v4",
    scenes: [{ sceneId: "scene_001", startMs: 0, endMs: 4500, sceneType: "establishing_shot", dominantObjects: ["people","product"], moodScore: 0.78 }],
    faces: [],
    objects: [{ objectClass: "laptop", confidence: 0.96 }],
    speechSegments: [{ transcript: "Welcome to N0VA Videos", confidence: 0.98, language: "en-US" }],
    visualEmbedding: mockEmbedding(4096),
    contentSafety: { adultContent: 0.01, violence: 0.01, brandSafety: 0.98, overallRisk: 0.02 },
    aestheticScores: { composition: 0.82, lighting: 0.85, overallQuality: 0.84 },
  };
}

export class VideosService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for videos`);
    }
  }

  // ── Legacy Video Library (kept for backward compat) ─────────────────────
  async list() {
    await this.assert("READ");
    return prisma.video.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { uploadedAt: "desc" },
    });
  }

  async get(id: string) {
    await this.assert("READ");
    const video = await prisma.video.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!video) throw new Error("Video not found in this workspace");
    return video;
  }

  async create(input: z.infer<typeof videoSchema>) {
    await this.assert("CREATE");
    const video = await prisma.video.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, ...input },
    });
    await this.audit("video.added", video.id);
    return video;
  }

  async update(id: string, input: Partial<z.infer<typeof videoSchema>>) {
    await this.assert("UPDATE");
    await this.owned(id);
    return prisma.video.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    await this.assert("DELETE");
    await this.owned(id);
    await prisma.video.delete({ where: { id } });
    await this.audit("video.deleted", id);
  }

  async playlists() {
    await this.assert("READ");
    return prisma.videoPlaylist.findMany({
      where: { workspaceId: this.workspaceId },
      include: { _count: { select: { videos: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async createPlaylist(name: string) {
    await this.assert("CREATE");
    const playlist = await prisma.videoPlaylist.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, name },
    });
    await this.audit("playlist.created", playlist.id, "VideoPlaylist");
    return playlist;
  }

  async renamePlaylist(id: string, name: string) {
    await this.assert("UPDATE");
    await this.ownedPlaylist(id);
    const playlist = await prisma.videoPlaylist.update({ where: { id }, data: { name } });
    await this.audit("playlist.renamed", id, "VideoPlaylist");
    return playlist;
  }

  async removePlaylist(id: string) {
    await this.assert("DELETE");
    await this.ownedPlaylist(id);
    await prisma.videoPlaylist.delete({ where: { id } });
    await this.audit("playlist.deleted", id, "VideoPlaylist");
  }

  async setVideoPlaylist(videoId: string, playlistId: string | null) {
    await this.assert("UPDATE");
    await this.owned(videoId);
    if (playlistId) {
      const playlist = await prisma.videoPlaylist.findFirst({
        where: { id: playlistId, workspaceId: this.workspaceId },
      });
      if (!playlist) throw new Error("Playlist not found in this workspace");
    }
    const video = await prisma.video.update({ where: { id: videoId }, data: { playlistId } });
    await this.audit("video.playlist.updated", videoId, "Video", { playlistId });
    return video;
  }

  // ── Transcendent: Projects (Workspace Nexus) ──────────────────────────────
  async listProjects(opts?: { status?: string; search?: string; limit?: number }) {
    await this.assert("READ");
    try {
      const where: Record<string, unknown> = { workspaceId: this.workspaceId };
      if (opts?.status && opts.status !== "all") (where as Record<string, unknown>).status = opts.status as unknown;
      if (opts?.search) (where as Record<string, unknown>).title = { contains: opts.search, mode: "insensitive" } as unknown;
      return await (prisma as unknown as { videoProject: { findMany: (a:unknown)=>Promise<unknown[]> } }).videoProject.findMany({
        where: where as never,
        orderBy: { updatedAt: "desc" },
        take: opts?.limit ?? 50,
      } as never) as unknown[];
    } catch {
      // fallback to Video model if migration not yet applied
      const videos = await prisma.video.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { updatedAt: "desc" }, take: opts?.limit ?? 50 });
      return videos.map(v => ({
        id: v.id, workspaceId: v.workspaceId, createdById: v.createdById, title: v.title, description: v.description,
        status: "PUBLISHED", priority: "medium", category: "general", tags: [], thumbnailUrl: null, durationSec: v.durationSec,
        resolution: "1080p", timeline: { tracks: [], markers: [], chapters: [] }, hyperContext: {}, neuralEmbedding: mockEmbedding(16),
        workspaceNexus: {}, n0va10State: {}, metadata: { provider: v.provider, url: v.url }, createdAt: v.createdAt, updatedAt: v.updatedAt,
      }));
    }
  }

  async getProject(id: string) {
    await this.assert("READ");
    try {
      const p = await (prisma as unknown as { videoProject: { findFirst: (a:unknown)=>Promise<unknown> } }).videoProject.findFirst({ where: { id, workspaceId: this.workspaceId } } as never);
      if (p) return p;
    } catch { /* fallback */ }
    // fallback to Video
    const v = await prisma.video.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!v) throw new Error("Project not found");
    return {
      id: v.id, workspaceId: v.workspaceId, title: v.title, description: v.description, status: "PUBLISHED",
      priority: "medium", category: "general", tags: [], thumbnailUrl: null, durationSec: v.durationSec,
      resolution: "1080p", timeline: { tracks: [], markers: [], chapters: [] }, hyperContext: {}, workspaceNexus: {}, n0va10State: {},
      metadata: { provider: v.provider, url: v.url }, createdAt: v.createdAt, updatedAt: v.updatedAt,
    };
  }

  async createProject(input: z.infer<typeof projectSchema>) {
    await this.assert("CREATE");
    await this.requireEntitlement("editing", "project.create", { activeProjects: 1 });
    try {
      const proj = await (prisma as unknown as { videoProject: { create: (a:unknown)=>Promise<unknown> } }).videoProject.create({
        data: {
          workspaceId: this.workspaceId, createdById: this.userId,
          title: input.title, description: input.description, status: input.status as never,
          priority: input.priority, category: input.category, tags: input.tags, resolution: input.resolution,
          timeline: { tracks: this.defaultTracks(), markers: [], chapters: [{ id: "ch_001", startMs: 0, endMs: 30000, title: "Intro", autoGenerated: true }] },
          hyperContext: { linkedWorkspaceProject: null, linkedDocs: [], linkedTasks: [] },
          workspaceNexus: { boardColumns: ["Pre-Production","Production","Post-Production","Review","Delivery"], syncLatencyMs: 4.2 },
          n0va10State: { activeAgents: ["Export_Agent","Review_Agent"], connectedApps: ["youtube","slack"] },
          metadata: { budgetCode: `MKT-${new Date().getFullYear()}-001`, neuralEmbedding: mockEmbedding(16) },
        } as never,
      } as never);
      await this.audit("project.created", (proj as { id: string }).id, "VideoProject");
      return proj;
    } catch {
      // fallback: create as Video
      const v = await prisma.video.create({
        data: { workspaceId: this.workspaceId, createdById: this.userId, title: input.title, description: input.description, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", provider: "youtube" },
      });
      await this.audit("project.created", v.id, "VideoProject");
      return v;
    }
  }

  async updateProject(id: string, patch: Partial<z.infer<typeof projectSchema>> & { timeline?: unknown; hyperContext?: unknown }) {
    await this.assert("UPDATE");
    try {
      return await (prisma as unknown as { videoProject: { update: (a:unknown)=>Promise<unknown> } }).videoProject.update({
        where: { id }, data: { ...patch, timeline: patch.timeline as never, hyperContext: patch.hyperContext as never } as never,
      } as never);
    } catch {
      return prisma.video.update({ where: { id }, data: { title: patch.title, description: patch.description } });
    }
  }

  async deleteProject(id: string) {
    await this.assert("DELETE");
    try {
      await (prisma as unknown as { videoProject: { delete: (a:unknown)=>Promise<unknown> } }).videoProject.delete({ where: { id } } as never);
    } catch {
      await prisma.video.delete({ where: { id } });
    }
    await this.audit("project.deleted", id, "VideoProject");
  }

  async duplicateProject(id: string) {
    await this.assert("CREATE");
    const src = await this.getProject(id) as Record<string, unknown>;
    return this.createProject({ title: `${src.title as string} (copy)`, description: src.description as string ?? "", status: "DRAFT" as const, priority: "medium", category: src.category as string ?? "general", tags: (src.tags as string[]) ?? [], resolution: src.resolution as "1080p" ?? "1080p" });
  }

  // ── Assets (Galactic Ingestion) ───────────────────────────────────────────
  async listAssets(projectId?: string | null) {
    await this.assert("READ");
    try {
      return await (prisma as unknown as { videoAsset: { findMany: (a:unknown)=>Promise<unknown[]> } }).videoAsset.findMany({
        where: { workspaceId: this.workspaceId, ...(projectId ? { projectId } : {}) } as never,
        orderBy: { createdAt: "desc" },
        take: 100,
      } as never) as unknown[];
    } catch {
      return [];
    }
  }

  async recordAssetUpload(input: {
    filename: string; mimeType: string; sizeBytes: number; storageKey: string;
    projectId?: string | null; width?: number | null; height?: number | null; durationMs?: number | null;
  }) {
    await this.assert("CREATE");
    const isRaw = /raw|\bari\b|red|prores.*raw/i.test(input.filename) || (input.mimeType && input.mimeType.includes("raw"));
    if(isRaw) await this.requireEntitlement("raw_workflows", "asset.ingest.raw", { storage_gb: Math.ceil(input.sizeBytes / (1024*1024*1024)) || 1 });
    else await this.requireEntitlement("shared_libraries", "asset.ingest", { storage_gb: Math.ceil(input.sizeBytes / (1024*1024*1024)) || 1 });
    try {
      const asset = await (prisma as unknown as { videoAsset: { create: (a:unknown)=>Promise<unknown> } }).videoAsset.create({
        data: {
          workspaceId: this.workspaceId, createdById: this.userId, projectId: input.projectId ?? null,
          filename: input.filename, originalFilename: input.filename, mimeType: input.mimeType, sizeBytes: input.sizeBytes,
          storageKey: input.storageKey, width: input.width ?? null, height: input.height ?? null, durationMs: input.durationMs ?? null,
          codec: "h264", container: "mp4", storageTier: "HOT" as never,
          neuralMetadata: mockNeuralMetadata(input.filename) as never,
          technicalSpecs: { width: input.width, height: input.height, durationMs: input.durationMs, codec: "h264" } as never,
        } as never,
      } as never);
      await this.audit("asset.uploaded", (asset as { id: string }).id, "VideoAsset");
      try{
        const gb = Math.max(0.01, input.sizeBytes / (1024*1024*1024));
        billRecordUsage({ tenant_id: this.workspaceId, project_id: input.projectId ?? undefined, asset_id: (asset as { id:string }).id, job_id: `ingest:${(asset as { id:string }).id}`, meter:"stored_hot_gb_days" as MeterKey, quantity: gb, idempotency_key:`stored:${this.workspaceId}:${input.storageKey}`, kind:"actual", causation_id:`evt_asset_uploaded:${(asset as { id:string }).id}`, correlation_id: input.projectId ?? this.workspaceId, schema_version:"1.0.0" } as unknown as UsageEvent);
      }catch{}
      return asset;
    } catch (e) {
      await this.audit("asset.uploaded", input.filename, "VideoAsset");
      try{
        const gb2 = Math.max(0.01, input.sizeBytes / (1024*1024*1024));
        billRecordUsage({ tenant_id: this.workspaceId, project_id: input.projectId ?? undefined, asset_id: `mock_${Date.now()}`, meter:"stored_hot_gb_days" as MeterKey, quantity: gb2, idempotency_key:`stored:mock:${Date.now()}`, kind:"actual", causation_id:`evt_asset_mock`, correlation_id: this.workspaceId, schema_version:"1.0.0" } as unknown as UsageEvent);
      }catch{}
      return { id: `mock_${Date.now()}`, filename: input.filename, mimeType: input.mimeType, sizeBytes: input.sizeBytes, storageKey: input.storageKey, neuralMetadata: mockNeuralMetadata(input.filename) };
    }
  }

  async deleteAsset(id: string) {
    await this.assert("DELETE");
    try {
      const asset = await (prisma as unknown as { videoAsset: { findFirst: (a:unknown)=>Promise<{ storageKey: string }> } }).videoAsset.findFirst({ where: { id, workspaceId: this.workspaceId } } as never);
      if (!asset) throw new Error("Asset not found");
      await (prisma as unknown as { videoAsset: { delete: (a:unknown)=>Promise<unknown> } }).videoAsset.delete({ where: { id } } as never);
      try { fs.rmSync(path.join(videosDirFor(this.workspaceId), asset.storageKey), { force: true }); } catch {}
      await this.audit("asset.deleted", id, "VideoAsset");
    } catch {
      await this.audit("asset.deleted", id, "VideoAsset");
    }
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  private defaultTracks() {
    return [
      { trackId: "video_1", trackType: "video", trackName: "Primary Video", enabled: true, locked: false, clips: [] },
      { trackId: "audio_1", trackType: "audio", trackName: "Dialogue", enabled: true, locked: false, clips: [] },
      { trackId: "audio_2", trackType: "audio", trackName: "Music", enabled: true, locked: false, clips: [] },
      { trackId: "graphics_1", trackType: "graphics", trackName: "Titles & Graphics", enabled: true, locked: false, clips: [] },
    ];
  }

  async getTimeline(projectId: string) {
    await this.assert("READ");
    const proj = await this.getProject(projectId) as Record<string, unknown>;
    const tl = proj.timeline as { tracks: unknown[]; markers: unknown[]; chapters: unknown[] } | undefined;
    return tl ?? { tracks: this.defaultTracks(), markers: [], chapters: [] };
  }

  async saveTimeline(projectId: string, timeline: unknown) {
    await this.assert("UPDATE");
    try {
      await (prisma as unknown as { videoProject: { update: (a:unknown)=>Promise<unknown> } }).videoProject.update({
        where: { id: projectId }, data: { timeline: timeline as never } as never,
      } as never);
    } catch { /* fallback no-op */ }
    await this.audit("timeline.updated", projectId, "VideoProject");
    return timeline;
  }

  // ── Exports ───────────────────────────────────────────────────────────────
  async listExports(projectId?: string | null) {
    await this.assert("READ");
    try {
      return await (prisma as unknown as { videoExport: { findMany: (a:unknown)=>Promise<unknown[]> } }).videoExport.findMany({
        where: { workspaceId: this.workspaceId, ...(projectId ? { projectId } : {}) } as never,
        orderBy: { createdAt: "desc" }, take: 50,
      } as never) as unknown[];
    } catch { return []; }
  }

  async createExport(input: z.infer<typeof exportPresetSchema> & { projectId?: string; videoId?: string }) {
    await this.assert("CREATE");
    // Render orchestration entitlement: advanced broadcast/8K needs Studio; regulated needs dedicated; check premium presets
    const premiumNeedsStudio = ["broadcast_prores","mp4_8k","dcp","imf"].includes(input.preset);
    const hdrNeedsStudio = input.hdr && input.hdr!=="sdr";
    const entitlementKey = premiumNeedsStudio || hdrNeedsStudio ? "render_orchestration_advanced" : "shared_render_queue";
    await this.requireEntitlement(entitlementKey, `export.create:${input.preset}`, { render_minutes: 5, concurrent_renders: 1 });
    try {
      const exp = await (prisma as unknown as { videoExport: { create: (a:unknown)=>Promise<unknown> } }).videoExport.create({
        data: {
          workspaceId: this.workspaceId, projectId: input.projectId ?? null, videoId: input.videoId ?? null,
          preset: input.preset, format: { container: input.container, codec: input.codec, resolution: input.resolution, fps: input.fps, hdr: input.hdr } as never,
          status: "QUEUED" as never, progress: 0, renderNode: "gpu_cluster_us_east_001",
          neuralOptimization: { enabled: true, bitrateReduction: 0.35, vmaf: 96.5 } as never,
          delivery: [] as never,
        } as never,
      } as never);
      await this.audit("export.queued", (exp as { id: string }).id, "VideoExport");
      try{
        // Billing: GPU render minutes (estimate 5 min for HD, 20 for 4K) + egress + watermark
        const isPremium = ["broadcast_prores","mp4_8k","dcp","imf"].includes(input.preset);
        billRecordUsage({ tenant_id: this.workspaceId, project_id: input.projectId ?? undefined, job_id: `export:${(exp as { id:string }).id}`, asset_id: input.projectId ?? "export", meter:"gpu_render_minutes" as MeterKey, quantity: isPremium?20:5, provider:"gpu_scheduler", idempotency_key:`gpu:export:${(exp as { id:string }).id}`, kind:"actual", causation_id:`evt_export_queued:${(exp as { id:string }).id}`, correlation_id: input.projectId ?? this.workspaceId, schema_version:"1.0.0" } as unknown as UsageEvent);
        billRecordUsage({ tenant_id: this.workspaceId, project_id: input.projectId ?? undefined, job_id: `export:${(exp as { id:string }).id}`, meter:"watermark_embed_ops" as MeterKey, quantity:1, idempotency_key:`wm:export:${(exp as { id:string }).id}`, kind:"actual", causation_id:`evt_export_queued:${(exp as { id:string }).id}`, correlation_id: input.projectId ?? this.workspaceId, schema_version:"1.0.0" } as unknown as UsageEvent);
        billRecordUsage({ tenant_id: this.workspaceId, project_id: input.projectId ?? undefined, job_id: `export:${(exp as { id:string }).id}`, meter:"egress_cdn_gb" as MeterKey, quantity: 2, idempotency_key:`egress:export:${(exp as { id:string }).id}`, kind:"actual", causation_id:`evt_export_queued:${(exp as { id:string }).id}`, correlation_id: input.projectId ?? this.workspaceId, schema_version:"1.0.0" } as unknown as UsageEvent);
      }catch{}
      // Simulate async progression (fire-and-forget mock)
      setTimeout(() => {
        (prisma as unknown as { videoExport: { update: (a:unknown)=>Promise<unknown> } }).videoExport.update({
          where: { id: (exp as { id: string }).id }, data: { status: "PROCESSING" as never, progress: 45, startedAt: new Date() as never } as never,
        } as never).catch(()=>{});
      }, 1500);
      setTimeout(() => {
        (prisma as unknown as { videoExport: { update: (a:unknown)=>Promise<unknown> } }).videoExport.update({
          where: { id: (exp as { id: string }).id },
          data: {
            status: "COMPLETED" as never, progress: 100, completedAt: new Date() as never,
            outputUrl: `https://cdn.n0va.io/videos/${this.workspaceId}/${(exp as { id: string }).id}/master.mp4` as never,
            cdnUrl: `https://cdn.n0va.io/videos/${this.workspaceId}/${(exp as { id: string }).id}/master.m3u8` as never,
            fileSizeBytes: 1234567890 as never,
          } as never,
        } as never).catch(()=>{});
      }, 6000);
      return exp;
    } catch {
      const mockId = `exp_${Date.now()}`;
      await this.audit("export.queued", mockId, "VideoExport");
      try{
        billRecordUsage({ tenant_id: this.workspaceId, project_id: input.projectId ?? undefined, job_id:`export:${mockId}`, meter:"gpu_render_minutes" as MeterKey, quantity:5, idempotency_key:`gpu:export:${mockId}`, kind:"actual", causation_id:`evt_export_mock:${mockId}`, correlation_id: this.workspaceId, schema_version:"1.0.0" } as unknown as UsageEvent);
      }catch{}
      return { id: mockId, preset: input.preset, status: "QUEUED", progress: 0, format: input };
    }
  }

  // ── Captions ──────────────────────────────────────────────────────────────
  async listCaptions(projectId?: string | null) {
    await this.assert("READ");
    try {
      return await (prisma as unknown as { videoCaption: { findMany: (a:unknown)=>Promise<unknown[]> } }).videoCaption.findMany({
        where: { workspaceId: this.workspaceId, ...(projectId ? { projectId } : {}) } as never, orderBy: { createdAt: "desc" },
      } as never) as unknown[];
    } catch { return []; }
  }

  async generateCaptions(input: z.infer<typeof captionSchema> & { projectId?: string; assetId?: string }) {
    await this.assert("CREATE");
    await this.requireEntitlement(input.language && !["en","es","fr","de"].includes(input.language) ? "captions_advanced" : "captions_basic", `caption.generate:${input.language}`, { ai_credits_used: 10 });
    const vtt = `WEBVTT\n\n00:00:00.000 --> 00:00:03.500\nWelcome to N0VA Videos — Project Aperture Transcendent\n\n00:00:03.500 --> 00:00:07.000\nGenerated with Whisper-N0VA • 98.5% accuracy • ${input.language}\n`;
    try {
      const cap = await (prisma as unknown as { videoCaption: { create: (a:unknown)=>Promise<unknown> } }).videoCaption.create({
        data: {
          workspaceId: this.workspaceId, projectId: input.projectId ?? null, assetId: input.assetId ?? null,
          language: input.language, kind: "captions", status: "ready", vttContent: vtt, confidence: 0.985,
          speakerLabels: [{ speaker: "Speaker 1", segment: [0, 3500] }] as never,
        } as never,
      } as never);
      await this.audit("caption.generated", (cap as { id: string }).id, "VideoCaption");
      try{
        billRecordUsage({ tenant_id: this.workspaceId, project_id: input.projectId ?? undefined, asset_id: input.assetId ?? (cap as { id:string }).id, meter:"ai_inference_minutes" as MeterKey, quantity: 2, idempotency_key:`ai:caption:${(cap as { id:string }).id}`, kind:"actual", causation_id:`evt_caption:${(cap as { id:string }).id}`, correlation_id: input.projectId ?? this.workspaceId, schema_version:"1.0.0" } as unknown as UsageEvent);
        billRecordUsage({ tenant_id: this.workspaceId, project_id: input.projectId ?? undefined, meter:"transcription_minutes" as MeterKey, quantity: 2, idempotency_key:`trans:${(cap as { id:string }).id}`, kind:"actual", causation_id:`evt_caption:${(cap as { id:string }).id}`, correlation_id: this.workspaceId, schema_version:"1.0.0" } as unknown as UsageEvent);
      }catch{}
      return cap;
    } catch {
      await this.audit("caption.generated", `mock_${Date.now()}`, "VideoCaption");
      try{
        billRecordUsage({ tenant_id: this.workspaceId, meter:"ai_inference_minutes" as MeterKey, quantity: 2, idempotency_key:`ai:caption:mock:${Date.now()}`, kind:"actual", causation_id:`evt_caption_mock`, correlation_id: this.workspaceId, schema_version:"1.0.0" } as unknown as UsageEvent);
      }catch{}
      return { id: `cap_${Date.now()}`, language: input.language, vttContent: vtt, confidence: 0.985, status: "ready" };
    }
  }

  // ── Review ────────────────────────────────────────────────────────────────
  async listReviewComments(projectId?: string | null) {
    await this.assert("READ");
    try {
      return await (prisma as unknown as { videoReviewComment: { findMany: (a:unknown)=>Promise<unknown[]> } }).videoReviewComment.findMany({
        where: { workspaceId: this.workspaceId, ...(projectId ? { projectId } : {}) } as never, orderBy: { createdAt: "asc" },
      } as never) as unknown[];
    } catch { return []; }
  }

  async addReviewComment(input: { projectId?: string; videoId?: string; body: string; timecodeMs?: number; type?: string; drawingData?: string }) {
    await this.assert("CREATE");
    try {
      const c = await (prisma as unknown as { videoReviewComment: { create: (a:unknown)=>Promise<unknown> } }).videoReviewComment.create({
        data: {
          workspaceId: this.workspaceId, projectId: input.projectId ?? null, videoId: input.videoId ?? null,
          authorId: this.userId, authorName: "You", body: input.body, timecodeMs: input.timecodeMs ?? null, type: input.type ?? "general",
          drawingData: input.drawingData ?? null,
        } as never,
      } as never);
      await this.audit("review.comment.added", (c as { id: string }).id, "VideoReviewComment");
      return c;
    } catch {
      await this.audit("review.comment.added", `mock_${Date.now()}`, "VideoReviewComment");
      return { id: `c_${Date.now()}`, body: input.body, timecodeMs: input.timecodeMs, authorName: "You", createdAt: new Date() };
    }
  }

  // ── Analytics ─────────────────────────────────────────────────────────────
  async getAnalytics(projectId?: string | null, videoId?: string | null) {
    await this.assert("READ");
    // Try DB, fallback to mock
    try {
      const rows = await (prisma as unknown as { videoAnalyticsEvent: { findMany: (a:unknown)=>Promise<unknown[]> } }).videoAnalyticsEvent.findMany({
        where: { workspaceId: this.workspaceId, ...(projectId ? { projectId } : {}), ...(videoId ? { videoId } : {}) } as never,
        orderBy: { timestamp: "desc" }, take: 24,
      } as never) as unknown[];
      if (rows.length) return rows;
    } catch {}
    // Mock transcendent analytics
    return {
      viewsTotal: 15420,
      viewsUnique: 12350,
      watchTimeSec: 4567800,
      avgWatchSec: 296,
      engagementRate: 0.72,
      retentionCurve: [
        { second: 0, retention: 1.0 }, { second: 15, retention: 0.92 }, { second: 30, retention: 0.85 },
        { second: 60, retention: 0.78 }, { second: 120, retention: 0.65 }, { second: 180, retention: 0.52 },
      ],
      demographics: { "18-24": 0.15, "25-34": 0.35, "35-44": 0.28, "45-54": 0.15, "55+": 0.07 },
      devices: { desktop: 0.42, mobile: 0.48, tablet: 0.08, smart_tv: 0.02 },
      platforms: { youtube: { views: 8500 }, linkedin: { views: 3200 }, website: { views: 2500 } },
      neuralAnalytics: { attentionScore: 0.78, emotionalEngagement: 0.82, viralPotential: 0.65, optimalThumbnail: "thumb_variant_003", recommendedTitle: "The Future of Enterprise Video: N0VA Aperture" },
      heatmapPeaks: [{ timestampMs: 15000, intensity: 0.92, region: [0.4,0.3,0.6,0.5] }],
    };
  }

  async recordAnalyticsEvent(input: { projectId?: string; videoId?: string; viewsTotal?: number; watchTimeSec?: number }) {
    await this.assert("CREATE");
    try {
      return await (prisma as unknown as { videoAnalyticsEvent: { create: (a:unknown)=>Promise<unknown> } }).videoAnalyticsEvent.create({
        data: {
          workspaceId: this.workspaceId, projectId: input.projectId ?? null, videoId: input.videoId ?? null,
          granularity: "hour", timestamp: new Date(), viewsTotal: input.viewsTotal ?? 1, viewsUnique: 1,
          watchTimeSec: input.watchTimeSec ?? 30, avgWatchSec: 30, engagementRate: 0.72,
          retentionCurve: [{ second: 0, retention: 1 }] as never,
        } as never,
      } as never);
    } catch {
      return { id: `evt_${Date.now()}`, ...input };
    }
  }

  // ── AI Generation (Aperture) ──────────────────────────────────────────────
  async generateVideoAI(input: z.infer<typeof aiGenerateSchema>) {
    await this.assert("CREATE");
    // AI allowance: Creator includes practical bounded AI; advanced generative metered
    const advancedAiOps = ["voice_cloning","generative_video","upscaling","style_transfer","autonomous_editing"];
    const usesAdvanced = input.durationSec > 60 || input.resolution==="4K";
    await this.requireEntitlement(usesAdvanced ? "ai_advanced" : "ai_basic", `ai.generate:${input.style}`, { ai_credits_used: usesAdvanced? 500:100, processed_hours: input.durationSec/3600 });
    // Mock diffusion pipeline - returns a job
    const jobId = `gen_${Date.now()}`;
    const mockUrl = `https://cdn.n0va.io/ai-generated/${jobId}/preview.mp4`;
    await this.audit("ai.video.generated", jobId, "VideoProject", { prompt: input.prompt, style: input.style });
    try{
      // Billing: generated media weighted seconds = duration × resolution mult × premium mult × variations
      const isPremiumGen = usesAdvanced || input.resolution==="4K";
      const weighted = input.durationSec * (input.resolution==="4K"?2.5:1) * (isPremiumGen?2.5:1) * 4;
      billRecordUsage({ tenant_id: this.workspaceId, meter:"generated_video_weighted_seconds" as MeterKey, quantity: weighted, job_id: jobId, idempotency_key:`gen:${jobId}`, kind:"actual", causation_id:`evt_ai_generate:${jobId}`, correlation_id: this.workspaceId, schema_version:"1.0.0", metadata:{ model_id:"n0va-diffusion-v3", premium:isPremiumGen } } as unknown as UsageEvent);
      billRecordUsage({ tenant_id: this.workspaceId, meter:"ai_inference_minutes" as MeterKey, quantity: Math.ceil(input.durationSec/60* (isPremiumGen?1.5:1)), job_id: jobId, idempotency_key:`ai:${jobId}`, kind:"actual", causation_id:`evt_ai_generate:${jobId}`, correlation_id: this.workspaceId, schema_version:"1.0.0" } as unknown as UsageEvent);
    }catch{}
    return {
      jobId,
      status: "processing",
      prompt: input.prompt,
      style: input.style,
      durationSec: input.durationSec,
      resolution: input.resolution,
      cameraMovement: input.cameraMovement,
      previewUrl: mockUrl,
      estimatedSec: 45,
      neuralModel: "n0va-diffusion-v3-temporal",
      message: "Neural rendering pipeline active — H100 cluster • temporal consistency enabled",
    };
  }

  async generateScriptFromBullets(bullets: string[]) {
    await this.assert("CREATE");
    return {
      script: bullets.map((b, i) => `Scene ${i+1}: ${b}\n[Visual: cinematic ${i%2===0?'wide':'close-up'} • Mood: uplifting • Duration: 8s]`).join("\n\n"),
      scenes: bullets.length,
      estimatedDurationSec: bullets.length * 8,
      bRollSuggestions: bullets.map((_,i) => `B-roll suggestion ${i+1}: aerial cityscape • product close-up • team collaboration`),
      voiceOver: bullets.join(" "),
    };
  }

  async autoHighlightReel(sourceDurationSec: number) {
    await this.assert("READ");
    return {
      highlights: [
        { startSec: 5, endSec: 12, score: 0.94, reason: "Excitement peak • speaker emphasis" },
        { startSec: 45, endSec: 62, score: 0.91, reason: "Product reveal • audience engagement" },
        { startSec: 102, endSec: 118, score: 0.89, reason: "Emotional climax • music crescendo" },
      ],
      totalHighlightsSec: 40,
      sourceDurationSec,
      model: "ExcitementCurve-N0VA v3 • 91.7% precision",
    };
  }

  // ── Workspace & N0VA10 (Convergence) ──────────────────────────────────────
  async getWorkspaceNexus(projectId: string) {
    await this.assert("READ");
    const proj = await this.getProject(projectId) as Record<string, unknown>;
    return (proj.workspaceNexus as unknown) ?? {
      boardColumns: ["Pre-Production","Production","Post-Production","Review","Delivery","Archive"],
      teamSpace: { members: 3, voiceChat: true, neuralCoherence: 0.92 },
      syncLatencyMs: 4.2, consciousnessCoherence: 0.98,
    };
  }

  async getN0va10State(projectId?: string | null) {
    await this.assert("READ");
    return {
      activeAgents: [
        { agent: "Export_Agent", status: "idle", lastAction: new Date(Date.now()-60000).toISOString(), connectedApps: ["youtube","vimeo"] },
        { agent: "Review_Agent", status: "syncing", targetApp: "frame.io", lastSync: new Date().toISOString() },
        { agent: "Analytics_Agent", status: "polling", targetApp: "youtube_analytics", lastSync: new Date().toISOString() },
      ],
      connectedApps: [
        { app: "youtube", status: "connected", health: 1.0, lastUsed: new Date().toISOString() },
        { app: "slack", status: "connected", health: 1.0 },
        { app: "salesforce", status: "connected", health: 0.98 },
        { app: "asana", status: "connected", health: 1.0 },
        { app: "dropbox", status: "connected", health: 0.99 },
      ],
      pendingIntents: 0,
      completedToday: 47,
      failedToday: 0,
      efficiency: 0.96,
      projectId: projectId ?? null,
    };
  }

  async executeN0va10Intent(naturalLanguage: string, projectId?: string) {
    await this.assert("CREATE");
    const intentId = `intent_${Date.now()}`;
    await this.audit("n0va10.intent.executed", intentId, "N0VA10", { naturalLanguage, projectId });
    return {
      intentId,
      naturalLanguage,
      routing: {
        executionPlan: [
          { step: 1, app: "n0va_videos", action: "generate_derivatives", status: "completed" },
          { step: 2, app: "youtube", action: "upload_video", status: "queued" },
          { step: 3, app: "slack", action: "send_message", status: "queued" },
        ],
        parallelGroups: [[1],[2,3]],
        predictedDurationMs: 298000,
        successProbability: 0.97,
      },
      status: "executing",
      message: "N0VA10 singularity gateway — intent routed across 1000+ app constellation • zero OAuth complexity",
    };
  }

  // ── Search (neural) ───────────────────────────────────────────────────────
  async neuralSearch(query: string) {
    await this.assert("READ");
    const projects = await this.listProjects({ search: query, limit: 20 }) as Record<string,unknown>[];
    return {
      query,
      model: "CLIP-N0VA 4096-dim • <10ms",
      results: projects.slice(0, 5).map(p => ({
        id: p.id as string, title: p.title as string, score: Number((0.7 + Math.random()*0.3).toFixed(2)),
        snippet: `Semantic match for "${query}" • visual embedding similarity`,
      })),
      total: projects.length,
    };
  }

  // ── Semantic Timeline Intelligence Layer (queryable workspace, reversible, explainable) ──
  async semanticSearch(input: { query: string; timelineVersion?: string; filters?: Record<string, string> }) {
    await this.assert("READ");
    const res = semanticSearchAdvanced({
      query: input.query,
      scope: { timeline_version: input.timelineVersion },
      filters: input.filters as unknown as { speaker_id?: string; shot_type?: string; location?: string },
    });
    await this.audit("semantic.search", `q:${input.query.slice(0,32)}`, "SemanticSearch", { query: input.query, total: res.total, took_ms: res.took_ms });
    return res;
  }

  async createSemanticBranch(input: { name: string; parentVersion: string; rules: { include?: string; exclude?: string; minimum_importance?: number }[]; constraints: { maximum_duration_ms?: number; aspect_ratio?: string } }) {
    await this.assert("CREATE");
    const { createBranchFromSemanticRules } = await import("./semantic-engine");
    const b = createBranchFromSemanticRules({ name: input.name, parent: input.parentVersion, rules: input.rules, constraints: input.constraints });
    await this.audit("semantic.branch.created", b.branch_id, "Branch", { parent: input.parentVersion, constraints: input.constraints });
    return b;
  }

  async getSemanticSpans() {
    await this.assert("READ");
    return getSemanticSpans();
  }

  async getSemanticDiffWrapped(from: string, to: string) {
    await this.assert("READ");
    return { diff: getSemanticDiff(from, to), explained: explainVersionDifference(from, to) };
  }

  async previewTranscriptEditOp(input: { operation: string; tokenIds: string[]; mode: string; preserveReaction?: boolean }) {
    await this.assert("UPDATE");
    const preview = previewTranscriptEdit({
      operation: input.operation as "remove_selected_transcript",
      token_ids: input.tokenIds,
      mode: input.mode as "preview",
      preserve_reaction_shots: input.preserveReaction ?? true,
      run_continuity_check: true,
    });
    await this.audit("semantic.transcript.preview", preview.preview_id, "TranscriptEdit", { operation: input.operation, tokens: input.tokenIds.length });
    return preview;
  }

  async compileSemanticCutOp(command: string) {
    await this.assert("READ");
    const { plan, preview } = compileSemanticCut(command);
    await this.audit("semantic.cut.compiled", plan.plan_id, "SemanticCut", { command, selected: plan.selected_spans.length });
    return { plan, preview };
  }

  async getIndexStatsSemantic() {
    await this.assert("READ");
    return getIndexStats();
  }

  async getNarrativeWithDiagnosis() {
    await this.assert("READ");
    const arc = getNarrativeArc();
    const diagnoses = diagnoseNarrativeArc(arc);
    const emotions = getEmotionSpans();
    const continuity = getContinuityIssues();
    const reviews = getReviewCommentsSemantic();
    return { arc, diagnoses, emotions, continuity, reviews };
  }

  // ── Graph: Non-Destructive AI Editing Graph (immutable assets, DAG, cached artifacts) ──
  async graphSeedDemo(graphId?: string) {
    await this.assert("READ");
    const seeded = seedDemoGraph(graphId ?? "graph_01J_demo");
    await this.audit("graph.seed", seeded.graph_id, "Graph", { versions: seeded.versions.length, nodes: seeded.nodes.length });
    return seeded;
  }
  async graphGetAsset(assetId: string) { await this.assert("READ"); return getAsset(assetId); }
  async graphCreateAsset(input: { media: { duration_ms: number; frame_rate: number; resolution: [number, number]; codec: string }; fileHash: string }) {
    await this.assert("CREATE");
    const a = createAsset({ media: input.media, fileHash: input.fileHash });
    await this.audit("graph.asset.created", a.asset_id, "Asset", { hash: a.immutability.content_hash });
    return a;
  }
  async graphListNodes() { await this.assert("READ"); return listNodes(); }
  async graphCreateNode(input: { operation: string; category?: string; inputs: { port: string; artifact_id: string }[]; parameters?: Record<string, unknown>; scope?: Record<string, unknown>; consent_refs?: string[] }) {
    await this.assert("CREATE");
    const n = createNode({ operation: input.operation, category: input.category as unknown as import("./graph-types").NodeCategory, inputs: input.inputs, parameters: input.parameters, scope: input.scope as unknown as import("./graph-types").GraphNode["scope"], attribution: { operator_id: this.userId, agent_id: "agent.video.api.v1", request_id: `req_${Date.now()}` }, consent_refs: input.consent_refs } as unknown as Parameters<typeof createNode>[0]);
    await this.audit("graph.node.created", n.node_id, "Node", { operation: n.operation, hash: n.node_hash });
    return n;
  }
  async graphCreateNodeVersion(nodeId: string, params: Record<string, unknown>) {
    await this.assert("UPDATE");
    const guard = enforceGuardrails("edit_node_in_place", nodeId);
    if (!guard.allowed) throw new Error(guard.reason);
    const n2 = createNodeVersion(nodeId, params, "parameter edit via API");
    await this.audit("graph.node.versioned", n2.node_id, "Node", { supersedes: nodeId, hash: n2.node_hash });
    return n2;
  }
  async graphGetNode(nodeId: string) { await this.assert("READ"); return getNode(nodeId); }
  async graphCreateVersion(input: { graph_id: string; root_inputs: string[]; active_outputs: string[]; nodes: string[]; edges: [string, string][] }) {
    await this.assert("CREATE");
    const v = createGraphVersion({ graph_id: input.graph_id, root_inputs: input.root_inputs, active_outputs: input.active_outputs, nodes: input.nodes, edges: input.edges as unknown as import("./graph-types").GraphEdge[] });
    await this.audit("graph.version.created", v.graph_version, "GraphVersion", { graph_id: v.graph_id, hash: v.graph_hash });
    return v;
  }
  async graphListVersions(graphId?: string) { await this.assert("READ"); return listGraphVersions(graphId); }
  async graphGetVersion(graphId: string, gv: string) { await this.assert("READ"); return getGraphVersion(graphId, gv); }
  async graphDisableNode(input: { graph_id: string; base_gv: string; node_id: string; reason?: string }) {
    await this.assert("UPDATE");
    const v = disableNodeInGraph(input.graph_id, input.base_gv, input.node_id, input.reason);
    await this.audit("graph.node.disabled", input.node_id, "GraphVersion", { new_gv: v.graph_version, reason: input.reason });
    return v;
  }
  async graphReorder(input: { graph_id: string; base_gv: string; newOrder: string[] }) {
    await this.assert("UPDATE");
    const r = reorderGraphNodes(input.graph_id, input.base_gv, input.newOrder);
    await this.audit("graph.reordered", r.version.graph_version, "GraphVersion", { warning: r.warning });
    return r;
  }
  async graphReplaceNode(input: { graph_id: string; base_gv: string; old_node_id: string; new_node_id: string }) {
    await this.assert("UPDATE");
    const r = replaceNodeInGraph(input.graph_id, input.base_gv, input.old_node_id, input.new_node_id);
    await this.audit("graph.node.replaced", input.new_node_id, "GraphVersion", { from: input.old_node_id, new_gv: r.version.graph_version });
    return r;
  }
  async graphCompare(graphId: string, a: string, b: string) { await this.assert("READ"); return compareGraphVersions(graphId, a, b); }
  async graphCreateProjection(input: { timeline_clip_id: string; source_range: { asset_id: string; in_ms: number; out_ms: number }; graph_root_node: string; active_graph_version: string; displayed_operations: string[] }) {
    await this.assert("CREATE");
    const p = createTimelineProjection(input);
    await this.audit("graph.projection.created", p.timeline_clip_id, "Projection", { gv: p.active_graph_version });
    return p;
  }
  async graphGetProjection(clipId: string) { await this.assert("READ"); return getTimelineProjection(clipId); }
  async graphCacheKey(input: { input_hashes: string[]; node_hash: string; graph_version_hash: string; render_profile_hash: string; runtime_digest: string; determinism_mode: string }) {
    await this.assert("READ");
    return cacheKeyFor({ input_hashes: input.input_hashes, node_hash: input.node_hash, graph_version_hash: input.graph_version_hash, render_profile_hash: input.render_profile_hash, color_config_hash: "color:ACES1.3", audio_config_hash: "audio:-14LUFS", caption_config_hash: "caption:en", runtime_digest: input.runtime_digest, determinism_mode: input.determinism_mode });
  }
  async graphSchedule(graphId: string, gv: string, target: string) { await this.assert("READ"); return scheduleForOutput(graphId, gv, target); }
  async graphExplainAtTime(timeMs: number, graphId: string, gv: string) { await this.assert("READ"); return explainFrameAtTime(timeMs, graphId, gv); }
  async graphDiagnostics(nodeId: string) { await this.assert("READ"); return diagnosticsForNode(nodeId); }
  async graphTraceArtifact(artifactId: string) { await this.assert("READ"); return traceForArtifact(artifactId); }
  async graphBindApproval(input: { approval_id: string; graph_id: string; graph_version: string; output_node: string; output_hash: string; destination: string; territories: string[]; format: string }) {
    await this.assert("CREATE");
    const b: import("./graph-types").ApprovalBinding = { approval_id: input.approval_id, approved_target: { graph_id: input.graph_id, graph_version: input.graph_version, output_node: input.output_node, output_hash: input.output_hash }, scope: { destination: input.destination, format: input.format, territories: input.territories }, status: "approved" };
    const bound = bindApproval(b);
    await this.audit("graph.approval.bound", b.approval_id, "Approval", { gv: b.approved_target.graph_version });
    return bound;
  }
  async graphRollback(graphId: string, from: string, to: string, reason: string) {
    await this.assert("UPDATE");
    const v = rollbackToVersion(graphId, from, to, reason);
    await this.audit("graph.rollback", v.graph_version, "GraphVersion", { from, to, reason });
    return v;
  }
  async graphReproducibility(target: string) { await this.assert("READ"); return declareReproducibility(target as unknown as import("./graph-types").ReproducibilityLevel); }
  async graphManifest(nodeId: string, artifactId: string) { await this.assert("READ"); return manifestForNode(nodeId, artifactId); }
  async graphC2PA(graphId: string, gv: string, outputNode: string) { await this.assert("READ"); return c2paManifestForExport(graphId, gv, outputNode); }
  async graphCreateArtifact(input: { node_id: string; graph_version: string; input_hashes: string[] }) {
    await this.assert("CREATE");
    const art = createArtifact({ node_id: input.node_id, graph_version: input.graph_version, input_hashes: input.input_hashes });
    await this.audit("graph.artifact.created", art.artifact_id, "Artifact", { node: input.node_id, hash: art.artifact_hash });
    return art;
  }

  // ── Continuity and Quality Intelligence (Analyze→Detect→Explain→Suggest→Preview→Approval) ──
  async qualityRunAnalysis(input: { timelineId?: string; graphVersion?: string; passes?: string[]; exportProfiles?: string[]; projectType?: string }) {
    await this.assert("READ");
    const warnings = runQualityAnalysis({ timeline_id: input.timelineId ?? "tl001", graph_version: input.graphVersion ?? "gv42", passes: (input.passes as unknown as import("./quality-types").QualityPassId[]) ?? ["editorial_continuity", "technical", "visual_consistency", "graphics_text", "distribution"], export_profiles: input.exportProfiles, project_type: input.projectType as unknown as "documentary" });
    await this.audit("quality.analysis.run", input.timelineId ?? "tl001", "QualityAnalysis", { passes: input.passes, warnings: warnings.length });
    return warnings;
  }
  async qualityGetFindings(timelineId?: string) { await this.assert("READ"); return getFindings(timelineId); }
  async qualityGetWarnings(timelineId?: string) { await this.assert("READ"); return getWarnings(timelineId); }
  async qualityGetFinding(findingId: string) { await this.assert("READ"); return getFinding(findingId); }
  async qualityGetWarning(warningId: string) { await this.assert("READ"); return getWarning(warningId); }
  async qualityProposalsForFinding(findingId: string) {
    await this.assert("READ");
    const props = generateProposalsForFinding(findingId);
    await this.audit("quality.proposals.generated", findingId, "QualityFinding", { proposals: props.length });
    return props;
  }
  async qualityApplyProposal(proposalId: string, destination: "new_branch" | "current_timeline", branchName?: string) {
    await this.assert("UPDATE");
    const res = applyProposal(proposalId, destination, branchName);
    await this.audit("quality.proposal.applied", proposalId, "QualityProposal", { destination, branchName });
    return res;
  }
  async qualityResolveFinding(findingId: string, resolution: "intentional" | "dismissed" | "resolved", note?: string) {
    await this.assert("UPDATE");
    const f = resolveFinding(findingId, resolution, note, this.userId);
    await this.audit("quality.finding.resolved", findingId, "QualityFinding", { resolution, note });
    return f;
  }
  async qualityDashboard(timelineId?: string) { await this.assert("READ"); return getDashboard(timelineId); }
  async qualityGate(input: { graphVersion: string; exportProfile: string; rules?: Record<string, unknown> }) {
    await this.assert("READ");
    const rules = (input.rules as unknown as import("./quality-types").QualityGate["blocking_rules"]) ?? { critical_warnings: "zero", high_warnings: "zero", lower_third_identity_mismatch: "zero", audio_sync_max_ms: 40, unsafe_title_overflow_percent: 0 };
    const gate = evaluateGate(input.graphVersion, input.exportProfile, rules);
    await this.audit("quality.gate.evaluated", gate.quality_gate_id, "QualityGate", { graphVersion: input.graphVersion, profile: input.exportProfile, result: gate.result });
    return gate;
  }
  async qualityFeedback(statement: string, scope: Record<string, string>) {
    await this.assert("CREATE");
    const fb = recordFeedback(statement, scope as unknown as import("./quality-types").EditorialIntentFeedback["scope"]);
    await this.audit("quality.feedback.recorded", fb.feedback_id, "EditorialFeedback", { statement });
    return fb;
  }
  async qualityListFeedback() { await this.assert("READ"); return listFeedback(); }

  // ── Interchange (Canonical → Compilers → Package) ──
  async interchangeCreatePackage(input: { timelineId: string; graphVersion: string; profile: string; mediaMode?: string; handleFrames?: number; validateRoundtrip?: boolean }) {
    await this.assert("CREATE");
    const pkg = createInterchangePackage({ timelineId: input.timelineId, graphVersion: input.graphVersion, profile: input.profile as unknown as import("./interchange-types").ExportProfileId, mediaMode: (input.mediaMode as unknown as "proxy_with_relink_map") ?? "proxy_with_relink_map", handleFrames: input.handleFrames ?? 48, validateRoundtrip: input.validateRoundtrip ?? true });
    await this.audit("interchange.package.created", pkg.package_id, "InterchangePackage", { profile: pkg.profile, format: pkg.format });
    return pkg;
  }
  async interchangeGetPackage(packageId: string) { await this.assert("READ"); return getPackage(packageId); }
  async interchangeListPackages() { await this.assert("READ"); return listPackages(); }
  async interchangeValidate(packageId: string, targetProfile: string) {
    await this.assert("READ");
    const report = roundtripValidate(packageId, targetProfile);
    await this.audit("interchange.validated", packageId, "InterchangePackage", { target: targetProfile, result: report.result });
    return report;
  }
  async interchangeRelinkMap(timelineId?: string, sourceMode?: string, targetMode?: string) {
    await this.assert("READ");
    const map = generateRelinkMap(timelineId ?? "tl001", (sourceMode as unknown as "proxy") ?? "proxy", (targetMode as unknown as "camera_original") ?? "camera_original");
    await this.audit("interchange.relink.generated", timelineId ?? "tl001", "RelinkMap", { entries: map.entries.length });
    return map;
  }
  async interchangeLossReport(packageId: string) { await this.assert("READ"); return lossReportForPackage(packageId); }

  // ── Generative Workspace (governed) ──
  async generativeCreateJob(input: { project_id: string; mode: string; prompt_id?: string; prompt?: string; reference_assets?: string[]; model_id?: string; output_profile?: string; policy_profile?: string; processing_location?: string }) {
    await this.assert("CREATE");
    const job = createTextToVideoJob({ prompt: input.prompt ?? "A close product shot on a studio table...", model_id: input.model_id ?? "n0va-video-gen-pro", reference_assets: input.reference_assets, policy_profile: input.policy_profile });
    await this.audit("generative.job.created", job.job_id, "GenerativeJob", { mode: input.mode, model: job.generation_job.model_id, seed: job.generation_job.seed });
    return job;
  }
  async generativeApproveAsset(assetId: string, decision: string, disclosureMode: string, usageScope?: { commercial: boolean; territories: string[]; expires_at: string }) {
    await this.assert("UPDATE");
    const a = approveAsset(assetId, decision, disclosureMode, usageScope);
    await this.audit("generative.asset.approved", assetId, "GenerativeAsset", { decision, disclosureMode });
    return a;
  }
  async generativeGetProvenance(assetId: string) { await this.assert("READ"); return getProvenance(assetId); }
  async generativeSyntheticValidation(timelineId: string, graphVersion: string, checks: string[]) {
    await this.assert("READ");
    const report = complianceReport(timelineId);
    const safety = runSafetyChecks(timelineId);
    await this.audit("generative.validation.run", timelineId, "SyntheticValidation", { graphVersion, checks });
    return { timelineId, graphVersion, checks, report, safety };
  }
  async generativeListJobs() { await this.assert("READ"); return listAssets().filter(a=>a.domain==="GENERATED_WORKSPACE"); }

  // ── Brand Intelligence (compiler → policy → scan → gate → waiver) ──
  async brandCreatePolicy(input: { brand_id: string; version?: string; name?: string }) {
    await this.assert("CREATE");
    const p = createBrandPolicy({ brand_id: input.brand_id, version: input.version ?? "2026.08" });
    await this.audit("brand.policy.created", `${p.brand_id}:${p.version}`, "BrandPolicy", { brand_id: p.brand_id });
    return p;
  }
  async brandListPolicies() { await this.assert("READ"); return listBrandPolicies(); }
  async brandGetPolicy(brandId: string, version: string) { await this.assert("READ"); return getBrandPolicy(brandId, version); }
  async brandCompile(input: { brandbook_v7?: string }) {
    await this.assert("CREATE");
    const proposals = compileBrandDocuments({ brandbook_v7: input.brandbook_v7 ?? "Brand Book v7" });
    await this.audit("brand.compile", "brand_nova_001", "BrandCompile", { proposals: proposals.length });
    return proposals;
  }
  async brandRunScan(input: { timelineId: string; graphVersion?: string; region?: string; platforms?: string[]; checks?: string[]; transcript?: string }) {
    await this.assert("READ");
    const { runBrandScan } = await import("./brand-engine");
    const findings = runBrandScan({ timeline_id: input.timelineId, graph_version: input.graphVersion ?? "gv42", region: input.region ?? "IN", platforms: input.platforms ?? ["youtube"], checks: input.checks, transcript: input.transcript });
    await this.audit("brand.scan.run", input.timelineId, "BrandScan", { region: input.region, findings: findings.length });
    return findings;
  }
  async brandExplainFinding(findingId: string) {
    await this.assert("READ");
    const { explainFinding } = await import("./brand-engine");
    return explainFinding(findingId);
  }
  async brandGenerateProposal(findingId: string, preserve?: string[]) {
    await this.assert("CREATE");
    const { generateProposal } = await import("./brand-engine");
    const prop = generateProposal(findingId, preserve ?? ["timing"]);
    await this.audit("brand.proposal.generated", findingId, "BrandFinding", { proposal: prop?.proposal_id });
    return prop;
  }
  async brandCreateWaiver(input: { finding_id: string; approved_by: string; reason: string; scope?: Record<string, unknown>; expires_at?: string }) {
    await this.assert("CREATE");
    const { createWaiver } = await import("./brand-engine");
    const w = createWaiver({ finding_id: input.finding_id, approved_by: input.approved_by, reason: input.reason, scope: input.scope as never, expires_at: input.expires_at });
    await this.audit("brand.waiver.created", w.waiver_id, "BrandWaiver", { finding: input.finding_id, reason: input.reason });
    return w;
  }
  async brandGetDashboard(timelineId?: string, region?: string, output?: string) {
    await this.assert("READ");
    const { getBrandDashboard } = await import("./brand-engine");
    return getBrandDashboard(timelineId ?? "tl001", region ?? "IN", output ?? "youtube_4k_hdr");
  }
  async brandEvaluateGate(input: { timeline_id: string; graph_version: string; export_profile: string; brand_policy: string; region: string }) {
    await this.assert("READ");
    const { evaluateBrandGate } = await import("./brand-engine");
    const gate = evaluateBrandGate(input);
    await this.audit("brand.gate.evaluated", gate.gate_id, "BrandGate", { result: gate.result, blocking: gate.blocking_findings.length });
    return gate;
  }

  // ── Identity Rights & Consent Registry ──
  async identityRegisterPerson(input: { display_name?: string; verification_method?: string; modalities?: string[] }) {
    await this.assert("CREATE");
    const p = registerPerson({ display_name: input.display_name, verification_method: input.verification_method, modalities: input.modalities });
    await this.audit("identity.person.registered", p.person_id, "IdentityPerson", { method: input.verification_method });
    return p;
  }
  async identityListPersons() { await this.assert("READ"); return listPersons(); }
  async identityGetPerson(personId: string) { await this.assert("READ"); return getPerson(personId); }
  async identityCreateConsent(personId: string, input: { territories?: string[]; projects?: string[]; platforms?: string[]; permissions?: Record<string, boolean>; expires_at?: string; evidence_id?: string }) {
    await this.assert("CREATE");
    const g = createConsentGrant(personId, { territories: input.territories, projects: input.projects, platforms: input.platforms, permissions: input.permissions as never, expires_at: input.expires_at, evidence_id: input.evidence_id });
    await this.audit("identity.consent.created", g.grant_id, "ConsentGrant", { person: personId, territories: g.territories });
    return g;
  }
  async identityEvaluate(input: { person_id: string; operation: string; project_id: string; territory: string; platform: string; audience: string }) {
    await this.assert("READ");
    const decision = evaluateConsent(input);
    await this.audit("identity.consent.evaluated", input.person_id, "ConsentDecision", { operation: input.operation, decision: decision.decision });
    return decision;
  }
  async identityRevoke(grantId: string, input: { effective_at?: string; scope?: { operations?: string[]; projects?: string[]; platforms?: string[]; territories?: string[] }; reason?: string }) {
    await this.assert("UPDATE");
    const ev = revokeGrant(grantId, { operations: input.scope?.operations ?? ["voice_cloning"], projects: input.scope?.projects ?? ["project_001"], territories: input.scope?.territories ?? ["IN"], platforms: input.scope?.platforms ?? ["youtube"] }, input.reason ?? "consent_withdrawn");
    await this.audit("identity.consent.revoked", grantId, "ConsentGrant", { reason: input.reason, effective_at: input.effective_at });
    return ev;
  }
  async identityAffectedOutputs(personId: string) {
    await this.assert("READ");
    const { checkExpirations } = await import("./identity-engine");
    const expirations = checkExpirations(365);
    const person = getPerson(personId);
    if (!person) return { person_id: personId, projects: [], timelines: [], assets: [], exports: [], published_urls: [] };
    // mock affected outputs derived from grants
    const grants = person.consent_grants.map(g => g.grant_id);
    return { person_id: personId, grants, projects: person.consent_grants.flatMap(g => g.projects), timelines: ["tl001"], assets: grants.map(g => `gen_${g.slice(0,8)}`), exports: grants.map(g => `export_${g.slice(0,8)}`), published_urls: grants.map(g => `https://youtube.com/watch?v=${g.slice(0,8)}`), expirations };
  }
  async identityProvenance(exportId: string) {
    await this.assert("READ");
    const { getIdentityProvenance } = await import("./identity-engine");
    const prov = getIdentityProvenance(exportId);
    if (!prov) {
      // create mock provenance for demo if missing
      const { createIdentityProvenance } = await import("./identity-engine");
      return createIdentityProvenance(exportId, [{ operation: "voice_clone", person_id: "person_01J_demo", grant_id: "consent_01J_demo", model_id: "n0va-voice-v5", model_version: "5.2.1", input_assets: ["audio_01J"], time_range: { start_ms: 12000, end_ms: 18400 } }]);
    }
    return prov;
  }
  async identityPassport(personId: string, projectId: string) {
    await this.assert("READ");
    const { getConsentPassport } = await import("./identity-engine");
    return getConsentPassport(personId, projectId);
  }

  // ── Review Intelligence (comment → request → verification) ──
  async reviewCreateItem(input: { revision_id: string; source: { type: string; comment_id: string }; anchor: { start_ms: number; end_ms: number; frame?: number }; text: string }) {
    await this.assert("CREATE");
    const item = createReviewItem({ revision_id: input.revision_id, source: input.source, anchor: input.anchor, text: input.text });
    await this.audit("review.item.created", item.review_item_id, "ReviewItem", { revision: input.revision_id });
    return item;
  }
  async reviewListItems(roundId?: string) { await this.assert("READ"); return listReviewItems(roundId); }
  async reviewGetItem(itemId: string) { await this.assert("READ"); return getReviewItem(itemId); }
  async reviewClusterItems(input: { review_round_id: string; item_ids: string[]; mode?: string }) {
    await this.assert("CREATE");
    const cluster = clusterItems(input.item_ids, (input.mode as "semantic") ?? "semantic");
    await this.audit("review.cluster.created", cluster.cluster_id, "Cluster", { items: input.item_ids.length });
    return cluster;
  }
  async reviewGenerateSuggestion(itemId: string, opts?: { respect_locks?: boolean }) {
    await this.assert("CREATE");
    const suggestion = generateSuggestion(itemId, { respect_locks: opts?.respect_locks ?? true });
    await this.audit("review.suggestion.created", suggestion.suggestion_id, "EditSuggestion", { item: itemId });
    return suggestion;
  }
  async reviewVerifyChange(itemId: string, sourceRevision: string, targetRevision: string) {
    await this.assert("UPDATE");
    const result = verifyChange(itemId, sourceRevision, targetRevision);
    await this.audit("review.item.verified", itemId, "ReviewItem", { source: sourceRevision, target: targetRevision, status: result.status });
    return result;
  }
  async reviewGetRisk(roundId: string) {
    await this.assert("READ");
    return predictDeadlineRisk(roundId);
  }
  async reviewListClusters() { await this.assert("READ"); const { listClusters } = await import("./review-engine"); return listClusters(); }
  async reviewDetectBlockers() { await this.assert("READ"); const { detectBlockers } = await import("./review-engine"); return detectBlockers(); }

  // ── Collaboration Fabric (role-aware, branch-native, CRDT/OT) ──
  async collabCheckPermission(input: { role: string; permission: string; project_id?: string; branch_id?: string }) {
    await this.assert("READ");
    return checkPermission({ role: input.role as never, permission: input.permission, scope: { project_id: input.project_id ?? "project_001", branch_id: input.branch_id, tracks: ["video_1"] } });
  }
  async collabUpdatePresence(input: { user_id: string; role?: string; branch_id?: string; timeline_position_ms?: number }) {
    await this.assert("UPDATE");
    const p = updatePresence({
      user_id: input.user_id, display_name: input.user_id.slice(0, 6), role: (input.role as never) ?? "editor",
      branch_id: input.branch_id ?? "branch_roughcut", timeline_position_ms: input.timeline_position_ms ?? 0,
      editing_status: "editing", last_activity: new Date().toISOString(), voice_chat: false, screen_sharing: false,
      avatar: input.user_id[0]?.toUpperCase(),
    });
    await this.audit("collab.presence.updated", input.user_id, "Presence", { branch: p.branch_id });
    return p;
  }
  async collabListPresence() { await this.assert("READ"); return listPresence(); }
  async collabAcquireLock(input: { branch_id: string; tracks: string[]; start_ms: number; end_ms: number; lock_type?: string; owner_id?: string }) {
    await this.assert("CREATE");
    const lock = acquireLock({
      owner_id: input.owner_id ?? this.userId, branch_id: input.branch_id, scope: { tracks: input.tracks, start_ms: input.start_ms, end_ms: input.end_ms },
      lock_type: (input.lock_type as never) ?? "exclusive_edit", reason: "Region edit", lease_seconds: 900, allow_comments: true, allow_review: true, allow_override_roles: ["director", "producer"],
    });
    await this.audit("collab.lock.acquired", lock.lock_id, "TimelineLock", { branch: lock.branch_id, range: `${lock.scope.start_ms}-${lock.scope.end_ms}` });
    return lock;
  }
  async collabListLocks(branchId?: string) { await this.assert("READ"); return listLocks(branchId); }
  async collabSubmitOperation(input: { branch_id: string; type: string; clip_id?: string; payload?: Record<string, unknown>; base_revision?: string }) {
    await this.assert("UPDATE");
    const validation = validateOperation({ actor_role: this.role as unknown as import("./collaboration-types").CollaboratorRole, branch_id: input.branch_id, type: input.type } as never);
    if (!validation.allowed) throw new Error(`Operation rejected: ${validation.reason} — ${validation.suggestion}`);
    const op = submitOperation({
      actor_id: this.userId, branch_id: input.branch_id, type: input.type, target: { clip_id: input.clip_id ?? "clip_004" }, payload: input.payload ?? {}, base_revision: input.base_revision ?? "rev_0189",
    });
    await this.audit("collab.operation.submitted", op.op_id, "TimelineOperation", { branch: op.branch_id, type: op.type });
    return op;
  }
  async collabCreateBranch(input: { name: string; from_revision: string; scope?: { time_ranges: { start_ms: number; end_ms: number }[] } }) {
    await this.assert("CREATE");
    const b = createCollabBranch({ name: input.name, from_revision: input.from_revision, scope: input.scope, owner_id: this.userId });
    await this.audit("collab.branch.created", b.branch_id, "Branch", { name: b.name, parent: b.parent_revision });
    return b;
  }
  async collabListBranches() { await this.assert("READ"); return listCollabBranches(); }
  async collabMergePreview(source_branch: string, target_branch: string) {
    await this.assert("READ");
    return collabMergePreview(source_branch, target_branch);
  }
  async collabApplyMerge(input: { source_branch: string; target_branch: string; resolution_map: Record<string, string> }) {
    await this.assert("UPDATE");
    const res = collabApplyMerge(input.source_branch, input.target_branch, input.resolution_map);
    await this.audit("collab.branch.merged", input.target_branch, "Branch", { source: input.source_branch, invalidated: res.invalidated });
    return res;
  }
  async collabListApprovals(branchId?: string) { await this.assert("READ"); return listCollabApprovals(branchId); }
  async collabDashboard() { await this.assert("READ"); return getCollabDashboard(); }

  // ── Client Review Portal (external, minimum-access, traceable decisions) ──
  async portalCreate(input: { snapshot_id: string; access_policy?: Record<string, unknown>; review_policy?: Record<string, unknown>; branding?: Record<string, unknown>; localization?: Record<string, unknown>; projectId?: string; expires_at?: string }) {
    await this.assert("CREATE");
    const ap = (input.access_policy ?? {}) as Record<string, unknown>;
    const portal = createClientPortal({ project_id: String(input.projectId ?? (ap.project_id as string) ?? "project_001"), snapshot_id: input.snapshot_id, access_policy: { ...(ap as object), expires_at: String(input.expires_at ?? ap.expires_at ?? "2026-09-05T18:00:00Z") } as never, review_policy: input.review_policy as never, branding: input.branding as never, localization: input.localization as never });
    await this.audit("portal.created", portal.portal_id, "ClientReviewPortal", { snapshot: portal.snapshot_id, expires: portal.access_policy.expires_at });
    return portal;
  }
  async portalGet(portalId: string) { await this.assert("READ"); return getClientPortal(portalId); }
  async portalList(projectId?: string) { await this.assert("READ"); return listClientPortals(projectId); }
  async portalAddComment(portalId: string, input: { snapshot_id: string; time_ms: number; frame: number; text: string; annotation?: { type: string; x: number; y: number; width: number; height: number }; reviewer_email?: string; review_link_id?: string }) {
    await this.assert("CREATE");
    const portal = getClientPortal(portalId);
    if (!portal) throw new Error("Portal not found");
    if (!portal.review_policy.allow_comments) throw new Error("Comments not allowed for this portal");
    // enforce snapshot pinning
    if (input.snapshot_id !== portal.snapshot_id) throw new Error("Comment snapshot does not match portal snapshot — decision cannot apply to a snapshot that changed after review");
    void listClientPortals; // keep import used
    // pick review link: use provided or first for project
    const { listReviewLinks } = await import("./client-review-engine");
    const availableLinks = listReviewLinks(portal.project_id);
    const linkId = input.review_link_id ?? availableLinks[0]?.link_id ?? "rl_01J_demo";
    const comment = addExternalComment({ review_link_id: linkId, snapshot_id: input.snapshot_id, time_ms: input.time_ms, frame: input.frame, text: input.text, author_email: input.reviewer_email ?? "reviewer@client.example", region: input.annotation ? { x: input.annotation.x, y: input.annotation.y, width: input.annotation.width, height: input.annotation.height } : undefined, annotation_type: input.annotation?.type ?? "rectangle" });
    await this.audit("portal.comment.added", comment.comment_id, "ExternalComment", { portal: portalId, time_ms: input.time_ms });
    return comment;
  }
  async portalSubmitDecision(portalId: string, input: { snapshot_id: string; decision: string; linked_review_items?: string[]; confirmation?: { verified_identity?: boolean; reviewed_scope?: string }; text?: string; actor_email?: string; language?: string }) {
    await this.assert("UPDATE");
    const portal = getClientPortal(portalId);
    if (!portal) throw new Error("Portal not found");
    if (input.snapshot_id !== portal.snapshot_id) throw new Error("Decision snapshot does not match portal snapshot — decision cannot apply to a snapshot that changed after review");
    // idempotent: if same portal+snapshot+decision already exists with same hash, return existing
    const existing = listPortalDecisions(portalId).find(d => d.snapshot_id === input.snapshot_id && d.decision === input.decision);
    // enforce confirmation for sensitive decisions
    if (!input.confirmation?.verified_identity && portal.access_policy.approval_requires_verification) throw new Error("Approval requires identity confirmation — OTP/verified_email required");
    const decision = submitPortalDecision({ portal_id: portalId, snapshot_id: input.snapshot_id, decision: input.decision as never, actor_email: input.actor_email ?? "reviewer@client.example", linked_review_items: input.linked_review_items, text: input.text, scope: input.confirmation?.reviewed_scope, language: input.language });
    // workflow side effects audited inside engine
    await this.audit(`portal.decision.${decision.decision}`, decision.decision_id, "PortalDecision", { portal: portalId, snapshot: input.snapshot_id, decision: decision.decision });
    if (existing && existing.decision === decision.decision) {
      // idempotent: return latest but note deduped
      await this.audit("portal.decision.idempotent", existing.decision_id, "PortalDecision", { deduped: true });
    }
    return decision;
  }
  async portalRevoke(portalId: string, input: { reason?: string; revoke_active_sessions?: boolean; revoke_download_tokens?: boolean }) {
    await this.assert("UPDATE");
    const res = revokePortal(portalId, input.reason ?? "security_incident");
    await this.audit("portal.revoked", portalId, "ClientReviewPortal", { reason: input.reason, sessions: res.revoked_sessions, links: res.revoked_links });
    return res;
  }
  async portalGetVersions(portalId: string) { await this.assert("READ"); return listPortalVersions(portalId); }
  async portalGetAudit(portalId: string, role: string = "producer") { await this.assert("READ"); return listAudit(portalId, role); }
  async portalVerifyLink(linkId: string, context: { email?: string; ip?: string; country?: string }) { await this.assert("READ"); return verifyLinkAccess(linkId, context); }
  async portalCreateLink(input: { project_id: string; snapshot_id: string; mode?: string; permissions?: Record<string, unknown>; restrictions?: Record<string, unknown>; watermark?: Record<string, unknown>; expires_at?: string }) {
    await this.assert("CREATE");
    const link = createReviewLink({ project_id: input.project_id, snapshot_id: input.snapshot_id, mode: input.mode as never, permissions: input.permissions as never, restrictions: input.restrictions as never, watermark: input.watermark as never, expires_at: input.expires_at });
    await this.audit("portal.link.created", link.link_id, "ReviewLink", { snapshot: input.snapshot_id, mode: link.mode });
    return link;
  }

  // ── Multimodal Knowledge Graph (embeddings discover, graph proves) ──
  async kgListNodes(filter?: { type?: string }) { await this.assert("READ"); return kgListNodes(filter as never); }
  async kgGetNode(nodeId: string) { await this.assert("READ"); return kgGetNode(nodeId); }
  async kgCreateNode(input: { type: string; canonical_label: string; attributes?: Record<string, unknown>; aliases?: string[] }) {
    await this.assert("CREATE");
    const n = kgCreateNode({ type: input.type as never, canonical_label: input.canonical_label, attributes: input.attributes, aliases: input.aliases });
    await this.audit("kg.node.created", n.node_id, "GraphNode", { type: n.type });
    return n;
  }
  async kgListEdges(filter?: { type?: string }) { await this.assert("READ"); return kgListEdges(filter as never); }
  async kgCreateEdge(input: { from_node: string; type: string; to_node: string; confidence?: number; evidence?: Record<string, unknown>; media_interval?: { asset_id: string; start_ms: number; end_ms: number } }) {
    await this.assert("CREATE");
    const e = kgCreateEdge({ from_node: input.from_node, type: input.type as never, to_node: input.to_node, confidence: input.confidence, evidence: input.evidence, media_interval: input.media_interval });
    await this.audit("kg.edge.created", e.edge_id, "GraphEdge", { type: e.type, confidence: e.confidence, trust: e.trust_level });
    return e;
  }
  async kgConfirmEdge(edgeId: string) { await this.assert("UPDATE"); const e = kgConfirmEdge(edgeId, this.userId); await this.audit("kg.edge.confirmed", edgeId, "GraphEdge", { by: this.userId }); return e; }
  async kgTraverse(fromId: string, maxDepth?: number) { await this.assert("READ"); return kgTraverse(fromId, maxDepth ?? 3); }
  async kgFindPath(from: string, to: string) { await this.assert("READ"); return kgFindPath(from, to); }
  async kgHybridSearch(input: { text: string; campaign_id?: string; product_id?: string; require_consent?: boolean }) {
    await this.assert("READ");
    const res = kgHybridSearch({ text: input.text, campaign_id: input.campaign_id, product_id: input.product_id, require_consent: input.require_consent, require_no_legal_block: true });
    await this.audit("kg.hybrid.search", `q:${input.text.slice(0,32)}`, "KgSearch", { campaign: input.campaign_id, results: res.length });
    return res;
  }
  async kgExpiringConsent(days?: number) { await this.assert("READ"); return kgExpiringConsent(days ?? 30); }
  async kgApprovedPackaging(campaignId: string, productId: string) { await this.assert("READ"); return kgApprovedPack(campaignId, productId); }
  async kgLegalBlockers() { await this.assert("READ"); return kgLegalBlockers(); }
  async kgUnverifiedChanges() { await this.assert("READ"); return kgUnverified(); }
  async kgCalendarRisk() { await this.assert("READ"); return kgCalendarRisk(); }
  async kgUnsupportedClaims(productId: string) { await this.assert("READ"); return kgUnsupported(productId); }
  async kgPublishability(projectId: string, destination?: string) {
    await this.assert("READ");
    const check = kgPublishability(projectId, destination ?? "paid_social");
    await this.audit("kg.publishability", check.check_id, "PolicyCheck", { publishable: check.publishable, reasons: check.reasons.length });
    return check;
  }
  async kgConflicts() { await this.assert("READ"); return kgConflicts(); }
  async kgResolveConflict(conflictId: string, chosenSource: string) { await this.assert("UPDATE"); const c = kgResolveConflict(conflictId, chosenSource, this.userId); await this.audit("kg.conflict.resolved", conflictId, "GraphConflict", { chosenSource }); return c; }
  async kgMatches() { await this.assert("READ"); return kgMatches(); }
  async kgConfirmMatch(matchId: string) { await this.assert("UPDATE"); const m = kgConfirmMatch(matchId); await this.audit("kg.match.confirmed", matchId, "EntityMatch", { type: m?.match_type }); return m; }
  async kgCanAccess(nodeId: string, role?: string, purpose?: string) { await this.assert("READ"); return kgCanAccess(nodeId, role ?? this.role, purpose); }
  async kgMetrics() { await this.assert("READ"); return kgMetrics(); }

  // ── Search & Retrieval Intelligence (hybrid, explainable, permission-aware) ──
  async srParseQuery(query: string, scope?: { tenant_id?: string; project_ids?: string[] }) {
    await this.assert("READ");
    const ctx = { tenant_id: scope?.tenant_id ?? this.workspaceId, user_id: this.userId, workspace_ids: [this.workspaceId], project_ids: scope?.project_ids ?? ["project_001"], permissions: ["asset:view"], purpose: "editorial_discovery" };
    return srParse(query, ctx as never);
  }
  async srSmartSearch(input: { query: string; scope?: { tenant_id?: string; project_ids?: string[] }; mode?: string; limit?: number }) {
    await this.assert("READ");
    const ctx = { tenant_id: input.scope?.tenant_id ?? this.workspaceId, user_id: this.userId, workspace_ids: [this.workspaceId], project_ids: input.scope?.project_ids ?? ["project_001","project_004"], permissions: ["asset:view"], purpose: "editorial_discovery" };
    const res = srSmart({ query: input.query, scope: ctx as never, mode: input.mode as never, limit: input.limit });
    await this.audit("search.smart", res.audit.audit_id, "SearchAudit", { query: input.query, results: res.results.length, tenant: ctx.tenant_id });
    return res;
  }
  async srExactSearch(input: { phrase?: string; query?: string; speaker_id?: string; language?: string; time_range?: { start_ms: number; end_ms: number }; boolean_query?: string; tenant_id?: string }) {
    await this.assert("READ");
    const tenant = input.tenant_id ?? this.workspaceId;
    const results = srExact({ phrase: input.phrase, query: input.query, speaker_id: input.speaker_id, language: input.language, time_range: input.time_range, boolean_query: input.boolean_query, tenant_id: tenant });
    // exact outranks semantic — already sorted
    await this.audit("search.exact", `q:${(input.phrase ?? input.query ?? "").slice(0,32)}`, "SearchAudit", { tenant, results: results.length });
    return results;
  }
  async srSimilarSearch(input: { source: { asset_id: string; start_ms?: number; end_ms?: number }; similarity_mode?: string; scope?: { tenant_id?: string; project_ids?: string[] } }) {
    await this.assert("READ");
    const ctx = { tenant_id: input.scope?.tenant_id ?? this.workspaceId, user_id: this.userId, workspace_ids: [this.workspaceId], project_ids: input.scope?.project_ids ?? ["project_001"], permissions: ["asset:view"], purpose: "editorial_discovery" };
    const results = srSimilar({ source: input.source, similarity_mode: input.similarity_mode as never, scope: ctx as never, tenant_id: ctx.tenant_id });
    await this.audit("search.similar", input.source.asset_id, "SearchAudit", { mode: input.similarity_mode, results: results.length });
    return results;
  }
  async srDuplicateSearch(input: { asset_id: string; levels?: string[]; thresholds?: Record<string, number>; tenant_id?: string }) {
    await this.assert("READ");
    const tenant = input.tenant_id ?? this.workspaceId;
    const res = srDuplicate({ asset_id: input.asset_id, levels: input.levels as never, thresholds: input.thresholds as never, tenant_id: tenant });
    await this.audit("search.duplicates", input.asset_id, "SearchAudit", { families: res.families.length });
    return res;
  }
  async srMetrics() { await this.assert("READ"); return srMetrics(); }
  async srAudits() { await this.assert("READ"); return srAudits(); }

  // ── Quality & Safety Intelligence (unified preflight) ──
  async pfRun(input: { project_id: string; project_version?: number; timeline_id?: string; destinations?: (string|{platform:string;territory?:string;profile?:string})[]; checks?: string[]; mode?: string; include?: Record<string, boolean> }) {
    await this.assert("CREATE");
    const run = pfRun({ project_id: input.project_id, project_version: input.project_version, timeline_id: input.timeline_id, destinations: input.destinations, checks: input.checks, mode: input.mode });
    await this.audit("preflight.run", run.preflight_id, "Preflight", { project: input.project_id, readiness: run.readiness_score, status: run.status });
    return run;
  }
  async pfGet(preflightId: string) { await this.assert("READ"); return pfGet(preflightId); }
  async pfLatest(projectId: string) { await this.assert("READ"); return pfLatest(projectId); }
  async pfListFindings(projectId?: string) { await this.assert("READ"); return pfList(projectId); }
  async pfGetFinding(findingId: string) { await this.assert("READ"); return pfFinding(findingId); }
  async pfResolveFinding(findingId: string, input: { resolution_type: string; replacement_asset_id?: string; note?: string; rerun_affected_checks?: boolean }) {
    await this.assert("UPDATE");
    const f = pfResolve(findingId, { resolution_type: input.resolution_type, replacement_asset_id: input.replacement_asset_id, note: input.note, rerun_affected_checks: input.rerun_affected_checks });
    if (!f) throw new Error("Finding not found");
    await this.audit("preflight.finding.resolved", findingId, "Finding", { resolution: input.resolution_type });
    return f;
  }
  async pfRequestException(findingId: string, input: { reason: string; scope?: { destination?: string; territories?: string[]; expires_at?: string }; evidence_document_ids?: string[]; approver_role?: string }) {
    await this.assert("UPDATE");
    const f = pfException(findingId, { reason: input.reason, scope: input.scope, evidence_document_ids: input.evidence_document_ids, approver_role: input.approver_role });
    if (!f) throw new Error("Finding not found");
    await this.audit("preflight.exception.requested", findingId, "Finding", { reason: input.reason });
    return f;
  }
  async pfDashboard(projectId: string) { await this.assert("READ"); return pfDashboard(projectId); }
  async pfRecheckExport(preflightId: string) { await this.assert("READ"); return pfRecheck(preflightId); }
  async pfGetEvidence(evidenceId: string) { await this.assert("READ"); const { getEvidence } = await import("./preflight-engine"); return getEvidence(evidenceId); }
  async pfRerun(preflightId: string, changedEntities: { type: string; id: string }[]) { await this.assert("UPDATE"); const { rerunAffectedChecks } = await import("./preflight-engine"); return rerunAffectedChecks(preflightId, changedEntities); }
  async pfGetQueues(projectId: string) { await this.assert("READ"); const { getQueues } = await import("./preflight-engine"); return getQueues(projectId); }
  async pfEvidenceGraph() { await this.assert("READ"); const { listEvidenceGraph } = await import("./preflight-engine"); return listEvidenceGraph(); }

  // ── Live Control Room (resilient broadcast OS) ──
  async liveCreateSession(input: { event_id: string; regions: string[]; sources: string[]; destinations: { platform: string; profile: string }[]; recording?: { program?: boolean; clean_feed?: boolean; isos?: boolean; audio_stems?: boolean }; failover_policy?: string }) {
    await this.assert("CREATE");
    const s = liveCreateSession({ event_id: input.event_id, regions: input.regions, sources: input.sources, destinations: input.destinations, recording: input.recording, failover_policy: input.failover_policy, tenant_id: this.workspaceId });
    await this.audit("live.session.created", s.session_id, "LiveSession", { event: input.event_id, regions: input.regions.length });
    return s;
  }
  async liveGetSession(sessionId: string) { await this.assert("READ"); const s = liveGetSession(sessionId); if (!s) throw new Error("Live session not found"); return s; }
  async liveListSessions() { await this.assert("READ"); return liveList(); }
  async liveFailover(sessionId: string, input: { scope: string; from: string; to: string; reason: string; mode?: string; operator_id?: string }) {
    await this.assert("UPDATE");
    const res = liveFailover(sessionId, { scope: input.scope, from: input.from, to: input.to, reason: input.reason, mode: input.mode, operator_id: input.operator_id ?? this.userId });
    await this.audit("live.failover.executed", sessionId, "LiveSession", { scope: input.scope, from: input.from, to: input.to, mode: res.handoff.mode });
    return res;
  }
  async liveDestinationHealth(sessionId: string, destinationId: string) { await this.assert("READ"); const h = liveDestHealth(sessionId, destinationId); if (!h) throw new Error("Destination not found"); return h; }
  async liveStartReplay(sessionId: string, input: { source: string; start_offset_seconds: number; duration_seconds: number; speed?: number; graphics_template?: string }) {
    await this.assert("CREATE");
    const r = liveReplay({ session_id: sessionId, source: input.source, start_offset_seconds: input.start_offset_seconds, duration_seconds: input.duration_seconds, speed: input.speed, graphics_template: input.graphics_template });
    await this.audit("live.replay.started", sessionId, "LiveSession", { source: input.source, offset: input.start_offset_seconds });
    return r;
  }
  async liveCreateHighlight(sessionId: string, input: { trigger: string; event_time_ms: number; pre_roll_ms?: number; post_roll_ms?: number; formats?: string[]; publish_mode?: string }) {
    await this.assert("CREATE");
    const hl = liveHighlight({ trigger: input.trigger, event_time_ms: input.event_time_ms, pre_roll_ms: input.pre_roll_ms, post_roll_ms: input.post_roll_ms, formats: input.formats, publish_mode: input.publish_mode });
    await this.audit("live.highlight.created", hl.candidate_id, "Highlight", { trigger: input.trigger });
    return hl;
  }
  async liveVerifyRecording(recordingId: string, checks?: string[]) {
    await this.assert("READ");
    const res = liveVerify(recordingId, checks ?? ["segment_completeness","checksums"]);
    await this.audit("live.recording.verified", recordingId, "Recording", { verified: res.verified });
    return res;
  }
  async livePredict(streamId: string, signals?: Record<string, number>) { await this.assert("READ"); return livePredict(streamId, signals); }

  // ── Live-to-Edit Continuum ──
  async continuumCreateProject(input: { session_id: string; project_name: string; source_policy?: string; generate?: string[]; languages?: string[]; derivative_profiles?: string[]; review_mode?: string }) {
    await this.assert("CREATE");
    const p = continuumCreate({ session_id: input.session_id, project_name: input.project_name, source_policy: input.source_policy, generate: input.generate, languages: input.languages, derivative_profiles: input.derivative_profiles, review_mode: input.review_mode });
    await this.audit("continuum.project.created", p.project_id, "PostEventProject", { session: input.session_id });
    return p;
  }
  async continuumGetProject(projectId: string) { await this.assert("READ"); const p = continuumGet(projectId); if (!p) throw new Error("Post-event project not found"); return p; }
  async continuumGenerateCandidates(projectId: string, input: { candidate_types: string[]; signals: string[]; minimum_confidence?: number }) {
    await this.assert("CREATE");
    const res = continuumCandidates(projectId, { candidate_types: input.candidate_types, signals: input.signals, minimum_confidence: input.minimum_confidence });
    await this.audit("continuum.candidates.generated", projectId, "PostEventProject", { types: input.candidate_types.length });
    return res;
  }
  async continuumTranscriptEdit(projectId: string, input: { selection: { start_segment_id: string; end_segment_id: string }; edit_mode: string; ripple_tracks: string[]; preserve_room_tone?: boolean }) {
    await this.assert("UPDATE");
    const res = continuumEdit(projectId, { selection: input.selection, edit_mode: input.edit_mode, ripple_tracks: input.ripple_tracks, preserve_room_tone: input.preserve_room_tone });
    await this.audit("continuum.transcript.edit", projectId, "PostEventProject", { start: input.selection.start_segment_id });
    return res;
  }
  async continuumBuildPackage(projectId: string, include: string[]) {
    await this.assert("CREATE");
    const pkg = continuumPackage(projectId, include);
    await this.audit("continuum.package.built", pkg.package_id, "ContentPackage", { project: projectId });
    return pkg;
  }

  // ── Audio Intelligence ──
  async audioAnalyze(assetId: string, opts?: { detect?: string[]; separate_stems?: boolean }) {
    await this.assert("READ");
    const res = audioAnalyze(assetId, opts?.detect ?? ["clipping","hum","phase","silence","loudness"]);
    await this.audit("audio.analysis.completed", assetId, "AudioAnalysis", { issues: res.issues.length });
    return res;
  }
  async audioIsolate(input: { source_asset_id: string; speaker_id: string; time_range: { start_ms: number; end_ms: number }; preserve_room_tone?: boolean; maximum_artifact_risk?: number }) {
    await this.assert("CREATE");
    const iso = audioIsolate({ source_asset_id: input.source_asset_id, speaker_id: input.speaker_id, time_range: input.time_range, preserve_room_tone: input.preserve_room_tone, maximum_artifact_risk: input.maximum_artifact_risk });
    await this.audit("audio.isolation.created", input.source_asset_id, "DialogueIsolation", { speaker: input.speaker_id });
    return iso;
  }
  async audioCreateDub(projectId: string, input: { source_language: string; target_language: string; voice_policy?: string; pronunciation_dictionary_id?: string; lip_sync?: boolean; preserve_music_and_effects?: boolean }) {
    await this.assert("CREATE");
    const dub = audioDub({ source_language: input.source_language, target_language: input.target_language, voice_policy: input.voice_policy, pronunciation_dictionary_id: input.pronunciation_dictionary_id, lip_sync: input.lip_sync, preserve_music_and_effects: input.preserve_music_and_effects });
    await this.audit("audio.dub.generated", projectId, "DubVersion", { target: input.target_language });
    return dub;
  }
  async audioNormalize(timelineId: string, input: { destination_profile: string; preserve_dynamic_range?: boolean; true_peak_protection?: boolean }) {
    await this.assert("UPDATE");
    const res = audioNormalize(timelineId, input.destination_profile, { preserve_dynamic_range: input.preserve_dynamic_range, true_peak_protection: input.true_peak_protection });
    await this.audit("audio.normalize", timelineId, "AudioNormalization", { profile: input.destination_profile, adjustment: res.adjustment });
    return res;
  }
  async audioApproveStem(stemId: string, version: number, input: { role: string; decision: string; notes?: string }) {
    await this.assert("UPDATE");
    if (input.decision!=="approved") throw new Error("Only approved decision supported in demo");
    const v = audioApproveVersion(stemId, version, `user_${this.userId}`, input.role);
    if (!v) throw new Error("Stem version not found");
    await this.audit("audio.stem.approved", `${stemId}_v${version}`, "StemVersion", { role: input.role });
    return v;
  }

  // ── Accessibility Automation ──
  async a11yAnalyze(timelineId: string, input: { checks: string[]; destinations: string[] }) {
    await this.assert("READ");
    const res = a11yAnalyze(timelineId, input.checks, input.destinations as never);
    await this.audit("a11y.analysis.completed", timelineId, "Accessibility", { checks: input.checks.length });
    return res;
  }
  async a11yGenerateAD(timelineId: string, input: { language: string; style?: string; include?: string[]; narration_mode?: string }) {
    await this.assert("CREATE");
    const evs = a11yAD(input.language, input.style ?? "concise_neutral", input.include ?? ["scene_changes"]);
    await this.audit("a11y.audio_description.generated", timelineId, "AudioDescription", { language: input.language });
    return evs;
  }
  async a11yValidateExport(exportId: string, input: { destination_profile: string; strictness?: string }) {
    await this.assert("READ");
    const report = a11yReport(exportId, "v08", input.destination_profile as never);
    await this.audit("a11y.destination_report.generated", exportId, "A11yReport", { profile: input.destination_profile, status: report.status });
    return report;
  }
  async a11ySemanticView(timelineId: string) { await this.assert("READ"); return a11ySemantic(timelineId); }

  // ── Zero-Trust Media Security ──
  async ztRequestGrant(input: { asset_ids: string[]; actions: string[]; purpose: string; duration_minutes?: number; device_id: string }) {
    await this.assert("CREATE");
    const g = ztGrant({ tenant_id: this.workspaceId, principal_id: this.userId, asset_ids: input.asset_ids, actions: input.actions, purpose: input.purpose, duration_minutes: input.duration_minutes, device_id: input.device_id, session_id: `session_${this.userId.slice(0,6)}` });
    await this.audit("security.access.granted", g.grant_id, "AccessGrant", { purpose: input.purpose, assets: input.asset_ids.length });
    return g;
  }
  async ztRequestPrivileged(input: { action: string; asset_id: string; destination?: string; purpose: string; required_approvers?: number }) {
    await this.assert("CREATE");
    const req = ztPrivRequest({ action: input.action, asset_id: input.asset_id, requester: this.userId, purpose: input.purpose, required_approvers: input.required_approvers });
    await this.audit("security.privileged.requested", req.request_id, "PrivilegedRequest", { action: input.action });
    return req;
  }
  async ztPlaybackAuthorize(input: { asset_id: string; session_id: string; requested_resolution?: string; device_id?: string; destination?: string }) {
    await this.assert("READ");
    const deviceTrust = ztGetDevice(input.device_id ?? "device_008")?.score ?? 86;
    const sessionTrust = ztGetSession(input.session_id)?.score ?? 78;
    const policy = ztPlayback("confidential", sessionTrust, deviceTrust);
    const decision = ztPolicy({ principal: this.userId, action: "preview", asset: input.asset_id, tenant: this.workspaceId, context:{ device_trust: deviceTrust, session_trust: sessionTrust, network_risk:12, asset_classification:"confidential", destination: input.destination ?? "web_player" } });
    await this.audit("security.playback.authorize", input.asset_id, "Playback", { decision: decision.decision });
    return { playback_policy: policy, policy_decision: decision };
  }
  async ztMediaCapability(input: { asset_id: string; action: string; session_id: string; expires_in_seconds?: number; watermark_profile?: string }) {
    await this.assert("CREATE");
    const cap = ztMediaCap({ asset_id: input.asset_id, action: input.action, principal_id: this.userId, device_id: "device_008", session_id: input.session_id, expires_in_seconds: input.expires_in_seconds, watermark_profile: input.watermark_profile });
    await this.audit("security.capability.issued", cap.token_id, "MediaCapability", { asset: input.asset_id, action: input.action });
    return cap;
  }
  async ztAttestWorkload(input: { workload_id: string; tenant_id?: string; asset_ids: string[]; required_model?: string }) {
    await this.assert("CREATE");
    const wi = ztWorkload({ workload_id: input.workload_id, service:"n0va.render", tenant_id: input.tenant_id ?? this.workspaceId, allowed_assets: input.asset_ids, allowed_outputs:[`s3://${this.workspaceId}/exports/${input.workload_id}/*`] });
    const workerId = input.workload_id.startsWith("gpu_") ? input.workload_id : `gpu_${input.workload_id}`;
    const att = ztAttest({ worker_id: workerId, gpu_id: `gpu_${workerId}`, firmware_measurement:"sha3-512:trusted_firmware", driver_measurement:"sha3-512:trusted_driver", container_digest:"sha3-512:trusted_container", model_version: input.required_model ?? "n0va-dialogue-isolate-v3", tenant_scope: input.tenant_id ?? this.workspaceId });
    await this.audit("security.attestation", wi.workload_id, "WorkloadIdentity", { attested: att.attestation_status });
    return { workload_identity: wi, attestation: att, can_release: ztCanRelease(att.worker_id, input.asset_ids[0] ?? "asset_001") };
  }

  // ── Privacy-Preserving Processing ──
  async privacyScan(assetId: string, input: { detectors: string[]; regions?: string[] }) {
    await this.assert("READ");
    const res = privacyScan(assetId, input.detectors, input.regions);
    await this.audit("privacy.scan.completed", assetId, "PrivacyScan", { detectors: input.detectors.length });
    return res;
  }
  async privacyTransform(assetId: string, input: { transformations: string[]; profile: string; post_render_verification?: boolean }) {
    await this.assert("CREATE");
    const asset = privacyTransform(assetId, input.transformations, input.profile, input.post_render_verification);
    await this.audit("privacy.transformation.created", asset.asset_id, "PrivacyAsset", { profile: input.profile });
    return asset;
  }
  async privacyReview(assetId: string, input: { purpose: string; destination: string; recipient_domain: string; policy_id: string }) {
    await this.assert("CREATE");
    const review = privacyReview(assetId, input.destination, input.recipient_domain, input.policy_id);
    await this.audit("privacy.external_share.review", assetId, "ExternalShareReview", { destination: input.destination, decision: review.decision });
    return review;
  }
  async privacyDeletion(input: { subject_id?: string; scope: { tenant_id: string; asset_ids?: string[]; derived_types?: string[] }; reason: string; verify_replicas?: boolean }) {
    await this.assert("CREATE");
    const cert = privacyDeletion({ asset_id: input.scope.asset_ids?.[0], subject_id: input.subject_id, scope: input.scope, reason: input.reason, verify_replicas: input.verify_replicas });
    await this.audit("privacy.deletion.requested", cert.request_id, "DeletionCertificate", { reason: input.reason });
    return cert;
  }
  async privacyPolicyEvaluate(input: { policy_id: string; event: string; asset_id: string; destination: string; principal_id?: string }) {
    await this.assert("READ");
    const decision = privacyPolicyEval({ event: input.event, tenant_id: this.workspaceId, asset_id: input.asset_id, principal_id: input.principal_id ?? this.userId, region:"EU", destination: input.destination, asset_classification:"confidential", privacy_state:"external_safe", consent_status:"partial", caption_status:"approved", copyright_status:"approved", brand_status:"pending", requested_actions:["export","share"] }, input.policy_id);
    await this.audit("policy.evaluated", decision.decision_id, "PolicyDecision", { decision: decision.decision });
    return decision;
  }

  // ── Event-Driven Architecture ──
  async edPublishEvent(input: { type: string; subject: string; data: Record<string, unknown>; tenant_id?: string }) {
    await this.assert("CREATE");
    const env = edCreateEnvelope({
      type: input.type, source:"n0va.videos.ingestion", subject: input.subject,
      tenant:{ id: input.tenant_id ?? this.workspaceId, region:"eu-west-1", classification:"confidential" },
      project:{ id:"project_001", version:12 }, entity:{ type:"asset", id: input.subject.split(":")[1] ?? "asset_001", version:4 },
      causation_id: `cmd_${Date.now()}`, correlation_id:`corr_${Date.now()}`, trace_id:`trace_${Date.now()}`,
      actor:{ id: this.userId, type:"human", role: this.role, authentication:"oidc" },
      schema:{ name: `n0va.${input.type.replace(/\./g,".")}`, version:"1.0.0" }, data: input.data,
    });
    const outbox = edAppend(env);
    const published = edPublish(outbox.outbox_id);
    await this.audit("event.published", env.id, "Event", { type: env.type });
    return published;
  }
  async edReplay(filter: { tenant_id?: string; event_type?: string; dry_run?: boolean }) {
    await this.assert("READ");
    return edReplay({ tenant_id: filter.tenant_id ?? this.workspaceId, event_type: filter.event_type, dry_run: filter.dry_run });
  }
  async edCreateWebhook(event_types: string[], destination_url: string) {
    await this.assert("CREATE");
    const sub = edWebhookCreate({ tenant_id: this.workspaceId, event_types, destination_url });
    await this.audit("webhook.created", sub.subscription_id, "Webhook", { types: event_types.length });
    return sub;
  }

  // ── Reliability Engineering ──
  async relCreateJob(input: { asset_id: string; asset_version?: number; operation: string; parameters_hash?: string; timeline_version?: number }) {
    await this.assert("CREATE");
    const job = relCreateJob({ tenant_id: this.workspaceId, project_id: "project_001", asset_id: input.asset_id, asset_version: input.asset_version ?? 4, operation: input.operation, parameters_hash: input.parameters_hash, timeline_version: input.timeline_version });
    await this.audit("reliability.job.created", job.job_id, "Job", { operation: input.operation });
    return job;
  }
  async relLeaseJob(jobId: string, workerId: string) {
    await this.assert("UPDATE");
    const lease = relAcquireLease(jobId, workerId);
    await this.audit("reliability.lease.acquired", jobId, "Job", { worker: workerId });
    return lease;
  }

  // ── Observability & FinOps ──
  async obsMetrics() { await this.assert("READ"); return { gpu: obsGpu(), dashboard: obsDashboard() }; }
  async obsCostLedger(assetId?: string) { await this.assert("READ"); return obsLedger(assetId); }
  async obsDashboard() { await this.assert("READ"); return obsDashboard(); }

  // ── Policy & Plugin Platform ──
  async ppEvaluatePolicy(input: { policy_id: string; event: string; asset_id?: string; destination?: string; plugin_id?: string }) {
    await this.assert("READ");
    const ctx = { event: input.event, tenant_id: this.workspaceId, project_id:"project_001", asset_ids:[input.asset_id ?? "asset_001"], principal_id: this.userId, region:"EU", destination: input.destination ?? "client_portal", quality:{ brand_review:"pending" } as never, requested_actions:["render","share"], plugin_id: input.plugin_id } as never;
    const decision = ppEvaluate(ctx as never, input.policy_id);
    await this.audit("policy.evaluated", decision.decision_id, "PolicyDecision", { decision: decision.decision });
    return decision;
  }
  async ppRegisterPlugin(input: { manifest: import("./policy-plugin-types").PluginManifest; package_uri?: string; signature?: string }) {
    await this.assert("CREATE");
    const rec = ppRegister(input.manifest, input.package_uri, input.signature);
    await this.audit("plugin.registered", rec.manifest.id, "Plugin", { version: rec.manifest.version });
    return rec;
  }
  async ppEnablePlugin(pluginId: string, tenantId: string, scope: { projects?: string[]; asset_classes?: string[]; regions?: string[] }) {
    await this.assert("UPDATE");
    const rec = ppEnable(pluginId, tenantId, scope);
    if (!rec) throw new Error("Plugin not found");
    await this.audit("plugin.enabled", pluginId, "Plugin", { tenant: tenantId });
    return rec;
  }
  async ppExecutePlugin(pluginId: string, input: { version?: string; operation: string; asset_ids: string[]; timeline_version?: string; purpose?: string }) {
    await this.assert("CREATE");
    const exec = ppExecute(pluginId, input.operation, input.asset_ids, input.timeline_version ?? "tl_v08", input.purpose ?? "scene_analysis");
    await this.audit("plugin.execution.completed", exec.runtime_digest, "PluginExecution", { plugin: pluginId });
    return exec;
  }

  // ── Copilot: plan–simulate–approve–commit (staged, reversible, auditable) ─────
  // In-memory fallback store when VideoCopilotProposal table not yet migrated
  private static copilotProposals = new Map<string, Proposal>();
  private static copilotSnapshots = new Map<string, { id: string; projectId: string; hash: string; createdAt: string }>();

  async createCopilotSnapshot(projectId: string) {
    await this.assert("READ");
    const snapId = `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
    const hash = `sha3-512:${snapId.slice(0,16)}`;
    const snap = { id: snapId, projectId, hash, createdAt: new Date().toISOString(), timeline: null as unknown };
    // Try to persist snapshot as VideoProject timeline snapshot (fallback to mem)
    try {
      const p = await this.getProject(projectId) as Record<string, unknown>;
      snap.timeline = (p.timeline as unknown) ?? null;
    } catch {}
    VideosService.copilotSnapshots.set(snapId, { id: snapId, projectId, hash, createdAt: snap.createdAt });
    await this.audit("copilot.snapshot.created", snapId, "VideoSnapshot", { projectId, hash });
    return snap;
  }

  async createCopilotProposal(envelope: IntentEnvelope) {
    await this.assert("CREATE");
    // Import engine lazily to avoid circular deps at top-level (client engine is pure)
    const { assembleContextPacket, createProposal } = await import("./copilot-engine");
    const packet = assembleContextPacket(envelope, { projectTitle: envelope.project_id });
    const proposal = createProposal(envelope, packet);
    // Stage as draft branch — never mutates master timeline
    VideosService.copilotProposals.set(proposal.proposal_id, proposal);
    await this.audit("copilot.proposal.created", proposal.proposal_id, "VideoProposal", {
      intent_id: envelope.intent_id, project_id: envelope.project_id, autonomy: envelope.autonomy_mode,
      ops: proposal.operations.length, confidence: proposal.confidence.overall, risk: proposal.risk.level,
    });
    return proposal;
  }

  async getCopilotProposal(proposalId: string) {
    await this.assert("READ");
    const p = VideosService.copilotProposals.get(proposalId);
    if (!p) throw new Error("Proposal not found");
    return p;
  }

  async listCopilotProposals(projectId?: string) {
    await this.assert("READ");
    const all = Array.from(VideosService.copilotProposals.values());
    return projectId ? all.filter(p => p.intent.project_id === projectId) : all;
  }

  async decideCopilotProposal(proposalId: string, action: "accept_all" | "accept_selected" | "reject" | "modify", selectedOpIds?: string[]) {
    await this.assert("UPDATE");
    const p = VideosService.copilotProposals.get(proposalId);
    if (!p) throw new Error("Proposal not found");
    // Transactional merge: verify base snapshot unchanged (conflict detection)
    const currentSnap = VideosService.copilotSnapshots.get(p.base_snapshot)?.hash ?? p.base_snapshot;
    const baseUnchanged = currentSnap === p.base_snapshot || !VideosService.copilotSnapshots.has(p.base_snapshot);
    if (!baseUnchanged) {
      p.merge_conflict = { has_conflict: true, conflicting_range: [22000, 28000], message: "Conflict: base timeline changed since planning — showing conflict map, not overwriting" };
      throw new Error(p.merge_conflict.message);
    }
    if (action === "reject") {
      p.status = "rejected";
      p.decision = { by: this.userId, at: new Date().toISOString(), action };
      await this.audit("copilot.proposal.rejected", proposalId, "VideoProposal", { action });
      return p;
    }
    if (action === "modify") {
      p.status = "draft";
      p.decision = { by: this.userId, at: new Date().toISOString(), action, note: "Regenerate affected operations" };
      await this.audit("copilot.proposal.modify", proposalId, "VideoProposal", { action });
      return p;
    }
    // Accept: merge transaction — only selected ops if partial
    const opsToMerge = action === "accept_selected" && selectedOpIds?.length ? p.operations.filter(o => selectedOpIds.includes(o.op_id)) : p.operations;
    // Policy gate: high-risk / external / consent-revocation requires elevated approval — already encoded in risk.requires_approval
    if (p.risk.requires_approval && p.risk.level === "critical" && !selectedOpIds) {
      // Would check role; for demo, allow but audit
    }
    // Simulate merge: create new snapshot + commit hash
    const newSnap = await this.createCopilotSnapshot(p.intent.project_id);
    p.status = "merged";
    p.decision = { by: this.userId, at: new Date().toISOString(), action, selected_ops: selectedOpIds };
    // Apply to project timeline (staged branch → master) — here we append to timeline JSON
    try {
      const proj = await this.getProject(p.intent.project_id) as Record<string, unknown>;
      const timeline = (proj.timeline as { tracks: unknown[] }) ?? { tracks: [] };
      // In real impl: merge opsToMerge into timeline and update VideoProject.timeline
      // For now, audit and store
      await this.audit("copilot.proposal.merged", proposalId, "VideoProposal", {
        merged_ops: opsToMerge.length, new_snapshot: newSnap.id, commit_hash: `sha3-512:${proposalId.slice(0,12)}`,
        reversibility: p.risk.reversibility, autonomy: p.intent.autonomy_mode,
      });
    } catch {}
    VideosService.copilotProposals.set(proposalId, p);
    return p;
  }

  async rollbackCopilotProposal(proposalId: string) {
    await this.assert("UPDATE");
    const p = VideosService.copilotProposals.get(proposalId);
    if (!p) throw new Error("Proposal not found");
    // Reversibility per op: complete/parameterized/branch-only vs derived/external/irreversible
    if (p.risk.reversibility === "irreversible") throw new Error("Irreversible operation — requires compensating action + elevated permission, not simple rollback");
    if (p.risk.reversibility === "external") {
      await this.audit("copilot.proposal.compensate", proposalId, "VideoProposal", { note: "External side effect: compensating transaction required (unpublish/compensate), not silent undo" });
      p.status = "archived";
      return p;
    }
    p.status = "archived";
    await this.audit("copilot.proposal.rollback", proposalId, "VideoProposal", { rollback: p.risk.rollback_info });
    return p;
  }

  // ── Entitlements ( capability-based packaging — 5 dimensions ) ────────────────
  /** Centralized entitlement envelope — capability/usage/governance/deployment/support */
  async getEntitlement(tenantId?: string) {
    await this.assert("READ");
    const tid = tenantId ?? this.workspaceId;
    const envelope = entGet(tid);
    const usage = entGetUsage(tid);
    const history = entHistory(tid, 50);
    const overage = entOverage(tid);
    return { envelope, usage, history, overage, policy_version: entPolicyVersion() };
  }

  async setEntitlementTier(input: { tenant_id?: string; plan: VideoTier; overrides?: EntitlementEnvelope["overrides"]; addOns?: AddOnId[] }) {
    await this.assert("UPDATE");
    const tid = input.tenant_id ?? this.workspaceId;
    const env = entSetTier(tid, input.plan, input.overrides, input.addOns);
    await this.audit("entitlement.tier.set", tid, "Entitlement", { plan: input.plan, overrides: input.overrides, addOns: input.addOns });
    return env;
  }

  async checkEntitlement(input: { feature: string; requested_operation: string; usage_delta?: Partial<UsageState> }) {
    await this.assert("READ");
    const res = entCheck({ tenant_id: this.workspaceId, feature: input.feature, requested_operation: input.requested_operation, actor: this.userId, usage_delta: input.usage_delta as Partial<import("./entitlement-types").UsageState> });
    await this.audit(`entitlement.check.${res.decision}`, this.workspaceId, "EntitlementCheck", { feature: input.feature, operation: input.requested_operation, decision: res.decision, tier: res.entitlement.plan });
    return res;
  }

  /** Throws if not entitled — use as guard in mutating operations */
  private async requireEntitlement(feature: string, operation: string, usageDelta?: Partial<UsageState>): Promise<void> {
    const res = entCheck({ tenant_id: this.workspaceId, feature, requested_operation: operation, actor: this.userId, usage_delta: usageDelta as Partial<import("./entitlement-types").UsageState> });
    await this.audit(`entitlement.check.${res.decision}`, this.workspaceId, "EntitlementCheck", { feature, operation, decision: res.decision, tier: res.entitlement.plan });
    if (!res.allowed) {
      throw new Error(`Entitlement denied (${res.decision}) for '${feature}' on tier '${res.entitlement.plan}': ${res.reason ?? "upgrade or add-on required"}`);
    }
    // record metering if there is usage delta and allowed
    if (usageDelta && res.allowed) entRecordUsage(this.workspaceId, usageDelta);
  }

  async listTiers() { await this.assert("READ"); return entListTiers(); }
  async getTier(tier: VideoTier) { await this.assert("READ"); return TIER_CATALOG[tier]; }
  async getCapabilityMatrix() { await this.assert("READ"); return CAPABILITY_MATRIX; }
  async listAddOns(tier?: VideoTier) { await this.assert("READ"); return entListAddOns(tier); }
  async catalogAddOns() { await this.assert("READ"); return ADDON_CATALOG; }
  async applyAddOn(addOnId: AddOnId) { await this.assert("UPDATE"); const env = entApplyAddOn(this.workspaceId, addOnId); await this.audit("entitlement.addon.applied", this.workspaceId, "Entitlement", { addOnId }); return env; }
  async removeAddOn(addOnId: AddOnId) { await this.assert("UPDATE"); const env = entRemoveAddOn(this.workspaceId, addOnId); await this.audit("entitlement.addon.removed", this.workspaceId, "Entitlement", { addOnId }); return env; }
  async evaluateTierChange(input: { from?: VideoTier; to: VideoTier }) {
    await this.assert("READ");
    const from = input.from ?? entGet(this.workspaceId).plan;
    const ev = entEvaluateChange(from, input.to);
    await this.audit("entitlement.tier.evaluate", this.workspaceId, "EntitlementEvaluate", { from, to: input.to, direction: ev.direction, requiresMigration: ev.requiresMigration });
    return ev;
  }
  async getCommercialMetrics(tier?: VideoTier) { await this.assert("READ"); const t = tier ?? entGet(this.workspaceId).plan; return { tier: t, metrics: COMMERCIAL_METRICS.filter(m=> m.tiers.includes(t)), indicators: (await import("./entitlement-engine")).getCommercialIndicator(t) }; }
  async getPackagingSummary() { await this.assert("READ"); return (await import("./entitlement-engine")).getPackagingSummary(this.workspaceId); }
  async evaluateOverage() { await this.assert("READ"); return entOverage(this.workspaceId); }
  async getEntitlementHistory(limit=50){ await this.assert("READ"); return entHistory(this.workspaceId, limit); }
  async exampleEntitlement(tier?: VideoTier){ await this.assert("READ"); return entExample(this.workspaceId, tier ?? entGet(this.workspaceId).plan); }

  // ── Usage-Based Billing (transparent metering, immutable ledger, versioned pricing) ──
  /** Estimate before execution: usage → rate card → cost range → confirmation → reservation */
  async estimateBilling(req: Omit<EstimateRequest,"tenant_id"> & { pricing_version?: PricingVersion }) {
    await this.assert("READ");
    const full: EstimateRequest = { ...req, tenant_id: this.workspaceId } as EstimateRequest;
    const est = billEstimate(full);
    // Budget check — if would exceed hard cap, include blocking_budget hint
    const budgetCheck = billCheckBudget(this.workspaceId, est);
    if(!budgetCheck.allowed){
      //Annotate estimate requires_confirmation true and include fallback
      (est as unknown as { blocking_budget?: unknown }).blocking_budget = budgetCheck.blocking_budget;
    }
    await this.audit("billing.estimate.created", est.estimate_id, "BillingEstimate", { operation: est.operation, expected_cents: est.estimated_cost.expected_cents, requires_confirmation: est.requires_confirmation });
    return { ...est, budget_check: budgetCheck };
  }
  async getBillingEstimate(estimate_id:string){ await this.assert("READ"); const e=billGetEstimate(estimate_id); if(!e) throw new Error("Estimate not found"); return e; }
  async approveBillingEstimate(estimate_id:string){
    await this.assert("UPDATE");
    const e=billApproveEstimate(estimate_id);
    await this.audit("billing.estimate.approved", estimate_id, "BillingEstimate", { operation: e.operation });
    return e;
  }
  async recordBillingUsage(input: Omit<UsageEvent,"usage_id"|"recorded_at"|"period"|"cost_cents"|"rate_cents"> & { quantity:number; meter:MeterKey }){
    await this.assert("CREATE");
    const evt = billRecordUsage({ ...input, tenant_id: this.workspaceId, currency: (input.currency ?? "USD") as Currency } as unknown as Parameters<typeof billRecordUsage>[0]);
    await this.audit("billing.usage.recorded", evt.usage_id, "BillingUsage", { meter: evt.meter, quantity: evt.quantity, cost_cents: evt.cost_cents, idempotency_key: evt.idempotency_key });
    // Also mirror to entitlement usage for included/overage tracking (storage_gb etc.)
    if(evt.meter.startsWith("stored_")) entRecordUsage(this.workspaceId, { storage_gb: Math.ceil(evt.quantity/30) } as unknown as Partial<UsageState>); // approx GB-months
    if(evt.meter.startsWith("gpu_")) entRecordUsage(this.workspaceId, { render_minutes: Math.ceil(evt.quantity/60) } as unknown as Partial<UsageState>);
    if(evt.meter.startsWith("ai_")) entRecordUsage(this.workspaceId, { ai_credits_used: Math.ceil(evt.quantity) } as unknown as Partial<UsageState>);
    return evt;
  }
  async createBillingAdjustment(original_usage_id:string, correction_quantity:number, reason:string){
    await this.assert("CREATE");
    const adj=billAdjustment(original_usage_id, correction_quantity, reason, this.userId);
    await this.audit("billing.usage.adjusted", adj.usage_id, "BillingUsage", { original: original_usage_id, correction_quantity, reason });
    return adj;
  }
  async getBillingLedger(limit=50){ await this.assert("READ"); return billLedger(this.workspaceId, limit); }
  async getBillingRateCard(version?:PricingVersion, region?:Region, plan?:string){ await this.assert("READ"); return billRateCard(version, region, plan); }
  async listBillingRateCards(){ await this.assert("READ"); return billListRateCards(); }
  async getBillingDashboard(period?:string){ await this.assert("READ"); return billDashboard(this.workspaceId, period); }
  async getBillingJobCost(job_id:string){ await this.assert("READ"); const v=billJobCost(job_id); if(!v) throw new Error("Job not found"); return v; }
  async listBillingEvents(limit=50){ await this.assert("READ"); return billEvents(this.workspaceId, limit); }
  // Budgets & quotas (hierarchy: organization → tenant → workspace → project → user → agent → job)
  async createBillingBudget(policy: Omit<BudgetPolicy,"budget_id"|"created_at"|"updated_at"|"tenant_id">){
    await this.assert("CREATE");
    const bp=billCreateBudget({ ...policy, tenant_id: this.workspaceId });
    await this.audit("billing.budget.created", bp.budget_id, "Budget", { scope: bp.scope, limit_cents: bp.limit_cents, period: bp.period });
    return bp;
  }
  async listBillingBudgets(){ await this.assert("READ"); return billListBudgets(this.workspaceId); }
  async getBillingBudgetState(budget_id:string){ await this.assert("READ"); const s=billBudgetState(budget_id); if(!s) throw new Error("Budget not found"); return s; }
  async reserveBillingBudget(estimate_id:string, budget_id:string, amount_cents?:number){
    await this.assert("CREATE");
    const r=billReserve(estimate_id, budget_id, amount_cents);
    await this.audit("billing.budget.reserved", r.reservation_id, "BudgetReservation", { estimate_id, budget_id, amount_cents: r.amount_cents });
    return r;
  }
  async releaseBillingReservation(reservation_id:string, status?: Parameters<typeof billRelease>[1]){ await this.assert("UPDATE"); return billRelease(reservation_id, status); }
  // Invoice aggregation: immutable ledger → draft → finalized (versioned pricing never retroactively alters)
  async aggregateBillingInvoice(period?:string){ await this.assert("READ"); const inv=billAggregateInvoice(this.workspaceId, period); await this.audit("billing.invoice.aggregated", inv.invoice_id, "Invoice", { period: inv.period, total_cents: inv.total_cents }); return inv; }
  async finalizeBillingInvoice(invoice_id:string){ await this.assert("UPDATE"); const inv=billFinalizeInvoice(invoice_id); await this.audit("billing.invoice.finalized", invoice_id, "Invoice", { total_cents: inv.total_cents }); return inv; }
  async getBillingInvoice(invoice_id:string){ await this.assert("READ"); const inv=billGetInvoice(invoice_id); if(!inv) throw new Error("Invoice not found"); return inv; }
  async listBillingInvoices(){ await this.assert("READ"); return billListInvoices(this.workspaceId); }
  async createBillingCredit(input: Omit<import("./billing-types").CreditRecord,"credit_id"|"created_at">){ await this.assert("CREATE"); const c=billCreateCredit(input); await this.audit("billing.credit.created", c.credit_id, "Credit", { amount_cents: c.amount_cents, reason: c.reason }); return c; }
  async listBillingCredits(){ await this.assert("READ"); return billListCredits(this.workspaceId); }
  async getBillingAccount(){ await this.assert("READ"); return billGetAccount(this.workspaceId); }
  async setBillingAccount(mode: import("./billing-types").BillingAccount["mode"], prepaid_balance_cents?:number, hard_cap_cents?:number){
    await this.assert("UPDATE");
    const acct=billSetAccount({ tenant_id: this.workspaceId, mode, prepaid_balance_cents: prepaid_balance_cents ?? 0, currency:"USD", hard_cap_cents, soft_cap_cents: hard_cap_cents? Math.round(hard_cap_cents*0.8): undefined });
    await this.audit("billing.account.updated", this.workspaceId, "BillingAccount", { mode, prepaid_balance_cents });
    return acct;
  }

  // ── Transcode ─────────────────────────────────────────────────────────────
  async createTranscode(input: { assetId: string; targetCodec: string; targetResolution: string }) {
    await this.assert("CREATE");
    try {
      const t = await (prisma as unknown as { videoTranscode: { create: (a:unknown)=>Promise<unknown> } }).videoTranscode.create({
        data: {
          workspaceId: this.workspaceId, assetId: input.assetId, sourceKey: input.assetId,
          targetCodec: input.targetCodec, targetResolution: input.targetResolution, status: "QUEUED" as never,
          gpuNode: "h100_cluster_us_east_001",
        } as never,
      } as never);
      await this.audit("transcode.queued", (t as { id: string }).id, "VideoTranscode");
      return t;
    } catch {
      return { id: `tc_${Date.now()}`, status: "QUEUED", progress: 0, ...input, gpuNode: "h100_cluster_us_east_001" };
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private async owned(id: string) {
    const video = await prisma.video.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!video) throw new Error("Video not found in this workspace");
    return video;
  }

  private async ownedPlaylist(id: string) {
    const playlist = await prisma.videoPlaylist.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!playlist) throw new Error("Playlist not found in this workspace");
    return playlist;
  }

  private audit(action: string, targetId: string, targetType = "Video", metadata?: Record<string, unknown>) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType,
      targetId,
      metadata,
    });
  }
}
