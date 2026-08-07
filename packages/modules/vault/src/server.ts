import crypto from "node:crypto";
import { z } from "zod";
import { prisma, logAudit, type VaultEntry } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "vault";

export const vaultEntrySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  hint: z.string().max(200).default(""),
  value: z.string().min(1, "Secret cannot be empty").max(8000),
  category: z.enum(["general", "api", "db", "deploy", "infra", "fintech"]).default("general"),
  expiresAt: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.union([z.string().date(), z.string().datetime()]).optional())
    .transform((v) => (v ? new Date(v) : null)),
});

function masterKey(): Buffer {
  const secret = process.env.N0VA_VAULT_KEY ?? "n0va-dev-vault-key-change-me";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB, tagB, dataB] = payload.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivB ?? "", "base64"));
  decipher.setAuthTag(Buffer.from(tagB ?? "", "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB ?? "", "base64")), decipher.final()]).toString("utf8");
}

export class VaultService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for vault`);
    }
  }

  async list(): Promise<Array<VaultEntry & { masked: string }>> {
    await this.assert("READ");
    const entries = await prisma.vaultEntry.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { updatedAt: "desc" },
    });
    return entries.map((e) => {
      const decrypted = decryptSecret(e.encryptedValue);
      const masked = decrypted.length > 2 ? "•".repeat(Math.min(12, decrypted.length)) : "•••";
      return { ...e, masked };
    });
  }

  async create(input: z.infer<typeof vaultEntrySchema>): Promise<void> {
    await this.assert("CREATE");
    const entry = await prisma.vaultEntry.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name: input.name,
        hint: input.hint,
        category: input.category,
        expiresAt: input.expiresAt,
        encryptedValue: encryptSecret(input.value),
      },
    });
    await this.audit("vault.created", entry.id);
  }

  async reveal(id: string): Promise<string> {
    await this.assert("READ");
    const entry = await prisma.vaultEntry.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!entry) throw new Error("Secret not found");
    await this.audit("vault.revealed", id);
    return decryptSecret(entry.encryptedValue);
  }

  async remove(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.vaultEntry.delete({ where: { id, workspaceId: this.workspaceId } });
    await this.audit("vault.deleted", id);
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "VaultEntry",
      targetId,
    });
  }
}
