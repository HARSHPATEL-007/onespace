"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { Video } from "@n0va/db";
import { embedFor } from "./server";

export interface VideosActions {
  create: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

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
  actions,
}: {
  videos: Video[];
  actions: VideosActions;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA VIDEOS</h1>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setAdding(true)}>
          + Add video
        </Button>
      </div>

      {videos.length === 0 ? (
        <div className="nv-empty" style={{ minHeight: 300 }}>
          <div>Your library is empty</div>
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            Add a video link
          </Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--nv-space-4)" }}>
          {videos.map((v) => {
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
                <form action={actions.remove} onSubmit={() => setTimeout(() => router.refresh(), 50)}>
                  <input type="hidden" name="id" value={v.id} />
                  <Button variant="ghost" size="sm">
                    Remove
                  </Button>
                </form>
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
    </div>
  );
}
