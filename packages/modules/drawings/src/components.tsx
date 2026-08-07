"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, cn } from "@n0va/ui";
import type { Drawing } from "@n0va/db";
import type { Shape } from "./server";

export interface DrawingsActions {
  create?: (formData: FormData) => Promise<void>;
  rename: (formData: FormData) => Promise<void>;
  remove?: (formData: FormData) => Promise<void>;
  saveCanvas: (formData: FormData) => Promise<void>;
}

type Tool = "select" | "rect" | "ellipse" | "line" | "text";

const COLORS = ["#7c5cfc", "#ef4444", "#f59e0b", "#22c55e", "#0ea5e9", "#1a1c23"];

function downloadBlob(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DrawingsList({
  drawings,
  actions,
}: {
  drawings: Drawing[];
  actions: DrawingsActions;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA DRAWINGS</h1>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setCreating(true)}>
          + New drawing
        </Button>
      </div>

      {drawings.length === 0 ? (
        <div className="nv-empty">
          <div>No drawings yet</div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
            Create a drawing
          </Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--nv-space-3)" }}>
          {drawings.map((d) => (
            <div key={d.id} className="nv-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a href={`/m/drawings/${d.id}`} style={{ fontWeight: 800, textDecoration: "none", color: "inherit" }}>
                {d.name}
              </a>
              <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                {(Array.isArray(d.canvas) ? (d.canvas as unknown as Shape[]).length : 0)} shapes · updated {d.updatedAt.toLocaleDateString()}
              </div>
              <form action={actions.remove} onSubmit={() => setTimeout(() => router.refresh(), 50)}>
                <input type="hidden" name="id" value={d.id} />
                <Button variant="ghost" size="sm">
                  Delete
                </Button>
              </form>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New drawing"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-drawing-form">
              Create
            </Button>
          </>
        }
      >
        <form
          id="create-drawing-form"
          action={(fd) => {
            void actions.create?.(fd).then(() => {
              setCreating(false);
              setTimeout(() => router.refresh(), 50);
            });
          }}
          style={{ minWidth: 320 }}
        >
          <input className="nv-input" name="name" placeholder="Drawing name" autoFocus required />
        </form>
      </Dialog>
    </div>
  );
}

export function CanvasEditor({
  drawing,
  actions,
}: {
  drawing: Drawing;
  actions: DrawingsActions;
}) {
  const router = useRouter();
  const [shapes, setShapes] = useState<Shape[]>(() => (Array.isArray(drawing.canvas) ? (drawing.canvas as unknown as Shape[]) : []));
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0]!);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "dirty">("saved");
  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [redoStack, setRedoStack] = useState<Shape[][]>([]);
  const [textDraft, setTextDraft] = useState("");
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; shape: Shape | null } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shapesRef = useRef<Shape[]>(shapes);

  useEffect(() => {
    shapesRef.current = shapes;
  });

  const pushUndo = (prev: Shape[]) => {
    setUndoStack((stack) => [...stack, prev].slice(-50));
    setRedoStack([]);
  };

  const scheduleSave = () => {
    setStatus("dirty");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave(shapesRef.current), 800);
  };

  const doSave = (data: Shape[]) => {
    setStatus("saving");
    const fd = new FormData();
    fd.set("id", drawing.id);
    fd.set("canvas", JSON.stringify(data));
    void actions.saveCanvas(fd).then(() => {
      if (shapesRef.current !== data) {
        scheduleSave();
        return;
      }
      setStatus("saved");
      setTimeout(() => router.refresh(), 50);
    });
  };

  const save = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    doSave(shapesRef.current);
  };

  const undo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    dragRef.current = null;
    setShapes(last);
    setSelectedId(null);
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => (stack[stack.length - 1] === shapes ? stack : [...stack, shapes].slice(-50)));
    scheduleSave();
  };

  const redo = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    dragRef.current = null;
    setShapes(next);
    setSelectedId(null);
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => (stack[stack.length - 1] === shapes ? stack : [...stack, shapes].slice(-50)));
    scheduleSave();
  };

  const serializeSvg = () => {
    const node = svgRef.current;
    if (!node) return "";
    const clone = node.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "900");
    clone.setAttribute("height", "560");
    clone.querySelectorAll("[data-export-ignore]").forEach((n) => n.remove());
    return new XMLSerializer().serializeToString(clone);
  };

  const exportSvg = () => {
    const svg = serializeSvg();
    if (!svg) return;
    downloadBlob(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), `drawing-${drawing.name}.svg`);
  };

  const exportPng = () => {
    const svg = serializeSvg();
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = 900 * scale;
      canvas.height = 560 * scale;
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(URL.createObjectURL(blob), `drawing-${drawing.name}.png`);
        URL.revokeObjectURL(url);
      });
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const local = (e: React.MouseEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (tool === "select") {
      const pos = local(e);
      const hit = [...shapes].reverse().find((s) => {
        if (s.type === "line") {
          const dx = pos.x - (s.x + s.w);
          const dy = pos.y - (s.y + s.h);
          return Math.hypot(dx, dy) < 12;
        }
        return pos.x >= s.x && pos.x <= s.x + s.w && pos.y >= s.y && pos.y <= s.y + s.h;
      });
      if (hit) pushUndo(shapes);
      setSelectedId(hit?.id ?? null);
      dragRef.current = { startX: pos.x, startY: pos.y, shape: hit ?? null };
      return;
    }
    if (tool === "text") {
      const pos = local(e);
      setTextPos(pos);
      setTextDraft("");
      return;
    }
    const pos = local(e);
    pushUndo(shapes);
    dragRef.current = { startX: pos.x, startY: pos.y, shape: null };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pos = local(e);
    if (drag.shape && tool === "select") {
      const dx = pos.x - drag.startX;
      const dy = pos.y - drag.startY;
      setShapes((prev) =>
        prev.map((s) =>
          s.id === drag.shape!.id ? { ...s, x: Math.max(0, s.x + dx), y: Math.max(0, s.y + dy) } : s,
        ),
      );
      drag.startX = pos.x;
      drag.startY = pos.y;
      scheduleSave();
      return;
    }
    if (!drag.shape && tool !== "select" && tool !== "text") {
      setShapes((prev) => {
        const existing = prev.filter((s) => s.id !== "draft");
        return [
          ...existing,
          {
            id: "draft",
            type: tool as "rect" | "ellipse" | "line",
            x: drag.startX,
            y: drag.startY,
            w: pos.x - drag.startX,
            h: pos.y - drag.startY,
            color,
          },
        ];
      });
    }
  };

  const onMouseUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.shape && tool !== "select" && tool !== "text") {
      setShapes((prev) => {
        const draft = prev.find((s) => s.id === "draft");
        const rest = prev.filter((s) => s.id !== "draft");
        if (!draft) return prev;
        const w = Math.abs(draft.w);
        const h = Math.abs(draft.h);
        if (w < 4 && h < 4) return prev;
        return [
          ...rest,
          {
            ...draft,
            id: crypto.randomUUID(),
            x: Math.min(draft.x, draft.x + draft.w),
            y: Math.min(draft.y, draft.y + draft.h),
            w,
            h,
          },
        ];
      });
      scheduleSave();
    }
    dragRef.current = null;
  };

  const commitText = () => {
    if (textPos && textDraft.trim()) {
      pushUndo(shapes);
      setShapes((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "text",
          x: textPos.x,
          y: textPos.y,
          w: textDraft.length * 9,
          h: 22,
          color,
          text: textDraft,
        },
      ]);
      scheduleSave();
    }
    setTextPos(null);
    setTextDraft("");
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    pushUndo(shapes);
    setShapes((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId(null);
    scheduleSave();
  };

  const clearAll = () => {
    pushUndo(shapes);
    setShapes([]);
    setSelectedId(null);
    scheduleSave();
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--nv-space-4)", flexWrap: "wrap" }}>
        <a href="/m/drawings" className="nv-link" style={{ fontSize: "var(--nv-font-sm)" }}>
          ← All drawings
        </a>
        <span style={{ fontWeight: 800, fontSize: "var(--nv-font-lg)" }}>{drawing.name}</span>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={undo} disabled={undoStack.length === 0}>
          ↩ Undo
        </Button>
        <Button variant="ghost" size="sm" onClick={redo} disabled={redoStack.length === 0}>
          ↪ Redo
        </Button>
        <Button variant="ghost" size="sm" onClick={clearAll}>
          Clear
        </Button>
        <Button variant="ghost" size="sm" onClick={exportSvg}>
          Export SVG
        </Button>
        <Button variant="ghost" size="sm" onClick={exportPng}>
          Export PNG
        </Button>
        <Button onClick={save} disabled={status === "saved"}>
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : "Save"}
        </Button>
      </div>

      <div style={{ display: "flex", gap: "var(--nv-space-3)", alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Toolbar */}
        <div
          className="nv-card"
          style={{ padding: "var(--nv-space-3)", display: "flex", flexDirection: "column", gap: 8, minWidth: 130 }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nv-color-text-faint)", textTransform: "uppercase" }}>
            Tools
          </div>
          {(["select", "rect", "ellipse", "line", "text"] as Tool[]).map((t) => (
            <Button
              key={t}
              variant={tool === t ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setTool(t)}
              style={{ justifyContent: "flex-start" }}
            >
              {t === "select" ? "🖱 Select" : t === "rect" ? "▭ Rectangle" : t === "ellipse" ? "◯ Ellipse" : t === "line" ? "╱ Line" : "A Text"}
            </Button>
          ))}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nv-color-text-faint)", textTransform: "uppercase", marginTop: 8 }}>
            Color
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  border: `2px solid ${color === c ? "var(--nv-color-primary)" : "transparent"}`,
                  background: c,
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <Button variant="danger" size="sm" onClick={deleteSelected} disabled={!selectedId}>
            Delete selected
          </Button>
        </div>

        {/* Canvas */}
        <div
          className="nv-card"
          style={{ padding: 0, overflow: "hidden", flex: 1, minWidth: 480, position: "relative" }}
        >
          <svg
            ref={svgRef}
            width="100%"
            height="560"
            viewBox="0 0 900 560"
            style={{
              cursor: tool === "select" ? "default" : "crosshair",
              background:
                "linear-gradient(#f6f7fb 1px, transparent 1px), linear-gradient(90deg, #f6f7fb 1px, transparent 1px), #ffffff",
              backgroundSize: "24px 24px",
              userSelect: "none",
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {shapes.map((s) => {
              const isSelected = s.id === selectedId;
              const stroke = isSelected ? "var(--nv-color-primary)" : "none";
              const common = { stroke: s.color, strokeWidth: 2, fill: s.type === "text" ? "none" : `${s.color}22` };
              return (
                <g key={s.id}>
                  {s.type === "rect" && <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={4} {...common} />}
                  {s.type === "ellipse" && <ellipse cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w / 2} ry={s.h / 2} {...common} />}
                  {s.type === "line" && <line x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y + s.h} stroke={s.color} strokeWidth={2} />}
                  {s.type === "text" && (
                    <text x={s.x} y={s.y + 18} fill={s.color} fontSize={18} fontWeight={600}>
                      {s.text}
                    </text>
                  )}
                  {isSelected && s.type !== "text" && (
                    <rect data-export-ignore x={s.x - 3} y={s.y - 3} width={s.w + 6} height={s.h + 6} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray="4 3" />
                  )}
                </g>
              );
            })}
          </svg>

          {textPos && (
            <div style={{ position: "absolute", left: (textPos.x / 900) * 100 + "%", top: (textPos.y / 560) * 100 + "%" }}>
              <input
                className="nv-input"
                autoFocus
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitText();
                  if (e.key === "Escape") setTextPos(null);
                }}
                onBlur={commitText}
                placeholder="Type text…"
                style={{ width: 180 }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
