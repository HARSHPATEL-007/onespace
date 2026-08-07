"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Input, Select } from "@n0va/ui";
import type { IntegrationLog } from "@n0va/db";
import type { IntegrationWithLogs } from "./server";
import { CATEGORIES, PROVIDERS, findProvider, categoryLabel } from "./catalog";

export interface McpSettings {
  retentionDays: number;
  mcpKey: string | null;
  mcpKeySet: boolean;
}

export interface AccessRequestView {
  id: string;
  integrationName: string;
  provider: string;
  tool: string;
  reason: string;
  requesterLabel: string;
  status: string;
  toolArguments: unknown | null;
  reasoningChain: unknown[] | null;
  sessionContext: unknown[] | null;
  approvedSignature: string | null;
  createdAt: Date;
}

export interface DiscoveredToolView {
  providerKey: string;
  providerName: string;
  category: string;
  name: string;
  description: string;
  relevance: number;
  reason: string;
}

export interface N0va1oActions {
  connect: (formData: FormData) => Promise<void>;
  sync: (formData: FormData) => Promise<{ message: string; ok: boolean; statusCode: number }>;
  toggle: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
  activity: (formData: FormData) => Promise<IntegrationLog[]>;
  update: (formData: FormData) => Promise<void>;
  rotateWebhook: (formData: FormData) => Promise<{ secret: string; path: string; url: string }>;
  setRetention: (formData: FormData) => Promise<void>;
  rotateMcpKey: (formData: FormData) => Promise<string>;
  cleanup: (formData: FormData) => Promise<{ purged: number }>;
  accessRequests: (formData: FormData) => Promise<AccessRequestView[]>;
  decideAccess: (formData: FormData) => Promise<void>;
  discoverTools: (formData: FormData) => Promise<DiscoveredToolView[]>;
}

const getOrigin = () => (typeof window !== "undefined" ? window.location.origin : "");

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid var(--nv-color-primary)" : "2px solid transparent",
        padding: "8px 14px",
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        color: active ? "var(--nv-color-text-strong)" : "var(--nv-color-text-muted)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Dot({ level }: { level: string }) {
  const color =
    level === "error"
      ? "var(--nv-color-danger)"
      : level === "warn"
        ? "var(--nv-color-warning)"
        : "color-mix(in srgb, var(--nv-color-success) 45%, transparent)";
  return <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: color }} />;
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === "inbound") return <span title="Inbound webhook" style={{ color: "var(--nv-color-info, #0ea5e9)" }}>▼</span>;
  if (direction === "system") return <span title="System" style={{ color: "var(--nv-color-text-faint)" }}>◆</span>;
  return <span title="Outbound call" style={{ color: "var(--nv-color-primary)" }}>▲</span>;
}

function LogRow({ log }: { log: IntegrationLog }) {
  const meta = (log.meta ?? {}) as Record<string, unknown>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
      <DirectionIcon direction={log.direction} />
      <Dot level={log.level} />
      <span style={{ color: "var(--nv-color-text-faint)", whiteSpace: "nowrap" }}>{log.createdAt.toLocaleString()}</span>
      {log.statusCode !== null && log.statusCode !== undefined && (
        <span
          style={{
            fontSize: 11,
            padding: "0 6px",
            borderRadius: 4,
            background:
              log.statusCode >= 400
                ? "color-mix(in srgb, var(--nv-color-danger) 15%, transparent)"
                : "color-mix(in srgb, var(--nv-color-success) 15%, transparent)",
            color: log.statusCode >= 400 ? "var(--nv-color-danger)" : "var(--nv-color-success)",
          }}
        >
          {log.statusCode}
        </span>
      )}
      {log.durationMs !== null && log.durationMs !== undefined && (
        <span style={{ color: "var(--nv-color-text-faint)", fontSize: 11 }}>{log.durationMs}ms</span>
      )}
      <span
        style={{
          color: log.level === "error" ? "var(--nv-color-danger)" : "var(--nv-color-text-muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {log.message}
      </span>
      {typeof meta.tool === "string" && <span className="nv-badge">{t(meta.tool)}</span>}
      {typeof meta.retries === "number" && meta.retries > 0 && <span className="nv-badge nv-badge-amber">retry ×{meta.retries}</span>}
    </div>
  );
}

const t = (key: string) => key.replace(/_/g, " ");

export function Integrations({
  integrations,
  settings,
  workspaceSlug,
  actions,
  requests,
  role,
}: {
  integrations: IntegrationWithLogs[];
  settings: McpSettings;
  workspaceSlug: string;
  actions: N0va1oActions;
  requests: AccessRequestView[];
  role: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"dashboard" | "connections" | "discover" | "compliance">("dashboard");
  const [connecting, setConnecting] = useState(false);
  const [connectCategory, setConnectCategory] = useState("all");
  const [connectQuery, setConnectQuery] = useState("");
  const [connectProvider, setConnectProvider] = useState("slack");
  const [syncMsg, setSyncMsg] = useState<Record<string, string | undefined>>({});
  const [openLogs, setOpenLogs] = useState<Record<string, IntegrationLog[] | null | undefined>>({});
  const [settingsFor, setSettingsFor] = useState<IntegrationWithLogs | null>(null);
  const [rotated, setRotated] = useState<{ secret: string; path: string } | null>(null);
  const [mcpKeyRotated, setMcpKeyRotated] = useState<string | null>(null);
  const [purged, setPurged] = useState<number | null>(null);
  const [localRetention, setLocalRetention] = useState(String(settings.retentionDays));
  const [liveRequests, setLiveRequests] = useState<AccessRequestView[]>(requests);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverResults, setDiscoverResults] = useState<DiscoveredToolView[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);

  const providerOptions = useMemo(() => {
    const q = connectQuery.trim().toLowerCase();
    return PROVIDERS.filter(
      (p) =>
        (connectCategory === "all" || p.category === connectCategory) &&
        (!q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
    );
  }, [connectCategory, connectQuery]);

  const toggleActivity = (id: string) => {
    if (openLogs[id] !== undefined) {
      setOpenLogs((m) => ({ ...m, [id]: undefined }));
      return;
    }
    setOpenLogs((m) => ({ ...m, [id]: null }));
    const fd = new FormData();
    fd.set("id", id);
    void actions.activity(fd).then((logs) => setOpenLogs((m) => ({ ...m, [id]: logs })));
  };

  const runSync = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("tool", "sync");
    void actions.sync(fd).then((r) => {
      setSyncMsg((m) => ({ ...m, [id]: r.message }));
      router.refresh();
    });
  };

  const mcpUrl = `${getOrigin()}/api/n0va1o/mcp/${workspaceSlug}`;

  return (
    <div style={{ maxWidth: 940, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA1O</h1>
        <span className="nv-badge nv-badge-amber">infinite integration gateway</span>
        <span className="nv-badge">{PROVIDERS.length} providers in catalog</span>
        <div style={{ flex: 1 }} />
        {tab === "connections" && (
          <Button size="sm" onClick={() => setConnecting(true)}>
            + Connect app
          </Button>
        )}
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: "var(--nv-space-4)", borderBottom: "1px solid var(--nv-color-border)" }}>
        <Tab active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
          Dashboard
        </Tab>
        <Tab active={tab === "connections"} onClick={() => setTab("connections")}>
          Connections ({integrations.length})
        </Tab>
        <Tab active={tab === "discover"} onClick={() => setTab("discover")}>
          Discover
        </Tab>
        <Tab active={tab === "compliance"} onClick={() => setTab("compliance")}>
          Compliance &amp; MCP {liveRequests.some((r) => r.status === "PENDING") ? "·" : ""}
        </Tab>
      </div>

      {tab === "dashboard" ? (
        <DashboardTab integrations={integrations} settings={settings} />
      ) : tab === "discover" ? (
        <DiscoverTab
          query={discoverQuery}
          setQuery={setDiscoverQuery}
          results={discoverResults}
          loading={discoverLoading}
          onSearch={(q, max) => {
            setDiscoverLoading(true);
            const fd = new FormData();
            fd.set("query", q);
            fd.set("maxTools", String(max));
            void actions.discoverTools(fd).then((r) => {
              setDiscoverResults(r);
              setDiscoverLoading(false);
            });
          }}
        />
      ) : tab === "connections" ? (
        integrations.length === 0 ? (
          <div className="nv-empty" style={{ minHeight: 280 }}>
            <div>No integrations connected</div>
            <Button variant="secondary" size="sm" onClick={() => setConnecting(true)}>
              Connect the first app
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {integrations.map((i) => {
              const meta = findProvider(i.provider);
              const lastLog = i.logs[0];
              return (
                <div key={i.id} className="nv-card" style={{ padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 280 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800 }}>{i.name}</span>
                        <span className="nv-badge">{meta?.name ?? i.provider}</span>
                        <span className="nv-badge nv-badge-green">{categoryLabel(i.category)}</span>
                        <span className={i.enabled ? "nv-badge nv-badge-green" : "nv-badge nv-badge-amber"}>
                          {i.enabled ? "Connected" : "Paused"}
                        </span>
                        {i.mcpEnabled && <span className="nv-badge">MCP</span>}
                        {i.webhookEnabled && i.webhookPath && <span className="nv-badge">webhook</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                        <span>
                          {syncMsg[i.id] ?? (lastLog ? `Last run: ${lastLog.message}` : "Not used yet")}
                          {i.lastSyncAt ? ` · ${i.lastSyncAt.toLocaleString()}` : ""}
                        </span>
                        {i.webhookPath && (
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <code style={{ fontSize: 11 }}>
                              {getOrigin()}/api/n0va1o/hooks/{i.webhookPath}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                void navigator.clipboard?.writeText(`${getOrigin()}/api/n0va1o/hooks/${i.webhookPath}`).catch(() => {});
                              }}
                            >
                              Copy
                            </Button>
                          </span>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => toggleActivity(i.id)}>
                      Activity {openLogs[i.id] !== undefined ? "▴" : "▾"}
                    </Button>
                    <Button variant="secondary" size="sm" disabled={!i.enabled} onClick={() => runSync(i.id)}>
                      Sync
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSettingsFor(i)}>
                      Settings
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("id", i.id);
                        fd.set("enabled", i.enabled ? "false" : "true");
                        void actions.toggle(fd).then(() => router.refresh());
                      }}
                    >
                      {i.enabled ? "Pause" : "Enable"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (!window.confirm(`Disconnect ${i.name}?`)) return;
                        const fd = new FormData();
                        fd.set("id", i.id);
                        void actions.remove(fd).then(() => router.refresh());
                      }}
                    >
                      ✕
                    </Button>
                  </div>

                  {openLogs[i.id] !== undefined && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--nv-color-border)" }}>
                      {openLogs[i.id] === null ? (
                        <div className="nv-empty" style={{ padding: "8px 0", minHeight: 0 }}>
                          Loading…
                        </div>
                      ) : openLogs[i.id]!.length === 0 ? (
                        <div className="nv-empty" style={{ padding: "8px 0", minHeight: 0 }}>
                          No activity yet
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
                          {openLogs[i.id]!.map((l) => (
                            <LogRow key={l.id} log={l} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <ComplianceTab
          settings={settings}
          workspaceSlug={workspaceSlug}
          localRetention={localRetention}
          setLocalRetention={setLocalRetention}
          mcpKeyRotated={mcpKeyRotated}
          setMcpKeyRotated={setMcpKeyRotated}
          purged={purged}
          setPurged={setPurged}
          actions={actions}
          requests={liveRequests}
          onRefreshRequests={async () => {
            const fd = new FormData();
            setLiveRequests(await actions.accessRequests(fd));
          }}
          onDecide={(rid, approve) => {
            const fd = new FormData();
            fd.set("id", rid);
            fd.set("approve", String(approve));
            void actions.decideAccess(fd).then(() => {
              setLiveRequests((rs) => rs.map((r) => (r.id === rid ? { ...r, status: approve ? "APPROVED" : "DENIED" } : r)));
            });
          }}
        />
      )}

      {connecting && (
        <ConnectDialog
          onClose={() => setConnecting(false)}
          category={connectCategory}
          setCategory={setConnectCategory}
          query={connectQuery}
          setQuery={setConnectQuery}
          provider={connectProvider}
          setProvider={setConnectProvider}
          options={providerOptions}
          onConnect={(fd) => {
            void actions.connect(fd).then(() => {
              setConnecting(false);
              router.refresh();
            });
          }}
        />
      )}

      {settingsFor && (
        <SettingsDialog
          integration={settingsFor}
          onClose={() => setSettingsFor(null)}
          actions={actions}
          rotated={rotated}
          setRotated={setRotated}
          showSecret={showSecret}
          setShowSecret={setShowSecret}
        />
      )}

      {(rotated || mcpKeyRotated) && (
        <Dialog open onClose={() => { setRotated(null); setMcpKeyRotated(null); }} title="Secret rotated — copy it now">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 380 }}>
            {rotated ? (
              <>
                <div>
                  <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: 4 }}>Webhook URL</div>
                  <code style={{ wordBreak: "break-all", fontSize: 12 }}>{getOrigin()}/api/n0va1o/hooks/{rotated.path}</code>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: 4 }}>Signing secret</div>
                  <code style={{ wordBreak: "break-all", fontSize: 12 }}>{rotated.secret}</code>
                </div>
              </>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: 4 }}>Workspace MCP key</div>
                <code style={{ wordBreak: "break-all", fontSize: 12 }}>{mcpKeyRotated}</code>
              </div>
            )}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => { setRotated(null); setMcpKeyRotated(null); }}>
              Done
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function ConnectDialog({
  onClose,
  category,
  setCategory,
  query,
  setQuery,
  provider,
  setProvider,
  options,
  onConnect,
}: {
  onClose: () => void;
  category: string;
  setCategory: (c: string) => void;
  query: string;
  setQuery: (q: string) => void;
  provider: string;
  setProvider: (p: string) => void;
  options: typeof PROVIDERS;
  onConnect: (fd: FormData) => void;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Connect an app"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="connect-integration-form">
            Connect
          </Button>
        </>
      }
    >
      <form
        id="connect-integration-form"
        action={onConnect}
        style={{ minWidth: 400, display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button
            type="button"
            className={category === "all" ? "nv-badge nv-badge-amber" : "nv-badge"}
            style={{ cursor: "pointer", background: "none", border: "none" }}
            onClick={() => setCategory("all")}
          >
            All ({PROVIDERS.length})
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={category === c.key ? "nv-badge nv-badge-amber" : "nv-badge"}
              style={{ cursor: "pointer", background: "none", border: "none" }}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <Input placeholder="Search providers…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select name="provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {options.length === 0 && <option value="">No providers match</option>}
          {options.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name} — {CATEGORIES.find((c) => c.key === p.category)?.label}
            </option>
          ))}
        </Select>
        {provider && (
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
            {findProvider(provider)?.description} Tools:{" "}
            {findProvider(provider)?.tools.map((x) => t(x.name)).join(", ") ?? "ping"}
          </div>
        )}
        <Input name="name" placeholder="Display name (e.g. Design channel)" required />
        <Input name="token" placeholder="API token / secret (optional)" />
        <Input name="baseUrl" placeholder="Base URL (only for REST/self-hosted providers)" />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" name="mcpEnabled" value="1" />
          Expose to MCP gateway (agent-scoped tools)
        </label>
      </form>
    </Dialog>
  );
}

function SettingsDialog({
  integration,
  onClose,
  actions,
  rotated,
  setRotated,
  showSecret,
  setShowSecret,
}: {
  integration: IntegrationWithLogs;
  onClose: () => void;
  actions: N0va1oActions;
  rotated: { secret: string; path: string } | null;
  setRotated: (v: { secret: string; path: string } | null) => void;
  showSecret: Record<string, boolean>;
  setShowSecret: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
}) {
  const allowlist = ((integration.allowlistTools as unknown) ?? []) as string[];
  const blocklist = ((integration.blocklistTools as unknown) ?? []) as string[];
  const config = (integration.config ?? {}) as Record<string, unknown>;
  const meta = findProvider(integration.provider);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Settings — ${integration.name}`}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            type="submit"
            form="settings-form"
            onClick={() => {
              void document.getElementById("settings-form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id="settings-form"
        style={{ minWidth: 400, display: "flex", flexDirection: "column", gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set("id", integration.id);
          void actions.update(fd).then(() => onClose());
        }}
      >
        <Input name="name" defaultValue={integration.name} required />
        <div style={{ display: "flex", gap: 10 }}>
          <Input name="rateLimitPerMin" type="number" min={1} defaultValue={integration.rateLimitPerMin} />
          <Input name="retryMax" type="number" min={0} max={5} defaultValue={integration.retryMax} />
          <Input name="timeoutMs" type="number" min={500} defaultValue={integration.timeoutMs} />
        </div>
        <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
          rate/min · retries · timeout ms
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" name="mcpEnabled" defaultChecked={integration.mcpEnabled} />
          Expose to MCP gateway
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" name="webhookEnabled" defaultChecked={integration.webhookEnabled} />
          Accept inbound webhooks
        </label>
        <Input name="allowlistTools" defaultValue={allowlist.join(", ")} placeholder="Tool allowlist (comma separated; destructive tools require this)" />
        <Input name="blocklistTools" defaultValue={blocklist.join(", ")} placeholder="Tool blocklist (comma separated)" />
      </form>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--nv-color-border)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Inbound webhook</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <code style={{ flex: 1, wordBreak: "break-all" }}>
            {getOrigin()}/api/n0va1o/hooks/{integration.webhookPath}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(`${getOrigin()}/api/n0va1o/hooks/${integration.webhookPath}`).catch(() => {});
            }}
          >
            Copy
          </Button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <code style={{ flex: 1, wordBreak: "break-all" }}>
            {showSecret[integration.id] ? integration.webhookSecret ?? "—" : (integration.webhookSecret ? "••••••••" : "—")}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSecret((prev) => ({ ...prev, [integration.id]: !prev[integration.id] }))}
          >
            {showSecret[integration.id] ? "Hide" : "Show"}
          </Button>
        </div>
        <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
          Sign with header <code>X-N0VA-Signature: sha256 hex</code> of the raw body. Metadata only is recorded.
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const fd = new FormData();
            fd.set("id", integration.id);
            void actions.rotateWebhook(fd).then((r) => {
              setRotated({ secret: r.secret, path: r.path });
              onClose();
            });
          }}
        >
          Rotate secret
        </Button>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "var(--nv-color-text-faint)" }}>
        Provider: {meta?.name ?? integration.provider} · {meta?.auth ?? "api-key"} auth ·{" "}
        {meta?.tools.length ?? 0} catalog tools
      </div>
    </Dialog>
  );
}

const prettyJson = (v: unknown) => (v === null || v === undefined ? "—" : JSON.stringify(v, null, 2));

function AccessRequestCard({
  request,
  onDecide,
}: {
  request: AccessRequestView;
  onDecide: (id: string, approve: boolean, signature?: string) => void;
}) {
  const pending = request.status === "PENDING";
  const [showDetail, setShowDetail] = useState(false);
  const [signature, setSignature] = useState("");

  return (
    <div className="nv-card" style={{ padding: 12, gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
        <span className={pending ? "nv-badge nv-badge-amber" : request.status === "APPROVED" ? "nv-badge nv-badge-green" : "nv-badge"}>
          {pending ? "PENDING REVIEW" : request.status}
        </span>
        <span style={{ fontWeight: 600 }}>{t(request.tool)}</span>
        <span style={{ color: "var(--nv-color-text-faint)" }}>on {request.integrationName}</span>
        <span style={{ color: "var(--nv-color-text-faint)", fontSize: 12 }}>by {request.requesterLabel}</span>
        {request.approvedSignature && <span className="nv-badge">signed</span>}
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={() => setShowDetail((s) => !s)}>
          {showDetail ? "▴" : "▾"} Inspect
        </Button>
        {pending && (
          <>
            <input
              type="text"
              placeholder="digital signature (optional)"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              style={{ width: 180, fontSize: 12, padding: "2px 6px", border: "1px solid var(--nv-color-border)", borderRadius: 4 }}
            />
            <Button variant="secondary" size="sm" onClick={() => onDecide(request.id, false)}>
              Deny
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onDecide(request.id, true, signature || undefined);
                setSignature("");
              }}
            >
              Approve
            </Button>
          </>
        )}
      </div>

      {request.reason && <div style={{ marginTop: 4, fontSize: 12, color: "var(--nv-color-text-faint)" }}>— {request.reason}</div>}

      {showDetail && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--nv-color-text-faint)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600, color: "var(--nv-color-text-muted)", marginBottom: 2 }}>Arguments (what the agent intended)</div>
            <pre style={{ margin: 0, padding: 8, borderRadius: 6, background: "color-mix(in srgb, var(--nv-color-surface-2, #000) 60%, transparent)", whiteSpace: "pre-wrap", overflowX: "auto" }}>
              {prettyJson(request.toolArguments)}
            </pre>
          </div>
          {request.reasoningChain && request.reasoningChain.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, color: "var(--nv-color-text-muted)", marginBottom: 2 }}>Chain-of-thought (reasoning)</div>
              <pre style={{ margin: 0, padding: 8, borderRadius: 6, background: "color-mix(in srgb, var(--nv-color-surface-2, #000) 60%, transparent)", whiteSpace: "pre-wrap", overflowX: "auto" }}>
                {prettyJson(request.reasoningChain)}
              </pre>
            </div>
          )}
          {request.sessionContext && request.sessionContext.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, color: "var(--nv-color-text-muted)", marginBottom: 2 }}>Session lineage (prior tool calls in this session)</div>
              <pre style={{ margin: 0, padding: 8, borderRadius: 6, background: "color-mix(in srgb, var(--nv-color-surface-2, #000) 60%, transparent)", whiteSpace: "pre-wrap", overflowX: "auto" }}>
                {prettyJson(request.sessionContext)}
              </pre>
            </div>
          )}
          {request.approvedSignature && (
            <div style={{ fontSize: 11 }}>
              Approved with signature: <code>{request.approvedSignature.slice(0, 16)}…</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ComplianceTab({
  settings,
  workspaceSlug,
  localRetention,
  setLocalRetention,
  mcpKeyRotated,
  setMcpKeyRotated,
  purged,
  setPurged,
  actions,
  requests,
  onRefreshRequests,
  onDecide,
}: {
  settings: McpSettings;
  workspaceSlug: string;
  localRetention: string;
  setLocalRetention: (v: string) => void;
  mcpKeyRotated: string | null;
  setMcpKeyRotated: (v: string | null) => void;
  purged: number | null;
  setPurged: (v: number | null) => void;
  actions: N0va1oActions;
  requests: AccessRequestView[];
  onRefreshRequests: () => void;
  onDecide: (id: string, approve: boolean, signature?: string) => void;
}) {
  const maskedKey = settings.mcpKey
    ? `${settings.mcpKey.slice(0, 8)}…${settings.mcpKey.slice(-4)}`
    : "not generated yet";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="nv-card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Audit-aware logging</div>
        <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: 12 }}>
          Every gateway call and webhook event is logged with metadata only — actor, tool, status, timing,
          idempotency key. Payload bodies are never stored.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            Retention (days, 1–3285):
            <Input
              type="number"
              min={1}
              max={3285}
              style={{ width: 110 }}
              value={localRetention}
              onChange={(e) => setLocalRetention(e.target.value)}
            />
          </label>
          <Button
            size="sm"
            onClick={() => {
              const fd = new FormData();
              fd.set("days", localRetention);
              void actions.setRetention(fd).then(() => {
                window.location.reload();
              });
            }}
          >
            Save retention
          </Button>
          <a href="/api/n0va1o/export" download>
            <Button variant="secondary" size="sm">
              Export audit CSV
            </Button>
          </a>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const fd = new FormData();
              void actions.cleanup(fd).then((r) => {
                setPurged(r.purged);
              });
            }}
          >
            Purge expired logs
          </Button>
          {purged !== null && (
            <span style={{ fontSize: 12, color: "var(--nv-color-success)" }}>Purged {purged} logs</span>
          )}
        </div>
      </div>

      <div className="nv-card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>MCP gateway — one URL per team</div>
        <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: 12 }}>
          Point Claude, Cursor or any MCP client at the team URL with the workspace key. Tools are scoped by
          each integration's allow/blocklists; destructive tools raise an access request instead of executing.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <code style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, background: "var(--nv-color-surface-2, rgba(127,127,127,.08))" }}>
            {getOrigin()}/api/n0va1o/mcp/{workspaceSlug}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(`${getOrigin()}/api/n0va1o/mcp/${workspaceSlug}`).catch(() => {});
            }}
          >
            Copy URL
          </Button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <code style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, background: "var(--nv-color-surface-2, rgba(127,127,127,.08))" }}>
            {mcpKeyRotated ?? maskedKey}
          </code>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const fd = new FormData();
              void actions.rotateMcpKey(fd).then((key) => {
                setMcpKeyRotated(key);
              });
            }}
          >
            Rotate key
          </Button>
        </div>
      </div>

      <div className="nv-card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Access requests</div>
          <Button variant="ghost" size="sm" onClick={onRefreshRequests}>
            Refresh
          </Button>
        </div>
        <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: 10 }}>
          Agents calling destructive tools get blocked and raise these; approving grants the tool on the
          integration's allowlist.
        </div>
        {requests.length === 0 ? (
          <div className="nv-empty" style={{ padding: "16px 0", minHeight: 0 }}>
            No access requests yet
          </div>
        ) : (
           <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {requests.map((r) => (
              <AccessRequestCard key={r.id} request={r} onDecide={onDecide} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardTab({ integrations, settings }: { integrations: IntegrationWithLogs[]; settings: McpSettings }): React.ReactNode {
  const connected = integrations.filter((i) => i.enabled).length;
  const paused = integrations.filter((i) => !i.enabled).length;
  const mcpEnabled = integrations.filter((i) => i.mcpEnabled).length;
  const withWebhooks = integrations.filter((i) => i.webhookEnabled && i.webhookPath).length;
  const totalTools = integrations.reduce((sum, i) => {
    const allowlist = ((i.allowlistTools as unknown) ?? []) as string[];
    return sum + (allowlist.length > 0 ? allowlist.length : (findProvider(i.provider)?.tools.length ?? 1));
  }, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <StatCard label="Connected" value={String(connected)} tone="success" />
        <StatCard label="Paused" value={String(paused)} tone="warning" />
        <StatCard label="MCP Enabled" value={String(mcpEnabled)} tone="primary" />
        <StatCard label="Webhooks" value={String(withWebhooks)} tone="primary" />
        <StatCard label="Total Tools" value={String(totalTools)} tone="neutral" />
        <StatCard label="Retention" value={`${settings.retentionDays}d`} tone="neutral" />
      </div>

      {integrations.length > 0 && (
        <div className="nv-card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Connector Health</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {integrations.map((i) => {
              const provider = findProvider(i.provider);
              const health = i.enabled ? "healthy" : "paused";
              return (
                <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, minWidth: 140 }}>{i.name}</span>
                  <span className="nv-badge">{provider?.name ?? i.provider}</span>
                  <span className={i.enabled ? "nv-badge nv-badge-green" : "nv-badge nv-badge-amber"}>{health}</span>
                  <span style={{ color: "var(--nv-color-text-faint)", fontSize: 11 }}>
                    {provider?.tools.length ?? 0} tools · {i.rateLimitPerMin}/min
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="nv-card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Quick Actions</div>
        <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: 10 }}>
          Jump to a section to manage your integrations.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="#connect"><Button size="sm">+ Connect app</Button></a>
          <a href="/api/n0va1o/export" download><Button variant="secondary" size="sm">Export audit CSV</Button></a>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "primary" | "neutral" }) {
  const colors: Record<string, string> = {
    success: "color-mix(in srgb, var(--nv-color-success) 12%, transparent)",
    warning: "color-mix(in srgb, var(--nv-color-warning) 12%, transparent)",
    primary: "color-mix(in srgb, var(--nv-color-primary) 12%, transparent)",
    neutral: "var(--nv-color-surface-2, rgba(127,127,127,.06))",
  };
  return (
    <div className="nv-card" style={{ padding: 14, background: colors[tone] }}>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function DiscoverTab({
  query,
  setQuery,
  results,
  loading,
  onSearch,
}: {
  query: string;
  setQuery: (q: string) => void;
  results: DiscoveredToolView[];
  loading: boolean;
  onSearch: (query: string, maxTools: number) => void;
}): React.ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="nv-card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Intent-Driven Tool Discovery</div>
        <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: 12 }}>
          Describe what you need in natural language — N0VA1O finds the most relevant tools across its 1,000+ provider catalog.
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) onSearch(query, 5);
          }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <Input
            placeholder="e.g. Find Q3 invoices in Dropbox and notify Slack"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 280 }}
          />
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? "Searching…" : "Discover"}
          </Button>
        </form>
      </div>

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Top {results.length} tools for your intent</div>
          {results.map((tool, idx) => (
            <div key={idx} className="nv-card" style={{ padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>{tool.providerName}:{tool.name}</span>
                <span className="nv-badge nv-badge-green">{(tool.relevance * 100).toFixed(0)}% match</span>
                <span className="nv-badge">{tool.category}</span>
                <div style={{ flex: 1 }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginTop: 4 }}>{tool.reason}</div>
              <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 2 }}>{tool.description}</div>
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && !loading && (
        <div className="nv-empty" style={{ padding: "24px 0" }}>
          Enter a query above to discover relevant tools.
        </div>
      )}
    </div>
  );
}
