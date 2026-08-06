import { VaultService } from "@n0va/modules-vault/server";
import { VaultManager } from "@n0va/modules-vault/components";
import { requireWorkspace } from "@/lib/context";
import { createVaultEntryAction, revealVaultEntryAction, removeVaultEntryAction } from "./actions";

export default async function VaultPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new VaultService(workspaceId, userId, role);
  const entries = await svc.list();

  return (
    <VaultManager
      entries={entries}
      actions={{ create: createVaultEntryAction, reveal: revealVaultEntryAction, remove: removeVaultEntryAction }}
    />
  );
}
