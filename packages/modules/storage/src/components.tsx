"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Dialog,
  Dropdown,
  Field,
  Input,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  cn,
} from "@n0va/ui";
import type { StorageItem, StorageFileVersion } from "@n0va/db";

export interface StorageActions {
  createFolder: (formData: FormData) => Promise<void>;
  rename: (formData: FormData) => Promise<void>;
  move: (formData: FormData) => Promise<void>;
  trash: (formData: FormData) => Promise<void>;
  restore: (formData: FormData) => Promise<void>;
  purge: (formData: FormData) => Promise<void>;
  versions: (formData: FormData) => Promise<StorageFileVersion[]>;
  restoreVersion: (formData: FormData) => Promise<unknown>;
  approve: (formData: FormData) => Promise<unknown>;
  placeHold: (formData: FormData) => Promise<unknown>;
  releaseHold: (formData: FormData) => Promise<unknown>;
  listHolds: () => Promise<Array<{ id: string; scope: string; objectId: string | null; matterName: string | null; reason: string; placedAt: Date; active: boolean }>>;
  evidencePack: (formData: FormData) => Promise<unknown>;
  checkOut: (formData: FormData) => Promise<unknown>;
  checkIn: (formData: FormData) => Promise<unknown>;
  setRestrictedDownload: (formData: FormData) => Promise<unknown>;
  issueHoldNotice: (formData: FormData) => Promise<unknown>;
  acknowledgeHold: (formData: FormData) => Promise<unknown>;
  exportLogs: (formData: FormData) => Promise<string>;
  metrics: () => Promise<unknown>;
}

export interface StorageMetrics {
  items: number;
  folders: number;
  indexed: number;
  indexCoverage: number;
  versions: number;
  restores: number;
  accessLogs: number;
  deniedAttempts: number;
  activeHolds: number;
  heldItems: number;
  holdCoverage: number;
  complianceLocked: number;
  immutable: number;
  approvedVersions: number;
  trashed: number;
  restrictedDownloads: number;
  checkedOut: number;
  retentionBreakdown: Record<string, number>;
  chainValid: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  CURRENT: "#22c55e",
  SUPERSEDED: "#94a3b8",
  RECALLED: "#ef4444",
  APPROVED: "#22c55e",
  PENDING: "#eab308",
  DRAFT: "#94a3b8",
  REJECTED: "#ef4444",
};

function Chip({ label, color }: { label: string; color?: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        padding: "2px 8px",
        borderRadius: 20,
        border: `1px solid ${color ?? "var(--nv-color-border)"}`,
        color: color ?? "inherit",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function StorageApp({
  items,
  crumbs,
  parentId,
  folderTargets,
  actions,
  metrics,
}: {
  items: StorageItem[];
  crumbs: Array<{ id: string; name: string }>;
  parentId: string | null;
  folderTargets: Array<{ id: string; name: string }>;
  actions: StorageActions;
  metrics?: StorageMetrics;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const versionFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [versioning, setVersioning] = useState<StorageItem | null>(null);
  const [versioningLoading, setVersioningLoading] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState<StorageItem | null>(null);
  const [versionRows, setVersionRows] = useState<StorageFileVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [moving, setMoving] = useState<StorageItem | null>(null);
  const [renaming, setRenaming] = useState<StorageItem | null>(null);

  const refresh = useCallback(() => router.refresh(), [router]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("parentId", parentId ?? "");
      await fetch("/api/storage/upload", { method: "POST", body: fd });
      refresh();
    } finally {
      setUploading(false);
    }
  };

  const uploadVersion = async (file: File) => {
    if (!versioning || versioningLoading) return;
    setVersioningLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("itemId", versioning.id);
      await fetch("/api/storage/upload", { method: "POST", body: fd });
      refresh();
    } finally {
      setVersioningLoading(false);
      setVersioning(null);
    }
  };

  const openVersions = (item: StorageItem) => {
    setVersionsOpen(item);
    setVersionRows([]);
    setVersionsLoading(true);
    const fd = new FormData();
    fd.append("id", item.id);
    void actions.versions(fd)
      .then(setVersionRows)
      .finally(() => setVersionsLoading(false));
  };

  const reloadVersions = (item: StorageItem | null) => {
    if (!item) return;
    const fd = new FormData();
    fd.append("id", item.id);
    void actions.versions(fd).then(setVersionRows);
    refresh();
  };

  const exportEvidence = (item: StorageItem) => {
    const fd = new FormData();
    fd.append("id", item.id);
    void actions.evidencePack(fd).then((pack) => downloadJson(`${item.name}-evidence.json`, pack));
  };

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA CLOUD STORAGE</h1>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={() => setNewFolderOpen(true)}>
          + New folder
        </Button>
        <Button size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
          ↑ Upload
        </Button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
        <input
          ref={versionFileRef}
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadVersion(file);
            e.target.value = "";
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: "var(--nv-space-4)", fontSize: "var(--nv-font-sm)" }}>
        <a className="nv-link" href="/m/cloud-storage">My files</a>
        {crumbs.map((crumb, i) => (
          <span key={crumb.id} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ color: "var(--nv-color-text-faint)" }}>/</span>
            <a className="nv-link" href={`/m/cloud-storage?folder=${crumb.id}`}>
              {crumb.name}
            </a>
          </span>
        ))}
      </div>

      {metrics ? (
        <div className="nv-card" style={{ display: "flex", flexWrap: "wrap", gap: 20, padding: "10px 16px", marginBottom: "var(--nv-space-4)", fontSize: "var(--nv-font-xs)" }}>
          <div><b>{metrics.items}</b> files · <b>{metrics.versions}</b> versions</div>
          <div>Indexed <b>{Math.round(metrics.indexCoverage * 100)}%</b></div>
          <div><b>{metrics.approvedVersions}</b> approved</div>
          <div style={metrics.activeHolds > 0 ? { color: "#ef4444" } : undefined}>Holds <b>{metrics.activeHolds}</b> ({metrics.heldItems} files)</div>
          <div>WORM <b>{metrics.immutable}</b> · locked <b>{metrics.complianceLocked}</b></div>
          <div>Restricted <b>{metrics.restrictedDownloads}</b> · checked out <b>{metrics.checkedOut}</b></div>
          <div>Restores <b>{metrics.restores}</b> · denied <b style={metrics.deniedAttempts > 0 ? { color: "#ef4444" } : undefined}>{metrics.deniedAttempts}</b></div>
          <div>Audit <b>{metrics.accessLogs}</b> entries {metrics.chainValid ? <span style={{ color: "#22c55e" }}>· chain OK</span> : <span style={{ color: "#ef4444" }}>· CHAIN INVALID</span>}</div>
        </div>
      ) : null}

      <div className="nv-card">
        {items.length === 0 ? (
          <div className="nv-empty">
            <div>This folder is empty</div>
            <div style={{ fontSize: "var(--nv-font-xs)" }}>Upload a file or create a folder.</div>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Size</TableHeaderCell>
                <TableHeaderCell>Modified</TableHeaderCell>
                <TableHeaderCell style={{ width: 110 }}></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.isFolder ? (
                      <a href={`/m/cloud-storage?folder=${item.id}`} style={{ fontWeight: 600, textDecoration: "none", color: "inherit" }}>
                        📁 {item.name}
                      </a>
                    ) : (
                      <a
                        href={`/api/storage/download?item=${item.id}`}
                        style={{ fontWeight: 500, textDecoration: "none", color: "inherit" }}
                      >
                        📄 {item.name}
                      </a>
                    )}
                    <span style={{ display: "inline-flex", gap: 4, marginLeft: 8, verticalAlign: "middle" }}>
                      {item.legalHold ? <Chip label="🔒 HOLD" color="#ef4444" /> : null}
                      {item.immutable ? <Chip label="WORM" color="#f97316" /> : item.retentionMode !== "STANDARD" ? <Chip label={item.retentionMode} color="#eab308" /> : null}
                      {item.complianceLocked ? <Chip label="LOCKED" color="#f97316" /> : null}
                      {item.restrictedDownload ? <Chip label="RESTRICTED" color="#a855f7" /> : null}
                      {item.lockedById ? <Chip label={`✎ ${item.lockedById.slice(0, 8)}`} color="#3b82f6" /> : null}
                    </span>
                  </TableCell>
                  <TableCell>{item.isFolder ? "—" : formatBytes(item.sizeBytes)}</TableCell>
                  <TableCell>{item.updatedAt.toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Dropdown trigger={<Button variant="ghost" size="sm">⋯</Button>}>
                      {!item.isFolder ? (
                        <>
                          <a className="nv-sidebar-item" href={`/api/storage/download?item=${item.id}`} style={{ color: "inherit" }}>
                            Download
                          </a>
                          <MenuItem onSelect={() => { setVersioning(item); versionFileRef.current?.click(); }}>
                            Upload new version
                          </MenuItem>
                          <MenuItem onSelect={() => openVersions(item)}>Versions</MenuItem>
                          <MenuItem onSelect={() => exportEvidence(item)}>Evidence pack</MenuItem>
                          <MenuItem onSelect={() => {
                            const fd = new FormData();
                            fd.append("id", item.id);
                            void actions[item.lockedById ? "checkIn" : "checkOut"](fd).then(refresh);
                          }}>
                            {item.lockedById ? "Check in" : "Check out"}
                          </MenuItem>
                          <MenuItem onSelect={() => {
                            const fd = new FormData();
                            fd.append("id", item.id);
                            fd.append("restricted", item.restrictedDownload ? "0" : "1");
                            void actions.setRestrictedDownload(fd).then(refresh);
                          }}>
                            {item.restrictedDownload ? "Allow download" : "Restrict download"}
                          </MenuItem>
                        </>
                      ) : null}
                      <MenuItem onSelect={() => setRenaming(item)}>Rename</MenuItem>
                      <MenuItem onSelect={() => setMoving(item)}>Move to…</MenuItem>
                      <form action={actions.trash} onSubmit={() => setTimeout(refresh, 50)}>
                        <input type="hidden" name="id" value={item.id} />
                        <MenuItem danger>Move to trash</MenuItem>
                      </form>
                    </Dropdown>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        title="New folder"
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
            <Button type="submit" form="new-folder-form">Create</Button>
          </>
        }
      >
        <form
          id="new-folder-form"
          action={actions.createFolder}
          onSubmit={() => {
            setNewFolderOpen(false);
            setTimeout(refresh, 50);
          }}
        >
          <input type="hidden" name="parentId" value={parentId ?? ""} />
          <Field label="Folder name">
            <Input name="name" required placeholder="Marketing assets" autoFocus />
          </Field>
        </form>
      </Dialog>

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename"
        actions={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button type="submit" form="rename-form">Save</Button>
          </>
        }
      >
        <form
          id="rename-form"
          action={actions.rename}
          onSubmit={() => {
            setRenaming(null);
            setTimeout(refresh, 50);
          }}
        >
          <input type="hidden" name="id" value={renaming?.id ?? ""} />
          <Field label="Name">
            <Input name="name" required defaultValue={renaming?.name ?? ""} autoFocus />
          </Field>
        </form>
      </Dialog>

      <Dialog
        open={moving !== null}
        onClose={() => setMoving(null)}
        title={`Move "${moving?.name}"`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setMoving(null)}>Cancel</Button>
            <Button type="submit" form="move-form">Move</Button>
          </>
        }
      >
        <form
          id="move-form"
          action={actions.move}
          onSubmit={() => {
            setMoving(null);
            setTimeout(refresh, 50);
          }}
        >
          <input type="hidden" name="id" value={moving?.id ?? ""} />
          <Field label="Destination folder">
            <select name="parentId" className="nv-select">
              <option value="">My files (root)</option>
              {folderTargets.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </Field>
        </form>
      </Dialog>
      <Dialog
        open={versionsOpen !== null}
        onClose={() => setVersionsOpen(null)}
        title={`Versions — ${versionsOpen?.name ?? ""}`}
        actions={
          <Button variant="secondary" onClick={() => setVersionsOpen(null)}>Close</Button>
        }
      >
        {versionsLoading ? (
          <div className="nv-empty">Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, opacity: 0.6, paddingBottom: 2 }}>
              Immutable revision history — status, approval state, restore and recall are tracked per version.
            </div>
            {versionRows.length === 0 ? (
              <div className="nv-empty">No version history.</div>
            ) : (
              versionRows.map((v) => (
                <VersionRow
                  key={v.id}
                  version={v}
                  current={v.versionNumber === versionsOpen?.version}
                  actions={actions}
                  onReload={() => reloadVersions(versionsOpen)}
                />
              ))
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function VersionRow({
  version,
  current = false,
  actions,
  onReload,
}: {
  version: StorageFileVersion;
  current?: boolean;
  actions: StorageActions;
  onReload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const doRestore = () => {
    if (busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("id", version.itemId);
    fd.append("versionNumber", String(version.versionNumber));
    fd.append("changeSummary", `Restored from v${version.versionNumber}`);
    void actions
      .restoreVersion(fd)
      .then(onReload)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  const doApprove = (approval: "APPROVED" | "REJECTED") => {
    if (busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("id", version.itemId);
    fd.append("versionNumber", String(version.versionNumber));
    fd.append("approval", approval);
    void actions
      .approve(fd)
      .then(onReload)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 12px",
        border: current ? "1px solid var(--nv-color-primary)" : "1px solid var(--nv-color-border)",
        borderRadius: "var(--nv-radius-md)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, minWidth: 44 }}>v{version.versionNumber}</span>
        <Chip label={version.status} color={STATUS_COLORS[version.status] ?? undefined} />
        <Chip label={version.approvalStatus} color={STATUS_COLORS[version.approvalStatus] ?? undefined} />
        {version.isLocked ? <Chip label="LOCKED" color="#f97316" /> : null}
        {current ? <Chip label="current" color="#22c55e" /> : null}
        <span style={{ fontSize: "var(--nv-font-xs)", color: "var(--nv-color-text-faint)", marginLeft: "auto" }}>
          {formatBytes(version.sizeBytes)} · {version.createdAt.toLocaleDateString()}
        </span>
      </div>
      {version.changeSummary ? (
        <div style={{ fontSize: "var(--nv-font-xs)", opacity: 0.75 }}>{version.changeSummary}</div>
      ) : null}
      {version.recallReason ? (
        <div style={{ fontSize: "var(--nv-font-xs)", color: "#ef4444" }}>Recalled: {version.recallReason}</div>
      ) : null}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {!current && version.status !== "RECALLED" ? (
          <button
            onClick={doRestore}
            disabled={busy}
            style={{ cursor: "pointer", fontSize: 10, padding: "2px 10px", borderRadius: 12, border: "1px solid var(--nv-color-border)", background: "transparent", color: "inherit" }}
          >
            Restore this version
          </button>
        ) : null}
        {version.approvalStatus !== "APPROVED" ? (
          <button
            onClick={() => doApprove("APPROVED")}
            disabled={busy}
            style={{ cursor: "pointer", fontSize: 10, padding: "2px 10px", borderRadius: 12, border: "1px solid #22c55e", background: "transparent", color: "#22c55e" }}
          >
            Approve
          </button>
        ) : null}
        {version.approvalStatus !== "REJECTED" ? (
          <button
            onClick={() => doApprove("REJECTED")}
            disabled={busy}
            style={{ cursor: "pointer", fontSize: 10, padding: "2px 10px", borderRadius: 12, border: "1px solid #ef4444", background: "transparent", color: "#ef4444" }}
          >
            Reject
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function TrashApp({
  items,
  actions,
}: {
  items: StorageItem[];
  actions: StorageActions;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>Trash</h1>
      </div>
      <div className="nv-card">
        {items.length === 0 ? (
          <div className="nv-empty">Trash is empty</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Trashed</TableHeaderCell>
                <TableHeaderCell style={{ width: 190 }}></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.isFolder ? "📁" : "📄"} {item.name}</TableCell>
                  <TableCell>{item.trashedAt?.toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div style={{ display: "flex", gap: 6 }}>
                      <form action={actions.restore} onSubmit={() => setTimeout(refresh, 50)}>
                        <input type="hidden" name="id" value={item.id} />
                        <Button variant="secondary" size="sm" type="submit">Restore</Button>
                      </form>
                      <form action={actions.purge} onSubmit={() => setTimeout(refresh, 50)}>
                        <input type="hidden" name="id" value={item.id} />
                        <Button variant="danger" size="sm" type="submit">Delete forever</Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}