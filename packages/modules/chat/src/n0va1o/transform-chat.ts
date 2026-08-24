/**
 * CHAT Canonical Schema Transform — Contact, Message, Task, Event, Invoice, Ticket
 * Extends N0VA1O transform.ts with CHAT-specific plugins, locale-aware formatting,
 * schema discovery/versioning, backward-compatible evolution
 */

import {
  normalizeRecord as baseNormalize,
  transformPluginFor as basePluginFor,
  deltaToFull,
  type TransformPlugin,
  type NormalizedRecord,
  type CanonicalObject,
} from "@n0va/modules-n0va1o/transform";
import { prisma } from "@n0va/db";

export type ChatCanonical = CanonicalObject | "contact" | "message" | "task" | "event" | "invoice" | "ticket";

// Locale-aware formatters
function localeDate(value: string, locale = "en-US"): string {
  try {
    return new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}
function localeNumber(value: number, locale = "en-US"): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

// CHAT-specific plugins with nested flatten, enum normalization, delta-to-full
export const CHAT_TRANSFORM_PLUGINS: TransformPlugin[] = [
  {
    provider: "slack",
    config: {
      schemaVersion: "v3",
      canonicalObject: "message",
      fieldMap: {
        ts: "externalId",
        channel: "channel",
        user: "authorExternalId",
        text: "body",
        thread_ts: "threadExternalId",
        team: "teamId",
        edited_ts: "editedAt",
      },
      coerce: { editedAt: "date" },
      enumMap: {},
      flatten: { "author.name": "user_profile.display_name" },
      drop: ["blocks", "attachments"],
    },
  },
  {
    provider: "msteams",
    config: {
      schemaVersion: "v3",
      canonicalObject: "message",
      fieldMap: {
        id: "externalId",
        conversationId: "channel",
        from: "authorExternalId",
        body_content: "body",
        createdDateTime: "createdAt",
      },
      coerce: { createdAt: "date" },
      enumMap: {},
      flatten: { "author.name": "from.user.displayName" },
    },
  },
  {
    provider: "jira",
    config: {
      schemaVersion: "v3",
      canonicalObject: "ticket",
      fieldMap: {
        key: "externalId",
        summary: "title",
        status_name: "status",
        priority_name: "priority",
        assignee_displayName: "assignee",
        updated: "updatedAt",
        created: "createdAt",
      },
      coerce: { updatedAt: "date", createdAt: "date" },
      enumMap: {
        status: { "To Do": "OPEN", "In Progress": "IN_PROGRESS", Done: "CLOSED" },
        priority: { Highest: "P0", High: "P1", Medium: "P2", Low: "P3" },
      },
      flatten: { "assignee.displayName": "fields.assignee.displayName" },
    },
  },
  {
    provider: "github",
    config: {
      schemaVersion: "v3",
      canonicalObject: "ticket",
      fieldMap: {
        number: "externalId",
        title: "title",
        state: "status",
        html_url: "url",
        body: "description",
        updated_at: "updatedAt",
      },
      coerce: { updatedAt: "date" },
      enumMap: { status: { open: "OPEN", closed: "CLOSED", merged: "MERGED" } },
    },
  },
  {
    provider: "salesforce",
    config: {
      schemaVersion: "v3",
      canonicalObject: "contact",
      fieldMap: {
        Id: "externalId",
        FirstName: "firstName",
        LastName: "lastName",
        Email: "email",
        Company: "company",
        Amount: "amount",
      },
      coerce: { amount: "number" },
      enumMap: {},
      drop: ["attributes"],
    },
  },
  {
    provider: "hubspot",
    config: {
      schemaVersion: "v3",
      canonicalObject: "contact",
      fieldMap: {
        vid: "externalId",
        properties_firstname_value: "firstName",
        properties_email_value: "email",
        properties_company_value: "company",
      },
      coerce: {},
      enumMap: {},
      flatten: { "properties.firstname.value": "properties.firstname.value" },
    },
  },
];

export function chatTransformPluginFor(provider: string): TransformPlugin {
  return CHAT_TRANSFORM_PLUGINS.find((p) => p.provider === provider) ?? basePluginFor(provider);
}

export function normalizeForChat(
  provider: string,
  raw: Record<string, unknown>,
  opts?: { locale?: string; deltaPrevious?: Record<string, unknown> | null },
): NormalizedRecord & { localeFormatted?: Record<string, string> } {
  const plugin = chatTransformPluginFor(provider);
  // delta-to-full conversion if deltaPrevious provided
  const full = opts?.deltaPrevious ? deltaToFull(opts.deltaPrevious as Record<string, unknown>, raw) : raw;
  const rec = baseNormalize(plugin, full as Record<string, unknown>);

  // Locale-aware formatting for dates/numbers in fields
  const localeFormatted: Record<string, string> = {};
  if (opts?.locale) {
    for (const [k, v] of Object.entries(rec.fields)) {
      if (typeof v === "string" && !Number.isNaN(Date.parse(v))) {
        localeFormatted[k] = localeDate(v, opts.locale);
      } else if (typeof v === "number") {
        localeFormatted[k] = localeNumber(v, opts.locale);
      }
    }
  }

  return { ...rec, localeFormatted: Object.keys(localeFormatted).length ? localeFormatted : undefined };
}

/**
 * Schema discovery & versioning — inspect live provider payload shape and record version
 */
export async function discoverChatSchema(provider: string, sample: Record<string, unknown>) {
  const keys = Object.keys(sample).sort();
  const version = `v${keys.length % 5 + 1}`;
  await prisma.connectorEventLog
    .create({
      data: {
        workspaceId: "discovery",
        direction: "INBOUND",
        actionType: "SCHEMA_DISCOVERED",
        canonicalObject: provider,
        payload: { provider, keys, version, sampleKeys: keys.slice(0, 20) },
        status: "SUCCESS",
      },
    })
    .catch(() => {});
  return { provider, keys, version, canonicalObject: chatTransformPluginFor(provider).config.canonicalObject };
}

/**
 * Backward-compatible mapping evolution — add field without breaking old consumers
 */
export function evolveMapping(plugin: TransformPlugin, additions: Partial<TransformPlugin["config"]>): TransformPlugin {
  return {
    provider: plugin.provider,
    config: {
      ...plugin.config,
      fieldMap: { ...plugin.config.fieldMap, ...(additions.fieldMap ?? {}) },
      coerce: { ...plugin.config.coerce, ...(additions.coerce ?? {}) },
      enumMap: { ...plugin.config.enumMap, ...(additions.enumMap ?? {}) },
      schemaVersion: `v${parseInt(plugin.config.schemaVersion.slice(1), 10) + 1}`,
    },
  };
}
