import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

const PLATFORM_CONFIG: Record<string, { label: string; icon: string }> = {
  N0VA: { label: "N0VA CHAT", icon: "💬" },
  WHATSAPP: { label: "WhatsApp", icon: "📱" },
  TELEGRAM: { label: "Telegram", icon: "✈️" },
  SIGNAL: { label: "Signal", icon: "🔒" },
  IMESSAGE: { label: "iMessage", icon: "🍎" },
  SMS: { label: "SMS", icon: "💌" },
  GOOGLE_CHAT: { label: "Google Chat", icon: "📧" },
  INSTAGRAM: { label: "Instagram", icon: "📷" },
  MESSENGER: { label: "Messenger", icon: "💭" },
  SNAPCHAT: { label: "Snapchat", icon: "👻" },
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await requireWorkspace().catch(() => ({ workspaceId: null }));
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, workspaceId },
    include: { chatLinks: true },
  });

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const targets: Array<{
    platform: string;
    label: string;
    icon: string;
    available: boolean;
    url: string | null;
    metadata?: Record<string, string | null>;
  }> = [];

  if (contact.n0vachatId) {
    targets.push({
      platform: "N0VA",
      label: "Message on N0VA CHAT",
      icon: "💬",
      available: true,
      url: `/m/chat?contact=${contact.id}`,
    });
  }

  if (contact.phone) {
    const phoneClean = contact.phone.replace(/[^\d+]/g, "");
    targets.push(
      { platform: "WHATSAPP", label: "WhatsApp", icon: "📱", available: true, url: `https://wa.me/${phoneClean}` },
      { platform: "TELEGRAM", label: "Telegram", icon: "✈️", available: true, url: `https://t.me/${phoneClean}` },
      { platform: "SIGNAL", label: "Signal", icon: "🔒", available: true, url: `sgnl://send?phone=${phoneClean}` },
      { platform: "IMESSAGE", label: "iMessage", icon: "🍎", available: true, url: `imessage:${phoneClean}` },
      { platform: "SMS", label: "SMS", icon: "💌", available: true, url: `sms:${phoneClean}` },
    );
  }

  if (contact.email) {
    targets.push({
      platform: "GOOGLE_CHAT",
      label: "Email via Google",
      icon: "📧",
      available: true,
      url: `mailto:${contact.email}`,
    });
  }

  if (contact.username) {
    const un = contact.username.replace("@", "");
    targets.push(
      { platform: "INSTAGRAM", label: "Instagram DM", icon: "📷", available: true, url: `https://ig.me/m/${un}` },
      { platform: "MESSENGER", label: "Messenger", icon: "💭", available: true, url: `https://m.me/${un}` },
      { platform: "TELEGRAM", label: "Telegram", icon: "✈️", available: true, url: `https://t.me/${un}` },
      { platform: "SNAPCHAT", label: "Snapchat", icon: "👻", available: true, url: `https://www.snapchat.com/add/${un}` },
    );
  }

  if (!contact.n0vachatId) {
    targets.push({
      platform: "N0VA",
      label: "Invite to N0VA CHAT",
      icon: "✉️",
      available: true,
      url: `/m/chat/invite?contact=${contact.id}`,
    });
  }

  return NextResponse.json({ contact, targets });
}
