import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const CONTACT_MODULE = "contacts";

export const contactInputSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().max(100).optional().nullable(),
  email: z.string().email().max(320).optional().nullable().or(z.literal("")),
  phone: z.string().max(60).optional().nullable(),
  company: z.string().max(160).optional().nullable(),
  title: z.string().max(160).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  labels: z.array(z.string().max(40)).max(12).default([]),
  isFavorite: z.boolean().default(false),
});

export type ContactInput = z.infer<typeof contactInputSchema>;

export class ContactService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  async assertPermission(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    const ok = await can(this.workspaceId, this.role, CONTACT_MODULE, action);
    if (!ok) throw new Error(`Missing ${action} permission for contacts`);
  }

  async list(input: { search?: string; favoriteOnly?: boolean } = {}) {
    await this.assertPermission("READ");
    const { search, favoriteOnly } = input;

    const where = {
      workspaceId: this.workspaceId,
      ...(favoriteOnly ? { isFavorite: true } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
              { company: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    return prisma.contact.findMany({
      where,
      orderBy: [{ isFavorite: "desc" }, { firstName: "asc" }],
    });
  }

  async get(id: string) {
    await this.assertPermission("READ");
    return this.owned(id);
  }

  async create(input: ContactInput) {
    await this.assertPermission("CREATE");
    const contact = await prisma.contact.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        email: input.email || null,
        phone: input.phone ?? null,
        company: input.company ?? null,
        title: input.title ?? null,
        notes: input.notes ?? null,
        labels: input.labels,
        isFavorite: input.isFavorite,
      },
    });
    await logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: CONTACT_MODULE,
      action: "contact.created",
      targetType: "Contact",
      targetId: contact.id,
    });
    return contact;
  }

  async update(id: string, input: Partial<ContactInput>) {
    await this.assertPermission("UPDATE");
    await this.owned(id);
    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName ?? null } : {}),
        ...(input.email !== undefined ? { email: input.email || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
        ...(input.company !== undefined ? { company: input.company ?? null } : {}),
        ...(input.title !== undefined ? { title: input.title ?? null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        ...(input.labels !== undefined ? { labels: input.labels } : {}),
        ...(input.isFavorite !== undefined ? { isFavorite: input.isFavorite } : {}),
      },
    });
    await logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: CONTACT_MODULE,
      action: "contact.updated",
      targetType: "Contact",
      targetId: id,
    });
    return contact;
  }

  async toggleFavorite(id: string) {
    await this.assertPermission("UPDATE");
    const contact = await this.owned(id);
    return this.update(id, { isFavorite: !contact.isFavorite });
  }

  async remove(id: string) {
    await this.assertPermission("DELETE");
    await this.owned(id);
    await prisma.contact.delete({ where: { id } });
    await logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: CONTACT_MODULE,
      action: "contact.deleted",
      targetType: "Contact",
      targetId: id,
    });
  }

  private async owned(id: string) {
    const contact = await prisma.contact.findFirst({
      where: { id, workspaceId: this.workspaceId },
    });
    if (!contact) throw new Error("Contact not found in this workspace");
    return contact;
  }
}