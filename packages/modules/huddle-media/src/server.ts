import { prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "huddle";

export type HuddleMode = "INSTANT" | "SCHEDULED" | "PERSISTENT" | "BREAKOUT";
export type HuddleRole = "HOST" | "PRESENTER" | "SPEAKER" | "ATTENDEE" | "GUEST";
export type RecordingType = "COMPOSITE" | "RAW_TRACKS" | "AUDIO_ONLY";

export class HuddleService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for huddles`);
    }
  }

  async createHuddle(input: { title: string; mode: HuddleMode; channelId?: string; qualityProfile?: string; recordingEnabled?: boolean; recordingType?: RecordingType; scheduledFor?: Date; guestPolicy?: Record<string, unknown> }) {
    await this.assert("CREATE");
    const huddle = await prisma.huddleSession.create({
      data: {
        workspaceId: this.workspaceId, createdById: this.userId, title: input.title, mode: input.mode,
        channelId: input.channelId,         qualityProfile: (input.qualityProfile as any) ?? "PREMIUM",
        recordingEnabled: input.recordingEnabled ?? false, recordingType: input.recordingType ?? "COMPOSITE",
        scheduledFor: input.scheduledFor, guestPolicy: (input.guestPolicy ?? {}) as any,
        status: input.mode === "INSTANT" ? "LIVE" : "SCHEDULED",
        startedAt: input.mode === "INSTANT" ? new Date() : undefined,
      },
    });

    await prisma.huddleParticipant.create({
      data: { huddleId: huddle.id, userId: this.userId, displayName: "Host", role: "HOST", isPresenter: true, videoEnabled: true, audioEnabled: true },
    });

    return huddle;
  }

  async joinHuddle(huddleId: string, input?: { displayName?: string; guestToken?: string }) {
    await this.assert("CREATE");
    const huddle = await prisma.huddleSession.findFirst({ where: { id: huddleId, workspaceId: this.workspaceId } });
    if (!huddle) throw new Error("Huddle not found");

    const participantCount = await prisma.huddleParticipant.count({ where: { huddleId, leftAt: null } });
    if (participantCount >= huddle.maxParticipants) throw new Error("Huddle is full");

    const isGuest = !this.userId || !!input?.guestToken;
    const role: HuddleRole = isGuest ? "GUEST" : "ATTENDEE";

    const existingGuest = input?.guestToken ? await prisma.huddleParticipant.findUnique({ where: { guestToken: input.guestToken } }) : null;
    if (existingGuest && existingGuest.leftAt) {
      return prisma.huddleParticipant.update({ where: { id: existingGuest.id }, data: { leftAt: null, joinedAt: new Date() } });
    }

    return prisma.huddleParticipant.create({
      data: { huddleId, userId: this.userId, displayName: input?.displayName ?? "Participant", role, guestToken: input?.guestToken, guestOrg: (huddle.guestPolicy as any)?.org, audioEnabled: !isGuest, videoEnabled: !isGuest },
    });
  }

  async updateParticipantRole(huddleId: string, participantId: string, role: HuddleRole) {
    await this.assert("UPDATE");
    return prisma.huddleParticipant.update({ where: { id: participantId }, data: { role, isPresenter: role === "PRESENTER" } });
  }

  async leaveHuddle(huddleId: string) {
    await this.assert("UPDATE");
    const participant = await prisma.huddleParticipant.findFirst({ where: { huddleId, userId: this.userId, leftAt: null } });
    if (participant) { await prisma.huddleParticipant.update({ where: { id: participant.id }, data: { leftAt: new Date() } }); }

    const remaining = await prisma.huddleParticipant.count({ where: { huddleId, leftAt: null } });
    if (remaining === 0) { await prisma.huddleSession.update({ where: { id: huddleId }, data: { status: "ENDED", endedAt: new Date() } }); }
  }

  async startRecording(huddleId: string, recordingType?: RecordingType) {
    await this.assert("CREATE");
    const huddle = await prisma.huddleSession.findFirst({ where: { id: huddleId, workspaceId: this.workspaceId } });
    if (!huddle) throw new Error("Huddle not found");
    if (!huddle.recordingEnabled) throw new Error("Recording not enabled for this huddle");

    return prisma.huddleRecording.create({
      data: { huddleId, workspaceId: this.workspaceId, startedById: this.userId, recordingType: recordingType ?? huddle.recordingType, status: "RECORDING", startedAt: new Date() },
    });
  }

  async stopRecording(recordingId: string) {
    await this.assert("UPDATE");
    const recording = await prisma.huddleRecording.findFirst({ where: { id: recordingId }, include: { tracks: true } });
    if (!recording) throw new Error("Recording not found");

    const startedAt = recording.startedAt ?? recording.createdAt;
    const durationSec = Math.round((Date.now() - startedAt.getTime()) / 1000);

    return prisma.huddleRecording.update({ where: { id: recordingId }, data: { status: "PROCESSING", endedAt: new Date(), durationSec, trackCount: recording.tracks.length } });
  }

  async addRecordingTrack(recordingId: string, input: { participantId?: string; participantName?: string; trackType: string; storageKey: string; durationSec: number; fileSizeBytes: number }) {
    await this.assert("CREATE");
    return prisma.recordingTrack.create({ data: { recordingId, participantId: input.participantId, participantName: input.participantName, trackType: input.trackType as any, storageKey: input.storageKey, durationSec: input.durationSec, fileSizeBytes: input.fileSizeBytes } });
  }

  async createBreakout(parentHuddleId: string, input: { title: string; assignmentType?: "MANUAL" | "AUTO_ROLE" | "AUTO_TEAM"; durationMin?: number; participantIds?: string[] }) {
    await this.assert("CREATE");
    const breakout = await prisma.breakoutRoom.create({
      data: { parentHuddleId, workspaceId: this.workspaceId, createdById: this.userId, title: input.title, assignmentType: input.assignmentType ?? "MANUAL", durationMin: input.durationMin },
    });

    if (input.participantIds?.length) {
      const participants = await prisma.huddleParticipant.findMany({ where: { id: { in: input.participantIds } } });
      for (const p of participants) {
        await prisma.breakoutParticipant.create({ data: { breakoutId: breakout.id, userId: p.userId, displayName: p.displayName } });
      }
    }

    return breakout;
  }

  async assignToBreakout(breakoutId: string, participantIds: string[]) {
    await this.assert("UPDATE");
    const participants = await prisma.huddleParticipant.findMany({ where: { id: { in: participantIds } } });
    for (const p of participants) {
      await prisma.breakoutParticipant.create({ data: { breakoutId, userId: p.userId, displayName: p.displayName } });
    }
    return { success: true };
  }

  async endBreakout(breakoutId: string) {
    await this.assert("UPDATE");
    return prisma.breakoutRoom.update({ where: { id: breakoutId }, data: { status: "ENDED", endedAt: new Date() } });
  }

  async broadcastToBreakouts(parentHuddleId: string, message: string) {
    await this.assert("CREATE");
    const breakouts = await prisma.breakoutRoom.findMany({ where: { parentHuddleId, status: "ACTIVE" } });
    for (const b of breakouts) {
      await prisma.huddleArtifact.create({ data: { huddleId: parentHuddleId, workspaceId: this.workspaceId, artifactType: "CHAT_LOG", title: "Host Broadcast", content: message } });
    }
    return { broadcastTo: breakouts.length };
  }

  async createArtifact(huddleId: string, input: { artifactType: string; title: string; content: string; storageKey?: string; metadata?: Record<string, unknown> }) {
    await this.assert("CREATE");
    return prisma.huddleArtifact.create({ data: { huddleId, workspaceId: this.workspaceId, artifactType: input.artifactType as any, title: input.title, content: input.content, storageKey: input.storageKey, metadata: (input.metadata ?? {}) as any } });
  }

  async getActiveHuddles() {
    await this.assert("READ");
    return prisma.huddleSession.findMany({ where: { workspaceId: this.workspaceId, status: "LIVE" }, include: { participants: { where: { leftAt: null } }, _count: { select: { participants: true, recordings: true, breakouts: true } } }, orderBy: { startedAt: "desc" } });
  }

  async getHuddle(huddleId: string) {
    await this.assert("READ");
    return prisma.huddleSession.findFirst({ where: { id: huddleId, workspaceId: this.workspaceId }, include: { participants: true, recordings: { include: { tracks: true } }, breakouts: { include: { participants: true } }, artifacts: true } });
  }

  async generateGuestToken(huddleId: string, guestName: string, guestOrg?: string) {
    await this.assert("CREATE");
    const token = `guest_${crypto.randomUUID().slice(0, 12)}`;
    const huddle = await prisma.huddleSession.findFirst({ where: { id: huddleId, workspaceId: this.workspaceId } });
    if (!huddle) throw new Error("Huddle not found");

    const policy = huddle.guestPolicy as Record<string, unknown>;
    if (!policy.enabled) throw new Error("Guest access not enabled");

    return { token, guestName, guestOrg, requiresApproval: policy.approvalRequired ?? true };
  }

  async admitGuest(huddleId: string, guestToken: string) {
    await this.assert("UPDATE");
    return prisma.huddleParticipant.updateMany({ where: { huddleId, guestToken }, data: { role: "GUEST", audioEnabled: true, videoEnabled: false } });
  }
}
