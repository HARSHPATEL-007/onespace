"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, cn } from "@n0va/ui";
import type { Sheet, SheetWorkbook } from "@n0va/db";
import { colName, cellDisplay, parseCellRef } from "./formula";

export interface SheetsListActions {
  create: (formData: FormData) => Promise<void>;
  rename: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

export interface SheetGridActions {
  saveCell: (formData: FormData) => Promise<void>;
  renameWorkbook: (formData: FormData) => Promise<void>;
  addSheet: (formData: FormData) => Promise<void>;
  renameSheet: (formData: FormData) => Promise<void>;
  removeSheet: (formData: FormData) => Promise<void>;
}

const MAX_COLS = 26;
const PAGE_ROWS = 30;

export function WorkbookList({
  workbooks,
  actions,
}: {
  workbooks: Array<SheetWorkbook & { sheets: Array<{ id: string; name: string }> }>;
  actions: SheetsListActions;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA SHEETS</h1>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setCreating(true)}>
          + New workbook
        </Button>
      </div>

      {workbooks.length === 0 ? (
        <div className="nv-empty">
          <div>No workbooks yet</div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
            Create your first workbook
          </Button>
        </div>
      ) : (
        <div className="nv-card">
          <table className="nv-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Sheets</th>
                <th>Modified</th>
                <th style={{ width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {workbooks.map((wb) => (
                <tr key={wb.id}>
                  <td>
                    <a href={`/m/sheets/${wb.id}`} style={{ fontWeight: 600, textDecoration: "none", color: "inherit" }}>
                      {wb.name}
                    </a>
                  </td>
                  <td>{wb.sheets.map((s) => s.name).join(", ") || "—"}</td>
                  <td>{wb.updatedAt.toLocaleString()}</td>
                  <td>
                    <form
                      action={actions.remove}
                      onSubmit={() => setTimeout(() => router.refresh(), 50)}
                      style={{ display: "inline" }}
                    >
                      <input type="hidden" name="id" value={wb.id} />
                      <Button variant="ghost" size="sm">
                        ✕
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New workbook"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-wb-form">
              Create
            </Button>
          </>
        }
      >
        <form
          id="create-wb-form"
          action={(fd) => {
            void actions.create(fd).then(() => {
              setCreating(false);
              setTimeout(() => router.refresh(), 50);
            });
          }}
        >
          <input className="nv-input" name="name" placeholder="e.g. Q3 Budget" autoFocus required />
        </form>
      </Dialog>
    </div>
  );
}

export function SheetGrid({
  workbookId,
  workbookName,
  sheets,
  activeSheet,
  rows,
  actions,
}: {
  workbookId: string;
  workbookName: string;
  sheets: Sheet[];
  activeSheet: Sheet;
  rows: string[][];
  actions: SheetGridActions;
}) {
  const router = useRouter();
  const [data, setData] = useState<string[][]>(rows);
  const [sel, setSel] = useState<{ col: number; row: number } | null>(null);
  const [editing, setEditing] = useState<{ col: number; row: number } | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [formulaBar, setFormulaBar] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [sheetNameDraft, setSheetNameDraft] = useState(activeSheet.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const visibleRows = useMemo(() => {
    const count = Math.max(data.length, PAGE_ROWS);
    return Array.from({ length: count }, (_, r) => data[r] ?? []);
  }, [data]);

  const activeRaw = sel ? (data[sel.row]?.[sel.col] ?? "") : "";

  const commitCell = (col: number, row: number, value: string) => {
    if (!editing) return;
    const next = data.map((r) => [...r]);
    while (next.length <= row) next.push([]);
    while (next[row]!.length <= col) next[row]!.push("");
    next[row]![col] = value;
    setData(next);
    const fd = new FormData();
    fd.set("sheetId", activeSheet.id);
    fd.set("col", String(col));
    fd.set("row", String(row));
    fd.set("value", value);
    void actions.saveCell(fd);
    setEditing(null);
  };

  const startEdit = (col: number, row: number, value: string) => {
    setSel({ col, row });
    setFormulaBar(value);
    setEditorValue(value);
    setEditing({ col, row });
  };

  const selectCell = (col: number, row: number) => {
    setSel({ col, row });
    setFormulaBar(data[row]?.[col] ?? "");
  };

  const addRow = () => {
    const next = [...data];
    for (let i = 0; i < 10; i++) next.push([]);
    setData(next);
  };

  const exportCsv = () => {
    const lines: string[] = [];
    for (const row of data) {
      const cells = row.map((v, c) => {
        const display = cellDisplay(v, data);
        return /[",\n]/.test(display) ? `"${display.replace(/"/g, '""')}"` : display;
      });
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${workbookName.replace(/[^\w-]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <a href="/m/sheets" className="nv-link" style={{ fontSize: "var(--nv-font-sm)" }}>
          ← All workbooks
        </a>
        <span style={{ fontWeight: 800, fontSize: "var(--nv-font-lg)" }}>{workbookName}</span>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={() => setRenameOpen(true)}>
          Rename
        </Button>
        <Button variant="secondary" size="sm" onClick={exportCsv}>
          ⤓ CSV
        </Button>
      </div>

      {/* Sheet tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
        {sheets.map((s) => (
          <a
            key={s.id}
            href={`/m/sheets/${workbookId}?sheet=${s.id}`}
            style={{
              padding: "6px 14px",
              borderRadius: "var(--nv-radius-md) 0 0 0",
              fontSize: "var(--nv-font-sm)",
              fontWeight: s.id === activeSheet.id ? 700 : 500,
              textDecoration: "none",
              color: s.id === activeSheet.id ? "var(--nv-color-primary)" : "var(--nv-color-text-muted)",
              background: s.id === activeSheet.id ? "var(--nv-color-primary-alpha)" : "transparent",
            }}
          >
            {s.name}
          </a>
        ))}
        <form
          action={actions.addSheet}
          onSubmit={() => setTimeout(() => router.refresh(), 50)}
          style={{ display: "inline" }}
        >
          <input type="hidden" name="workbookId" value={workbookId} />
          <input type="hidden" name="name" value={`Sheet ${sheets.length + 1}`} />
          <Button variant="ghost" size="sm">
            + Add sheet
          </Button>
        </form>
      </div>

      {/* Formula bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--nv-color-surface)",
          border: "1px solid var(--nv-color-border)",
          borderRadius: "var(--nv-radius-md) var(--nv-radius-md) 0 0",
          padding: "8px 12px",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)", minWidth: 40 }}>
          {sel ? `${colName(sel.col)}${sel.row + 1}` : ""}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--nv-color-primary)" }}>ƒx</span>
        <input
          className="nv-input"
          value={formulaBar}
          onChange={(e) => setFormulaBar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && sel) {
              commitCell(sel.col, sel.row, formulaBar);
              selectCell(sel.col, sel.row);
              router.refresh();
            }
          }}
          placeholder="Type a value or formula, e.g. =SUM(B2:B8)"
          style={{ flex: 1 }}
        />
      </div>

      {/* Grid */}
      <div
        style={{
          overflow: "auto",
          maxHeight: "calc(100dvh - 320px)",
          background: "var(--nv-color-surface)",
          border: "1px solid var(--nv-color-border)",
          borderRadius: "0 0 var(--nv-radius-md) var(--nv-radius-md)",
        }}
      >
        <table style={{ borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--nv-font-mono, monospace)" }}>
          <thead>
            <tr>
              <th
                style={{
                  width: 44,
                  minWidth: 44,
                  background: "var(--nv-color-surface-2)",
                  borderBottom: "1px solid var(--nv-color-border)",
                  borderRight: "1px solid var(--nv-color-border)",
                  position: "sticky",
                  left: 0,
                  top: 0,
                  zIndex: 3,
                }}
              />
              {Array.from({ length: MAX_COLS }, (_, c) => (
                <th
                  key={c}
                  style={{
                    minWidth: 110,
                    background: "var(--nv-color-surface-2)",
                    borderBottom: "1px solid var(--nv-color-border)",
                    borderRight: "1px solid var(--nv-color-border)",
                    fontWeight: 600,
                    fontSize: 11,
                    color: "var(--nv-color-text-muted)",
                    padding: "4px 8px",
                    textAlign: "left",
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                  }}
                >
                  {colName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, r) => (
              <tr key={r}>
                <td
                  style={{
                    minWidth: 44,
                    background: "var(--nv-color-surface-2)",
                    borderRight: "1px solid var(--nv-color-border)",
                    borderBottom: "1px solid var(--nv-color-border)",
                    fontWeight: 600,
                    fontSize: 11,
                    color: "var(--nv-color-text-muted)",
                    textAlign: "center",
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                  }}
                >
                  {r + 1}
                </td>
                {Array.from({ length: MAX_COLS }, (_, c) => {
                  const raw = row[c] ?? "";
                  const display = cellDisplay(raw, data);
                  const isSel = sel?.col === c && sel?.row === r;
                  const isEditing = editing?.col === c && editing?.row === r;
                  return (
                    <td
                      key={c}
                      style={{
                        minWidth: 110,
                        padding: 0,
                        borderRight: "1px solid var(--nv-color-border)",
                        borderBottom: "1px solid var(--nv-color-border)",
                        background: isSel ? "var(--nv-color-primary-alpha)" : "transparent",
                        position: "relative",
                        boxShadow: isSel ? "inset 0 0 0 2px var(--nv-color-primary)" : undefined,
                      }}
                      onClick={() => selectCell(c, r)}
                      onDoubleClick={() => startEdit(c, r, raw)}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          autoFocus
                          value={editorValue}
                          onChange={(e) => setEditorValue(e.target.value)}
                          onBlur={() => commitCell(c, r, editorValue)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              commitCell(c, r, editorValue);
                              selectCell(c, r);
                              router.refresh();
                            }
                            if (e.key === "Escape") setEditing(null);
                          }}
                          style={{
                            width: "100%",
                            border: "none",
                            outline: "none",
                            padding: "4px 8px",
                            background: "#fff",
                            fontFamily: "inherit",
                            fontSize: 13,
                            boxSizing: "border-box",
                            boxShadow: "inset 0 0 0 2px var(--nv-color-primary)",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            padding: "4px 8px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            color: display.startsWith("#") ? "var(--nv-color-danger)" : undefined,
                          }}
                          title={raw.startsWith("=") ? raw : undefined}
                        >
                          {display}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: 8, display: "flex", gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={addRow}>
            + 10 rows
          </Button>
        </div>
      </div>

      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename workbook"
        actions={
          <>
            <Button variant="secondary" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="rename-wb-form">
              Save
            </Button>
          </>
        }
      >
        <form
          id="rename-wb-form"
          action={(fd) => {
            fd.set("id", workbookId);
            void actions.renameWorkbook(fd).then(() => {
              setRenameOpen(false);
              router.refresh();
            });
          }}
        >
          <input className="nv-input" name="name" defaultValue={workbookName} autoFocus required />
        </form>
      </Dialog>
    </div>
  );
}
