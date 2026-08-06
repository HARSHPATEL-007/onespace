"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Field, Input, Textarea, cn } from "@n0va/ui";
import type { CalendarEvent } from "@n0va/db";

export interface CalendarActions {
  create: (formData: FormData) => Promise<void>;
  update: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarApp({
  events,
  actions,
}: {
  events: CalendarEvent[];
  actions: CalendarActions;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; event: CalendarEvent } | null>(null);

  const grid = useMemo(() => buildMonth(cursor, events), [cursor, events]);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const shiftMonth = (delta: number) => {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA CALENDAR</h1>
        <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
          Today
        </Button>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <Button variant="secondary" size="sm" onClick={() => shiftMonth(-1)}>{`<`}</Button>
          <Button variant="secondary" size="sm" onClick={() => shiftMonth(1)}>{`>`}</Button>
        </div>
        <span style={{ fontWeight: 700, fontSize: "var(--nv-font-md)" }}>{monthLabel}</span>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setDialog({ mode: "create" })}>+ New event</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--nv-color-border)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", overflow: "hidden" }}>
        {WEEKDAYS.map((day) => (
          <div key={day} style={{ background: "var(--nv-color-surface)", padding: "8px 10px", textAlign: "center", fontWeight: 600, fontSize: "var(--nv-font-xs)", color: "var(--nv-color-text-muted)" }}>
            {day}
          </div>
        ))}
        {grid.map((day, i) => {
          const isToday = day.date.getTime() === today.getTime();
          const daysEvents = day.events;
          return (
            <div
              key={i}
              style={{
                background: "var(--nv-color-surface)",
                minHeight: 92,
                padding: 6,
                display: "flex",
                flexDirection: "column",
                gap: 3,
                opacity: day.inMonth ? 1 : 0.35,
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  fontSize: "var(--nv-font-xs)",
                  fontWeight: 600,
                  background: isToday ? "var(--nv-color-primary)" : "transparent",
                  color: isToday ? "#fff" : "var(--nv-color-text-muted)",
                  marginBottom: 2,
                }}
              >
                {day.date.getDate()}
              </span>
              {day.events.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setDialog({ mode: "edit", event: e })}
                  style={{
                    textAlign: "left",
                    border: "none",
                    cursor: "pointer",
                    background: "var(--nv-color-primary-alpha)",
                    color: "var(--nv-color-text)",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 6px",
                    borderRadius: 6,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {e.allDay ? "" : `${formatTime(e.startAt)} `}
                  {e.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <EventDialog
        key={dialog?.mode === "edit" ? dialog.event.id : dialog?.mode ?? "none"}
        mode={dialog?.mode ?? null}
        event={dialog?.mode === "edit" ? dialog.event : null}
        actions={actions}
        onClose={() => {
          setDialog(null);
          refresh();
        }}
      />
    </div>
  );
}

function EventDialog({
  mode,
  event,
  actions,
  onClose,
}: {
  mode: "create" | "edit" | null;
  event: CalendarEvent | null;
  actions: CalendarActions;
  onClose: () => void;
}) {
  const action = mode === "edit" ? actions.update : actions.create;
  return (
    <Dialog
      open={mode !== null}
      onClose={onClose}
      title={mode === "edit" ? "Edit event" : "New event"}
      actions={
        <>
          {mode === "edit" ? (
            <form action={actions.remove} onSubmit={() => setTimeout(onClose, 50)} style={{ marginRight: "auto" }}>
              <input type="hidden" name="id" value={event?.id ?? ""} />
              <Button variant="danger" type="submit">Delete</Button>
            </form>
          ) : null}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="event-form">{mode === "edit" ? "Save" : "Create"}</Button>
        </>
      }
    >
      <form id="event-form" action={action} onSubmit={() => setTimeout(onClose, 50)}>
        <input type="hidden" name="id" value={event?.id ?? ""} />
        <Field label="Title">
          <Input name="title" required defaultValue={event?.title ?? ""} autoFocus />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--nv-space-3)" }}>
          <Field label="Start">
            <Input type="datetime-local" name="startAt" required defaultValue={event ? toDateTimeInput(event.startAt) : defaultDateTime()} />
          </Field>
          <Field label="End">
            <Input type="datetime-local" name="endAt" required defaultValue={event ? toDateTimeInput(event.endAt) : ""} />
          </Field>
        </div>
        <Field label="Location">
          <Input name="location" defaultValue={event?.location ?? ""} placeholder="Conference Room A" />
        </Field>
        <Field label="Attendees (emails, comma separated)">
          <Input name="attendees" defaultValue={event?.attendees.join(", ") ?? ""} />
        </Field>
        <Field label="Description">
          <Textarea name="description" rows={3} defaultValue={event?.description ?? ""} />
        </Field>
      </form>
    </Dialog>
  );
}

/* ---------- month grid helpers ---------- */

interface DayCell {
  date: Date;
  inMonth: boolean;
  events: CalendarEvent[];
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function buildMonth(cursor: Date, events: CalendarEvent[]): DayCell[] {
  const year = cursor.getFullYear();
  const monthIdx = cursor.getMonth();
  const first = new Date(year, monthIdx, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const dayEvents = events.filter((e) => date.getTime() === startOfDay(e.startAt).getTime());
    cells.push({ date, inMonth: date.getMonth() === monthIdx, events: dayEvents });
  }
  return cells;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function toDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultDateTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return toDateTimeInput(d);
}