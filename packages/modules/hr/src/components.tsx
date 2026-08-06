"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { Employee, LeaveRequest } from "@n0va/db";

export interface HrActions {
  addEmployee: (formData: FormData) => Promise<void>;
  setEmployeeStatus: (formData: FormData) => Promise<void>;
  removeEmployee: (formData: FormData) => Promise<void>;
  requestLeave: (formData: FormData) => Promise<void>;
  decideLeave: (formData: FormData) => Promise<void>;
  removeLeave: (formData: FormData) => Promise<void>;
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "nv-badge nv-badge-green",
  INVITED: "nv-badge nv-badge-amber",
  OFFBOARDED: "nv-badge",
};

const KIND_BADGE: Record<string, string> = {
  VACATION: "nv-badge nv-badge-green",
  SICK: "nv-badge nv-badge-amber",
  PERSONAL: "nv-badge",
};

const LEAVE_BADGE: Record<string, string> = {
  PENDING: "nv-badge nv-badge-amber",
  APPROVED: "nv-badge nv-badge-green",
  REJECTED: "nv-badge",
};

export function PeopleDirectory({
  employees,
  actions,
}: {
  employees: Array<Employee & { leaveRequests: LeaveRequest[] }>;
  actions: HrActions;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"people" | "leave">("people");
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const pendingLeaves = employees.flatMap((e) =>
    e.leaveRequests.filter((l) => l.status === "PENDING").map((l) => ({ ...l, employeeName: e.name })),
  );

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA HR</h1>
        <span className="nv-badge nv-badge-amber">people operations</span>
        <div style={{ flex: 1 }} />
        {tab === "people" && (
          <Button size="sm" onClick={() => setAdding(true)}>+ Add employee</Button>
        )}
        {tab === "leave" && (
          <Button size="sm" onClick={() => setLeaving(true)}>+ Request leave</Button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Button variant={tab === "people" ? "primary" : "secondary"} size="sm" onClick={() => setTab("people")}>
          People ({employees.length})
        </Button>
        <Button variant={tab === "leave" ? "primary" : "secondary"} size="sm" onClick={() => setTab("leave")}>
          Leave ({pendingLeaves.length} pending)
        </Button>
      </div>

      {tab === "people" && (
        <div className="nv-card" style={{ padding: 0 }}>
          <table className="nv-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Title</th>
                <th>Status</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 700 }}>{e.name}</td>
                  <td style={{ fontSize: 12 }}>{e.email}</td>
                  <td style={{ fontSize: 12 }}>{e.department}</td>
                  <td style={{ fontSize: 12 }}>{e.title}</td>
                  <td>
                    <span className={STATUS_BADGE[e.status] ?? "nv-badge"}>{e.status}</span>
                  </td>
                  <td>
                    {e.status === "ACTIVE" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("id", e.id);
                          fd.set("status", "INVITED");
                          void actions.setEmployeeStatus(fd).then(() => router.refresh());
                        }}
                      >
                        Invite
                      </Button>
                    ) : e.status === "INVITED" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("id", e.id);
                          fd.set("status", "ACTIVE");
                          void actions.setEmployeeStatus(fd).then(() => router.refresh());
                        }}
                      >
                        Activate
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (!window.confirm(`Remove ${e.name}?`)) return;
                        const fd = new FormData();
                        fd.set("id", e.id);
                        void actions.removeEmployee(fd).then(() => router.refresh());
                      }}
                    >
                      ✕
                    </Button>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && <tr><td colSpan={6} className="nv-empty">No employees yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "leave" && (
        <div className="nv-card" style={{ padding: 0 }}>
          <table className="nv-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th style={{ width: 130 }}></th>
              </tr>
            </thead>
            <tbody>
              {employees.flatMap((e) =>
                e.leaveRequests.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>{e.name}</td>
                    <td><span className={KIND_BADGE[l.kind] ?? "nv-badge"}>{l.kind}</span></td>
                    <td style={{ fontSize: 12 }}>{l.startDate.toLocaleDateString()}</td>
                    <td style={{ fontSize: 12 }}>{l.endDate.toLocaleDateString()}</td>
                    <td><span className={LEAVE_BADGE[l.status] ?? "nv-badge"}>{l.status}</span></td>
                    <td>
                      {l.status === "PENDING" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("id", l.id);
                              fd.set("approved", "true");
                              void actions.decideLeave(fd).then(() => router.refresh());
                            }}
                          >
                            ✓
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("id", l.id);
                              fd.set("approved", "false");
                              void actions.decideLeave(fd).then(() => router.refresh());
                            }}
                          >
                            ✕
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("id", l.id);
                          void actions.removeLeave(fd).then(() => router.refresh());
                        }}
                      >
                        Del
                      </Button>
                    </td>
                  </tr>
                )),
              )}
              {pendingLeaves.length === 0 && employees.every((e) => e.leaveRequests.length === 0) && (
                <tr><td colSpan={6} className="nv-empty">No leave requests yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add employee"
        actions={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" form="add-employee-form">Add</Button>
          </>
        }
      >
        <form
          id="add-employee-form"
          action={(fd) => {
            void actions.addEmployee(fd).then(() => {
              setAdding(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="name" placeholder="Full name" required autoFocus />
          <input className="nv-input" name="email" type="email" placeholder="name@company.com" required />
          <div style={{ display: "flex", gap: 8 }}>
            <input className="nv-input" name="department" placeholder="Department" style={{ flex: 1 }} />
            <input className="nv-input" name="title" placeholder="Title" style={{ flex: 1 }} />
          </div>
        </form>
      </Dialog>

      <Dialog
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Request leave"
        actions={
          <>
            <Button variant="secondary" onClick={() => setLeaving(false)}>Cancel</Button>
            <Button type="submit" form="leave-form">Request</Button>
          </>
        }
      >
        <form
          id="leave-form"
          action={(fd) => {
            void actions.requestLeave(fd).then(() => {
              setLeaving(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <select className="nv-input" name="employeeId" required>
            <option value="">Select employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select className="nv-input" name="kind" defaultValue="VACATION">
            <option value="VACATION">Vacation</option>
            <option value="SICK">Sick</option>
            <option value="PERSONAL">Personal</option>
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="nv-input" name="startDate" type="date" required style={{ flex: 1 }} />
            <input className="nv-input" name="endDate" type="date" required style={{ flex: 1 }} />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
