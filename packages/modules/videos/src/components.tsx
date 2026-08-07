"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Dropdown, MenuItem } from "@n0va/ui";
import type { Video, VideoPlaylist } from "@n0va/db";
import { embedFor } from "./server";

export interface VideosActions {
  create: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
  createPlaylist: (formData: FormData) => Promise<void>;
  renamePlaylist: (formData: FormData) => Promise<void>;
  removePlaylist: (formData: FormData) => Promise<void>;
  setVideoPlaylist: (formData: FormData) => Promise<void>;
}

export type PlaylistWithCount = VideoPlaylist & { _count: { videos: number } };

export function VideoDetail({ video }: { video: Video }) {
  const embed = embedFor(video.url, video.provider);
  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <a href="/m/videos" className="nv-link" style={{ fontSize: "var(--nv-font-sm)" }}>
        ← Video library
      </a>
      <div style={{ aspectRatio: "16/9", borderRadius: "var(--nv-radius-lg)", overflow: "hidden", background: "#000", marginTop: "var(--nv-space-3)" }}>
        {embed ? (
          <iframe
            src={embed}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ width: "100%", height: "100%", border: "none" }}
          />
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
        <Button size="sm" onClick={() => setAdding(true)}>
          + Add video
        </Button>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: "var(--nv-space-4)" }}>
        <Chip active={selected === null} onClick={() => setSelected(null)}>
          All videos ({videos.length})
        </Chip>
        {playlists.map((p) => (
          <div key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <Chip active={selected === p.id} onClick={() => setSelected(selected === p.id ? null : p.id)}>
              {p.name} ({p._count.videos})
            </Chip>
            <Dropdown trigger={<Button variant="ghost" size="sm" style={{ minWidth: 0, padding: "2px 6px" }}>⋯</Button>}>
              <MenuItem onSelect={() => setRenaming({ id: p.id, name: p.name })}>Rename</MenuItem>
              <MenuItem danger onSelect={() => setDeleting({ id: p.id, name: p.name })}>Delete</MenuItem>
            </Dropdown>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
          + New playlist
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="nv-empty" style={{ minHeight: 300 }}>
          <div>{selected ? "No videos in this playlist" : "Your library is empty"}</div>
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            Add a video link
          </Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--nv-space-4)" }}>
          {filtered.map((v) => {
            const embed = embedFor(v.url, v.provider);
            return (
              <div key={v.id} className="nv-card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ aspectRatio: "16/9", borderRadius: "var(--nv-radius-md)", overflow: "hidden", background: "#000" }}>
                  {embed ? (
                    <iframe
                      src={embed}
                      title={v.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      style={{ width: "100%", height: "100%", border: "none" }}
                    />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 13 }}>
                      External video
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: 700 }}>{v.title}</div>
                {v.description && (
                  <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)" }}>{v.description}</div>
                )}
                <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
                  {v.provider} · added {v.uploadedAt.toLocaleDateString()}
                </div>
                <Dropdown trigger={<Button variant="ghost" size="sm" style={{ alignSelf: "flex-end" }}>⋯</Button>}>
                  <MenuItem onSelect={() => setAssigning(v.id)}>Add to playlist…</MenuItem>
                  {v.playlistId ? (
                    <MenuItem
                      onSelect={() => {
                        const fd = new FormData();
                        fd.set("videoId", v.id);
                        fd.set("playlistId", "");
                        run(fd, actions.setVideoPlaylist);
                      }}
                    >
                      Remove from playlist
                    </MenuItem>
                  ) : null}
                  <MenuItem
                    danger
                    onSelect={() => {
                      const fd = new FormData();
                      fd.set("id", v.id);
                      run(fd, actions.remove);
                    }}
                  >
                    Remove
                  </MenuItem>
                </Dropdown>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add video"
        actions={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-video-form">
              Add
            </Button>
          </>
        }
      >
        <form
          id="add-video-form"
          action={(fd) => {
            void actions.create(fd).then(() => {
              setAdding(false);
              setTimeout(() => router.refresh(), 50);
            });
          }}
          style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 400 }}
        >
          <input className="nv-input" name="title" placeholder="Title" autoFocus required />
          <input className="nv-input" name="url" placeholder="https://youtube.com/watch?v=… or https://vimeo.com/…" required />
          <select className="nv-input" name="provider" defaultValue="youtube">
            <option value="youtube">YouTube</option>
            <option value="vimeo">Vimeo</option>
            <option value="other">Other (link only)</option>
          </select>
          <textarea className="nv-input" name="description" placeholder="Description (optional)" rows={3} />
        </form>
      </Dialog>

      {assigning !== null && (
        <Dialog
          open
          onClose={() => setAssigning(null)}
          title="Add to playlist"
          actions={
            <Button variant="secondary" onClick={() => setAssigning(null)}>
              Close
            </Button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 320 }}>
            {playlists.length === 0 ? (
              <div className="nv-empty" style={{ minHeight: 80 }}>
                <div>No playlists yet</div>
                <div style={{ fontSize: "var(--nv-font-xs)" }}>Create a playlist, then assign videos to it.</div>
              </div>
            ) : (
              playlists.map((p) => {
                const current = videos.find((v) => v.id === assigning)?.playlistId ?? null;
                const active = current === p.id;
                return (
                  <MenuItem
                    key={p.id}
                    onSelect={() => {
                      const fd = new FormData();
                      fd.set("videoId", assigning);
                      fd.set("playlistId", active ? "" : p.id);
                      run(fd, actions.setVideoPlaylist);
                      setAssigning(null);
                    }}
                  >
                    {active ? "✓ " : ""}
                    {p.name} ({p._count.videos})
                  </MenuItem>
                );
              })
            )}
          </div>
        </Dialog>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New playlist"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-playlist-form">
              Create
            </Button>
          </>
        }
      >
        <form
          id="create-playlist-form"
          action={(fd) => {
            run(fd, actions.createPlaylist);
            setCreating(false);
          }}
          style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 400 }}
        >
          <input className="nv-input" name="name" placeholder="Playlist name" autoFocus required />
        </form>
      </Dialog>

      {renaming !== null && (
        <Dialog
          open
          onClose={() => setRenaming(null)}
          title="Rename playlist"
          actions={
            <>
              <Button variant="secondary" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit" form="rename-playlist-form">
                Save
              </Button>
            </>
          }
        >
          <form
            id="rename-playlist-form"
            action={(fd) => {
              run(fd, actions.renamePlaylist);
              setRenaming(null);
            }}
            style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 400 }}
          >
            <input type="hidden" name="id" value={renaming.id} />
            <input className="nv-input" name="name" placeholder="Playlist name" defaultValue={renaming.name} autoFocus required />
          </form>
        </Dialog>
      )}

      {deleting !== null && (
        <Dialog
          open
          onClose={() => setDeleting(null)}
          title="Delete playlist"
          actions={
            <>
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" type="submit" form="delete-playlist-form">
                Delete
              </Button>
            </>
          }
        >
          <div style={{ minWidth: 400 }}>
            Delete "{deleting.name}"? Videos in it will be kept, but unassigned from this playlist.
          </div>
          <form
            id="delete-playlist-form"
            action={(fd) => {
              run(fd, actions.removePlaylist);
              if (selected === deleting.id) setSelected(null);
              setDeleting(null);
            }}
          >
            <input type="hidden" name="id" value={deleting.id} />
          </form>
        </Dialog>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 12,
        background: active ? "var(--nv-color-primary)" : "rgba(0,0,0,0.08)",
        color: active ? "#fff" : "inherit",
        padding: "4px 12px",
        borderRadius: 999,
        fontWeight: 600,
        cursor: "pointer",
        border: "none",
      }}
    >
      {children}
    </button>
  );
}
