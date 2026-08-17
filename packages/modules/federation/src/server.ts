import { prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "federation";

export type FederationProtocol = "N0VA_NATIVE" | "MATRIX" | "XMPP" | "SLACK_BRIDGE" | "DISCORD_BRIDGE";
export type FederationMode = "PRODUCTION" | "BETA" | "PLANNED";
export type TrustLevel = "VIEWER" | "CONTRIBUTOR" | "PARTNER" | "VENDOR" | "FULL";
export type GuestTier = "VIEWER" | "CONTRIBUTOR" | "PARTNER" | "VENDOR" | "TEMPORARY";

export class FederationService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for federation`);
    }
  }

  async createConnection(input: { protocol: FederationProtocol; remoteDomain: string; remoteRoomId?: string; localChannelId?: string; trustLevel?: TrustLevel; capabilities?: string[]; config?: Record<string, unknown> }) {
    await this.assert("CREATE");
    const mode: FederationMode = input.protocol === "N0VA_NATIVE" ? "PRODUCTION" : input.protocol === "XMPP" ? "PLANNED" : input.protocol === "SLACK_BRIDGE" ? "PRODUCTION" : "BETA";

    const connection = await prisma.federationConnection.create({
      data: { workspaceId: this.workspaceId, protocol: input.protocol, mode, remoteDomain: input.remoteDomain, remoteRoomId: input.remoteRoomId, localChannelId: input.localChannelId, trustLevel: input.trustLevel ?? "PARTNER", capabilities: input.capabilities ?? ["messages"], config: (input.config ?? {}) as any, status: "PENDING" },
    });

    await prisma.federationAuditLog.create({ data: { connectionId: connection.id, workspaceId: this.workspaceId, action: "connection.created", actorId: this.userId, details: { protocol: input.protocol, domain: input.remoteDomain } } });
    return connection;
  }

  async mapIdentity(connectionId: string, input: { externalUserId: string; externalProtocol: string; localAlias: string; displayName?: string; trustLevel?: TrustLevel; roleMapping?: string }) {
    await this.assert("CREATE");
    const connection = await prisma.federationConnection.findFirst({ where: { id: connectionId, workspaceId: this.workspaceId } });
    if (!connection) throw new Error("Connection not found");

    const identity = await prisma.federatedIdentity.create({
      data: { connectionId, workspaceId: this.workspaceId, externalUserId: input.externalUserId, externalProtocol: input.externalProtocol, localAlias: input.localAlias, displayName: input.displayName, trustLevel: input.trustLevel ?? "PARTNER", roleMapping: input.roleMapping ?? "guest" },
    });

    await prisma.federationAuditLog.create({ data: { connectionId, workspaceId: this.workspaceId, action: "identity.mapped", actorId: this.userId, details: { externalUserId: input.externalUserId } } });
    return identity;
  }

  async setPolicy(input: { policyType: "OPEN" | "CLOSED" | "WHITELIST"; domainRules?: any[]; contentRules?: any[] }) {
    await this.assert("UPDATE");
    return prisma.federationPolicy.upsert({
      where: { workspaceId: this.workspaceId },
      create: { workspaceId: this.workspaceId, policyType: input.policyType, domainRules: (input.domainRules ?? []) as any, contentRules: (input.contentRules ?? []) as any },
      update: { policyType: input.policyType, domainRules: (input.domainRules ?? []) as any, contentRules: (input.contentRules ?? []) as any },
    });
  }

  async checkDomainAllowed(domain: string): Promise<boolean> {
    const policy = await prisma.federationPolicy.findUnique({ where: { workspaceId: this.workspaceId } });
    if (!policy || !policy.enabled) return false;
    if (policy.breakGlass) return false;

    const rules = policy.domainRules as Array<{ domain: string; action: string }>;
    if (policy.policyType === "OPEN") return !rules.some(r => r.domain === domain && r.action === "deny");
    if (policy.policyType === "CLOSED") return rules.some(r => r.domain === domain && r.action === "allow");
    return rules.some(r => r.domain === domain && r.action === "allow");
  }

  async inviteGuest(input: { guestEmail: string; guestName: string; accessTier: GuestTier; roomScope?: string[]; expiresAt?: Date }) {
    await this.assert("CREATE");
    const guest = await prisma.guestAccess.create({
      data: { workspaceId: this.workspaceId, guestEmail: input.guestEmail, guestName: input.guestName, accessTier: input.accessTier, invitedById: this.userId, roomScope: input.roomScope ?? [], expiresAt: input.expiresAt },
    });

    await prisma.federationAuditLog.create({ data: { connectionId: null, workspaceId: this.workspaceId, action: "guest.invited", actorId: this.userId, details: { guestEmail: input.guestEmail, tier: input.accessTier } } });
    return guest;
  }

  async revokeGuest(guestId: string) {
    await this.assert("UPDATE");
    return prisma.guestAccess.update({ where: { id: guestId }, data: { status: "REVOKED" } });
  }

  async getConnections(): Promise<any[]> {
    await this.assert("READ");
    return prisma.federationConnection.findMany({ where: { workspaceId: this.workspaceId }, include: { identities: true, _count: { select: { auditLogs: true } } }, orderBy: { createdAt: "desc" } });
  }

  async getGuests(): Promise<any[]> {
    await this.assert("READ");
    return prisma.guestAccess.findMany({ where: { workspaceId: this.workspaceId }, include: { invitedBy: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" } });
  }

  async normalizeMessage(protocol: FederationProtocol, rawMessage: Record<string, unknown>): Promise<{ body: string; authorName: string; metadata: Record<string, unknown> }> {
    switch (protocol) {
      case "MATRIX":
        return { body: (rawMessage.content as any)?.body ?? "", authorName: (rawMessage.sender as string) ?? "Unknown", metadata: { protocol: "matrix", eventType: rawMessage.type as string } };
      case "SLACK_BRIDGE":
        return { body: (rawMessage.text as string) ?? "", authorName: (rawMessage.user as string) ?? "Unknown", metadata: { protocol: "slack", channel: rawMessage.channel } };
      case "DISCORD_BRIDGE":
        return { body: (rawMessage.content as string) ?? "", authorName: (rawMessage.author as any)?.username ?? "Unknown", metadata: { protocol: "discord", guildId: rawMessage.guild_id } };
      case "XMPP":
        return { body: (rawMessage.body as string) ?? "", authorName: (rawMessage.from as string) ?? "Unknown", metadata: { protocol: "xmpp" } };
      default:
        return { body: (rawMessage.body as string) ?? "", authorName: (rawMessage.authorName as string) ?? "Unknown", metadata: {} };
    }
  }

  async breakGlass(): Promise<void> {
    await this.assert("UPDATE");
    await prisma.federationPolicy.update({ where: { workspaceId: this.workspaceId }, data: { breakGlass: true } });
    await prisma.federationConnection.updateMany({ where: { workspaceId: this.workspaceId }, data: { status: "PAUSED" } });
    await prisma.federationAuditLog.create({ data: { connectionId: null, workspaceId: this.workspaceId, action: "break_glass.activated", actorId: this.userId, details: {} } });
  }
}
