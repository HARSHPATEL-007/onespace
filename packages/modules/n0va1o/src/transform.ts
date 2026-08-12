/**
 * N0VA1O Canonical Schema Transformation — normalizes vendor payloads into
 * N0VA canonical objects (spec §schema transformation).
 *
 * Per-connector transform plugins declare field maps, coercion rules, enum
 * normalization, flatten/nest paths, and date standardization. The gateway
 * applies these so downstream modules only ever see the canonical shape.
 */

export type CanonicalObject = "contact" | "message" | "task" | "event" | "invoice" | "ticket";

export type CoerceKind = "string" | "number" | "boolean" | "date" | "stringArray" | "isoDate";

export interface TransformConfig {
  schemaVersion: string;
  canonicalObject: CanonicalObject;
  /** vendorField -> canonicalField */
  fieldMap: Record<string, string>;
  /** canonicalField -> coercion kind */
  coerce: Partial<Record<string, CoerceKind>>;
  /** canonicalField -> vendor enum value -> canonical enum value */
  enumMap: Partial<Record<string, Record<string, string>>>;
  /** canonicalField -> dotted path to flatten, e.g. "address" -> "location.city" */
  flatten?: Record<string, string>;
  /** canonicalField -> source fields to nest into an object */
  nest?: Record<string, string[]>;
  /** fields dropped before storage (secrets, noise) */
  drop?: string[];
}

export const CANONICAL_SCHEMA_VERSIONS: Record<CanonicalObject, string> = {
  contact: "v1",
  message: "v1",
  task: "v1",
  event: "v1",
  invoice: "v1",
  ticket: "v1",
};

export interface NormalizedRecord {
  canonicalObject: CanonicalObject;
  schemaVersion: string;
  id: string;
  fields: Record<string, unknown>;
  /** flat dotted-path view used for drift checks */
  flatKeys: string[];
  warnings: string[];
}

export interface TransformPlugin {
  provider: string;
  config: TransformConfig;
}

// ── Coercion ──────────────────────────────────────────────────────────

function coerceValue(value: unknown, kind: CoerceKind): { value: unknown; warning?: string } {
  if (value === null || value === undefined) return { value: undefined };
  switch (kind) {
    case "string":
      return { value: String(value) };
    case "number": {
      const n = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
      if (Number.isFinite(n)) return { value: n };
      return { value: undefined, warning: `Cannot coerce ${String(value)} to number` };
    }
    case "boolean":
      if (typeof value === "boolean") return { value };
      if (value === "true" || value === "1" || value === 1) return { value: true };
      if (value === "false" || value === "0" || value === 0) return { value: false };
      return { value: undefined, warning: `Cannot coerce ${String(value)} to boolean` };
    case "date": {
      const d = new Date(value as string | number);
      if (!Number.isNaN(d.getTime())) return { value: d.toISOString() };
      return { value: undefined, warning: `Cannot coerce ${String(value)} to date` };
    }
    case "isoDate": {
      const d = new Date(value as string | number);
      return { value: Number.isNaN(d.getTime()) ? null : d.toISOString() };
    }
    case "stringArray": {
      if (Array.isArray(value)) return { value: value.map((v) => String(v)) };
      if (typeof value === "string") return { value: value.split(",").map((s) => s.trim()).filter(Boolean) };
      return { value: [] };
    }
  }
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

// ── Core normalize ────────────────────────────────────────────────────

export function normalizeRecord(plugin: TransformPlugin, raw: Record<string, unknown>): NormalizedRecord {
  const { config } = plugin;
  const fields: Record<string, unknown> = {};
  const warnings: string[] = [];
  let id = String(raw.id ?? raw._id ?? raw["id_str"] ?? "");

  // 1. Field mapping + coercion + enum normalization.
  for (const [vendorKey, canonicalKey] of Object.entries(config.fieldMap)) {
    let value = raw[vendorKey];
    if (value === undefined) continue;
    const kind = config.coerce[canonicalKey];
    if (kind) {
      const coerced = coerceValue(value, kind);
      value = coerced.value;
      if (coerced.warning) warnings.push(coerced.warning);
      if (value === undefined) continue;
    }
    const enumMap = config.enumMap[canonicalKey];
    if (enumMap && typeof value === "string" && enumMap[value] !== undefined) {
      value = enumMap[value];
    }
    if (canonicalKey === "id") id = String(value);
    fields[canonicalKey] = value;
  }

  // 2. Flatten nested vendor objects into dotted canonical paths.
  for (const [canonicalKey, vendorPath] of Object.entries(config.flatten ?? {})) {
    const value = getPath(raw, vendorPath);
    if (value !== undefined) fields[canonicalKey] = value;
  }

  // 3. Nest flat vendor fields into canonical sub-objects.
  for (const [canonicalKey, sources] of Object.entries(config.nest ?? {})) {
    const nested: Record<string, unknown> = {};
    for (const src of sources) {
      const value = getPath(raw, src);
      if (value !== undefined) nested[src.split(".").pop()!] = value;
    }
    if (Object.keys(nested).length > 0) fields[canonicalKey] = nested;
  }

  // 4. Pass-through unknown keys are dropped unless explicitly mapped —
  //    canonical objects are closed shapes. Drop-list scrubbing.
  for (const dropKey of config.drop ?? []) {
    delete fields[dropKey];
  }

  const flatKeys = Object.keys(flattenObject(fields));
  if (!id) warnings.push("No id found for record");
  return {
    canonicalObject: config.canonicalObject,
    schemaVersion: config.schemaVersion,
    id: id || `auto:${Math.random().toString(36).slice(2, 10)}`,
    fields,
    flatKeys,
    warnings,
  };
}

export function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      Object.assign(out, flattenObject(v as Record<string, unknown>, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

// ── Delta → full record conversion ────────────────────────────────────

/**
 * Merge a delta record into a previous full record. `deltaKeys` marks which
 * fields in the delta are authoritative; everything else is preserved from
 * the previous snapshot.
 */
export function deltaToFull(previous: Record<string, unknown> | null, delta: Record<string, unknown>): Record<string, unknown> {
  return { ...(previous ?? {}), ...delta };
}

// ── Built-in transform plugins ────────────────────────────────────────

export const TRANSFORM_PLUGINS: TransformPlugin[] = [
  {
    provider: "slack",
    config: {
      schemaVersion: "v1",
      canonicalObject: "message",
      fieldMap: {
        ts: "externalId",
        channel: "channel",
        user: "authorExternalId",
        text: "body",
        thread_ts: "threadExternalId",
      },
      coerce: { externalId: "string", threadExternalId: "string" },
      drop: ["attachments", "blocks", "files"],
    },
  },
  {
    provider: "gdrive",
    config: {
      schemaVersion: "v1",
      canonicalObject: "message",
      fieldMap: { id: "externalId", name: "body", modifiedTime: "updatedAt" },
      coerce: { updatedAt: "date" },
    },
  },
  {
    provider: "github",
    config: {
      schemaVersion: "v1",
      canonicalObject: "ticket",
      fieldMap: {
        number: "externalId",
        title: "title",
        state: "status",
        html_url: "url",
        created_at: "createdAt",
        updated_at: "updatedAt",
      },
      coerce: { externalId: "number", createdAt: "date", updatedAt: "date" },
      enumMap: { status: { open: "OPEN", closed: "CLOSED", merged: "MERGED" } },
      nest: { reporter: ["user.login", "user.html_url"] },
    },
  },
  {
    provider: "gmail",
    config: {
      schemaVersion: "v1",
      canonicalObject: "message",
      fieldMap: { id: "externalId", threadId: "threadExternalId", snippet: "body" },
    },
  },
  {
    provider: "hubspot",
    config: {
      schemaVersion: "v1",
      canonicalObject: "contact",
      fieldMap: {
        id: "externalId",
        properties_firstname: "firstName",
        properties_lastname: "lastName",
        properties_email: "email",
        properties_company: "company",
        properties_phone: "phone",
        createdAt: "createdAt",
      },
      coerce: { createdAt: "date" },
    },
  },
];

export function transformPluginFor(provider: string): TransformPlugin {
  return TRANSFORM_PLUGINS.find((p) => p.provider === provider) ?? {
    provider,
    config: {
      schemaVersion: CANONICAL_SCHEMA_VERSIONS.message,
      canonicalObject: "message",
      fieldMap: { id: "externalId" },
      coerce: {},
    },
  };
}
