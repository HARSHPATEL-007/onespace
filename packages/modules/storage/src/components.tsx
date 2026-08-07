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
}

export function StorageApp({
  items,
  crumbs,
  parentId,
  folderTargets,
  actions,
}: {
  items: StorageItem[];
  crumbs: Array<{ id: string; name: string }>;
  parentId: string | null;
  folderTargets: Array<{ id: string; name: string }>;
  actions: StorageActions;
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
            {versionsOpen ? (
              <VersionRow
                label={`v${versionsOpen.version}`}
                sizeBytes={versionsOpen.sizeBytes}
                storageKey={versionsOpen.storageKey ?? "—"}
                date={versionsOpen.updatedAt}
                current
              />
            ) : null}
            {versionRows.length <= 1 ? (
              <div className="nv-empty">Only the original version exists.</div>
            ) : (
              versionRows.map((v, i) => (
                <VersionRow
                  key={v.id}
                  label={`v${Math.max(1, (versionsOpen?.version ?? 1) - 1 - i)}`}
                  sizeBytes={v.sizeBytes}
                  storageKey={v.storageKey}
                  date={v.createdAt}
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
  label,
  sizeBytes,
  storageKey,
  date,
  current = false,
}: {
  label: string;
  sizeBytes: number;
  storageKey: string;
  date: Date;
  current?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        border: "1px solid var(--nv-color-border)",
        borderRadius: "var(--nv-radius-md)",
      }}
    >
      <span style={{ fontWeight: 700, minWidth: 44 }}>
        {label}
        {current ? " (current)" : ""}
      </span>
      <span style={{ fontSize: "var(--nv-font-sm)", minWidth: 70 }}>{formatBytes(sizeBytes)}</span>
      <span
        style={{
          flex: 1,
          fontSize: "var(--nv-font-xs)",
          color: "var(--nv-color-text-faint)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {storageKey}
      </span>
      <span style={{ fontSize: "var(--nv-font-xs)", color: "var(--nv-color-text-faint)" }}>
        {date.toLocaleDateString()}
      </span>
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