import { prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "contacts";

export type ContactPlatform = "N0VA" | "WHATSAPP" | "TELEGRAM" | "SIGNAL" | "IMESSAGE" | "SMS";
export type ChatLinkStatus = "ACTIVE" | "PENDING_INVITE" | "BLOCKED" | "ARCHIVED";

export interface ContactIdentifier {
  type: "n0vachat_id" | "email" | "phone" | "username";
  value: string;
}

export interface ContactChatResult {
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    n0vachatId: string | null;
    username: string | null;
    platform: ContactPlatform;
    company: string | null;
    title: string | null;
    avatarUrl: string | null;
  };
  status: "on_platform" | "off_platform" | "new_contact";
  chatLink: {
    id: string;
    channelId: string | null;
    status: ChatLinkStatus;
    platform: ContactPlatform;
  } | null;
  actions: {
    canMessage: boolean;
    canSaveContact: boolean;
    canInvite: boolean;
    messageUrl: string | null;
    inviteUrl: string | null;
  };
}

export class ContactChatService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for contacts`);
    }
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/[^\d+]/g, "");
    if (digits.startsWith("+")) return digits;
    if (digits.startsWith("1") && digits.length === 11) return "+" + digits;
    return "+1" + digits;
  }

  private detectIdentifierType(value: string): ContactIdentifier["type"] {
    if (value.includes("@") && value.includes(".")) return "email";
    if (/^@?[a-zA-Z0-9_]{3,30}$/.test(value)) return "username";
    if (/^(\+?\d[\d\s\-().]{6,})$/.test(value)) return "phone";
    if (value.startsWith("nc_") || value.length === 21) return "n0vachat_id";
    return "n0vachat_id";
  }

  async resolveContact(identifier: string): Promise<ContactChatResult> {
    await this.assert("READ");
    const type = this.detectIdentifierType(identifier);
    let contact = null;

    switch (type) {
      case "email":
        contact = await prisma.contact.findFirst({
          where: { workspaceId: this.workspaceId, email: identifier.toLowerCase() },
        });
        break;
      case "phone":
        const phoneE164 = this.normalizePhone(identifier);
        contact = await prisma.contact.findFirst({
          where: { workspaceId: this.workspaceId, OR: [{ phone: identifier }, { phoneE164 }] },
        });
        break;
      case "username":
        const username = identifier.startsWith("@") ? identifier.slice(1) : identifier;
        contact = await prisma.contact.findFirst({
          where: { workspaceId: this.workspaceId, username: { equals: username, mode: "insensitive" } },
        });
        break;
      case "n0vachat_id":
        contact = await prisma.contact.findFirst({
          where: { workspaceId: this.workspaceId, n0vachatId: identifier },
        });
        break;
    }

    if (!contact) {
      const resolvedUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: identifier.includes("@") ? identifier.toLowerCase() : undefined },
            { name: { contains: identifier, mode: "insensitive" } },
          ],
        },
        include: { memberships: { where: { workspaceId: this.workspaceId } } },
      });

      if (resolvedUser && resolvedUser.memberships.length > 0) {
        const membership = resolvedUser.memberships[0]!;
        const fullName = resolvedUser.name ?? identifier;
        const nameParts = fullName.split(/\s+/);
        contact = await prisma.contact.create({
          data: {
            workspaceId: this.workspaceId,
            createdById: this.userId,
            firstName: nameParts[0] ?? fullName,
            lastName: nameParts.slice(1).join(" ") || null,
            email: resolvedUser.email,
            avatarUrl: resolvedUser.image,
            n0vachatId: "nc_" + resolvedUser.id.slice(0, 18),
            username: resolvedUser.name?.toLowerCase().replace(/\s+/g, "_") ?? null,
            platform: "N0VA",
          },
        });

        const existingLink = await prisma.contactChatLink.findFirst({
          where: { contactId: contact.id },
        });

        if (!existingLink) {
          await prisma.contactChatLink.create({
            data: {
              contactId: contact.id,
              workspaceId: this.workspaceId,
              userId: membership.userId,
              platform: "N0VA",
              status: "ACTIVE",
            },
          });
        }

        return this.buildResult(contact, "on_platform");
      }

      const newContact = await prisma.contact.create({
        data: {
          workspaceId: this.workspaceId,
          createdById: this.userId,
          firstName: identifier.includes("@") ? identifier.split("@")[0]! : identifier,
          lastName: null,
          email: type === "email" ? identifier.toLowerCase() : null,
          phone: type === "phone" ? identifier : null,
          phoneE164: type === "phone" ? this.normalizePhone(identifier) : null,
          username: type === "username" ? identifier.replace("@", "") : null,
          n0vachatId: type === "n0vachat_id" ? identifier : null,
          platform: type === "n0vachat_id" ? "N0VA" : "N0VA",
        },
      });

      await prisma.contactChatLink.create({
        data: {
          contactId: newContact.id,
          workspaceId: this.workspaceId,
          platform: "N0VA",
          status: "PENDING_INVITE",
        },
      });

      return this.buildResult(newContact, "new_contact");
    }

    const status = contact.n0vachatId ? "on_platform" : "off_platform";
    return this.buildResult(contact, status);
  }

  async initiateChat(identifier: string): Promise<{ channelId: string; isNew: boolean }> {
    await this.assert("CREATE");
    const result = await this.resolveContact(identifier);

    if (result.chatLink?.channelId) {
      await prisma.contactChatLink.update({
        where: { id: result.chatLink.id },
        data: { lastUsedAt: new Date() },
      });
      return { channelId: result.chatLink.channelId, isNew: false };
    }

    if (!result.contact.n0vachatId) {
      throw new Error("Cannot start chat: contact is not on N0VA CHAT");
    }

    const targetUser = await prisma.workspaceMember.findFirst({
      where: { workspaceId: this.workspaceId, status: "ACTIVE" },
      include: { user: true },
    });

    const channel = await prisma.chatChannel.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name: "direct",
        kind: "DM",
        members: {
          create: [
            { userId: this.userId, role: "MEMBER" },
          ],
        },
      },
    });

    await prisma.contactChatLink.create({
      data: {
        contactId: result.contact.id,
        workspaceId: this.workspaceId,
        channelId: channel.id,
        userId: this.userId,
        platform: "N0VA",
        status: "ACTIVE",
      },
    });

    return { channelId: channel.id, isNew: true };
  }

  async saveContact(data: {
    firstName: string;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    title?: string | null;
    notes?: string | null;
    labels?: string[];
    n0vachatId?: string | null;
    username?: string | null;
    address?: string | null;
    website?: string | null;
    platform?: ContactPlatform;
  }) {
    await this.assert("CREATE");
    return prisma.contact.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        firstName: data.firstName,
        lastName: data.lastName ?? null,
        email: data.email?.toLowerCase() || null,
        phone: data.phone ?? null,
        phoneE164: data.phone ? this.normalizePhone(data.phone) : null,
        company: data.company ?? null,
        title: data.title ?? null,
        notes: data.notes ?? null,
        labels: data.labels ?? [],
        n0vachatId: data.n0vachatId ?? null,
        username: data.username ?? null,
        address: data.address ?? null,
        website: data.website ?? null,
        platform: data.platform ?? "N0VA",
      },
    });
  }

  async generateInviteLink(contactId: string): Promise<string> {
    await this.assert("CREATE");
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId: this.workspaceId },
    });
    if (!contact) throw new Error("Contact not found");

    const workspace = await prisma.workspace.findUnique({
      where: { id: this.workspaceId },
    });
    if (!workspace) throw new Error("Workspace not found");

    const inviteToken = Buffer.from(`${contactId}:${Date.now()}`).toString("base64url");
    return `https://n0va.ai/invite/${workspace.slug}?c=${inviteToken}`;
  }

  private async buildResult(
    contact: {
      id: string;
      firstName: string;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      n0vachatId: string | null;
      username: string | null;
      platform: string;
      company: string | null;
      title: string | null;
      avatarUrl: string | null;
    },
    status: "on_platform" | "off_platform" | "new_contact",
  ): Promise<ContactChatResult> {
    const chatLink = await prisma.contactChatLink.findFirst({
      where: { contactId: contact.id },
      orderBy: { lastUsedAt: "desc" },
    });

    const canMessage = status === "on_platform" && contact.n0vachatId !== null;
    const canSaveContact = true;
    const canInvite = status !== "on_platform";

    return {
      contact: {
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        n0vachatId: contact.n0vachatId,
        username: contact.username,
        platform: contact.platform as ContactPlatform,
        company: contact.company,
        title: contact.title,
        avatarUrl: contact.avatarUrl,
      },
      status,
      chatLink: chatLink ? {
        id: chatLink.id,
        channelId: chatLink.channelId,
        status: chatLink.status as ChatLinkStatus,
        platform: chatLink.platform as ContactPlatform,
      } : null,
      actions: {
        canMessage,
        canSaveContact,
        canInvite,
        messageUrl: canMessage && chatLink?.channelId
          ? `/m/chat?c=${chatLink.channelId}`
          : canMessage
            ? `/m/chat?contact=${contact.id}`
            : null,
        inviteUrl: canInvite ? `/m/chat/invite?contact=${contact.id}` : null,
      },
    };
  }
}
