import { getPublicForm } from "@n0va/modules-forms/server";
import { PublicForm } from "@n0va/modules-forms/components";
import { submitFormResponse } from "./actions";

export const dynamic = "force-dynamic";

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  const form = await getPublicForm(formId);

  if (!form) {
    return <FormNotice message="Form not found" />;
  }

  if (!form.published) {
    return <FormNotice message="This form is not accepting responses." />;
  }

  return (
    <PublicForm
      form={{ id: form.id, name: form.name, description: form.description, fields: form.fields }}
      submit={submitFormResponse}
    />
  );
}

function FormNotice({ message }: { message: string }) {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--nv-space-6)" }}>
      <div className="nv-card" style={{ padding: "var(--nv-space-6)", textAlign: "center" }}>
        <p style={{ color: "var(--nv-color-text-muted)" }}>{message}</p>
      </div>
    </div>
  );
}
