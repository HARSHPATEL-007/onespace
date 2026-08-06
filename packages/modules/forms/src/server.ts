import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "forms";

export const FIELD_TYPES = ["text", "textarea", "email", "number", "select", "radio", "checkbox"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const formFieldSchema = z.object({
  id: z.string(),
  type: z.enum(FIELD_TYPES),
  label: z.string().min(1).max(300),
  required: z.boolean().default(false),
  options: z.array(z.string().max(300)).max(30).default([]),
});

export const formInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).default(""),
  fields: z.array(formFieldSchema).min(1, "Add at least one field").max(50),
  published: z.boolean().default(false),
});

export type FormInput = z.infer<typeof formInputSchema>;
export type FormField = z.infer<typeof formFieldSchema>;

export class FormsService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for forms`);
    }
  }

  async list() {
    await this.assert("READ");
    const forms = await prisma.form.findMany({
      where: { workspaceId: this.workspaceId },
      include: { _count: { select: { responses: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return forms;
  }

  async get(id: string) {
    await this.assert("READ");
    return this.owned(id);
  }

  async create(input: FormInput) {
    await this.assert("CREATE");
    const form = await prisma.form.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name: input.name,
        description: input.description,
        fields: input.fields as never,
        published: input.published,
      },
    });
    await this.audit("form.created", form.id);
    return form;
  }

  async update(id: string, input: Partial<FormInput>) {
    await this.assert("UPDATE");
    await this.owned(id);
    const form = await prisma.form.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.fields !== undefined ? { fields: input.fields as never } : {}),
        ...(input.published !== undefined ? { published: input.published } : {}),
      },
    });
    await this.audit("form.updated", id);
    return form;
  }

  async setPublished(id: string, published: boolean) {
    return this.update(id, { published });
  }

  async remove(id: string) {
    await this.assert("DELETE");
    await this.owned(id);
    await prisma.form.delete({ where: { id } });
    await this.audit("form.deleted", id);
  }

  async responses(id: string) {
    await this.assert("READ");
    await this.owned(id);
    return prisma.formResponse.findMany({
      where: { formId: id },
      orderBy: { submittedAt: "desc" },
    });
  }

  async submitResponse(id: string, answers: Record<string, unknown>) {
    const form = await this.owned(id);
    const response = await prisma.formResponse.create({
      data: {
        formId: id,
        workspaceId: this.workspaceId,
        answers: answers as never,
      },
    });
    await logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action: "form.response.submitted",
      targetType: "Form",
      targetId: form.id,
    });
    return response;
  }

  private async owned(id: string) {
    const form = await prisma.form.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!form) throw new Error("Form not found in this workspace");
    return form;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Form",
      targetId,
    });
  }
}