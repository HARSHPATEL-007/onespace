"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Dialog, Field, Input, MenuItem, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Textarea, cn } from "@n0va/ui";
import type { Form, FormResponse } from "@n0va/db";
import { FIELD_TYPES, type FormField, type FieldType } from "./server";

export interface FormsActions {
  create: (formData: FormData) => Promise<void>;
  update: (formData: FormData) => Promise<void>;
  setPublished: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
  submit: (formData: FormData) => Promise<void>;
}

export function FormsApp({
  forms,
  actions,
}: {
  forms: Array<Form & { _count: { responses: number } }>;
  actions: FormsActions;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [mode, setMode] = useState<"list" | "builder" | "responses">("list");
  const [editing, setEditing] = useState<Form | null>(null);
  const [responses, setResponses] = useState<FormResponse[] | null>(null);

  const openBuilder = (form: Form | null) => {
    setEditing(form);
    setMode("builder");
  };

  const openResponses = async (form: Form) => {
    setEditing(form);
    const res = await fetch(`/api/forms/${form.id}/responses`);
    setResponses(res.ok ? await res.json() : []);
    setMode("responses");
  };

  if (mode === "builder") {
    return (
      <FormBuilder
        form={editing}
        actions={actions}
        onDone={() => {
          setMode("list");
          refresh();
        }}
      />
    );
  }

  if (mode === "responses" && editing) {
    return (
      <ResponsesView
        form={editing}
        responses={responses ?? []}
        onBack={() => setMode("list")}
      />
    );
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA FORMS</h1>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => openBuilder(null)}>+ New form</Button>
      </div>

      {forms.length === 0 ? (
        <div className="nv-empty">
          <div>No forms yet</div>
          <Button variant="secondary" onClick={() => openBuilder(null)}>Create your first form</Button>
        </div>
      ) : (
        <div className="nv-card">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Form</TableHeaderCell>
                <TableHeaderCell>Responses</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Updated</TableHeaderCell>
                <TableHeaderCell style={{ width: 260 }}></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {forms.map((form) => (
                <TableRow key={form.id}>
                  <TableCell>
                    <div style={{ fontWeight: 600 }}>{form.name}</div>
                    <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{form.description}</div>
                  </TableCell>
                  <TableCell>{form._count.responses}</TableCell>
                  <TableCell>
                    <Badge tone={form.published ? "success" : "neutral"}>
                      {form.published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell>{form.updatedAt.toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div style={{ display: "flex", gap: 6 }}>
                      {form.published ? <CopyLinkButton formId={form.id} /> : null}
                      <Button variant="secondary" size="sm" onClick={() => openBuilder(form)}>Edit</Button>
                      <Button variant="secondary" size="sm" onClick={() => openResponses(form)}>Responses</Button>
                      <form action={actions.setPublished} onSubmit={() => setTimeout(refresh, 50)}>
                        <input type="hidden" name="id" value={form.id} />
                        <Button variant="ghost" size="sm" type="submit">
                          {form.published ? "Unpublish" : "Publish"}
                        </Button>
                      </form>
                      <form action={actions.remove} onSubmit={() => setTimeout(refresh, 50)}>
                        <input type="hidden" name="id" value={form.id} />
                        <Button variant="ghost" size="sm" type="submit">🗑</Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function FormBuilder({
  form,
  actions,
  onDone,
}: {
  form: Form | null;
  actions: FormsActions;
  onDone: () => void;
}) {
  const [name, setName] = useState(form?.name ?? "");
  const [description, setDescription] = useState(form?.description ?? "");
  const [fields, setFields] = useState<FormField[]>(
    (form?.fields as unknown as FormField[]) ?? [{ id: crypto.randomUUID(), type: "text", label: "", required: false, options: [] }],
  );

  const updateField = (id: string, patch: Partial<FormField>) => {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id: string) => {
    setFields((fs) => fs.filter((f) => f.id !== id));
  };

  const save = () => {
    const fd = new FormData();
    fd.set("id", form?.id ?? "");
    fd.set("name", name);
    fd.set("description", description);
    fd.set("fields", JSON.stringify(fields));
    fd.set("published", form?.published ? "true" : "false");
    const action = form ? actions.update : actions.create;
    void action(fd).then(onDone);
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <Button variant="ghost" size="sm" onClick={onDone}>← Back</Button>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>
          {form ? "Edit form" : "New form"}
        </h1>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={save}>Save form</Button>
      </div>

      <div className="nv-card" style={{ padding: "var(--nv-space-5)", marginBottom: "var(--nv-space-4)" }}>
        <Field label="Form title">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer feedback" />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>

      {fields.map((field, i) => (
        <div key={field.id} className="nv-card" style={{ padding: "var(--nv-space-4)", marginBottom: "var(--nv-space-3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontWeight: 700, color: "var(--nv-color-text-muted)", fontSize: 13 }}>Q{i + 1}</span>
            <select
              className="nv-select"
              style={{ width: 150 }}
              value={field.type}
              onChange={(e) => updateField(field.id, { type: e.target.value as FieldType })}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div style={{ flex: 1 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
              <input type="checkbox" checked={field.required} onChange={(e) => updateField(field.id, { required: e.target.checked })} />
              Required
            </label>
            <Button variant="ghost" size="sm" onClick={() => removeField(field.id)}>✕</Button>
          </div>
          <Input
            placeholder="Question label"
            value={field.label}
            onChange={(e) => updateField(field.id, { label: e.target.value })}
          />
          {["select", "radio", "checkbox"].includes(field.type) ? (
            <Textarea
              rows={2}
              style={{ marginTop: 8 }}
              placeholder={"Options, one per line"}
              value={field.options.join("\n")}
              onChange={(e) =>
                updateField(field.id, {
                  options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          ) : null}
        </div>
      ))}

      <Button
        variant="secondary"
        block
        onClick={() =>
          setFields((fs) => [...fs, { id: crypto.randomUUID(), type: "text", label: "", required: false, options: [] }])
        }
      >
        + Add question
      </Button>
    </div>
  );
}

function ResponsesView({
  form,
  responses,
  onBack,
}: {
  form: Form;
  responses: FormResponse[];
  onBack: () => void;
}) {
  const fields = (form.fields as unknown as FormField[]) ?? [];
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>{form.name} — Responses</h1>
        <Badge tone="primary">{responses.length}</Badge>
      </div>
      {responses.length === 0 ? (
        <div className="nv-empty">No responses yet</div>
      ) : (
        <div className="nv-card">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Submitted</TableHeaderCell>
                {fields.map((f) => (
                  <TableHeaderCell key={f.id}>{f.label}</TableHeaderCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {responses.map((r) => {
                const answers = (r.answers as Record<string, unknown>) ?? {};
                return (
                  <TableRow key={r.id}>
                    <TableCell style={{ whiteSpace: "nowrap" }}>{r.submittedAt.toLocaleString()}</TableCell>
                    {fields.map((f) => (
                      <TableCell key={f.id}>
                        {formatAnswer(answers[f.id])}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function formatAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "—";
  return String(value);
}

function CopyLinkButton({ formId }: { formId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/f/${formId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Button variant="ghost" size="sm" onClick={copy}>
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

export function PublicForm({
  form,
  submit,
}: {
  form: Pick<Form, "id" | "name" | "description" | "fields">;
  submit: (formId: string, answers: Record<string, unknown>) => Promise<void>;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = (form.fields as unknown as FormField[]) ?? [];

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const answers: Record<string, unknown> = {};
    for (const field of fields) {
      answers[field.id] =
        field.type === "checkbox"
          ? fd.getAll(field.id).map(String)
          : String(fd.get(field.id) ?? "");
    }
    const missing = fields.find(
      (f) => f.required && f.type === "checkbox" && (answers[f.id] as string[]).length === 0,
    );
    if (missing) {
      setError(`Please answer "${missing.label}"`);
      return;
    }
    setError(null);
    try {
      await submit(form.id, answers);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (submitted) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--nv-space-6)" }}>
        <div className="nv-card" style={{ padding: "var(--nv-space-6)", textAlign: "center" }}>
          <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>Thank you</h1>
          <p style={{ color: "var(--nv-color-text-muted)", marginTop: 8 }}>
            Your response has been recorded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--nv-space-6)" }}>
      <div className="nv-card" style={{ padding: "var(--nv-space-6)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>{form.name}</h1>
        {form.description ? (
          <p style={{ color: "var(--nv-color-text-muted)", marginTop: 8 }}>
            {form.description}
          </p>
        ) : null}
        <form onSubmit={handleSubmit} style={{ marginTop: "var(--nv-space-5)" }}>
          {fields.map((field) => (
            <PublicField key={field.id} field={field} />
          ))}
          {error ? (
            <p style={{ color: "var(--nv-color-danger)", fontSize: "var(--nv-font-sm)", marginBottom: 12 }}>
              {error}
            </p>
          ) : null}
          <Button type="submit" block size="lg">
            Submit
          </Button>
        </form>
      </div>
    </div>
  );
}

function PublicField({ field }: { field: FormField }) {
  const label = `${field.label}${field.required ? " *" : ""}`;
  const required = field.required;
  switch (field.type) {
    case "textarea":
      return (
        <Field label={label}>
          <Textarea name={field.id} rows={3} required={required} />
        </Field>
      );
    case "select":
      return (
        <Field label={label}>
          <Select name={field.id} defaultValue="" required={required}>
            <option value="" disabled>Select…</option>
            {field.options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
        </Field>
      );
    case "radio":
    case "checkbox": {
      const checkbox = field.type === "checkbox";
      return (
        <div className="nv-field">
          <span className="nv-label">{label}</span>
          {field.options.map((o) => (
            <label
              key={o}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}
            >
              <input type={field.type} name={field.id} value={o} required={required && !checkbox} />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case "email":
      return (
        <Field label={label}>
          <Input type="email" name={field.id} required={required} />
        </Field>
      );
    case "number":
      return (
        <Field label={label}>
          <Input type="number" name={field.id} required={required} />
        </Field>
      );
    default:
      return (
        <Field label={label}>
          <Input type="text" name={field.id} required={required} />
        </Field>
      );
  }
}