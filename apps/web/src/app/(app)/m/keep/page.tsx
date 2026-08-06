import { KeepService } from "@n0va/modules-keep/server";
import { KeepApp } from "@n0va/modules-keep/components";
import { requireWorkspace } from "@/lib/context";
import {
  archiveNoteAction,
  createNoteAction,
  deleteNoteAction,
  restoreNoteAction,
  togglePinNoteAction,
  updateNoteAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function KeepPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const ctx = await requireWorkspace();
  const svc = new KeepService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  const archived = view === "archived";
  const notes = await svc.list(archived);

  return (
    <KeepApp
      notes={notes}
      archived={archived}
      actions={{
        create: createNoteAction,
        update: updateNoteAction,
        togglePin: togglePinNoteAction,
        archive: archived ? restoreNoteAction : archiveNoteAction,
        remove: deleteNoteAction,
      }}
    />
  );
}