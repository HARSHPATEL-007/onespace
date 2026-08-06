import { FormsService } from "@n0va/modules-forms/server";
import { FormsApp } from "@n0va/modules-forms/components";
import { requireWorkspace } from "@/lib/context";
import {
  createFormAction,
  deleteFormAction,
  setPublishedAction,
  submitAnswerAction,
  updateFormAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const ctx = await requireWorkspace();
  const svc = new FormsService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  const forms = await svc.list();

  return (
    <FormsApp
      forms={forms}
      actions={{
        create: createFormAction,
        update: updateFormAction,
        setPublished: setPublishedAction,
        remove: deleteFormAction,
        submit: submitAnswerAction,
      }}
    />
  );
}