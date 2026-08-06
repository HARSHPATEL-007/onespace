"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { Album, Photo } from "@n0va/db";

export interface PicsActions {
  createAlbum: (formData: FormData) => Promise<void>;
  removeAlbum: (formData: FormData) => Promise<void>;
  removePhoto: (formData: FormData) => Promise<void>;
  movePhoto: (formData: FormData) => Promise<void>;
}

export function PicsApp({
  albums,
  photos,
  activeAlbumId,
  actions,
}: {
  albums: Array<Album & { _count: { photos: number } }>;
  photos: Photo[];
  activeAlbumId: string | null;
  actions: PicsActions;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [moving, setMoving] = useState<Photo | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        if (activeAlbumId) fd.set("albumId", activeAlbumId);
        await fetch("/api/pics/upload", { method: "POST", body: fd });
      }
      router.refresh();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--nv-space-4)", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA PICS</h1>
        <div style={{ display: "flex", gap: 6, marginLeft: 12, flexWrap: "wrap" }}>
          <a
            href="/m/pics"
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
              color: !activeAlbumId ? "var(--nv-color-primary)" : "var(--nv-color-text-muted)",
              background: !activeAlbumId ? "var(--nv-color-primary-alpha)" : "transparent",
            }}
          >
            All photos
          </a>
          {albums.map((a) => (
            <a
              key={a.id}
              href={`/m/pics?a=${a.id}`}
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
                color: activeAlbumId === a.id ? "var(--nv-color-primary)" : "var(--nv-color-text-muted)",
                background: activeAlbumId === a.id ? "var(--nv-color-primary-alpha)" : "transparent",
              }}
            >
              {a.name} ({a._count.photos})
            </a>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
          + Album
        </Button>
        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : "↑ Upload"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
      </div>

      {photos.length === 0 ? (
        <div className="nv-empty" style={{ minHeight: 300 }}>
          <div>{uploading ? "Uploading…" : "No photos here yet"}</div>
          {!uploading && (
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              Upload photos
            </Button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "var(--nv-space-3)" }}>
          {photos.map((p) => (
            <div key={p.id} className="nv-card" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <img
                src={`/api/pics/img?key=${encodeURIComponent(p.storageKey)}`}
                alt={p.filename}
                onClick={() => setLightbox(p)}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  objectFit: "cover",
                  borderRadius: "var(--nv-radius-md)",
                  cursor: "zoom-in",
                  background: "var(--nv-color-surface-2)",
                }}
              />
              <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.filename}
              </div>
              <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
                {p.width && p.height ? `${p.width}×${p.height}` : ""} · {Math.round(p.sizeBytes / 1024)} KB
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Button variant="ghost" size="sm" onClick={() => setMoving(p)}>
                  Move
                </Button>
                <form
                  action={actions.removePhoto}
                  onSubmit={() => setTimeout(() => router.refresh(), 50)}
                >
                  <input type="hidden" name="id" value={p.id} />
                  <Button variant="ghost" size="sm">
                    Delete
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New album"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-album-form">
              Create
            </Button>
          </>
        }
      >
        <form
          id="create-album-form"
          action={(fd) => {
            void actions.createAlbum(fd).then(() => {
              setCreating(false);
              setTimeout(() => router.refresh(), 50);
            });
          }}
          style={{ minWidth: 320 }}
        >
          <input className="nv-input" name="name" placeholder="Album name" autoFocus required />
        </form>
      </Dialog>

      <Dialog
        open={moving !== null}
        onClose={() => setMoving(null)}
        title="Move photo"
        actions={
          <>
            <Button variant="secondary" onClick={() => setMoving(null)}>
              Cancel
            </Button>
            <Button type="submit" form="move-photo-form">
              Move
            </Button>
          </>
        }
      >
        <form
          id="move-photo-form"
          action={(fd) => {
            fd.set("id", moving?.id ?? "");
            void actions.movePhoto(fd).then(() => {
              setMoving(null);
              setTimeout(() => router.refresh(), 50);
            });
          }}
          style={{ minWidth: 320 }}
        >
          <select className="nv-input" name="albumId" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
            <option value="">No album (all photos)</option>
            {albums.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </form>
      </Dialog>

      {lightbox && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          onClick={() => setLightbox(null)}
        >
          <img
            src={`/api/pics/img?key=${encodeURIComponent(lightbox.storageKey)}`}
            alt={lightbox.filename}
            style={{ maxWidth: "92vw", maxHeight: "92vh", borderRadius: 8 }}
          />
        </div>
      )}
    </div>
  );
}
