import { z } from "zod";
import { prisma, type HealthCheckin } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "health";

export const checkinSchema = z.object({
  mood: z.enum(["LOW", "OK", "GOOD", "GREAT"]).default("OK"),
  energy: z.enum(["LOW", "OK", "HIGH"]).default("OK"),
  sleepHours: z.coerce.number().min(0).max(24).default(7),
  note: z.string().max(1000).default(""),
});

export interface CheckinStats {
  avgSleep: number;
  moodCounts: Record<string, number>;
  energyCounts: Record<string, number>;
  checkinCount: number;
}

export class HealthService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert() {
    if (!(await can(this.workspaceId, this.role, MODULE, "READ"))) {
      throw new Error("Missing READ permission for health");
    }
  }

  async checkins(take = 30): Promise<HealthCheckin[]> {
    await this.assert();
    return prisma.healthCheckin.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async create(input: z.infer<typeof checkinSchema>): Promise<void> {
    if (!(await can(this.workspaceId, this.role, MODULE, "CREATE"))) {
      throw new Error("Missing CREATE permission for health");
    }
    await prisma.healthCheckin.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, mood: input.mood, energy: input.energy, sleepHours: input.sleepHours, note: input.note },
    });
  }

  async stats(): Promise<CheckinStats> {
    await this.assert();
    const checkins = await prisma.healthCheckin.findMany({
      where: { workspaceId: this.workspaceId, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    });
    const moodCounts: Record<string, number> = { LOW: 0, OK: 0, GOOD: 0, GREAT: 0 };
    const energyCounts: Record<string, number> = { LOW: 0, OK: 0, HIGH: 0 };
    let sleepTotal = 0;
    for (const c of checkins) {
      moodCounts[c.mood] = (moodCounts[c.mood] ?? 0) + 1;
      energyCounts[c.energy] = (energyCounts[c.energy] ?? 0) + 1;
      sleepTotal += c.sleepHours;
    }
    return {
      avgSleep: checkins.length > 0 ? sleepTotal / checkins.length : 0,
      moodCounts,
      energyCounts,
      checkinCount: checkins.length,
    };
  }

  async remove(id: string): Promise<void> {
    if (!(await can(this.workspaceId, this.role, MODULE, "DELETE"))) {
      throw new Error("Missing DELETE permission for health");
    }
    await prisma.healthCheckin.delete({ where: { id } });
  }
}
