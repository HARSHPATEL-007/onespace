import { ContactService } from "@n0va/modules-contacts/server";
import { ContactsApp } from "@n0va/modules-contacts/components";
import { requireWorkspace } from "@/lib/context";
import {
  createContact,
  removeContact,
  toggleFavoriteContact,
  updateContact,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const ctx = await requireWorkspace();
  const svc = new ContactService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  const contacts = await svc.list();

  return (
    <ContactsApp
      initialContacts={contacts}
      actions={{
        create: createContact,
        update: updateContact,
        remove: removeContact,
        toggleFavorite: toggleFavoriteContact,
      }}
    />
  );
}