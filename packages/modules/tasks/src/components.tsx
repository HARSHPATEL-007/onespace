"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Dialog, Dropdown, Field, Input, MenuItem, Textarea, cn } from "@n0va/ui";
import type { TaskList, Task } from "@n0va/db";

export interface TasksActions {
  createList: (formData: FormData) => Promise<void>;
  renameList: (formData: FormData) => Promise<void>;
  deleteList: (formData: FormData) => Promise<void>;
  createTask: (formData: FormData) => Promise<void>;
  updateTask: (formData: FormData) => Promise<void>;
  toggleComplete: (formData: FormData) => Promise<void>;
  deleteTask: (formData: FormData) => Promise<void>;
}

const PRIORITY_TONE: Record<string, "neutral" | "warning" | "danger"> = {
  LOW: "neutral",
  MEDIUM: "warning",
  HIGH: "danger",
};

export function TasksApp({
  lists,
  members,
  actions,
}: {
  lists: Array<TaskList & { tasks: Task[] }>;
  members: Array<{ id: string; name: string | null; email: string }>;
  actions: TasksActions;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [newListOpen, setNewListOpen] = useState(false);
  const [taskDialog, setTaskDialog] = useState<{ listId: string } | { listId: string; task: Task } | null>(null);
  const [renaming, setRenaming] = useState<TaskList | null>(null);

  const openCount = lists.reduce(
    (acc, l) => acc + l.tasks.filter((t) => !t.completedAt).length,
    0,
  );

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA TASKS</h1>
        <Badge tone="primary">{openCount} open</Badge>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setNewListOpen(true)}>+ New list</Button>
      </div>

      {lists.length === 0 ? (
        <div className="nv-empty">
          <div>No task lists yet</div>
          <Button variant="secondary" onClick={() => setNewListOpen(true)}>Create your first list</Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--nv-space-4)", alignItems: "start" }}>
          {lists.map((list) => {
            const remaining = list.tasks.filter((t) => !t.completedAt);
            const done = list.tasks.length - remaining.length;
            return (
              <div key={list.id} className="nv-card" style={{ padding: "var(--nv-space-4)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ flex: 1, fontWeight: 700 }}>{list.name}</div>
                  <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                    {done}/{list.tasks.length}
                  </span>
                  <Dropdown trigger={<Button variant="ghost" size="sm">⋯</Button>}>
                    <MenuItem onSelect={() => setRenaming(list)}>Rename</MenuItem>
                    <MenuItem onSelect={() => setTaskDialog({ listId: list.id })}>Add task</MenuItem>
                    <form action={actions.deleteList} onSubmit={() => setTimeout(refresh, 50)}>
                      <input type="hidden" name="id" value={list.id} />
                      <MenuItem danger>Delete list</MenuItem>
                    </form>
                  </Dropdown>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.tasks.map((task) => (
                    <div
                      key={task.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: "var(--nv-radius-md)",
                        background: "var(--nv-color-surface-2)",
                        opacity: task.completedAt ? 0.55 : 1,
                      }}
                    >
                      <form action={actions.toggleComplete} onSubmit={() => setTimeout(refresh, 50)}>
                        <input type="hidden" name="id" value={task.id} />
                        <input
                          type="checkbox"
                          checked={Boolean(task.completedAt)}
                          onChange={(e) => e.currentTarget.form?.requestSubmit()}
                          style={{ width: 16, height: 16, cursor: "pointer" }}
                        />
                      </form>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "var(--nv-font-sm)", fontWeight: 600, textDecoration: task.completedAt ? "line-through" : "none", wordBreak: "break-word" }}>
                          {task.title}
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
                          <Badge tone={PRIORITY_TONE[task.priority] ?? "neutral"}>{task.priority}</Badge>
                          {task.dueDate ? (
                            <span style={{ fontSize: 11, color: task.dueDate < new Date() && !task.completedAt ? "var(--nv-color-danger)" : "var(--nv-color-text-faint)" }}>
                              {task.dueDate.toLocaleDateString()}
                            </span>
                          ) : null}
                          {task.assigneeId ? (
                            <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
                              → {members.find((m) => m.id === task.assigneeId)?.name ?? "Member"}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <Dropdown trigger={<Button variant="ghost" size="sm">⋯</Button>}>
                        <MenuItem onSelect={() => setTaskDialog({ listId: list.id, task })}>Edit</MenuItem>
                        <form action={actions.deleteTask} onSubmit={() => setTimeout(refresh, 50)}>
                          <input type="hidden" name="id" value={task.id} />
                          <MenuItem danger>Delete</MenuItem>
                        </form>
                      </Dropdown>
                    </div>
                  ))}
                </div>

                <Button variant="ghost" size="sm" block style={{ marginTop: 10 }} onClick={() => setTaskDialog({ listId: list.id })}>
                  + Add task
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={newListOpen}
        onClose={() => setNewListOpen(false)}
        title="New task list"
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewListOpen(false)}>Cancel</Button>
            <Button type="submit" form="new-list-form">Create</Button>
          </>
        }
      >
        <form id="new-list-form" action={actions.createList} onSubmit={() => { setNewListOpen(false); setTimeout(refresh, 50); }}>
          <Field label="List name">
            <Input name="name" required autoFocus placeholder="Launch checklist" />
          </Field>
        </form>
      </Dialog>

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename list"
        actions={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button type="submit" form="rename-list-form">Save</Button>
          </>
        }
      >
        <form id="rename-list-form" action={actions.renameList} onSubmit={() => { setRenaming(null); setTimeout(refresh, 50); }}>
          <input type="hidden" name="id" value={renaming?.id ?? ""} />
          <Field label="List name">
            <Input name="name" required defaultValue={renaming?.name ?? ""} />
          </Field>
        </form>
      </Dialog>

      <TaskDialog
        key={taskDialog && "task" in taskDialog ? taskDialog.task.id : taskDialog?.listId ?? "none"}
        open={taskDialog !== null}
        listId={taskDialog?.listId ?? ""}
        task={"task" in (taskDialog ?? {}) ? taskDialog.task : null}
        members={members}
        actions={actions}
        onClose={() => {
          setTaskDialog(null);
          refresh();
        }}
      />
    </div>
  );
}

function TaskDialog({
  open,
  listId,
  task,
  members,
  actions,
  onClose,
}: {
  open: boolean;
  listId: string;
  task: Task | null;
  members: Array<{ id: string; name: string | null; email: string }>;
  actions: TasksActions;
  onClose: () => void;
}) {
  const action = task ? actions.updateTask : actions.createTask;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? "Edit task" : "New task"}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="task-form">{task ? "Save" : "Create"}</Button>
        </>
      }
    >
      <form id="task-form" action={action} onSubmit={() => setTimeout(onClose, 50)}>
        <input type="hidden" name="id" value={task?.id ?? ""} />
        <input type="hidden" name="listId" value={listId} />
        <Field label="Title">
          <Input name="title" required defaultValue={task?.title ?? ""} autoFocus />
        </Field>
        <Field label="Due date">
          <Input type="date" name="dueDate" defaultValue={task?.dueDate ? toDateInput(task.dueDate) : ""} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--nv-space-3)" }}>
          <Field label="Priority">
            <select name="priority" className="nv-select" defaultValue={task?.priority ?? "MEDIUM"}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </Field>
          <Field label="Assignee">
            <select name="assigneeId" className="nv-select" defaultValue={task?.assigneeId ?? ""}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea name="notes" rows={3} defaultValue={task?.notes ?? ""} />
        </Field>
      </form>
    </Dialog>
  );
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}