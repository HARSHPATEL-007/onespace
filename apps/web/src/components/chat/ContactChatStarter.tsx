"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Input, Avatar, Badge, cn } from "@n0va/ui";
import type { Contact, ContactChatLink } from "@n0va/db";

type Platform = "N0VA" | "WHATSAPP" | "TELEGRAM" | "SIGNAL" | "IMESSAGE" | "SMS" | "GOOGLE_CHAT" | "INSTAGRAM" | "MESSENGER" | "SNAPCHAT";
type ChatLinkStatus = "ACTIVE" | "PENDING_INVITE" | "BLOCKED" | "ARCHIVED";

interface ResolvedContact {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  n0vachatId: string | null;
  username: string | null;
  platform: Platform;
  company: string | null;
  title: string | null;
  avatarUrl: string | null;
  address?: string | null;
  website?: string | null;
}

interface ContactChatResult {
  contact: ResolvedContact;
  status: "on_platform" | "off_platform" | "new_contact";
  chatLink: {
    id: string;
    channelId: string | null;
    status: ChatLinkStatus;
    platform: Platform;
  } | null;
  actions: {
    canMessage: boolean;
    canSaveContact: boolean;
    canInvite: boolean;
    messageUrl: string | null;
    inviteUrl: string | null;
  };
}

interface PlatformTarget {
  platform: Platform;
  label: string;
  icon: string;
  available: boolean;
  url: string | null;
}

const PLATFORM_CONFIG: Record<Platform, { label: string; icon: string; color: string }> = {
  N0VA: { label: "N0VA CHAT", icon: "💬", color: "#7c5cfc" },
  WHATSAPP: { label: "WhatsApp", icon: "📱", color: "#25D366" },
  TELEGRAM: { label: "Telegram", icon: "✈️", color: "#0088cc" },
  SIGNAL: { label: "Signal", icon: "🔒", color: "#3A76F0" },
  IMESSAGE: { label: "iMessage", icon: "🍎", color: "#34C759" },
  SMS: { label: "SMS", icon: "💌", color: "#8E8E93" },
  GOOGLE_CHAT: { label: "Google Chat", icon: "📧", color: "#1A73E8" },
  INSTAGRAM: { label: "Instagram", icon: "📷", color: "#E4405F" },
  MESSENGER: { label: "Messenger", icon: "💭", color: "#0084FF" },
  SNAPCHAT: { label: "Snapchat", icon: "👻", color: "#FFFC00" },
};

function detectIdentifierType(value: string): "email" | "phone" | "username" | "n0vachat_id" {
  const trimmed = value.trim();
  if (trimmed.includes("@") && trimmed.includes(".")) return "email";
  if (/^@?[a-zA-Z][a-zA-Z0-9_.]{2,30}$/.test(trimmed)) return "username";
  if (/^\+?\d[\d\s\-().]{6,}$/.test(trimmed)) return "phone";
  if (trimmed.startsWith("nc_") || trimmed.length >= 15) return "n0vachat_id";
  return "n0vachat_id";
}

function buildPlatformTargets(result: ContactChatResult): PlatformTarget[] {
  const { contact, actions } = result;
  const targets: PlatformTarget[] = [];

  if (contact.n0vachatId) {
    targets.push({
      platform: "N0VA",
      label: "Message on N0VA CHAT",
      icon: PLATFORM_CONFIG.N0VA.icon,
      available: true,
      url: actions.messageUrl,
    });
  }

  if (contact.phone) {
    targets.push({
      platform: "WHATSAPP",
      label: "Message on WhatsApp",
      icon: PLATFORM_CONFIG.WHATSAPP.icon,
      available: true,
      url: `https://wa.me/${contact.phone.replace(/[^\d+]/g, "")}`,
    });
    targets.push({
      platform: "SMS",
      label: "Send SMS",
      icon: PLATFORM_CONFIG.SMS.icon,
      available: true,
      url: `sms:${contact.phone.replace(/[^\d+]/g, "")}`,
    });
    targets.push({
      platform: "SIGNAL",
      label: "Message on Signal",
      icon: PLATFORM_CONFIG.SIGNAL.icon,
      available: true,
      url: `sgnl://send?phone=${contact.phone.replace(/[^\d+]/g, "")}`,
    });
    targets.push({
      platform: "IMESSAGE",
      label: "Send iMessage",
      icon: PLATFORM_CONFIG.IMESSAGE.icon,
      available: true,
      url: `imessage:${contact.phone.replace(/[^\d+]/g, "")}`,
    });
  }

  if (contact.email) {
    targets.push({
      platform: "GOOGLE_CHAT",
      label: "Send via Google Chat",
      icon: PLATFORM_CONFIG.GOOGLE_CHAT.icon,
      available: true,
      url: `mailto:${contact.email}`,
    });
  }

  if (contact.username) {
    targets.push({
      platform: "INSTAGRAM",
      label: "Open Instagram DM",
      icon: PLATFORM_CONFIG.INSTAGRAM.icon,
      available: true,
      url: `https://ig.me/m/${contact.username.replace("@", "")}`,
    });
    targets.push({
      platform: "MESSENGER",
      label: "Open Messenger",
      icon: PLATFORM_CONFIG.MESSENGER.icon,
      available: true,
      url: `https://m.me/${contact.username.replace("@", "")}`,
    });
    targets.push({
      platform: "TELEGRAM",
      label: "Message on Telegram",
      icon: PLATFORM_CONFIG.TELEGRAM.icon,
      available: true,
      url: `https://t.me/${contact.username.replace("@", "")}`,
    });
    targets.push({
      platform: "SNAPCHAT",
      label: "Add on Snapchat",
      icon: PLATFORM_CONFIG.SNAPCHAT.icon,
      available: true,
      url: `https://www.snapchat.com/add/${contact.username.replace("@", "")}`,
    });
  }

  if (!contact.n0vachatId && actions.canInvite) {
    targets.push({
      platform: "N0VA",
      label: "Invite to N0VA CHAT",
      icon: "✉️",
      available: true,
      url: actions.inviteUrl,
    });
  }

  return targets;
}

export function ContactChatStarter({
  workspaceId,
  onChatStarted,
}: {
  workspaceId: string;
  onChatStarted?: (channelId: string) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ContactChatResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [messagePreview, setMessagePreview] = useState("");

  const identifierType = query.trim() ? detectIdentifierType(query.trim()) : null;

  const handleResolve = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/contacts/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: query.trim(), workspaceId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to resolve contact");
      }

      const data: ContactChatResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [query, workspaceId]);

  const handleStartChat = useCallback(async () => {
    if (!result) return;
    setLoading(true);

    try {
      const res = await fetch("/api/chats/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: query.trim(),
          workspaceId,
          message: messagePreview || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to start chat");

      const data = await res.json();
      if (data.channelId) {
        onChatStarted?.(data.channelId);
        router.push(`/m/chat?c=${data.channelId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start chat");
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  }, [result, query, workspaceId, messagePreview, router, onChatStarted]);

  const handleSaveContact = useCallback(async () => {
    if (!result) return;
    setLoading(true);

    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          firstName: result.contact.firstName,
          lastName: result.contact.lastName,
          email: result.contact.email,
          phone: result.contact.phone,
          company: result.contact.company,
          title: result.contact.title,
          n0vachatId: result.contact.n0vachatId,
          username: result.contact.username,
          platform: result.contact.platform,
        }),
      });

      if (!res.ok) throw new Error("Failed to save contact");

      const saved = await res.json();
      setResult((prev) => prev ? {
        ...prev,
        contact: { ...prev.contact, id: saved.id },
        status: "on_platform",
      } : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save contact");
    } finally {
      setLoading(false);
    }
  }, [result, workspaceId]);

  const handleInvite = useCallback(async () => {
    if (!result) return;
    setLoading(true);

    try {
      const res = await fetch("/api/contacts/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: result.contact.id,
          workspaceId,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate invite");

      const data = await res.json();
      if (data.inviteUrl) {
        await navigator.clipboard.writeText(data.inviteUrl);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate invite");
    } finally {
      setLoading(false);
    }
  }, [result, workspaceId]);

  const platformTargets = result ? buildPlatformTargets(result) : [];

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ marginBottom: "var(--nv-space-5)" }}>
        <h2 style={{ fontSize: "var(--nv-font-lg)", fontWeight: 800, marginBottom: 6 }}>
          Start a conversation
        </h2>
        <p style={{ color: "var(--nv-color-text-muted)", fontSize: "var(--nv-font-sm)" }}>
          Enter a phone number, email, or username to find or invite someone.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "var(--nv-space-4)" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Input
            placeholder="+91..., name@domain.com, or @username"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleResolve(); }}
            autoComplete="off"
            style={{ paddingLeft: 40 }}
          />
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>
            {identifierType === "email" ? "📧" : identifierType === "phone" ? "📱" : identifierType === "username" ? "👤" : "🔍"}
          </span>
        </div>
        <Button onClick={handleResolve} disabled={!query.trim() || loading}>
          {loading ? "..." : "Find"}
        </Button>
      </div>

      {identifierType && query.trim() && (
        <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: "var(--nv-space-3)" }}>
          Detected: <strong style={{ color: "var(--nv-color-text-muted)" }}>{identifierType.replace("_", " ")}</strong>
          {identifierType === "phone" && " — will route to WhatsApp, Signal, SMS"}
          {identifierType === "email" && " — will route to Google Chat, N0VA"}
          {identifierType === "username" && " — will route to Instagram, Telegram, Messenger"}
          {identifierType === "n0vachat_id" && " — direct N0VA CHAT routing"}
        </div>
      )}

      {error && (
        <div style={{ padding: "var(--nv-space-3)", background: "var(--nv-color-danger-alpha)", borderRadius: "var(--nv-radius-md)", color: "var(--nv-color-danger)", fontSize: "var(--nv-font-sm)", marginBottom: "var(--nv-space-3)" }}>
          {error}
        </div>
      )}

      {result && (
        <div className="nv-card" style={{ padding: "var(--nv-space-5)" }}>
          <ContactCard result={result} />

          <div style={{ marginTop: "var(--nv-space-4)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--nv-color-text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--nv-space-2)" }}>
              Choose how to connect
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {platformTargets.map((target) => (
                <PlatformRouteButton key={target.platform} target={target} />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: "var(--nv-space-4)", paddingTop: "var(--nv-space-4)", borderTop: "1px solid var(--nv-color-border)" }}>
            {result.actions.canMessage && (
              <Button size="sm" onClick={() => setShowConfirm(true)}>
                💬 Message on N0VA
              </Button>
            )}
            {result.actions.canSaveContact && (
              <Button size="sm" variant="secondary" onClick={handleSaveContact} disabled={loading}>
                📇 Save contact
              </Button>
            )}
            {result.actions.canInvite && (
              <Button size="sm" variant="secondary" onClick={handleInvite} disabled={loading}>
                ✉️ Invite to N0VA CHAT
              </Button>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Start N0VA Chat"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={handleStartChat} disabled={loading}>Start Chat</Button>
          </>
        }
      >
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name={`${result.contact.firstName} ${result.contact.lastName ?? ""}`} />
              <div>
                <div style={{ fontWeight: 700 }}>{result.contact.firstName} {result.contact.lastName}</div>
                <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                  {result.contact.n0vachatId ? "✅ On N0VA CHAT" : "⏳ Pending invite"}
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--nv-color-text-faint)", marginBottom: 4 }}>Platform</div>
              <Badge>{PLATFORM_CONFIG[result.contact.platform as Platform]?.label ?? result.contact.platform}</Badge>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--nv-color-text-faint)", marginBottom: 4 }}>Identifier</div>
              <code style={{ fontSize: 12 }}>{query.trim()}</code>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--nv-color-text-faint)", marginBottom: 4 }}>Optional first message</div>
              <Input
                placeholder="Say hello..."
                value={messagePreview}
                onChange={(e) => setMessagePreview(e.target.value)}
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function ContactCard({ result }: { result: ContactChatResult }) {
  const { contact, status } = result;
  const fullName = `${contact.firstName} ${contact.lastName ?? ""}`.trim();

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ position: "relative" }}>
        <Avatar name={fullName} size="lg" />
        {status === "on_platform" && (
          <span style={{ position: "absolute", bottom: -2, right: -2, width: 14, height: 14, borderRadius: "50%", background: "var(--nv-color-success)", border: "2px solid var(--nv-color-surface)" }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "var(--nv-font-md)", fontWeight: 700 }}>{fullName}</span>
          {contact.n0vachatId && <Badge tone="success">Verified</Badge>}
          {status === "new_contact" && <Badge tone="warning">New</Badge>}
        </div>
        {contact.title && contact.company && (
          <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)", marginTop: 2 }}>
            {contact.title} @ {contact.company}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
          {contact.email && (
            <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span>📧</span>
              <a href={`mailto:${contact.email}`} className="nv-link">{contact.email}</a>
            </div>
          )}
          {contact.phone && (
            <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span>📱</span>
              <span>{contact.phone}</span>
            </div>
          )}
          {contact.username && (
            <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span>👤</span>
              <span>@{contact.username}</span>
            </div>
          )}
          {contact.n0vachatId && (
            <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span>💬</span>
              <span style={{ fontFamily: "var(--nv-font-mono)" }}>{contact.n0vachatId}</span>
            </div>
          )}
          {contact.address && (
            <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span>📍</span>
              <span>{contact.address}</span>
            </div>
          )}
          {contact.website && (
            <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span>🌐</span>
              <a href={contact.website} target="_blank" rel="noopener" className="nv-link">{contact.website}</a>
            </div>
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          <Badge tone={status === "on_platform" ? "success" : status === "new_contact" ? "warning" : "neutral"}>
            {status === "on_platform" ? "✅ On N0VA CHAT" : status === "new_contact" ? "🆕 Not yet contacted" : "⏳ Off platform"}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function PlatformRouteButton({ target }: { target: PlatformTarget }) {
  const config = PLATFORM_CONFIG[target.platform];

  return (
    <a
      href={target.url ?? "#"}
      target={target.platform !== "N0VA" ? "_blank" : undefined}
      rel="noopener noreferrer"
      className="nv-sidebar-item"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: "var(--nv-radius-md)",
        border: "1px solid var(--nv-color-border)",
        textDecoration: "none",
        color: "var(--nv-color-text)",
        opacity: target.available ? 1 : 0.5,
        cursor: target.available ? "pointer" : "not-allowed",
      }}
    >
      <span style={{ fontSize: 18 }}>{target.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "var(--nv-font-sm)", fontWeight: 600 }}>{target.label}</div>
        {config && (
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{config.label}</div>
        )}
      </div>
      <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>→</span>
    </a>
  );
}
