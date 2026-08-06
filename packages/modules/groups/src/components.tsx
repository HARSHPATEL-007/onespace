"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { Group, GroupMember } from "@n0va/db";

export interface GroupsActions {
  create?: (formData: FormData) => Promise<void>;
  remove?: (formData: FormData) => Promise<void>;
  addMember: (formData: FormData) => Promise<void>;
  removeMember: (formData: FormData) => Promise<void>;
}

type GroupWithCount = Group & { _count: { members: number } };
type MemberWithUser = GroupMember & { user: { id: string; name: string | null; email: string } };

export function GroupsList({
  groups,
  actions,
}: {
  groups: GroupWithCount[];
  actions: GroupsActions;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA GROUPS</h1>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setCreating(true)}>
          + New group
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="nv-empty">
          <div>No groups yet</div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
            Create a group
          </Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--nv-space-3)" }}>
          {groups.map((g) => (
            <div key={g.id} className="nv-card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <a href={`/m/groups/${g.id}`} style={{ fontWeight: 800, fontSize: "var(--nv-font-lg)", textDecoration: "none", color: "inherit" }}>
                {g.name}
              </a>
              {g.description && (
                <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)" }}>{g.description}</div>
              )}
              <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                {g._count.members} members · updated {g.updatedAt.toLocaleDateString()}
              </div>
              <form
                action={actions.remove}
                onSubmit={() => setTimeout(() => router.refresh(), 50)}
                style={{ marginTop: "auto" }}
              >
                <input type="hidden" name="id" value={g.id} />
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
        title="New group"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-group-form">
              Create
            </Button>
          </>
        }
      >
        <form
          id="create-group-form"
          action={(fd) => {
            void actions.create?.(fd).then(() => {
              setCreating(false);
              setTimeout(() => router.refresh(), 50);
            });
          }}
          style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 320 }}
        >
          <input className="nv-input" name="name" placeholder="Group name" autoFocus required />
          <input className="nv-input" name="description" placeholder="Description (optional)" />
        </form>
      </Dialog>
    </div>
  );
}

export function GroupDetail({
  group,
  members,
  users,
  actions,
}: {
  group: Group & { members: MemberWithUser[] };
  members: MemberWithUser[];
  users: Array<{ id: string; name: string | null; email: string }>;
  actions: GroupsActions;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--nv-space-4)" }}>
        <a href="/m/groups" className="nv-link" style={{ fontSize: "var(--nv-font-sm)" }}>
          ← All groups
        </a>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>{group.name}</h1>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setAdding(true)}>
          + Add member
        </Button>
      </div>

      {group.description && (
        <div style={{ color: "var(--nv-color-text-muted)", marginBottom: "var(--nv-space-4)" }}>{group.description}</div>
      )}

      <div className="nv-card">
        <table className="nv-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Email</th>
              <th>Joined</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="nv-empty" style={{ padding: "var(--nv-space-6)" }}>
                  No members yet
                </td>
              </tr>
            )}
            {members.map((m) => (
              <tr key={m.id}>
                <td style={{ fontWeight: 600 }}>{m.user.name ?? "—"}</td>
                <td>{m.user.email}</td>
                <td>{m.joinedAt.toLocaleDateString()}</td>
                <td>
                  <form
                    action={actions.removeMember}
                    onSubmit={() => setTimeout(() => router.refresh(), 50)}
                  >
                    <input type="hidden" name="groupId" value={group.id} />
                    <input type="hidden" name="userId" value={m.user.id} />
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

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title={`Add member to ${group.name}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-member-form">
              Add
            </Button>
          </>
        }
      >
        <form
          id="add-member-form"
          action={(fd) => {
            fd.set("groupId", group.id);
            void actions.addMember(fd).then(() => {
              setAdding(false);
              setTimeout(() => router.refresh(), 50);
            });
          }}
          style={{ minWidth: 300 }}
        >
          <select className="nv-input" name="userId" required>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
        </form>
      </Dialog>
    </div>
  );
}
