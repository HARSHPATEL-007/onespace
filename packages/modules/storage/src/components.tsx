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
import type { StorageItem } from "@n0va/db";

export interface StorageActions {
  createFolder: (formData: FormData) => Promise<void>;
  rename: (formData: FormData) => Promise<void>;
  move: (formData: FormData) => Promise<void>;
  trash: (formData: FormData) => Promise<void>;
  restore: (formData: FormData) => Promise<void>;
  purge: (formData: FormData) => Promise<void>;
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
  const [uploading, setUploading] = useState(false);
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
                        <a className="nv-sidebar-item" href={`/api/storage/download?item=${item.id}`} style={{ color: "inherit" }}>
                          Download
                        </a>
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