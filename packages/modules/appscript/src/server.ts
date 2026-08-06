import { z } from "zod";
import vm from "node:vm";
import { prisma, logAudit, type Script, type ScriptRun } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "appscript";

export const scriptSchema = z.object({
  name: z.string().trim().min(1).max(120),
  language: z.enum(["js", "ts"]).default("js"),
  code: z.string().max(50_000),
});

export type ScriptWithRuns = Script & { runs: ScriptRun[] };

export class AppScriptService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for appscript`);
    }
  }

  async list(): Promise<ScriptWithRuns[]> {
    await this.assert("READ");
    return prisma.script.findMany({
      where: { workspaceId: this.workspaceId },
      include: { runs: { orderBy: { startedAt: "desc" }, take: 5 } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async create(input: z.infer<typeof scriptSchema>): Promise<void> {
    await this.assert("CREATE");
    await prisma.script.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, name: input.name, language: input.language, code: input.code },
    });
    await this.audit("script.created", input.name);
  }

  async update(id: string, input: z.infer<typeof scriptSchema>): Promise<void> {
    await this.assert("UPDATE");
    await prisma.script.update({ where: { id }, data: { name: input.name, language: input.language, code: input.code } });
  }

  async remove(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.script.delete({ where: { id } });
    await this.audit("script.deleted", id);
  }

  async run(id: string): Promise<ScriptRun> {
    await this.assert("UPDATE");
    const script = await prisma.script.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!script) throw new Error("Script not found");

    const started = Date.now();
    const logs: string[] = [];
    const sandbox = {
      console: {
        log: (...args: unknown[]) => logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")),
        info: (...args: unknown[]) => logs.push(`[info] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`),
        warn: (...args: unknown[]) => logs.push(`[warn] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`),
        error: (...args: unknown[]) => logs.push(`[error] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`),
      },
      JSON,
      Math,
      Date,
      setTimeout,
      clearTimeout,
    };
    vm.createContext(sandbox);

    let status = "success";
    let output = "";
    let error = "";

    try {
      const result = vm.runInContext(script.code, sandbox, { timeout: 5000 });
      if (result !== undefined) logs.push(String(result));
      output = logs.join("\n") || "Script ran with no console output.";
    } catch (e) {
      status = "failed";
      error = e instanceof Error ? e.message : String(e);
      output = logs.join("\n");
    }

    const durationMs = Date.now() - started;
    const run = await prisma.scriptRun.create({
      data: { scriptId: id, workspaceId: this.workspaceId, status, output: output.slice(0, 2000), error: error.slice(0, 500), durationMs },
    });
    await prisma.script.update({ where: { id }, data: { lastRunAt: new Date() } });
    await this.audit(status === "success" ? "script.ran" : "script.failed", script.name);
    return run;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Script",
      targetId,
    });
  }
}
