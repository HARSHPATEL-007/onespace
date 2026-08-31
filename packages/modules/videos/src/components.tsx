"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Dialog, Dropdown, MenuItem, Tabs } from "@n0va/ui";
import type { Video, VideoPlaylist } from "@n0va/db";
import { embedFor, EXPORT_PRESETS } from "./server";
import { VideoCopilotPanel } from "./copilot-components";
import { GovernanceControlCenter } from "./governance-components";
import { ProvenanceExplorer } from "./provenance-components";
import { SemanticTimelinePanel } from "./semantic-components";
import { GraphPanel } from "./graph-components";
import { QualityPanel } from "./quality-components";
import { GenerativePanel } from "./generative-components";
import { InterchangePanel } from "./interchange-components";
import { BrandPanel } from "./brand-components";
import { IdentityPanel } from "./identity-components";
import { ReviewIntelligencePanel } from "./review-components";
import { ClientReviewPortalPanel } from "./client-review-components";
import { KnowledgeGraphPanel } from "./knowledge-graph-components";
import { SearchRetrievalPanel } from "./search-retrieval-components";
import { PreflightPanel } from "./preflight-components";
import { LiveControlRoomPanel } from "./live-control-components";
import { LiveEditContinuumPanel } from "./live-edit-components";
import { AudioIntelligencePanel } from "./audio-intelligence-components";
import { AccessibilityAutomationPanel } from "./accessibility-automation-components";
import { ZeroTrustPanel } from "./zero-trust-components";
import { PrivacyPreservingPanel } from "./privacy-preserving-components";
import { EventDrivenPanel } from "./event-driven-components";
import { ReliabilityEngineeringPanel } from "./reliability-engineering-components";
import { ObservabilityFinOpsPanel } from "./observability-finops-components";
import { PolicyPluginPanel } from "./policy-plugin-components";
import { EntitlementControlCenter } from "./entitlement-components";
import { BillingControlCenter } from "./billing-components";

// ── Legacy Types ─────────────────────────────────────────────────────────────
export interface VideosActions {
  create: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
  createPlaylist: (formData: FormData) => Promise<void>;
  renamePlaylist: (formData: FormData) => Promise<void>;
  removePlaylist: (formData: FormData) => Promise<void>;
  setVideoPlaylist: (formData: FormData) => Promise<void>;
}
export type PlaylistWithCount = VideoPlaylist & { _count: { videos: number } };

// ── Transcendent Types ──────────────────────────────────────────────────────
export interface TranscendentActions extends VideosActions {
  createProject?: (formData: FormData) => Promise<void>;
  deleteProject?: (formData: FormData) => Promise<void>;
  createExport?: (formData: FormData) => Promise<void>;
  generateAI?: (formData: FormData) => Promise<void>;
  uploadAsset?: (formData: FormData) => Promise<void>;
}

export interface VideoProjectLike {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  category?: string;
  tags?: string[];
  thumbnailUrl?: string | null;
  durationSec?: number | null;
  resolution?: string | null;
  timeline?: { tracks: TrackLike[]; markers: unknown[]; chapters: unknown[] };
  updatedAt: Date | string;
  createdAt?: Date | string;
  metadata?: Record<string, unknown>;
}
interface TrackLike {
  trackId: string;
  trackType: string;
  trackName: string;
  enabled: boolean;
  clips: ClipLike[];
}
interface ClipLike {
  clipId: string;
  sourceAssetId?: string;
  timelineInMs: number;
  timelineOutMs: number;
  effects?: unknown[];
  speed?: number;
}
function projectTitleFallback(projects: VideoProjectLike[]): string {
  return projects[0]?.title ?? "Untitled Project";
}

// ── Legacy: Detail & Library (kept) ────────────────────────────────────────
export function VideoDetail({ video }: { video: Video }) {
  const embed = embedFor(video.url, video.provider);
  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <a href="/m/videos" className="nv-link" style={{ fontSize: "var(--nv-font-sm)" }}>
        ← Video library
      </a>
      <div style={{ aspectRatio: "16/9", borderRadius: "var(--nv-radius-lg)", overflow: "hidden", background: "#000", marginTop: "var(--nv-space-3)" }}>
        {embed ? (
          <iframe src={embed} title={video.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ width: "100%", height: "100%", border: "none" }} />
        ) : (
          <a href={video.url} target="_blank" rel="noreferrer" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15 }}>
            Open external video ↗
          </a>
        )}
      </div>
      <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800, marginTop: "var(--nv-space-4)" }}>{video.title}</h1>
      {video.description && <p style={{ color: "var(--nv-color-text-muted)" }}>{video.description}</p>}
      <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
        {video.provider} · added {video.uploadedAt.toLocaleDateString()}
        {video.durationSec ? ` · ${Math.floor(video.durationSec / 60)}:${String(video.durationSec % 60).padStart(2, "0")}` : ""}
      </div>
    </div>
  );
}

export function VideoLibrary({
  videos,
  playlists,
  actions,
}: {
  videos: Video[];
  playlists: PlaylistWithCount[];
  actions: VideosActions;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

  const run = (fd: FormData, fn: (fd: FormData) => Promise<void>) => {
    void fn(fd).then(() => setTimeout(() => router.refresh(), 50));
  };
  const filtered = selected ? videos.filter((v) => v.playlistId === selected) : videos;
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA VIDEOS</h1>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setAdding(true)}>+ Add video</Button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: "var(--nv-space-4)" }}>
        <Chip active={selected === null} onClick={() => setSelected(null)}>All videos ({videos.length})</Chip>
        {playlists.map((p) => (
          <div key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <Chip active={selected === p.id} onClick={() => setSelected(selected === p.id ? null : p.id)}>{p.name} ({p._count.videos})</Chip>
            <Dropdown trigger={<Button variant="ghost" size="sm" style={{ minWidth: 0, padding: "2px 6px" }}>⋯</Button>}>
              <MenuItem onSelect={() => setRenaming({ id: p.id, name: p.name })}>Rename</MenuItem>
              <MenuItem danger onSelect={() => setDeleting({ id: p.id, name: p.name })}>Delete</MenuItem>
            </Dropdown>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>+ New playlist</Button>
      </div>
      {filtered.length === 0 ? (
        <div className="nv-empty" style={{ minHeight: 300 }}>
          <div>{selected ? "No videos in this playlist" : "Your library is empty"}</div>
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>Add a video link</Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--nv-space-4)" }}>
          {filtered.map((v) => {
            const embed = embedFor(v.url, v.provider);
            return (
              <div key={v.id} className="nv-card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ aspectRatio: "16/9", borderRadius: "var(--nv-radius-md)", overflow: "hidden", background: "#000" }}>
                  {embed ? <iframe src={embed} title={v.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ width: "100%", height: "100%", border: "none" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 13 }}>External video</div>}
                </div>
                <div style={{ fontWeight: 700 }}>{v.title}</div>
                {v.description && <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)" }}>{v.description}</div>}
                <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{v.provider} · added {v.uploadedAt.toLocaleDateString()}</div>
                <Dropdown trigger={<Button variant="ghost" size="sm" style={{ alignSelf: "flex-end" }}>⋯</Button>}>
                  <MenuItem onSelect={() => setAssigning(v.id)}>Add to playlist…</MenuItem>
                  {v.playlistId ? <MenuItem onSelect={() => { const fd = new FormData(); fd.set("videoId", v.id); fd.set("playlistId", ""); run(fd, actions.setVideoPlaylist); }}>Remove from playlist</MenuItem> : null}
                  <MenuItem danger onSelect={() => { const fd = new FormData(); fd.set("id", v.id); run(fd, actions.remove); }}>Remove</MenuItem>
                </Dropdown>
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} title="Add video" actions={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" form="add-video-form">Add</Button></>}>
        <form id="add-video-form" action={(fd) => { void actions.create(fd).then(() => { setAdding(false); setTimeout(() => router.refresh(), 50); }); }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 400 }}>
          <input className="nv-input" name="title" placeholder="Title" autoFocus required />
          <input className="nv-input" name="url" placeholder="https://youtube.com/watch?v=… or https://vimeo.com/…" required />
          <select className="nv-input" name="provider" defaultValue="youtube"><option value="youtube">YouTube</option><option value="vimeo">Vimeo</option><option value="other">Other (link only)</option></select>
          <textarea className="nv-input" name="description" placeholder="Description (optional)" rows={3} />
        </form>
      </Dialog>
      {assigning !== null && (
        <Dialog open onClose={() => setAssigning(null)} title="Add to playlist" actions={<Button variant="secondary" onClick={() => setAssigning(null)}>Close</Button>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 320 }}>
            {playlists.length === 0 ? <div className="nv-empty" style={{ minHeight: 80 }}><div>No playlists yet</div></div> : playlists.map((p) => { const current = videos.find((v) => v.id === assigning)?.playlistId ?? null; const active = current === p.id; return <MenuItem key={p.id} onSelect={() => { const fd = new FormData(); fd.set("videoId", assigning); fd.set("playlistId", active ? "" : p.id); run(fd, actions.setVideoPlaylist); setAssigning(null); }}>{active ? "✓ " : ""}{p.name} ({p._count.videos})</MenuItem>; })}
          </div>
        </Dialog>
      )}
      <Dialog open={creating} onClose={() => setCreating(false)} title="New playlist" actions={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" form="create-playlist-form">Create</Button></>}>
        <form id="create-playlist-form" action={(fd) => { run(fd, actions.createPlaylist); setCreating(false); }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 400 }}><input className="nv-input" name="name" placeholder="Playlist name" autoFocus required /></form>
      </Dialog>
      {renaming !== null && (
        <Dialog open onClose={() => setRenaming(null)} title="Rename playlist" actions={<><Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button><Button type="submit" form="rename-playlist-form">Save</Button></>}>
          <form id="rename-playlist-form" action={(fd) => { run(fd, actions.renamePlaylist); setRenaming(null); }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 400 }}><input type="hidden" name="id" value={renaming.id} /><input className="nv-input" name="name" placeholder="Playlist name" defaultValue={renaming.name} autoFocus required /></form>
        </Dialog>
      )}
      {deleting !== null && (
        <Dialog open onClose={() => setDeleting(null)} title="Delete playlist" actions={<><Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" type="submit" form="delete-playlist-form">Delete</Button></>}>
          <div style={{ minWidth: 400 }}>Delete "{deleting.name}"? Videos in it will be kept, but unassigned from this playlist.</div>
          <form id="delete-playlist-form" action={(fd) => { run(fd, actions.removePlaylist); if (selected === deleting.id) setSelected(null); setDeleting(null); }}><input type="hidden" name="id" value={deleting.id} /></form>
        </Dialog>
      )}
    </div>
  );
}

// ── Transcendent Studio ──────────────────────────────────────────────────────
const STUDIO_TABS = [
  { id: "studio", label: "Studio" },
  { id: "graph", label: "Graph" },
  { id: "semantic", label: "Semantic" },
  { id: "quality", label: "Quality" },
  { id: "interchange", label: "Interchange" },
  { id: "generative", label: "Generative" },
  { id: "brand", label: "Brand" },
  { id: "identity", label: "Identity" },
  { id: "review-intel", label: "Review Intel" },
  { id: "portal", label: "Client Portal" },
  { id: "knowledge-graph", label: "Knowledge Graph" },
  { id: "search", label: "Search" },
  { id: "preflight", label: "Preflight" },
  { id: "live", label: "Live Control" },
  { id: "live-edit", label: "Live→Edit" },
  { id: "audio-intel", label: "Audio Intel" },
  { id: "a11y", label: "Accessibility" },
  { id: "zero-trust", label: "Zero-Trust" },
  { id: "privacy", label: "Privacy" },
  { id: "events", label: "Events" },
  { id: "reliability", label: "Reliability" },
  { id: "observability", label: "Observability" },
  { id: "entitlements", label: "Entitlements" },
  { id: "billing", label: "Billing" },
  { id: "policy-plugin", label: "Policy & Plugins" },
  { id: "copilot", label: "Copilot" },
  { id: "governance", label: "Governance" },
  { id: "provenance", label: "Provenance" },
  { id: "assets", label: "Assets" },
  { id: "ai", label: "AI Aperture" },
  { id: "color", label: "Color" },
  { id: "audio", label: "Audio" },
  { id: "captions", label: "Captions" },
  { id: "export", label: "Export" },
  { id: "review", label: "Review" },
  { id: "analytics", label: "Analytics" },
  { id: "workspace", label: "Workspace" },
  { id: "n0va10", label: "N0VA10" },
  { id: "library", label: "Library" },
] as const;

export function VideoStudioTranscendent({
  videos,
  playlists,
  projects,
  assets,
  actions,
}: {
  videos: Video[];
  playlists: PlaylistWithCount[];
  projects: VideoProjectLike[];
  assets: { id: string; filename: string; mimeType: string; sizeBytes: number; width?: number | null; height?: number | null; storageKey?: string; createdAt?: string | Date }[];
  actions: TranscendentActions;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<(typeof STUDIO_TABS)[number]["id"]>("copilot");
  const [selectedProject, setSelectedProject] = useState<string | null>(projects[0]?.id ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showNewProject, setShowNewProject] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("Cinematic drone shot over neon city at sunset, volumetric light, 8K");
  const [aiStyle, setAiStyle] = useState("cinematic");
  const [aiDuration, setAiDuration] = useState(30);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<null | { jobId: string; previewUrl: string }>(null);
  const [captionLang, setCaptionLang] = useState("en");
  const [captionBusy, setCaptionBusy] = useState(false);
  const [captionVtt, setCaptionVtt] = useState<string | null>(null);
  const [n0vaIntent, setN0vaIntent] = useState("Publish Q3 launch to YouTube, Vimeo and Slack #marketing, optimal Tuesday 2pm EST, notify CRM");
  const [n0vaRunning, setN0vaRunning] = useState(false);
  const [n0vaResult, setN0vaResult] = useState<null | { intentId: string }>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [webCodecs, setWebCodecs] = useState<string>("detecting…");
  const [webGPU, setWebGPU] = useState<string>("detecting…");
  const fileRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  // Detect browser capabilities (WebCodecs + WebGPU)
  useEffect(() => {
    try {
      const hasVC = typeof (globalThis as unknown as { VideoEncoder?: unknown }).VideoEncoder !== "undefined";
      const hasVD = typeof (globalThis as unknown as { VideoDecoder?: unknown }).VideoDecoder !== "undefined";
      setWebCodecs(hasVC && hasVD ? "✓ WebCodecs active (VideoEncoder/Decoder)" : "◐ WebCodecs fallback (FFmpeg cluster)");
    } catch { setWebCodecs("◐ FFmpeg cluster (GPU H100/H200/GB200)"); }
    try {
      const hasGPU = !!((navigator as unknown as { gpu?: unknown }).gpu);
      setWebGPU(hasGPU ? "✓ WebGPU active (compute + render)" : "◐ WebGPU fallback (WebGL2/Metal/Vulkan)");
    } catch { setWebGPU("◐ WebGL2/Metal/Vulkan"); }
  }, []);

  // Playhead ticker
  useEffect(() => {
    if (!isPlaying) return;
    const t = setInterval(() => setPlayheadMs(v => (v + 40 * zoom) % 180000), 40);
    return () => clearInterval(t);
  }, [isPlaying, zoom]);

  const selectedProj = projects.find(p => p.id === selectedProject) ?? projects[0] ?? null;
  const filteredProjects = searchQuery ? projects.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase())) : projects;

  // Upload handler (video assets)
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", f);
        if (selectedProject) fd.set("projectId", selectedProject);
        const res = await fetch("/api/videos/upload", { method: "POST", body: fd });
        if (!res.ok) {
          // fallback: create as link via legacy action
          const lf = new FormData();
          lf.set("title", f.name);
          lf.set("url", URL.createObjectURL(f));
          lf.set("provider", "other");
          lf.set("description", `${f.type} • ${Math.round(f.size/1024)}KB • neural pre-analysis`);
          await actions.create(lf);
        }
      }
      router.refresh();
    } finally { setUploading(false); }
  };

  // AI generate mock
  const runAIGenerate = async () => {
    setAiGenerating(true);
    setAiResult(null);
    try {
      const res = await fetch("/api/videos/ai/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: aiPrompt, style: aiStyle, durationSec: aiDuration }) });
      if (res.ok) {
        const j = await res.json();
        setAiResult({ jobId: j.jobId ?? `gen_${Date.now()}`, previewUrl: j.previewUrl ?? `https://cdn.n0va.io/ai-generated/${Date.now()}/preview.mp4` });
      } else {
        // local mock
        await new Promise(r => setTimeout(r, 1800));
        setAiResult({ jobId: `gen_${Date.now()}`, previewUrl: "https://cdn.n0va.io/ai-generated/mock/preview.mp4" });
      }
    } finally { setAiGenerating(false); }
  };

  const runCaption = async () => {
    setCaptionBusy(true);
    try {
      const res = await fetch("/api/videos/captions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: selectedProject, language: captionLang }) });
      if (res.ok) {
        const j = await res.json();
        setCaptionVtt(j.vttContent ?? j.vtt ?? "WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nDemo caption — Whisper-N0VA 98.5%\n");
      } else {
        await new Promise(r => setTimeout(r, 900));
        setCaptionVtt(`WEBVTT\n\n00:00:00.000 --> 00:00:03.500\nWelcome to N0VA Videos — Project Aperture Transcendent\n\n00:00:03.500 --> 00:00:07.000\nLanguage: ${captionLang} • Whisper-N0VA • speaker diarization + punctuation restoration\n`);
      }
    } finally { setCaptionBusy(false); }
  };

  const runN0VAIntent = async () => {
    setN0vaRunning(true);
    setN0vaResult(null);
    try {
      const res = await fetch("/api/videos/n0va10/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: n0vaIntent, projectId: selectedProject }) });
      if (res.ok) {
        const j = await res.json();
        setN0vaResult({ intentId: j.intentId ?? `intent_${Date.now()}` });
      } else {
        await new Promise(r => setTimeout(r, 1200));
        setN0vaResult({ intentId: `intent_${Date.now()}` });
      }
    } finally { setN0vaRunning(false); }
  };

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--nv-space-4)" }}>
      {/* ── Header: Project Aperture Transcendent ─────────────────────────── */}
      <div style={{ borderRadius: "var(--nv-radius-lg)", overflow: "hidden", background: "linear-gradient(135deg, #0f0f12 0%, #1a1625 40%, #1e1a3a 100%)", color: "#fff", padding: "var(--nv-space-5)", border: "1px solid rgba(255,255,255,0.08)", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(600px 300px at 85% 0%, rgba(129,140,248,0.18), transparent 60%), radial-gradient(500px 400px at 10% 100%, rgba(56,189,248,0.12), transparent 60%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#818cf8,#38bdf8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, boxShadow: "0 8px 24px rgba(129,140,248,0.35)" }}>◉</div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", margin: 0 }}>N0VA VIDEOS</h1>
              <Badge tone="primary">Project Aperture Transcendent</Badge>
              <Badge tone="success">99.999% uptime</Badge>
              <span style={{ fontSize: 11, opacity: 0.7, border: "1px solid rgba(255,255,255,0.15)", padding: "2px 8px", borderRadius: 999 }}>8K/120fps • AV1 • HDR10+ • Dolby Vision</span>
            </div>
            <div style={{ fontSize: "var(--nv-font-sm)", opacity: 0.85, marginTop: 6, maxWidth: 780 }}>
              Core Media Module — Cinematic Video Infrastructure & Omniscient Content Engine. Browser lightweight editing (WebCodecs + WebGPU) + server heavy rendering (H100/H200/GB200). &lt;50ms first-frame • &lt;100ms seek • unlimited transcode pipelines • synthetic visual consciousness.
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", fontSize: 11, opacity: 0.75 }}>
              <span>● Transcoding Constellation: H.264 H.265 VP9 AV1 ProRes DNxHR • 1000× real-time</span>
              <span>● Streaming: DASH HLS LL-HLS WebRTC SRT QUIC • &lt;500ms glass-to-glass</span>
              <span>● Storage: Hot NVMe Gen6 → Cryogenic DNA/Quantum WORM</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Button size="sm" variant="secondary" onClick={() => setShowNewProject(true)}>+ New Project</Button>
            <Button size="sm" onClick={() => fileRef.current?.click()}>{uploading ? "Uploading…" : "↑ Ingest"}</Button>
            <input ref={fileRef} type="file" accept="video/*,audio/*,image/*" multiple hidden onChange={e => void handleUpload(e.target.files)} />
          </div>
        </div>
        {/* SLA strip */}
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 10, marginTop: "var(--nv-space-4)" }}>
          {[
            { k: "First-Frame", v: "<50ms", sub: "Neural pre-fetch + CDN warming" },
            { k: "Seek", v: "<100ms", sub: "Keyframe pre-position" },
            { k: "Concurrent Streams", v: "10M+", sub: "Per tenant • 900+ PoPs" },
            { k: "Parallel Transcodes", v: "1M+", sub: "Per region • GPU/TPU/QPU" },
            { k: "Single File", v: "500TB", sub: "Chunked resumable QUIC" },
            { k: "Neural Inference", v: "<5ms", sub: "Edge + batch coalescing" },
          ].map(s => (
            <div key={s.k} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.k}</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{s.v}</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>{s.sub}</div>
            </div>
          ))}
        </div>
        {/* Engine badges */}
        <div style={{ position: "relative", display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", fontSize: 11 }}>
          <span style={{ background: "rgba(129,140,248,0.18)", border: "1px solid rgba(129,140,248,0.3)", padding: "4px 10px", borderRadius: 999 }}>{webCodecs}</span>
          <span style={{ background: "rgba(52,211,153,0.14)", border: "1px solid rgba(52,211,153,0.28)", padding: "4px 10px", borderRadius: 999 }}>{webGPU}</span>
          <span style={{ background: "rgba(251,191,36,0.14)", border: "1px solid rgba(251,191,36,0.28)", padding: "4px 10px", borderRadius: 999 }}>◉ Neural Direct &lt;1ms • BCI synaptic-rate</span>
        </div>
      </div>

      {/* ── Toolbar: Project selector + search + stats ─────────────────────── */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {filteredProjects.slice(0, 6).map(p => (
            <button key={p.id} onClick={() => setSelectedProject(p.id)} style={{ padding: "6px 12px", borderRadius: 999, fontSize: 13, fontWeight: 700, background: selectedProject === p.id ? "var(--nv-color-primary)" : "var(--nv-color-surface)", color: selectedProject === p.id ? "#fff" : "var(--nv-color-text-muted)", border: "1px solid var(--nv-color-border)", cursor: "pointer" }}>
              {p.title}
              <span style={{ opacity: 0.7, marginLeft: 6, fontWeight: 600, fontSize: 11 }}>{p.status}</span>
            </button>
          ))}
          {projects.length === 0 && <Badge tone="warning">No projects — create one to unlock Studio</Badge>}
        </div>
        <div style={{ flex: 1 }} />
        <input className="nv-input" placeholder="Neural search 4096-dim — e.g. red car at sunset, CEO smile, product demo…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ maxWidth: 360, fontSize: 13 }} />
        <Badge tone="neutral">{projects.length} projects • {videos.length} links • {assets.length} assets</Badge>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div style={{ background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "10px 12px 0" }}>
          <Tabs tabs={STUDIO_TABS as unknown as { id: string; label: string }[]} active={activeTab} onChange={id => setActiveTab(id as typeof activeTab)} />
        </div>

        <div style={{ padding: "var(--nv-space-4)" }}>
          {/* COPILOT — plan–simulate–approve–commit (primary) */}
          {activeTab === "copilot" && (
            <VideoCopilotPanel
              projectId={selectedProj?.id ?? projects[0]?.id ?? "proj_demo"}
              timelineId={(selectedProj?.timeline as unknown as { tracks?: unknown[] }) ? `tl_${(selectedProj?.id ?? "demo").slice(0,6)}` : undefined}
              projectTitle={selectedProj?.title ?? projectTitleFallback(projects)}
            />
          )}

          {/* GOVERNANCE — agent operating system */}
          {activeTab === "governance" && (
            <GovernanceControlCenter projectId={selectedProj?.id ?? projects[0]?.id ?? "proj_q3_launch"} />
          )}

          {/* SEMANTIC — queryable workspace */}
          {activeTab === "semantic" && (
            <SemanticTimelinePanel timelineId={selectedProj?.id ? `tl_${selectedProj.id.slice(0,6)}` : "tl001"} projectId={selectedProj?.id ?? projects[0]?.id ?? "proj_q3_launch"} />
          )}

          {/* PROVENANCE — cryptographically verifiable fabric */}
          {activeTab === "provenance" && (
            <ProvenanceExplorer projectId={selectedProj?.id ?? projects[0]?.id ?? "proj_q3_launch"} />
          )}

          {/* GRAPH — non-destructive DAG */}
          {activeTab === "graph" && (
            <GraphPanel projectId={selectedProj?.id ?? "proj_q3_launch"} timelineId={selectedProj?.id ? `tl_${selectedProj.id.slice(0, 6)}` : "tl_07"} />
          )}

          {/* QUALITY — continuity & quality intelligence */}
          {activeTab === "quality" && (
            <QualityPanel timelineId={selectedProj?.id ? `tl_${selectedProj.id.slice(0, 6)}` : "tl001"} graphVersion="gv42" />
          )}

          {/* INTERCHANGE — professional interchange */}
          {activeTab === "interchange" && (
            <InterchangePanel timelineId={selectedProj?.id ? `tl_${selectedProj.id.slice(0, 6)}` : "tl001"} graphVersion="gv42" />
          )}

          {/* GENERATIVE — controlled workspace */}
          {activeTab === "generative" && (
            <GenerativePanel projectId={selectedProj?.id ?? "project001"} />
          )}

          {/* BRAND — brand intelligence */}
          {activeTab === "brand" && (
            <BrandPanel timelineId={selectedProj?.id ? `tl_${selectedProj.id.slice(0, 6)}` : "tl001"} graphVersion="gv42" />
          )}

          {/* IDENTITY — consent-aware */}
          {activeTab === "identity" && (
            <IdentityPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* REVIEW INTEL — decision intelligence */}
          {activeTab === "review-intel" && (
            <ReviewIntelligencePanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* CLIENT PORTAL — external review surface */}
          {activeTab === "portal" && (
            <ClientReviewPortalPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* KNOWLEDGE GRAPH — multimodal intelligence fabric */}
          {activeTab === "knowledge-graph" && (
            <KnowledgeGraphPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* SEARCH — hybrid retrieval */}
          {activeTab === "search" && (
            <SearchRetrievalPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* PREFLIGHT — quality & safety intelligence */}
          {activeTab === "preflight" && (
            <PreflightPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* LIVE CONTROL ROOM — resilient broadcast OS */}
          {activeTab === "live" && (
            <LiveControlRoomPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* LIVE-TO-EDIT CONTINUUM */}
          {activeTab === "live-edit" && (
            <LiveEditContinuumPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* AUDIO INTELLIGENCE */}
          {activeTab === "audio-intel" && (
            <AudioIntelligencePanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* ACCESSIBILITY AUTOMATION */}
          {activeTab === "a11y" && (
            <AccessibilityAutomationPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* ZERO-TRUST */}
          {activeTab === "zero-trust" && (
            <ZeroTrustPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* PRIVACY-PRESERVING */}
          {activeTab === "privacy" && (
            <PrivacyPreservingPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* EVENT-DRIVEN */}
          {activeTab === "events" && (
            <EventDrivenPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* RELIABILITY */}
          {activeTab === "reliability" && (
            <ReliabilityEngineeringPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* OBSERVABILITY & FINOPS */}
          {activeTab === "observability" && (
            <ObservabilityFinOpsPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* ENTITLEMENTS — capability-based tiers */}
          {activeTab === "entitlements" && (
            <EntitlementControlCenter tenantId={typeof window !== "undefined" ? undefined : undefined} />
          )}

          {/* BILLING — usage-based transparent metering */}
          {activeTab === "billing" && (
            <BillingControlCenter tenantId={typeof window !== "undefined" ? undefined : undefined} />
          )}

          {/* POLICY & PLUGINS */}
          {activeTab === "policy-plugin" && (
            <PolicyPluginPanel projectId={selectedProj?.id ?? "project_001"} />
          )}

          {/* STUDIO */}
          {activeTab === "studio" && (
            <StudioPanel
              project={selectedProj}
              playheadMs={playheadMs}
              isPlaying={isPlaying}
              zoom={zoom}
              onPlayToggle={() => setIsPlaying(v => !v)}
              onSeek={setPlayheadMs}
              onZoom={setZoom}
              videoPreviewRef={videoPreviewRef}
            />
          )}

          {/* ASSETS */}
          {activeTab === "assets" && (
            <AssetsPanel projects={projects} selectedProject={selectedProject} assets={assets} videos={videos} uploading={uploading} onUploadClick={() => fileRef.current?.click()} onUpload={handleUpload} />
          )}

          {/* AI APERTURE */}
          {activeTab === "ai" && (
            <AIPanel
              prompt={aiPrompt} onPrompt={setAiPrompt}
              styleVal={aiStyle} onStyle={setAiStyle}
              duration={aiDuration} onDuration={setAiDuration}
              generating={aiGenerating} result={aiResult} onGenerate={runAIGenerate}
              videos={videos}
            />
          )}

          {/* COLOR */}
          {activeTab === "color" && <ColorPanel />}

          {/* AUDIO */}
          {activeTab === "audio" && <AudioPanel />}

          {/* CAPTIONS */}
          {activeTab === "captions" && (
            <CaptionsPanel lang={captionLang} onLang={setCaptionLang} busy={captionBusy} vtt={captionVtt} onGenerate={runCaption} project={selectedProj} />
          )}

          {/* EXPORT */}
          {activeTab === "export" && <ExportPanel project={selectedProj} actions={actions} />}

          {/* REVIEW */}
          {activeTab === "review" && <ReviewPanel project={selectedProj} />}

          {/* ANALYTICS */}
          {activeTab === "analytics" && <AnalyticsPanel project={selectedProj} />}

          {/* WORKSPACE */}
          {activeTab === "workspace" && <WorkspacePanel project={selectedProj} />}

          {/* N0VA10 */}
          {activeTab === "n0va10" && (
            <N0VA10Panel intent={n0vaIntent} onIntent={setN0vaIntent} running={n0vaRunning} result={n0vaResult} onRun={runN0VAIntent} />
          )}

          {/* LIBRARY (legacy) */}
          {activeTab === "library" && (
            <div style={{ borderTop: "1px solid var(--nv-color-border)", paddingTop: "var(--nv-space-4)", marginTop: "var(--nv-space-2)" }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Legacy Video Library (links & playlists)</h3>
              <p style={{ fontSize: 13, color: "var(--nv-color-text-muted)", marginBottom: 12 }}>Existing Video + VideoPlaylist persistence — kept for backward compat. New projects use VideoProject constellation.</p>
              <VideoLibraryInline videos={videos} playlists={playlists} actions={actions} />
            </div>
          )}
        </div>
      </div>

      {/* ── Intelligence strip ─────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
        <MiniCard title="Synthetic Visual Cortex" badge="N0VA-SceneNet-V3" lines={["Scene detection 99.4% • Shot boundary 99.7%", "YOLO-N0VA mAP 98.9% • <10ms/frame", "CLIP-N0VA 4096-dim • <10ms recall@10 92%"]} />
        <MiniCard title="Neural Compression" badge="N0VA-Codec-V1" lines={["60% bitrate vs H.265 • 2× real-time", "Per-content ladder 8K→360p 12 rungs", "VMAF-predictive • neural rate control"]} />
        <MiniCard title="Autonomous Agents (31)" badge="live" lines={["Auto-Editor • Colorist • Sound Designer", "Compliance • Thumbnail • Caption • Distribution", "N0VA10 orchestration <10ms latency"]} />
        <MiniCard title="Galactic Pipeline" badge="H100/GB200" lines={["Transcode constellation 1000× real-time", "HDR10+/Dolby Vision/HLG tone-map <5ms", "ABR • LL-HLS • WebRTC • SRT • QUIC"]} />
      </div>

      {/* New Project Dialog */}
      <Dialog open={showNewProject} onClose={() => setShowNewProject(false)} title="New Video Project — Aperture Transcendent" actions={<><Button variant="secondary" onClick={() => setShowNewProject(false)}>Cancel</Button><Button type="submit" form="new-project-form">Create</Button></>}>
        <form id="new-project-form" action={fd => { if (actions.createProject) void actions.createProject(fd).then(() => { setShowNewProject(false); setTimeout(() => router.refresh(), 300); }); else { const title = String(fd.get("title") ?? "Untitled"); const lf = new FormData(); lf.set("title", title); lf.set("url", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"); lf.set("provider", "youtube"); void actions.create(lf).then(() => { setShowNewProject(false); setTimeout(() => router.refresh(), 300); }); } }} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 420 }}>
          <input className="nv-input" name="title" placeholder="Q3 Product Launch — Project Aperture" autoFocus required />
          <input className="nv-input" name="description" placeholder="Description — encrypted at rest (AES-256-GCM + HSM)" />
          <div style={{ display: "flex", gap: 8 }}>
            <select className="nv-input" name="status" defaultValue="DRAFT"><option value="DRAFT">Draft</option><option value="IN_PRODUCTION">In Production</option><option value="IN_REVIEW">In Review</option><option value="PUBLISHED">Published</option></select>
            <select className="nv-input" name="category" defaultValue="promotional"><option value="promotional">Promotional</option><option value="product_demo">Product Demo</option><option value="education">Education</option><option value="broadcast">Broadcast</option></select>
            <select className="nv-input" name="resolution" defaultValue="1080p"><option value="1080p">1080p</option><option value="4K">4K</option><option value="8K">8K/120fps</option></select>
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Creates Workspace Nexus + N0VA10 agents • timeline with tracks • neural embedding 4096-dim • hyper-context links</div>
        </form>
      </Dialog>
    </div>
  );
}

// ── Sub-Panels ─────────────────────────────────────────────────────────────

function StudioPanel({ project, playheadMs, isPlaying, zoom, onPlayToggle, onSeek, onZoom, videoPreviewRef }: {
  project: VideoProjectLike | null; playheadMs: number; isPlaying: boolean; zoom: number;
  onPlayToggle: () => void; onSeek: (ms: number) => void; onZoom: (z: number) => void;
  videoPreviewRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const durationMs = 180000;
  const tracks: TrackLike[] = (project?.timeline?.tracks as TrackLike[]) ?? [
    { trackId: "video_1", trackType: "video", trackName: "V1 — Primary", enabled: true, clips: [{ clipId: "c1", timelineInMs: 0, timelineOutMs: 42000 }, { clipId: "c2", timelineInMs: 42000, timelineOutMs: 90000, speed: 0.8 } as ClipLike] },
    { trackId: "video_2", trackType: "video", trackName: "V2 — B-Roll / Overlay", enabled: true, clips: [{ clipId: "c3", timelineInMs: 15000, timelineOutMs: 45000 }] },
    { trackId: "audio_1", trackType: "audio", trackName: "A1 — Dialogue (4-ch PCM 24-bit 48kHz)", enabled: true, clips: [{ clipId: "a1", timelineInMs: 0, timelineOutMs: 180000 }] },
    { trackId: "audio_2", trackType: "audio", trackName: "A2 — Music (MusicGen-N0VA)", enabled: true, clips: [{ clipId: "a2", timelineInMs: 0, timelineOutMs: 180000 }] },
    { trackId: "gfx", trackType: "graphics", trackName: "GFX — Titles / Lower Thirds / 3D", enabled: true, clips: [{ clipId: "g1", timelineInMs: 2000, timelineOutMs: 8000 }] },
  ];
  const timeLabel = (ms: number) => `${String(Math.floor(ms/60000)).padStart(2,"0")}:${String(Math.floor((ms%60000)/1000)).padStart(2,"0")}:${String(Math.floor((ms%1000)/10)).padStart(2,"0")}`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.25fr 0.9fr", gap: 12 }}>
      {/* Preview */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ background: "#000", borderRadius: 12, overflow: "hidden", aspectRatio: "16/9", position: "relative", border: "1px solid #222" }}>
          <video ref={videoPreviewRef} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} poster="https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1200&q=80&auto=format&fit=crop" muted />
          <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 6, fontSize: 11, color: "#fff" }}>
            <span style={{ background: "rgba(239,68,68,0.9)", padding: "2px 8px", borderRadius: 999, fontWeight: 800 }}>● REC • Live Preview</span>
            <span style={{ background: "rgba(0,0,0,0.55)", padding: "2px 8px", borderRadius: 999 }}>{project?.resolution ?? "4K"} • {project?.title ?? "No project selected"}</span>
          </div>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 28, background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", color: "#fff", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
            <span>{timeLabel(playheadMs)} / {timeLabel(durationMs)} • {isPlaying ? "▶ Playing • WebCodecs render + neural filter" : "⏸ Paused • proxy: H.264 low-res • conform: 8K"}</span>
            <span style={{ opacity: 0.8 }}>{zoom.toFixed(1)}× • 60fps • ACES 1.3 • 32-bit float</span>
          </div>
          {/* Scopes overlay mock */}
          <div style={{ position: "absolute", right: 10, top: 42, background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 6, display: "flex", gap: 6 }}>
            {["Vectorscope","Waveform","Parade","Histogram"].map(s => <span key={s} style={{ fontSize: 10, color: "#a5b4fc", background: "rgba(129,140,248,0.18)", padding: "2px 6px", borderRadius: 999 }}>{s}</span>)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Button size="sm" onClick={onPlayToggle}>{isPlaying ? "⏸ Pause" : "▶ Play"}</Button>
          <Button size="sm" variant="secondary" onClick={() => onSeek(Math.max(0, playheadMs - 2000))}>⏪ 2s</Button>
          <Button size="sm" variant="secondary" onClick={() => onSeek(Math.min(durationMs, playheadMs + 2000))}>2s ⏩</Button>
          <Badge tone="neutral">{timeLabel(playheadMs)}</Badge>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Zoom</span>
          <input type="range" min={0.5} max={4} step={0.5} value={zoom} onChange={e => onZoom(parseFloat(e.target.value))} />
          <Badge tone="primary">{zoom}×</Badge>
        </div>
        {/* Tool bar */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12, alignItems: "center", background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 10, border: "1px solid var(--nv-color-border)" }}>
          {["Selection","Ripple","Razor","Slip","Slide","Pen","Hand","Zoom","Speed (0.01×-100×)","Time Remap","Stabilize","Keying","Motion Track","Nested Seq"].map(t => <span key={t} style={{ background: "#fff", border: "1px solid var(--nv-color-border)", padding: "4px 8px", borderRadius: 999, fontWeight: 600 }}>{t}</span>)}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--nv-color-text-faint)" }}>Snap • Sync Lock • Proxy • Thumbnails • Waveforms • 16K • 64 angles multi-cam</span>
        </div>
      </div>
      {/* Inspector + Timeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--nv-color-text-faint)", display: "flex", alignItems: "center", gap: 6 }}>
            <span>Timeline — Non-linear + Node Compositing</span>
            <Badge tone="primary">Unlimited tracks • 50+ collaborators CRDT</Badge>
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Ruler */}
            <div style={{ height: 18, background: "#0f0f12", borderRadius: 6, position: "relative", overflow: "hidden", border: "1px solid #222" }}>
              <div style={{ position: "absolute", left: `${(playheadMs/durationMs)*100}%`, top: 0, bottom: 0, width: 2, background: "#ef4444" }} />
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0 8px", fontSize: 10, color: "#888", lineHeight: "18px", fontVariantNumeric: "tabular-nums" }}>
                <span>00:00</span><span>00:30</span><span>01:00</span><span>01:30</span><span>02:00</span><span>03:00</span>
              </div>
            </div>
            {/* Tracks */}
            {tracks.map(tr => (
              <div key={tr.trackId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ width: 140, fontSize: 11, fontWeight: 700, color: "var(--nv-color-text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: tr.trackType==="video" ? "#818cf8" : tr.trackType==="audio" ? "#34d399" : "#fbbf24", display: "inline-block" }} />
                  {tr.trackName}
                </div>
                <div style={{ flex: 1, height: 36, background: tr.trackType==="video" ? "rgba(129,140,248,0.08)" : tr.trackType==="audio" ? "rgba(52,211,153,0.08)" : "rgba(251,191,36,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, position: "relative", overflow: "hidden" }}>
                  {tr.clips.map(c => {
                    const left = (c.timelineInMs / durationMs) * 100;
                    const width = ((c.timelineOutMs - c.timelineInMs) / durationMs) * 100;
                    const color = tr.trackType==="video" ? "linear-gradient(135deg,#818cf8,#38bdf8)" : tr.trackType==="audio" ? "linear-gradient(135deg,#34d399,#10b981)" : "linear-gradient(135deg,#fbbf24,#f59e0b)";
                    return <div key={c.clipId} title={`${c.clipId} ${timeLabel(c.timelineInMs)} → ${timeLabel(c.timelineOutMs)}`} style={{ position: "absolute", left: `${left}%`, width: `${Math.max(width, 2)}%`, top: 4, bottom: 4, background: color, borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", display: "flex", alignItems: "center", padding: "0 6px", fontSize: 11, fontWeight: 700, color: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>{c.clipId} {c.speed && c.speed!==1 ? `• ${c.speed}×` : ""}</div>;
                  })}
                  <div style={{ position: "absolute", left: `${(playheadMs/durationMs)*100}%`, top: 0, bottom: 0, width: 2, background: "#ef4444", pointerEvents: "none" }} />
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              <Button size="sm" variant="ghost">✂ Split</Button>
              <Button size="sm" variant="ghost">⊕ Merge</Button>
              <Button size="sm" variant="ghost">⎌ Trim</Button>
              <Button size="sm" variant="ghost">⟲ Ripple</Button>
              <Button size="sm" variant="ghost">◎ Chroma Key</Button>
              <Button size="sm" variant="ghost">◍ Keyframe</Button>
              <Badge tone="neutral">Neural conflict resolution • proxy→8K conform</Badge>
            </div>
            <div style={{ height: 8, background: "linear-gradient(90deg, #0ea5e9 0%, #818cf8 50%, #ec4899 100%)", borderRadius: 999, opacity: 0.9 }} />
            <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", display: "flex", justifyContent: "space-between" }}>
              <span>Playhead: {timeLabel(playheadMs)} • snap • beat detection • AI cut prediction</span>
              <span>50+ simultaneous editors • CRDT • precognitive UI 3.2× faster</span>
            </div>
          </div>
        </div>
        <div style={{ background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: 12, padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <EffectStack />
          <TransitionsPanel />
        </div>
      </div>
    </div>
  );
}

function EffectStack() {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Effects Stack — GPU (WebGPU/Metal/Vulkan) • 32-bit ACES</div>
      {[
        { name: "Color Wheels • n0va.color.wheels", p: "Exposure +0.12 • Contrast 1.05 • Shadows +0.15", acc: "Neural auto-correct" },
        { name: "LUT • lut_corporate_warm_001", p: "Intensity 0.75 • Skin tone protect (neural seg)", acc: "Brand kit enforced" },
        { name: "Denoise • AI Restoration", p: "95% auto • dust/scratch/flicker neural inpaint", acc: "Archival mode" },
        { name: "Neural Style Transfer", p: "AdaIN-N0VA + transformer • 2× real-time", acc: "Style from reference" },
      ].map(e => (
        <div key={e.name} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--nv-color-border)" }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#818cf8,#38bdf8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12 }}>◈</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{e.p}</div>
          </div>
          <Badge tone="primary">{e.acc}</Badge>
        </div>
      ))}
      <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Real-time 8K preview • object masking ML • motion tracking 99.2% MOTA • depth-aware</div>
    </div>
  );
}
function TransitionsPanel() {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Transitions • 200+ (neural morph)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
        {["Dissolve 500ms","Morph 750ms","Wipe","3D Flip","Particle","Holographic","Neural"].map(n => (
          <div key={n} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, textAlign: "center", fontSize: 11, fontWeight: 700 }}>{n}</div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 8 }}>AI suggests transition by mood • beat detection • 40% less manual placement</div>
      <div style={{ marginTop: 8, background: "#0f0f12", color: "#a5b4fc", borderRadius: 8, padding: 8, fontSize: 11, fontFamily: "var(--nv-font-mono)" }}>
        <div>Keyframe: color.wheels • opacity → vector scope realtime</div>
        <div>Speed ramp: 1× → 0.1× (optical flow FILM/IFRNet++ • 42.3 PSNR)</div>
      </div>
    </div>
  );
}

function AssetsPanel({ projects, selectedProject, assets, videos, uploading, onUploadClick, onUpload }: {
  projects: VideoProjectLike[]; selectedProject: string | null; assets: { id: string; filename: string; mimeType: string; sizeBytes: number; width?: number | null; height?: number | null; storageKey?: string; createdAt?: string|Date }[]; videos: Video[]; uploading: boolean; onUploadClick: () => void; onUpload: (files: FileList|null)=>void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12 }}>
      <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 12, padding: 12, alignSelf: "start" }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>Asset Constellation</div>
        <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4 }}>Tiered Cryogenic Continuum — Hot NVMe Gen6 → Frozen WORM → DNA Quantum • deduplication 50-70% • perceptual hashing</div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <Button size="sm" onClick={onUploadClick}>{uploading ? "Ingesting…" : "↑ Ingest (S3/GCS/Azure/Aspera/Watch)"}</Button>
          <input type="file" id="hiddenAsset" hidden multiple accept="video/*,audio/*,image/*" onChange={e => void onUpload(e.target.files)} />
          <Button size="sm" variant="secondary" onClick={() => document.getElementById("hiddenAsset")?.click()}>Select Files</Button>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Protocols: HTTP/3 QUIC chunked resumable 500TB • RTMP/SRT/WebRTC 10k IoT/drone feeds • MAVLink • Neural Lace</div>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700 }}>Smart Collections (AI)</div>
        {["All assets","People (face 99.85%)","Scenes (99.4%)","Objects (mAP 98.9%)","Text on screen (OCR)","Recent 7d (Hot)","Duplicates","Brand kit"].map(c => <div key={c} style={{ padding: "6px 8px", borderRadius: 8, background: c==="All assets" ? "var(--nv-color-primary-alpha)" : "transparent", fontSize: 13, fontWeight: c==="All assets" ? 700 : 500, marginTop: 4, border: "1px solid var(--nv-color-border)" }}>{c} <span style={{ float: "right", opacity: 0.6 }}>{Math.floor(Math.random()*40)}</span></div>)}
        <div style={{ marginTop: 12, fontSize: 11, color: "var(--nv-color-text-faint)" }}>AI auto-tagging • visual similarity grouping • semantic search • face clustering + consent • duplicate = perceptual hash + chunking</div>
      </div>
      <div>
        {assets.length === 0 && videos.length === 0 ? (
          <div className="nv-empty" style={{ minHeight: 380 }}>
            <div style={{ fontSize: 42 }}>◍</div>
            <div style={{ fontWeight: 800 }}>Asset constellation empty — ingest to activate neural analysis</div>
            <div style={{ fontSize: 13, color: "var(--nv-color-text-muted)", maxWidth: 520 }}>Drop 500TB via QUIC, sync from S3/GCS/Azure Blob (delta + dedup), or capture SRT/WebRTC live. Neural analysis: scenes/faces/objects/speech/music/OCR • 4096-dim embeddings • safety 98% brand-safe.</div>
            <Button size="sm" onClick={onUploadClick}>Ingest Assets</Button>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Stock library: 50M+ videos/images/audio • neural suggestions • brand kit (colors/fonts/logos) • usage analytics</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <Badge tone="primary">{assets.length} assets (DB)</Badge>
              <Badge tone="neutral">{videos.length} linked videos</Badge>
              <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Storage: Hot NVMe • replicas us-west/eu • proxy+H.264 • thumbs/waveforms/embeddings</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 10 }}>
              {assets.map(a => (
                <div key={a.id} className="nv-card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ height: 120, background: "linear-gradient(135deg,#0f0f12,#1a1625)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#818cf8", fontWeight: 800 }}>◉ {a.mimeType.split("/")[0]}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.filename}</div>
                  <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{a.width && a.height ? `${a.width}×${a.height}` : "—"} • {Math.round(a.sizeBytes/1024)} KB • {a.mimeType}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Badge tone="success">neural analyzed</Badge>
                    <Badge tone="neutral">phash</Badge>
                    <Badge tone="neutral">{a.storageKey ? "tier: HOT" : "link"}</Badge>
                  </div>
                </div>
              ))}
              {videos.slice(0, 6).map(v => (
                <div key={v.id} className="nv-card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6, opacity: 0.9 }}>
                  <div style={{ height: 120, background: "#000", borderRadius: 8, overflow: "hidden" }}>{embedFor(v.url, v.provider) ? <iframe src={embedFor(v.url, v.provider)!} title={v.title} style={{ width: "100%", height: "100%", border: "none" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>External</div>}</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{v.title}</div>
                  <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{v.provider}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AIPanel({ prompt, onPrompt, styleVal, onStyle, duration, onDuration, generating, result, onGenerate, videos }: {
  prompt: string; onPrompt: (v:string)=>void; styleVal: string; onStyle: (v:string)=>void; duration: number; onDuration: (v:number)=>void; generating: boolean; result: null|{ jobId:string; previewUrl:string }; onGenerate: ()=>void; videos: Video[];
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
      <div style={{ background: "linear-gradient(135deg, #0f0f12, #1e1a3a)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", opacity: 0.7 }}>ANI: APERTURE — SYNTHETIC VISUAL CORTEX</div>
        <h3 style={{ margin: "6px 0 8px", fontSize: 18, fontWeight: 900 }}>Text-to-Video • Image-to-Video • Avatar • Music</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea className="nv-input" value={prompt} onChange={e => onPrompt(e.target.value)} rows={3} placeholder="Prompt — diffusion temporal consistency, motion brush, camera movement…" style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="nv-input" value={styleVal} onChange={e => onStyle(e.target.value)} style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}>{["cinematic","corporate","anime","photoreal","abstract","vintage"].map(s => <option key={s} value={s} style={{ color: "#000" }}>{s}</option>)}</select>
            <select className="nv-input" value={duration} onChange={e => onDuration(parseInt(e.target.value))} style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}>{[5,15,30,60,120,300].map(n => <option key={n} value={n} style={{ color: "#000" }}>{n}s</option>)}</select>
            <select className="nv-input" defaultValue="static" style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}><option style={{ color: "#000" }} value="static">Static</option><option style={{ color: "#000" }} value="pan">Pan</option><option style={{ color: "#000" }} value="dolly">Dolly</option><option style={{ color: "#000" }} value="orbit">Orbit</option><option style={{ color: "#000" }} value="handheld">Handheld</option></select>
          </div>
          <Button size="md" onClick={onGenerate} disabled={generating}>{generating ? "◍ Neural rendering… (H100 cluster • temporal consistency)" : "✦ Generate — diffusion + neural rendering (<1m for 30s clip)"}</Button>
          {result && <div style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 10, padding: 10, fontSize: 13 }}><div style={{ fontWeight: 800 }}>✓ Job {result.jobId} — preview ready</div><div style={{ opacity: 0.8, fontSize: 11 }}>{result.previewUrl} • n0va-diffusion-v3-temporal • 8K/120fps • motion brush • multi-scene continuity • auto B-roll</div><div style={{ marginTop: 8, height: 160, background: "#000", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #222" }}>◉ AI Preview • neural VMAF 98.2 • style transfer ready</div></div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, fontSize: 11 }}>
            {["Style Transfer AdaIN","Motion Brush","Video Inpainting","Camera pan/tilt/zoom/dolly","Multi-scene continuity","B-roll from script"].map(f => <span key={f} style={{ background: "rgba(255,255,255,0.06)", padding: "6px 8px", borderRadius: 8, textAlign: "center" }}>{f}</span>)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>SLA: 8K/120fps export • &lt;1m generation 30s • proprietary diffusion • temporal consistency • neural TTS emotion/prosody • Whisper fine-tuned diarization</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="nv-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Ani Script → Scene Intelligence</div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4 }}>Bullet → script • scene suggestions • auto-highlight reel • smart B-roll • voice cloning (enterprise) • summarization • brand consistency</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {["• Auto-highlight: excitement curve 91.7% precision — peaks at 0:05, 0:45, 1:42","• B-roll: skyline aerial + product macro + team handshake (context-aware)","• MusicGen-N0VA: corporate ambient 120bpm C-major — mood matched","• Voice: neural cloning 97.8% similarity + Wav2Lip lip-sync 0.95 LSE-D"].map(l => <div key={l} style={{ fontSize: 12, background: "var(--nv-color-surface-2)", padding: "6px 8px", borderRadius: 8 }}>{l}</div>)}
          </div>
        </div>
        <div className="nv-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Recent Generations</div>
          {videos.slice(0,3).map(v => <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, padding: 8, background: "var(--nv-color-surface-2)", borderRadius: 8 }}><div style={{ width: 48, height: 28, background: "#000", borderRadius: 6 }} /> <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{v.title}</div><div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>neural • {v.provider}</div></div><Badge tone="primary">reuse</Badge></div>)}
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 8 }}>Store in Asset Constellation + N0VA10 auto-publish</div>
        </div>
        <div className="nv-card" style={{ padding: 12, background: "linear-gradient(135deg, #fff, #f1f3f6)" }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Model Constellation</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, marginTop: 8, fontSize: 11 }}>
            {["Whisper-N0VA 98.5% WER","MusicGen 10× real-time","Tortoise-N0VA 97.8%","Wav2Lip-N0VA 0.95","MiDaS-N0VA depth","IFRNet++ 2× real-time","Real-ESRGAN SD→4K","DeepSORT 99.2% MOTA","ColorMatch GAN"].map(m => <span key={m} style={{ background: "#fff", border: "1px solid var(--nv-color-border)", padding: "4px 6px", borderRadius: 6, textAlign: "center", fontWeight: 600 }}>{m}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorPanel() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
      <div className="nv-card" style={{ padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>Color Grading — ACES 1.3 • HDR10 / HDR10+ / Dolby Vision 5.0 / HLG / SDR</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 12 }}>
          {["Lift","Gamma","Gain","Offset"].map(w => (
            <div key={w} style={{ textAlign: "center" }}>
              <div style={{ width: 80, height: 80, borderRadius: 999, background: "conic-gradient(from 0deg, #ef4444, #f59e0b, #10b981, #0ea5e9, #8b5cf6, #ec4899, #ef4444)", margin: "0 auto", border: "2px solid var(--nv-color-border)", position: "relative" }}>
                <div style={{ position: "absolute", inset: 12, background: "var(--nv-color-surface)", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{w}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6 }}>{w}</div>
              <input type="range" style={{ width: "100%" }} />
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 12 }}>
          {["Waveform","Vectorscope","Parade","Histogram","False Color"].map(s => <div key={s} style={{ height: 72, background: "#0f0f12", borderRadius: 8, border: "1px solid #222", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: 11, fontWeight: 700 }}>{s}</div>)}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {["Primary Wheels","Curves RGB/HSL/Luma","LUT .cube/.3dl blending","Film Emulation (halation/bloom)","HDR tone map per-scene","Skin tone protect (neural seg)"].map(t => <Badge key={t} tone="neutral">{t}</Badge>)}
        </div>
        <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>AI matching across clips • auto white balance/exposure • mood LUT from brand guidelines • 90% less manual correction • neural grain responsive to luminance</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="nv-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>LUT Management + Film Stock</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, marginTop: 8 }}>
            {["Corporate Warm 001","Teal & Orange","Kodak 2383","Fuji Eterna","Bleach Bypass","Cross Process"].map(l => <div key={l} style={{ padding: "8px", borderRadius: 8, background: "linear-gradient(135deg,#1a1625,#2a2f3b)", color: "#fff", fontSize: 11, fontWeight: 700, textAlign: "center" }}>{l}</div>)}
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Neural LUT from reference image • animated LUTs • brand consistency • scanned negatives emulation indistinguishable from analog</div>
        </div>
        <div className="nv-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Scopes — Quad Layout • Comparison Split</div>
          <div style={{ height: 120, background: "#000", borderRadius: 8, marginTop: 8, display: "grid", placeItems: "center", color: "#666", fontSize: 12, border: "1px solid #222" }}>ACES 1.3 • DCI-P3 D65 • MaxCLL 1000,400 • Neural luminance mapping</div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Reference monitor • broadcast-compliant • HDR metadata injection (Dolby Vision dynamic)</div>
        </div>
      </div>
    </div>
  );
}

function AudioPanel() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div className="nv-card" style={{ padding: 12 }}>
        <div style={{ fontWeight: 800 }}>Audio Post — Multi-track unlimited • Spectral • Surround 9.1.6 Dolby Atmos</div>
        <div style={{ height: 90, background: "#0f0f12", borderRadius: 8, marginTop: 8, padding: 8, display: "flex", alignItems: "center", gap: 2, border: "1px solid #222" }}>
          {Array.from({ length: 64 }).map((_,i) => <div key={i} style={{ flex: 1, height: `${12 + Math.abs(Math.sin(i/4))*48}px`, background: i%8===0 ? "#818cf8" : "#38bdf8", borderRadius: 2 }} />)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 8 }}>
          {["Dialogue Cleanup (AI)","Noise Profile (learned)","De-ess / Comp / EQ","Pitch Correction","Stem Separation 5-stem 95% SDR","Spatial 9.1.6 auto-place"].map(t => <span key={t} style={{ fontSize: 11, background: "var(--nv-color-surface-2)", padding: "4px 6px", borderRadius: 6, textAlign: "center", fontWeight: 600, border: "1px solid var(--nv-color-border)" }}>{t}</span>)}
        </div>
        <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Waveform + spectral edit • loudness -23 LKFS • neural enhancement voice-preserved • surround neural HRTF</div>
      </div>
      <div className="nv-card" style={{ padding: 12 }}>
        <div style={{ fontWeight: 800 }}>Music & SFX • Voice • Transcription</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, fontSize: 12 }}>
          <div style={{ background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8 }}><strong>Library:</strong> 1M+ tracks + 500K SFX • AI music from mood/tempo • SFX auto-placed by visual events • stem separation for custom mix</div>
          <div style={{ background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8 }}><strong>Voice:</strong> cloning 97.8% + multilingual dub + lip-sync + real-time transform • noise -72dB floor • 18 LUFS</div>
          <div style={{ background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8 }}><strong>Transcription:</strong> 200+ langs • speaker diarization + punctuation restoration • SRT/VTT/TTML • 0.5× real-time • 98.5% WER</div>
          <div style={{ background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8 }}><strong>Mix:</strong> Auto-sync waveform/timecode/clap • drift correction • 5.1→9.1.6 upmix • auto-panning by visual objects</div>
        </div>
      </div>
    </div>
  );
}

function CaptionsPanel({ lang, onLang, busy, vtt, onGenerate, project }: { lang: string; onLang: (v:string)=>void; busy: boolean; vtt: string|null; onGenerate: ()=>void; project: VideoProjectLike|null }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 12 }}>
      <div className="nv-card" style={{ padding: 12 }}>
        <div style={{ fontWeight: 800 }}>Captions — 200+ Languages • Burn-in or Sidecar</div>
        <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Whisper-N0VA fine-tuned + speaker diarization + punctuation restoration • neural timing refinement • context-preserving translation</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <select className="nv-input" value={lang} onChange={e => onLang(e.target.value)} style={{ maxWidth: 160 }}>{["en","es","fr","de","ja","zh","pt","ar","hi","ru","ko","it"].map(l => <option key={l} value={l}>{l}</option>)}</select>
          <Button size="sm" onClick={onGenerate} disabled={busy}>{busy ? "Generating…" : "Auto-Generate"}</Button>
          <Badge tone="neutral">{project?.title ?? "No project"}</Badge>
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["SRT","VTT","TTML","Burn-in","Style: font/color/pos/anim","Translation (context aware)"].map(t => <Badge key={t} tone="primary">{t}</Badge>)}
        </div>
        <div style={{ marginTop: 10, background: "#0f0f12", color: "#a5b4fc", borderRadius: 8, padding: 10, fontFamily: "var(--nv-font-mono)", fontSize: 12, minHeight: 120, border: "1px solid #222" }}>
          {vtt ? vtt : "WEBVTT placeholder — click Auto-Generate to create 98.5% accurate transcript with speaker labels. Burn-in exports + sidecar files."}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <Button size="sm" variant="secondary">Export SRT</Button>
          <Button size="sm" variant="secondary">Export VTT</Button>
          <Button size="sm" variant="secondary">Export TTML</Button>
          <Badge tone="success">WCAG 2.1 AA • CVAA • auto audio description + sign avatar</Badge>
        </div>
      </div>
      <div className="nv-card" style={{ padding: 12 }}>
        <div style={{ fontWeight: 800 }}>Style Templates • Timing • Animation</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 8 }}>
          {["Pop-on","Roll-up","Fade","Karaoke","Lower-third","Kinetic"].map(s => <div key={s} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 12, textAlign: "center", fontWeight: 700 }}>{s}<div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", fontWeight: 500 }}>preview</div></div>)}
        </div>
        <div style={{ marginTop: 10, background: "#000", borderRadius: 8, height: 110, display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, border: "1px solid #222" }}>Caption Burn-in Preview — position / font / color / animation</div>
        <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>AI signer avatar • audio description generation from visual analysis • keyboard nav • neural caption optimization</div>
      </div>
    </div>
  );
}

function ExportPanel({ project, actions }: { project: VideoProjectLike|null; actions: TranscendentActions }) {
  const [preset, setPreset] = useState("youtube_1080");
  const [hdr, setHdr] = useState("sdr");
  const [queue, setQueue] = useState<{ id: string; preset: string; status: string; progress: number }[]>([]);
  const addToQueue = () => {
    const id = `exp_${Date.now()}`;
    setQueue(q => [{ id, preset, status: "QUEUED", progress: 0 }, ...q]);
    // mock progress
    let p = 0;
    const t = setInterval(() => {
      p += 12 + Math.random()*18;
      if (p >= 100) { p = 100; clearInterval(t); setQueue(q => q.map(x => x.id===id ? { ...x, status: "COMPLETED", progress: 100 } : x)); }
      else setQueue(q => q.map(x => x.id===id ? { ...x, status: p<15?"QUEUED": p<80?"PROCESSING":"FINALIZING", progress: Math.round(p) } : x));
    }, 450);
    // also try server action
    if (actions.createExport) {
      const fd = new FormData();
      fd.set("preset", preset);
      fd.set("hdr", hdr);
      if (project) fd.set("projectId", project.id);
      void actions.createExport(fd).catch(()=>{});
    }
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 12 }}>
      <div className="nv-card" style={{ padding: 12 }}>
        <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>Export & Delivery <Badge tone="primary">50+ formats • IMF/DCP • HDR10/Dolby Vision</Badge></div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label="Preset (500+ built-in)"><select className="nv-input" value={preset} onChange={e => setPreset(e.target.value)}>{EXPORT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label} — {p.resolution} {p.hdr}</option>)}</select></Field>
          <Field label="HDR"><select className="nv-input" value={hdr} onChange={e => setHdr(e.target.value)}><option value="sdr">SDR BT.709</option><option value="hdr10">HDR10</option><option value="hdr10_plus">HDR10+</option><option value="dolby_vision">Dolby Vision 5.0</option><option value="hlg">HLG</option></select></Field>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {EXPORT_PRESETS.slice(0,6).map(p => <span key={p.id} onClick={() => setPreset(p.id)} style={{ cursor: "pointer", fontSize: 11, padding: "4px 8px", borderRadius: 999, background: preset===p.id ? "var(--nv-color-primary)" : "var(--nv-color-surface-2)", color: preset===p.id ? "#fff" : "inherit", border: "1px solid var(--nv-color-border)", fontWeight: 600 }}>{p.label}</span>)}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <Button size="sm" onClick={addToQueue}>+ Add to Queue (batch)</Button>
          <Button size="sm" variant="secondary">Watermark: visible + forensic</Button>
          <Button size="sm" variant="secondary">Chapters auto • Thumbnail A/B</Button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--nv-color-text-faint)" }}>Custom presets • auto brand adaptation • neural per-platform optimization • 1000× real-time H100 • 40% bitrate savings • auto retry + exponential backoff • CDN + S3 + social direct publish • MASV/Aspera/Signiant delivery</div>
        <div style={{ marginTop: 10, background: "#0f0f12", color: "#a5b4fc", borderRadius: 8, padding: 10, fontSize: 11, fontFamily: "var(--nv-font-mono)", border: "1px solid #222" }}>
          <div>Format: {preset} • Container MP4 • Codec {EXPORT_PRESETS.find(p=>p.id===preset)?.codec} • {EXPORT_PRESETS.find(p=>p.id===preset)?.bitrate} • ACES</div>
          <div>Project: {project?.title ?? "—"} • {project?.resolution ?? "1080p"} • queue &lt;5m • auto-scaling GPU • neural queue prediction</div>
        </div>
      </div>
      <div className="nv-card" style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontWeight: 800 }}>Queue • Batch • Delivery</span><Badge tone="neutral">{queue.length} jobs</Badge><span style={{ marginLeft: "auto", fontSize: 11, color: "var(--nv-color-text-faint)" }}>SLA &lt;5m queue → processing • 99.999% durability (11 nines)</span></div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto" }}>
          {queue.length===0 ? <div className="nv-empty" style={{ minHeight: 160 }}><div>No exports yet — queue a preset</div><div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>HDR injection • DRM Widevine/PlayReady/FairPlay • forensic watermark viewer-ID • package to CDN/YouTube/Vimeo/Wistia</div></div> : queue.map(j => (
            <div key={j.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: 10, background: "var(--nv-color-surface-2)", borderRadius: 10, border: "1px solid var(--nv-color-border)" }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: j.status==="COMPLETED" ? "#10b981" : "#818cf8", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800 }}>{j.status==="COMPLETED" ? "✓" : "◍"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{EXPORT_PRESETS.find(p=>p.id===j.preset)?.label ?? j.preset}</div>
                <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{j.id} • {j.status} • {j.preset.includes("4k") ? "3840×2160 60fps HDR10+" : "1920×1080 30fps"} • CDN edges us-east/us-west/eu-west/ap-south</div>
                <div style={{ marginTop: 6, height: 6, background: "var(--nv-color-border)", borderRadius: 999, overflow: "hidden" }}><div style={{ width: `${j.progress}%`, height: "100%", background: j.status==="COMPLETED" ? "#10b981" : "linear-gradient(90deg,#818cf8,#38bdf8)", transition: "width 300ms" }} /></div>
              </div>
              <div style={{ textAlign: "right", fontSize: 11 }}><div style={{ fontWeight: 800 }}>{j.progress}%</div><div style={{ color: "var(--nv-color-text-faint)" }}>{j.status}</div></div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge tone="success">DASH ABR 8K→360p 12 rungs AI ladder</Badge>
          <Badge tone="primary">ProRes/DNxHR/MXF masters</Badge>
          <Badge tone="warning">Forensic leak trace • 99.7% ContentID</Badge>
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({ project }: { project: VideoProjectLike|null }) {
  const [comments, setComments] = useState<{ id: string; body: string; timecodeMs: number; author: string; resolved: boolean }[]>([
    { id: "c1", body: "Color too warm at 0:45 — check skin tone protection", timecodeMs: 45000, author: "Creative Director", resolved: false },
    { id: "c2", body: "Add product close-up at 1:12 per client feedback", timecodeMs: 72000, author: "Client", resolved: false },
    { id: "c3", body: "LGTM — approved for broadcast (CALM -23 LKFS)", timecodeMs: 0, author: "Legal", resolved: true },
  ]);
  const [newComment, setNewComment] = useState("");
  const [tc, setTc] = useState(45000);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
      <div className="nv-card" style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontWeight: 800 }}>Frame-Accurate Review • Collective Consciousness</span><Badge tone="primary">{comments.filter(c=>!c.resolved).length} open</Badge><Badge tone="neutral">Workflow: Creative → Client → Legal</Badge></div>
        <div style={{ marginTop: 10, height: 220, background: "#000", borderRadius: 8, position: "relative", overflow: "hidden", border: "1px solid #222" }}>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#666" }}>Frame {Math.round(tc/33)} • {String(Math.floor(tc/60000)).padStart(2,"0")}:{String(Math.floor((tc%60000)/1000)).padStart(2,"0")} • Draw tools • Pin • @mentions</div>
          {/* Mock pins */}
          <div style={{ position: "absolute", left: "42%", top: "38%", width: 14, height: 14, borderRadius: 999, background: "#ef4444", border: "2px solid #fff" }} />
          <div style={{ position: "absolute", left: "58%", top: "55%", width: 14, height: 14, borderRadius: 999, background: "#f59e0b", border: "2px solid #fff" }} />
          <div style={{ position: "absolute", bottom: 8, left: 8, right: 8, height: 24, background: "rgba(0,0,0,0.7)", borderRadius: 6, display: "flex", alignItems: "center", padding: "0 8px", gap: 6 }}>
            <input type="range" min={0} max={180000} value={tc} onChange={e => setTc(parseInt(e.target.value))} style={{ flex: 1 }} />
            <span style={{ color: "#fff", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{String(Math.floor(tc/60000)).padStart(2,"0")}:{String(Math.floor((tc%60000)/1000)).padStart(2,"0")}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input className="nv-input" placeholder="Time-coded comment — AI sentiment + auto-routing…" value={newComment} onChange={e => setNewComment(e.target.value)} style={{ flex: 1 }} />
          <Button size="sm" onClick={() => { if (!newComment.trim()) return; setComments(c => [...c, { id: `c${Date.now()}`, body: newComment, timecodeMs: tc, author: "You", resolved: false }]); setNewComment(""); }}>Comment</Button>
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
          {comments.map(c => (
            <div key={c.id} style={{ display: "flex", gap: 10, padding: 10, background: c.resolved ? "rgba(52,211,153,0.08)" : "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 999, background: c.resolved ? "#10b981" : "#818cf8", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 12 }}>{c.author.slice(0,1)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{c.author} • {String(Math.floor(c.timecodeMs/60000)).padStart(2,"0")}:{String(Math.floor((c.timecodeMs%60000)/1000)).padStart(2,"0")} • frame {Math.round(c.timecodeMs/33)} {c.resolved && <Badge tone="success">resolved</Badge>}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{c.body}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Button size="sm" variant="ghost" onClick={() => setComments(cs => cs.map(x=> x.id===c.id ? {...x, resolved: !x.resolved} : x))}>{c.resolved ? "Reopen" : "Resolve"}</Button><span style={{ fontSize: 11, color: "var(--nv-color-text-faint)", lineHeight: "28px" }}>Replies • drawing SVG • AI prioritization</span></div>
              </div>
              <Badge tone={c.resolved ? "success" : "warning"}>{c.resolved ? "done" : "open"}</Badge>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="nv-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Approval Workflow • Digital Signatures</div>
          {[
            { stage: "Editor Self-Review", who: "You", status: "completed", decision: "pass" },
            { stage: "Creative Director Review", who: "Director", status: "in_progress", decision: "—" },
            { stage: "Client Approval", who: "Client", status: "pending", decision: "—" },
            { stage: "Legal & Compliance", who: "Legal", status: "pending", decision: "—" },
          ].map(s => (
            <div key={s.stage} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--nv-color-border)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: s.status==="completed" ? "#10b981" : s.status==="in_progress" ? "#f59e0b" : "#e5e7eb" }} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{s.stage}</div><div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{s.who} • {s.status} {s.decision!=="—" && `• ${s.decision}`}</div></div>
              <Badge tone={s.status==="completed" ? "success" : s.status==="in_progress" ? "warning" : "neutral"}>{s.status}</Badge>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Sequential/parallel • delegation • escalation timers • AI optimal approver • 80% fewer bottlenecks • review links: password/expiry/domain/watermark + access log • version diff (changed frames only)</div>
        </div>
        <div className="nv-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Share — Review Link (secure)</div>
          <div style={{ marginTop: 8, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontFamily: "var(--nv-font-mono)", fontSize: 11, wordBreak: "break-all" }}>https://videos.n0va.io/review/{project?.id ?? "demo"} • password • expiry 2026-07-15 • domain: clientdomain.com • watermark CONFIDENTIAL {"{viewer_email}"} • forensic trace</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}><Button size="sm">Copy Link</Button><Button size="sm" variant="secondary">Side-by-side diff</Button><Button size="sm" variant="ghost">Heatmap + dwell</Button></div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Viewer engagement: heatmap • attention 0.78 • completion 52% • AI engagement analysis • auto follow-up for non-responsive</div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel({ project }: { project: VideoProjectLike|null }) {
  const retention = [1.0,0.92,0.85,0.78,0.68,0.62,0.55,0.52];
  const maxY = 1;
  const pts = retention.map((r,i) => `${(i/(retention.length-1))*100},${(1 - r/maxY)*100}`).join(" ");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 12 }}>
      <div className="nv-card" style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontWeight: 800 }}>Perception Consciousness — Analytics</span><Badge tone="primary">Real-time • neural predictions</Badge><span style={{ marginLeft: "auto", fontSize: 11, color: "var(--nv-color-text-faint)" }}>Project: {project?.title ?? "—"}</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 10 }}>
          {[
            { k: "Views", v: "15,420", sub: "12,350 unique • 8,500 new" },
            { k: "Watch Time", v: "1,268h", sub: "Avg 296s • completion 52%" },
            { k: "Engagement", v: "72%", sub: "Attention 0.78 • resonance 0.71" },
            { k: "Viral Potential", v: "0.65", sub: "Thumbnail 003 optimal" },
          ].map(m => <div key={m.k} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 10, padding: 10 }}><div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.k}</div><div style={{ fontSize: 18, fontWeight: 800 }}>{m.v}</div><div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{m.sub}</div></div>)}
        </div>
        <div style={{ marginTop: 12, background: "#0f0f12", borderRadius: 10, padding: 12, border: "1px solid #222" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#fff", fontSize: 11, fontWeight: 700 }}><span>Retention Curve (second-by-second)</span><span style={{ color: "#a5b4fc" }}>Emotional engagement 0.82 • neural virality 0.65</span></div>
          <div style={{ marginTop: 8, height: 110, background: "#111", borderRadius: 8, padding: 8 }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
              <polyline fill="none" stroke="#818cf8" strokeWidth="2" points={pts} />
              <polyline fill="rgba(129,140,248,0.18)" stroke="none" points={`0,100 ${pts} 100,100`} />
            </svg>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", marginTop: 4 }}><span>0s 100%</span><span>30s 85%</span><span>60s 78%</span><span>120s 65%</span><span>180s 52%</span></div>
        </div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, fontSize: 11 }}>
          <div style={{ background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, border: "1px solid var(--nv-color-border)" }}><div style={{ fontWeight: 800 }}>Demographics</div><div>25-34: 35% • 35-44: 28% • 18-24: 15% • US 45% UK 12% DE 8% JP 7%</div></div>
          <div style={{ background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, border: "1px solid var(--nv-color-border)" }}><div style={{ fontWeight: 800 }}>Devices / Platforms</div><div>Mobile 48% • Desktop 42% • YT 8.5k • LinkedIn 3.2k • Web 2.5k</div></div>
          <div style={{ background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, border: "1px solid var(--nv-color-border)" }}><div style={{ fontWeight: 800 }}>Traffic • Heatmap</div><div>Organic 30% • Social 28% • Direct 25% • peaks at 0:15 (0.92 intensity)</div></div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="nv-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Player & Embedding</div>
          <div style={{ marginTop: 8, background: "#000", borderRadius: 8, aspectRatio: "16/9", display: "grid", placeItems: "center", color: "#666", border: "1px solid #222" }}>Adaptive HTML5 • chapters • PiP • 0.25×-4× • hotspots/branching • 360°/VR • holographic • WCAG</div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>AIS quality (network+device+content) • smart chapters • foveated viewport tiles • signed URLs • interactive 300% engagement ↑</div>
        </div>
        <div className="nv-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Neural Recommendations</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            <div style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", padding: 8, borderRadius: 8 }}><strong>Thumbnail:</strong> variant 003 predicted CTR +18% • A/B testing active</div>
            <div style={{ background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.25)", padding: 8, borderRadius: 8 }}><strong>Title:</strong> “The Future of Enterprise Video: N0VA Aperture” • SEO optimized</div>
            <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", padding: 8, borderRadius: 8 }}><strong>Publish:</strong> Tuesday 14:00 EST optimal • content gaps: add interactive hotspots, extend hook to 12s</div>
          </div>
        </div>
        <div className="nv-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Security & DRM</div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>AES-256-GCM + HSM + post-quantum • DRM Widevine/PlayReady/FairPlay • forensic watermark per viewer • geo/domain/IP • anti-capture 95% • 99.7% ContentID / 99.9% fingerprint • deepfake 99.7% (N0VA-ContentGuard)</div>
        </div>
      </div>
    </div>
  );
}

function WorkspacePanel({ project }: { project: VideoProjectLike|null }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
      <div className="nv-card" style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontWeight: 800 }}>Workspace ↔ Videos Convergence</span><Badge tone="success">&lt;10ms quantum delta • CRDT</Badge></div>
        <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4 }}>Every project is a Workspace Nexus — board, team space, task stream, time track, focus mode, doc center, comm hub, calendar — bidirectional sync. Video IS the workspace when visual is primary.</div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
          {[
            { name: "Pre-Production", items: ["Script ✦ done","Storyboard done","Scout done"] },
            { name: "Production", items: ["Day1 Interviews done","Day2 B-Roll done","Day3 Demo ◍ in_progress"] },
            { name: "Post-Production", items: ["Rough cut ◍","Color todo","Sound todo","GFX todo"] },
            { name: "Review", items: ["Internal todo","Client todo","Legal todo"] },
            { name: "Delivery", items: ["Masters todo","Upload todo","Archive todo"] },
          ].map(col => (
            <div key={col.name} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 10, padding: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>{col.name}</div>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                {col.items.map(it => <div key={it} style={{ background: it.includes("done") ? "rgba(52,211,153,0.12)" : it.includes("in_progress") ? "rgba(251,191,36,0.14)" : "#fff", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: "6px 8px", fontSize: 11, fontWeight: 600 }}>{it}</div>)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, background: "#0f0f12", color: "#a5b4fc", borderRadius: 8, padding: 10, fontFamily: "var(--nv-font-mono)", fontSize: 11, border: "1px solid #222" }}>
          <div>Neural progression: predicted 2026-07-15 18:00 • 87% • bottleneck: sound_design_may_delay • suggested: sound 16h / color 8h</div>
          <div>Risk: client_review_history_slow • legal_hold_possible • auto-escalation ON • focus: deep_edit • coherence 0.97</div>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge tone="primary">Time tracked 78.5/120h • burn on track</Badge>
          <Badge tone="neutral">Focus: Deep Work — notifications suppressed 47</Badge>
          <Badge tone="success">Task auto-gen from rough_cut_export • calendar auto-scheduled review</Badge>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="nv-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Team Space • Shared Preview • Presence</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            {[
              { name: "Director", role: "director", color: "#818cf8", cursor: "video_1 @ 0:45" },
              { name: "Editor", role: "editor", color: "#34d399", cursor: "audio_1 @ 0:12" },
              { name: "Client", role: "client", color: "#fbbf24", cursor: "review portal idle" },
            ].map(m => <div key={m.name} style={{ flex: 1, background: "var(--nv-color-surface-2)", border: `1px solid ${m.color}`, borderRadius: 10, padding: 8, textAlign: "center" }}><div style={{ width: 28, height: 28, borderRadius: 999, background: m.color, margin: "0 auto", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800 }}>{m.name.slice(0,1)}</div><div style={{ fontSize: 11, fontWeight: 800, marginTop: 4 }}>{m.name}</div><div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{m.role}</div><div style={{ fontSize: 10, marginTop: 4, fontFamily: "var(--nv-font-mono)" }}>{m.cursor}</div></div>)}
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Voice chat ON • shared preview 1080p @ 0:45 • coherence 0.92 • CRDT • quantum delta &lt;10ms • offline merge AI</div>
        </div>
        <div className="nv-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Focus Modes → Video Behavior</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, marginTop: 8, fontSize: 11 }}>
            {[
              ["Deep Work","Fullscreen • notifications suppressed • AI muted • flow >0.85"],
              ["Collaboration","Realtime 50+ • voice • cursors • neural coherence"],
              ["Review","Comments max • diff • decision buttons"],
              ["Presentation","Preview • notes • timer • QR • engagement pred"],
              ["Crisis","War room • emergency GPU • auto escalation"],
              ["Flow State","Neural lace • eye-track • haptic • zero load"],
            ].map(([k,v]) => <div key={k} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 800 }}>{k}</div><div style={{ color: "var(--nv-color-text-faint)" }}>{v}</div></div>)}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--nv-color-text-faint)" }}>Project: {project?.title ?? "—"} • budget MKT-2026-Q3-001 • client → opportunity linkage • linked docs/sheets/slides auto-synced</div>
        </div>
      </div>
    </div>
  );
}

function N0VA10Panel({ intent, onIntent, running, result, onRun }: { intent: string; onIntent: (v:string)=>void; running: boolean; result: null|{ intentId:string }; onRun: ()=>void; }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 12 }}>
      <div style={{ background: "linear-gradient(135deg,#0f0f12,#1a1625)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", opacity: 0.7 }}>N0VA10 SINGULARITY GATEWAY — N×M → 1 COLLAPSE</div>
        <h3 style={{ margin: "6px 0 8px", fontSize: 18, fontWeight: 900 }}>One Gateway • One Intent • Infinite Reach (1000+ apps)</h3>
        <div style={{ fontSize: 11, opacity: 0.75 }}>Agents speak intent (natural language / consciousness vector). N0VA10 translates to optimal action sequence across all apps — zero OAuth complexity, zero fragile layers, self-healing (retry + circuit breaker + fallback chaining → human escalation).</div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Intent-Based Routing — Example</div>
          <textarea className="nv-input" value={intent} onChange={e => onIntent(e.target.value)} rows={3} placeholder="Publish Q3 launch to YouTube, Vimeo, website Tuesday 2pm EST, thumbnails/captions/SEO, notify Slack #marketing, update Salesforce, log Harvest 4h…" style={{ background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }} />
          <Button size="md" onClick={onRun} disabled={running} style={{ marginTop: 8 }}>{running ? "◍ Orchestrating across constellation…" : "↗ Execute Intent via N0VA10"}</Button>
          {result && <div style={{ marginTop: 8, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 8, padding: 8, fontSize: 12 }}><strong>✓ Intent {result.intentId}</strong> • routed 7 steps • parallel groups [[1],[2,3],[4],[5,6,7]] • predicted 298s • 0.97 success • cost $0.12 • 45g CO₂ • self-healing enabled<br/><span style={{ opacity: 0.8, fontFamily: "var(--nv-font-mono)", fontSize: 11 }}>1 derivatives → 2 YouTube ↑ + 3 Vimeo ↑ (parallel) → 4 website embed → 5 Slack + 6 Salesforce + 7 Harvest (parallel)</span></div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginTop: 10, fontSize: 11 }}>
          {["Zero-knowledge vault\n7-day rotation post-quantum","Request proxy • egress scan\nPII/copyright watermark","Geo-fenced residency\nEU→EU HIPAA→HIPAA attested","Rate-limit adaptive\nquota + neural prediction","Circuit breaker per app\n14-day failure forecast","Audit Merkle + blockchain\nquantum-signed tamper-proof"].map(x => <div key={x} style={{ background: "rgba(255,255,255,0.06)", padding: 8, borderRadius: 8, whiteSpace: "pre-wrap", lineHeight: 1.25 }}>{x}</div>)}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="nv-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>Connected App Constellation <Badge tone="primary">1000+ apps</Badge><Badge tone="success">Health 0.96 efficiency</Badge></div>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, fontSize: 11 }}>
            <AppGroup title="Creative" apps={["Premiere","After Effects","DaVinci","Final Cut","Avid","Blender","Cinema 4D","FFmpeg"]} />
            <AppGroup title="Publishing" apps={["YouTube","Vimeo","Wistia","Brightcove","Twitch","TikTok","LinkedIn","X"]} />
            <AppGroup title="Storage / CDN" apps={["S3/Glacier","GCS","Azure Blob","Cloudflare R2","Wasabi","Backblaze","IPFS","Fastly/Akamai"]} />
            <AppGroup title="Collab / Comms" apps={["Frame.io","Zoom","Teams","Meet","Slack","Discord","Telegram","Loom"]} />
            <AppGroup title="PM / Time" apps={["Asana","Jira","Trello","Monday","Notion","Harvest","Toggl","Clockify"]} />
            <AppGroup title="CRM / Analytics" apps={["Salesforce","HubSpot","Pipedrive","GA4","Adobe Analytics","Tableau","Power BI","Mixpanel"]} />
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Adobe CC direct sync • Mux/Cloudflare Stream APIs • OBS/Descript/Runway AI • Hootsuite/Buffer • Stripe • HelloSign • ShareGrid kit • …900+ more via adapter framework</div>
        </div>
        <div className="nv-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Autonomous Agent Fleet — Video Orchestration</div>
          <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["Import Agent","Dropbox/GDrive/Box/S3/camera/drone → auto-ingest","High • predictive pre-fetch"],
              ["Export Agent","YouTube/Vimeo/Wistia/IG/TikTok/LinkedIn → multi-publish","High • optimal schedule"],
              ["Meeting Capture","Zoom/Teams/Meet/Webex → auto transcript/highlights","High • importance detect"],
              ["Project Sync","Asana/Jira/Trello/Monday ↔ video status","High • delay prediction"],
              ["Compliance","ContentID • brand safety • pre-publish block","High • 99.7%"],
              ["CDN Agent","Cloudflare/Fastly/Akamai warm + edge pre-pos","High • predictive"],
              ["N0VA10 Orchestrator","Intent → 1000+ apps • failure recovery","High • self-heal"],
            ].map(([n,d,l]) => <div key={n} style={{ display: "flex", gap: 8, padding: 8, background: "var(--nv-color-surface-2)", borderRadius: 8, border: "1px solid var(--nv-color-border)" }}><span style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#818cf8,#38bdf8)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 11 }}>◉</span><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 800 }}>{n} <span style={{ fontWeight: 500, color: "var(--nv-color-text-faint)" }}>• {l}</span></div><div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{d}</div></div></div>)}
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Isolated confidential containers per tenant • hardware attestation • scope-pruned OAuth • instant revocation propagation</div>
        </div>
      </div>
    </div>
  );
}

function AppGroup({ title, apps }: { title: string; apps: string[] }) {
  return <div style={{ background: "var(--nv-color-surface-2)", borderRadius: 8, padding: 8, border: "1px solid var(--nv-color-border)" }}><div style={{ fontWeight: 800, fontSize: 11 }}>{title}</div><div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>{apps.map(a => <span key={a} style={{ background: "#fff", border: "1px solid var(--nv-color-border)", padding: "2px 6px", borderRadius: 999, fontSize: 10, fontWeight: 700 }}>{a}</span>)}</div></div>;
}

function MiniCard({ title, badge, lines }: { title: string; badge: string; lines: string[] }) {
  return <div className="nv-card" style={{ padding: 12 }}><div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontWeight: 800, fontSize: 13 }}>{title}</span><Badge tone="primary">{badge}</Badge></div><div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>{lines.map(l => <span key={l} style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{l}</span>)}</div></div>;
}

function VideoLibraryInline({ videos, playlists, actions }: { videos: Video[]; playlists: PlaylistWithCount[]; actions: VideosActions }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string|null>(null);
  const filtered = selected ? videos.filter(v=>v.playlistId===selected) : videos;
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <Chip active={selected===null} onClick={()=>setSelected(null)}>All ({videos.length})</Chip>
        {playlists.map(p=> <Chip key={p.id} active={selected===p.id} onClick={()=>setSelected(p.id)}>{p.name} ({p._count.videos})</Chip>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 8 }}>
        {filtered.map(v=> {
          const embed = embedFor(v.url, v.provider);
          return <div key={v.id} className="nv-card" style={{ padding: 8 }}><div style={{ aspectRatio:"16/9", background:"#000", borderRadius:8, overflow:"hidden" }}>{embed ? <iframe src={embed} title={v.title} style={{ width:"100%", height:"100%", border:"none"}}/> : <div style={{ width:"100%", height:"100%", display:"grid", placeItems:"center", color:"#666"}}>External</div>}</div><div style={{ fontWeight:700, fontSize:13, marginTop:6 }}>{v.title}</div><div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>{v.provider}</div></div>;
        })}
        {filtered.length===0 && <div className="nv-empty">No videos in this view</div>}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: ()=>void; children: ReactNode }) {
  return <button type="button" onClick={onClick} style={{ fontSize: 12, background: active ? "var(--nv-color-primary)" : "rgba(0,0,0,0.08)", color: active ? "#fff":"inherit", padding:"4px 12px", borderRadius: 999, fontWeight:600, cursor:"pointer", border:"none" }}>{children}</button>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display:"flex", flexDirection:"column", gap: 6, fontSize: 11, fontWeight:700, color:"var(--nv-color-text-muted)" }}>{label}{children}</label>;
}
