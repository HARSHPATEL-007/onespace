/**
 * Cloud, storage, CRM, and productivity adapters.
 * Merged into ADAPTERS via adapters-extra.ts.
 */
import type { Integration } from "@n0va/db";
import type { AdapterContext, AdapterResult } from "./adapters";
import { cfgOf, tokenOf, providerHeaders, fetchJson, fetchPostJson } from "./adapters";

/* ------------------------------------------------------------------ */
/*  Google Drive                                                       */
/* ------------------------------------------------------------------ */

const gdrive = {
  "gdrive:list_files": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const folderId = String((input as Record<string, unknown>).folderId ?? "root");
    const q = folderId === "root" ? "'root' in parents and trashed=false" : `'${folderId}' in parents and trashed=false`;
    const r = await fetchJson(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=20&fields=files(id,name,mimeType,modifiedTime)`, {
      headers: providerHeaders(integration, "gdrive"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Google Drive: list_files failed — ${r.err}` };
    const d = r.data as { files?: Array<{ name?: string; mimeType?: string }> };
    const files = d.files ?? [];
    return { statusCode: 200, ok: true, message: `Google Drive: ${files.length} files${files[0] ? `; first: ${files[0].name}` : ""}`.slice(0, 240) };
  },
  "gdrive:read_doc": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const fileId = String((input as Record<string, unknown>).fileId ?? input.id ?? "");
    if (!fileId) return { statusCode: 400, ok: false, message: "Google Drive: read_doc requires fileId" };
    const r = await fetchJson(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, {
      headers: providerHeaders(integration, "gdrive"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Google Drive: read_doc failed — ${r.err}` };
    const text = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    return { statusCode: 200, ok: true, message: `Google Drive: exported ${text.length} chars`.slice(0, 240) };
  },
  "gdrive:upload_file": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const name = String((input as Record<string, unknown>).name ?? "upload.txt");
    const content = String((input as Record<string, unknown>).content ?? "");
    const metadata = { name, mimeType: "text/plain" };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([content], { type: "text/plain" }));
    const r = await fetchJson("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenOf(integration)}` },
      body: form,
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Google Drive: upload_file failed — ${r.err}` };
    const d = r.data as { id?: string; name?: string };
    return { statusCode: 201, ok: true, message: `Google Drive: uploaded ${d.name ?? name} (${d.id ?? "n/a"})` };
  },
  "gdrive:delete_file": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const fileId = String((input as Record<string, unknown>).fileId ?? input.id ?? "");
    if (!fileId) return { statusCode: 400, ok: false, message: "Google Drive: delete_file requires fileId" };
    const r = await fetchJson(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: providerHeaders(integration, "gdrive"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Google Drive: delete_file failed — ${r.err}` };
    return { statusCode: 200, ok: true, message: `Google Drive: file ${fileId} trashed` };
  },
};

/* ------------------------------------------------------------------ */
/*  Google Calendar                                                    */
/* ------------------------------------------------------------------ */

const gcal = {
  "gcal:list_events": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const calId = String((input as Record<string, unknown>).calendarId ?? "primary");
    const params = new URLSearchParams({ maxResults: "20", singleEvents: "true", orderBy: "startTime" });
    const r = await fetchJson(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`, {
      headers: providerHeaders(integration, "gcal"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Google Calendar: list_events failed — ${r.err}` };
    const d = r.data as { items?: Array<{ summary?: string; start?: { dateTime?: string } }> };
    const events = d.items ?? [];
    return { statusCode: 200, ok: true, message: `Google Calendar: ${events.length} events${events[0] ? `; next: ${events[0].summary} at ${events[0].start?.dateTime}` : ""}`.slice(0, 240) };
  },
  "gcal:create_event": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const calId = String((input as Record<string, unknown>).calendarId ?? "primary");
    const summary = String((input as Record<string, unknown>).summary ?? "New event");
    const start = String((input as Record<string, unknown>).start ?? new Date().toISOString());
    const end = String((input as Record<string, unknown>).end ?? new Date(Date.now() + 3600000).toISOString());
    const event = { summary, start: { dateTime: start }, end: { dateTime: end } };
    const r = await fetchPostJson(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`, integration, "gcal", event);
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Google Calendar: create_event failed — ${r.err}` };
    const d = r.data as { id?: string; htmlLink?: string };
    return { statusCode: 201, ok: true, message: `Google Calendar: event created — ${d.htmlLink ?? d.id ?? ""}`.slice(0, 240) };
  },
  "gcal:cancel_event": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const calId = String((input as Record<string, unknown>).calendarId ?? "primary");
    const eventId = String((input as Record<string, unknown>).eventId ?? input.id ?? "");
    if (!eventId) return { statusCode: 400, ok: false, message: "Google Calendar: cancel_event requires eventId" };
    const r = await fetchJson(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: providerHeaders(integration, "gcal"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Google Calendar: cancel_event failed — ${r.err}` };
    return { statusCode: 200, ok: true, message: `Google Calendar: event ${eventId} cancelled` };
  },
};

/* ------------------------------------------------------------------ */
/*  Google Sheets                                                      */
/* ------------------------------------------------------------------ */

const gsheets = {
  "gsheets:read_range": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const spreadsheetId = String((input as Record<string, unknown>).spreadsheetId ?? input.id ?? "");
    const range = String((input as Record<string, unknown>).range ?? "Sheet1!A1:D10");
    if (!spreadsheetId) return { statusCode: 400, ok: false, message: "Google Sheets: read_range requires spreadsheetId" };
    const r = await fetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`, {
      headers: providerHeaders(integration, "gsheets"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Google Sheets: read_range failed — ${r.err}` };
    const d = r.data as { values?: string[][] };
    const rows = d.values ?? [];
    return { statusCode: 200, ok: true, message: `Google Sheets: ${rows.length} rows × ${rows[0]?.length ?? 0} cols`.slice(0, 240) };
  },
  "gsheets:append_row": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const spreadsheetId = String((input as Record<string, unknown>).spreadsheetId ?? input.id ?? "");
    const range = String((input as Record<string, unknown>).range ?? "Sheet1!A1");
    const values = (input as Record<string, unknown>).values as string[] | undefined;
    if (!spreadsheetId || !values) return { statusCode: 400, ok: false, message: "Google Sheets: append_row requires spreadsheetId and values" };
    const r = await fetchPostJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`, integration, "gsheets", { values: [values] });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Google Sheets: append_row failed — ${r.err}` };
    const d = r.data as { updates?: { updatedRows?: number } };
    return { statusCode: 200, ok: true, message: `Google Sheets: appended ${d.updates?.updatedRows ?? 1} row(s)` };
  },
  "gsheets:write_range": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const spreadsheetId = String((input as Record<string, unknown>).spreadsheetId ?? input.id ?? "");
    const range = String((input as Record<string, unknown>).range ?? "Sheet1!A1");
    const values = (input as Record<string, unknown>).values as string[][] | undefined;
    if (!spreadsheetId || !values) return { statusCode: 400, ok: false, message: "Google Sheets: write_range requires spreadsheetId and values" };
    const r = await fetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      headers: { ...providerHeaders(integration, "gsheets"), "content-type": "application/json" },
      body: JSON.stringify({ values }),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Google Sheets: write_range failed — ${r.err}` };
    const d = r.data as { updatedCells?: number };
    return { statusCode: 200, ok: true, message: `Google Sheets: wrote ${d.updatedCells ?? 0} cells` };
  },
};

/* ------------------------------------------------------------------ */
/*  Google Forms                                                       */
/* ------------------------------------------------------------------ */

const gforms = {
  "gforms:list_forms": async ({ integration }: AdapterContext): Promise<AdapterResult> => {
    return { statusCode: 501, ok: false, message: "Google Forms: list_forms requires Google Forms API (not Drive). Use the Forms API v1 with a Google Cloud project." };
  },
  "gforms:list_responses": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const formId = String((input as Record<string, unknown>).formId ?? input.id ?? "");
    if (!formId) return { statusCode: 400, ok: false, message: "Google Forms: list_responses requires formId" };
    const r = await fetchJson(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}/responses`, {
      headers: providerHeaders(integration, "gforms"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Google Forms: list_responses failed — ${r.err}` };
    const d = r.data as { responses?: Array<{ respondTime?: string }> };
    const responses = d.responses ?? [];
    return { statusCode: 200, ok: true, message: `Google Forms: ${responses.length} responses collected`.slice(0, 240) };
  },
};

/* ------------------------------------------------------------------ */
/*  Google Tasks                                                       */
/* ------------------------------------------------------------------ */

const gtasks = {
  "gtasks:list_tasks": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const tasklist = String((input as Record<string, unknown>).tasklist ?? "@default");
    const r = await fetchJson(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklist)}/tasks?maxResults=20`, {
      headers: providerHeaders(integration, "gtasks"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Google Tasks: list_tasks failed — ${r.err}` };
    const d = r.data as { items?: Array<{ title?: string; status?: string }> };
    const tasks = d.items ?? [];
    return { statusCode: 200, ok: true, message: `Google Tasks: ${tasks.length} tasks (${tasks.filter(t => t.status !== "completed").length} open)`.slice(0, 240) };
  },
  "gtasks:create_task": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const tasklist = String((input as Record<string, unknown>).tasklist ?? "@default");
    const title = String((input as Record<string, unknown>).title ?? "New task");
    const r = await fetchPostJson(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklist)}/tasks`, integration, "gtasks", { title });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Google Tasks: create_task failed — ${r.err}` };
    const d = r.data as { id?: string; title?: string };
    return { statusCode: 201, ok: true, message: `Google Tasks: created "${d.title ?? title}" (${d.id ?? "n/a"})` };
  },
};

/* ------------------------------------------------------------------ */
/*  OneDrive                                                           */
/* ------------------------------------------------------------------ */

const onedrive = {
  "onedrive:list_files": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const folderId = (input as Record<string, unknown>).folderId;
    const path = folderId ? `/items/${encodeURIComponent(String(folderId))}/children` : "/drive/root/children";
    const r = await fetchJson(`https://graph.microsoft.com/v1.0/me/drive${path}?$top=20&$select=name,file,folder,lastModifiedDateTime`, {
      headers: providerHeaders(integration, "onedrive"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `OneDrive: list_files failed — ${r.err}` };
    const d = r.data as { value?: Array<{ name?: string; file?: unknown }> };
    const items = d.value ?? [];
    return { statusCode: 200, ok: true, message: `OneDrive: ${items.length} items${items[0] ? `; first: ${items[0].name}` : ""}`.slice(0, 240) };
  },
  "onedrive:upload_file": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const name = String((input as Record<string, unknown>).name ?? "upload.txt");
    const content = String((input as Record<string, unknown>).content ?? "");
    const r = await fetchJson(`https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(name)}:/content`, {
      method: "PUT",
      headers: { ...providerHeaders(integration, "onedrive"), "content-type": "text/plain" },
      body: content,
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `OneDrive: upload_file failed — ${r.err}` };
    const d = r.data as { id?: string; name?: string };
    return { statusCode: 201, ok: true, message: `OneDrive: uploaded ${d.name ?? name} (${d.id ?? "n/a"})` };
  },
};

/* ------------------------------------------------------------------ */
/*  Microsoft Teams                                                    */
/* ------------------------------------------------------------------ */

const teams = {
  "teams:post_chat": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const channelId = String((input as Record<string, unknown>).channelId ?? "");
    const teamId = String((input as Record<string, unknown>).teamId ?? "");
    const content = String((input as Record<string, unknown>).content ?? "");
    if (!teamId || !channelId) return { statusCode: 400, ok: false, message: "Teams: post_chat requires teamId and channelId" };
    const r = await fetchPostJson(`https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`, integration, "teams", {
      body: { content, contentType: "text" },
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Teams: post_chat failed — ${r.err}` };
    const d = r.data as { id?: string };
    return { statusCode: 201, ok: true, message: `Teams: message posted (${d.id ?? "n/a"})` };
  },
  "teams:list_teams": async ({ integration }: AdapterContext): Promise<AdapterResult> => {
    const r = await fetchJson("https://graph.microsoft.com/v1.0/me/joinedTeams?$select=displayName,id", {
      headers: providerHeaders(integration, "teams"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Teams: list_teams failed — ${r.err}` };
    const d = r.data as { value?: Array<{ displayName?: string }> };
    const teams = d.value ?? [];
    return { statusCode: 200, ok: true, message: `Teams: ${teams.length} teams${teams[0] ? `; first: ${teams[0].displayName}` : ""}`.slice(0, 240) };
  },
  "teams:start_meeting": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const subject = String((input as Record<string, unknown>).subject ?? "N0VA1O Meeting");
    const r = await fetchPostJson("https://graph.microsoft.com/v1.0/me/onlineMeetings", integration, "teams", {
      subject, startDateTime: new Date().toISOString(), endDateTime: new Date(Date.now() + 3600000).toISOString(),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Teams: start_meeting failed — ${r.err}` };
    const d = r.data as { joinUrl?: string; id?: string };
    return { statusCode: 201, ok: true, message: `Teams: meeting created — ${d.joinUrl ?? d.id ?? ""}`.slice(0, 240) };
  },
};

/* ------------------------------------------------------------------ */
/*  Dropbox                                                            */
/* ------------------------------------------------------------------ */

const dropbox = {
  "dropbox:list_files": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const path = String((input as Record<string, unknown>).path ?? "");
    const r = await fetchPostJson("https://api.dropboxapi.com/2/files/list_folder", integration, "dropbox", { path, limit: 20 });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Dropbox: list_files failed — ${r.err}` };
    const d = r.data as { entries?: Array<{ name?: string; ".tag"?: string }> };
    const entries = d.entries ?? [];
    return { statusCode: 200, ok: true, message: `Dropbox: ${entries.length} items${entries[0] ? `; first: ${entries[0].name}` : ""}`.slice(0, 240) };
  },
  "dropbox:upload_file": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const path = String((input as Record<string, unknown>).path ?? "/upload.txt");
    const content = String((input as Record<string, unknown>).content ?? "");
    const r = await fetchJson("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenOf(integration)}`,
        "content-type": "application/octet-stream",
        "dropbox-api-arg": JSON.stringify({ path, mode: "add", autorename: true, mute: false }),
      },
      body: content,
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Dropbox: upload_file failed — ${r.err}` };
    const d = r.data as { id?: string; name?: string };
    return { statusCode: 200, ok: true, message: `Dropbox: uploaded ${d.name ?? path} (${d.id ?? "n/a"})` };
  },
  "dropbox:share_link": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const path = String((input as Record<string, unknown>).path ?? "");
    if (!path) return { statusCode: 400, ok: false, message: "Dropbox: share_link requires path" };
    const r = await fetchPostJson("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", integration, "dropbox", { path });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Dropbox: share_link failed — ${r.err}` };
    const d = r.data as { url?: string; name?: string };
    return { statusCode: 200, ok: true, message: `Dropbox: shared ${d.name ?? path} — ${d.url ?? ""}`.slice(0, 240) };
  },
};

/* ------------------------------------------------------------------ */
/*  Box                                                                */
/* ------------------------------------------------------------------ */

const box = {
  "box:list_files": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const folderId = String((input as Record<string, unknown>).folderId ?? "0");
    const r = await fetchJson(`https://api.box.com/2.0/folders/${encodeURIComponent(folderId)}/items?limit=20`, {
      headers: providerHeaders(integration, "box"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Box: list_files failed — ${r.err}` };
    const d = r.data as { entries?: Array<{ name?: string; type?: string }> };
    const entries = d.entries ?? [];
    return { statusCode: 200, ok: true, message: `Box: ${entries.length} items${entries[0] ? `; first: ${entries[0].name}` : ""}`.slice(0, 240) };
  },
  "box:upload_file": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const name = String((input as Record<string, unknown>).name ?? "upload.txt");
    const content = String((input as Record<string, unknown>).content ?? "");
    const folderId = String((input as Record<string, unknown>).folderId ?? "0");
    const form = new FormData();
    form.append("attributes", JSON.stringify({ name, parent: { id: folderId } }));
    form.append("file", new Blob([content], { type: "text/plain" }), name);
    const r = await fetchJson("https://upload.box.com/api/2.0/files/content", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenOf(integration)}` },
      body: form,
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Box: upload_file failed — ${r.err}` };
    const d = r.data as { entries?: Array<{ id?: string; name?: string }> };
    const file = d.entries?.[0];
    return { statusCode: 201, ok: true, message: `Box: uploaded ${file?.name ?? name} (${file?.id ?? "n/a"})` };
  },
  "box:delete_file": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const fileId = String((input as Record<string, unknown>).fileId ?? input.id ?? "");
    if (!fileId) return { statusCode: 400, ok: false, message: "Box: delete_file requires fileId" };
    const r = await fetchJson(`https://api.box.com/2.0/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: providerHeaders(integration, "box"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Box: delete_file failed — ${r.err}` };
    return { statusCode: 200, ok: true, message: `Box: file ${fileId} deleted` };
  },
};

/* ------------------------------------------------------------------ */
/*  Salesforce                                                         */
/* ------------------------------------------------------------------ */

const salesforce = {
  "salesforce:query": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const c = cfgOf(integration);
    const instanceUrl = typeof c.instanceUrl === "string" ? c.instanceUrl.replace(/\/$/, "") : "";
    if (!instanceUrl) return { statusCode: 400, ok: false, message: "Salesforce: query requires instanceUrl in config" };
    const soql = String((input as Record<string, unknown>).q ?? input.query ?? "SELECT Id, Name FROM Account LIMIT 10");
    const r = await fetchJson(`${instanceUrl}/services/data/v58.0/query?q=${encodeURIComponent(soql)}`, {
      headers: providerHeaders(integration, "salesforce"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Salesforce: query failed — ${r.err}` };
    const d = r.data as { records?: Array<{ Name?: string }>; totalSize?: number };
    return { statusCode: 200, ok: true, message: `Salesforce: ${d.totalSize ?? d.records?.length ?? 0} records${d.records?.[0] ? `; first: ${d.records[0].Name}` : ""}`.slice(0, 240) };
  },
  "salesforce:create_record": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const c = cfgOf(integration);
    const instanceUrl = typeof c.instanceUrl === "string" ? c.instanceUrl.replace(/\/$/, "") : "";
    const objectType = String((input as Record<string, unknown>).objectType ?? input.type ?? "Account");
    const fields = ((input as Record<string, unknown>).fields ?? {}) as Record<string, unknown>;
    if (!instanceUrl) return { statusCode: 400, ok: false, message: "Salesforce: create_record requires instanceUrl in config" };
    const r = await fetchPostJson(`${instanceUrl}/services/data/v58.0/sobjects/${encodeURIComponent(objectType)}`, integration, "salesforce", fields);
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Salesforce: create_record failed — ${r.err}` };
    const d = r.data as { id?: string; success?: boolean };
    return { statusCode: 201, ok: true, message: `Salesforce: ${objectType} created (${d.id ?? "n/a"})` };
  },
  "salesforce:update_record": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const c = cfgOf(integration);
    const instanceUrl = typeof c.instanceUrl === "string" ? c.instanceUrl.replace(/\/$/, "") : "";
    const objectType = String((input as Record<string, unknown>).objectType ?? input.type ?? "Account");
    const recordId = String((input as Record<string, unknown>).id ?? "");
    const fields = ((input as Record<string, unknown>).fields ?? {}) as Record<string, unknown>;
    if (!instanceUrl || !recordId) return { statusCode: 400, ok: false, message: "Salesforce: update_record requires instanceUrl and id" };
    const r = await fetchJson(`${instanceUrl}/services/data/v58.0/sobjects/${encodeURIComponent(objectType)}/${encodeURIComponent(recordId)}`, {
      method: "PATCH",
      headers: { ...providerHeaders(integration, "salesforce"), "content-type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Salesforce: update_record failed — ${r.err}` };
    return { statusCode: 200, ok: true, message: `Salesforce: ${objectType} ${recordId} updated` };
  },
  "salesforce:delete_record": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const c = cfgOf(integration);
    const instanceUrl = typeof c.instanceUrl === "string" ? c.instanceUrl.replace(/\/$/, "") : "";
    const objectType = String((input as Record<string, unknown>).objectType ?? input.type ?? "Account");
    const recordId = String((input as Record<string, unknown>).id ?? "");
    if (!instanceUrl || !recordId) return { statusCode: 400, ok: false, message: "Salesforce: delete_record requires instanceUrl and id" };
    const r = await fetchJson(`${instanceUrl}/services/data/v58.0/sobjects/${encodeURIComponent(objectType)}/${encodeURIComponent(recordId)}`, {
      method: "DELETE",
      headers: providerHeaders(integration, "salesforce"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Salesforce: delete_record failed — ${r.err}` };
    return { statusCode: 200, ok: true, message: `Salesforce: ${objectType} ${recordId} deleted` };
  },
};

/* ------------------------------------------------------------------ */
/*  Pipedrive                                                         */
/* ------------------------------------------------------------------ */

const pipedrive = {
  "pipedrive:list_deals": async ({ integration }: AdapterContext): Promise<AdapterResult> => {
    const c = cfgOf(integration);
    const company = typeof c.company === "string" ? c.company : "";
    const r = await fetchJson(`https://api.pipedrive.com/v1/deals?api_token=${encodeURIComponent(tokenOf(integration))}&limit=10`, {
      headers: providerHeaders(integration, "pipedrive"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Pipedrive: list_deals failed — ${r.err}` };
    const d = r.data as { data?: Array<{ title?: string; value?: number }> };
    const deals = d.data ?? [];
    return { statusCode: 200, ok: true, message: `Pipedrive: ${deals.length} deals${deals[0] ? `; first: ${deals[0].title} ($${deals[0].value})` : ""}`.slice(0, 240) };
  },
  "pipedrive:create_deal": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const title = String((input as Record<string, unknown>).title ?? "New deal");
    const value = Number((input as Record<string, unknown>).value ?? 0);
    const r = await fetchPostJson(`https://api.pipedrive.com/v1/deals?api_token=${encodeURIComponent(tokenOf(integration))}`, integration, "pipedrive", { title, value });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Pipedrive: create_deal failed — ${r.err}` };
    const d = r.data as { id?: number; title?: string };
    return { statusCode: 201, ok: true, message: `Pipedrive: deal "${d.title ?? title}" created (${d.id ?? "n/a"})` };
  },
  "pipedrive:move_stage": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const dealId = String((input as Record<string, unknown>).dealId ?? input.id ?? "");
    const stageId = Number((input as Record<string, unknown>).stageId ?? 0);
    if (!dealId || !stageId) return { statusCode: 400, ok: false, message: "Pipedrive: move_stage requires dealId and stageId" };
    const r = await fetchPostJson(`https://api.pipedrive.com/v1/deals/${encodeURIComponent(dealId)}?api_token=${encodeURIComponent(tokenOf(integration))}`, integration, "pipedrive", { stage_id: stageId });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Pipedrive: move_stage failed — ${r.err}` };
    return { statusCode: 200, ok: true, message: `Pipedrive: deal ${dealId} moved to stage ${stageId}` };
  },
};

/* ------------------------------------------------------------------ */
/*  Trello                                                             */
/* ------------------------------------------------------------------ */

const trello = {
  "trello:list_cards": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const boardId = String((input as Record<string, unknown>).boardId ?? input.id ?? "");
    if (!boardId) return { statusCode: 400, ok: false, message: "Trello: list_cards requires boardId" };
    const c = cfgOf(integration);
    const key = typeof c.key === "string" ? c.key : "";
    const r = await fetchJson(`https://api.trello.com/1/boards/${encodeURIComponent(boardId)}/cards?key=${encodeURIComponent(key)}&token=${encodeURIComponent(tokenOf(integration))}&fields=name,list`, {
      headers: providerHeaders(integration, "trello"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Trello: list_cards failed — ${r.err}` };
    const cards = r.data as Array<{ name?: string; list?: { name?: string } }>;
    return { statusCode: 200, ok: true, message: `Trello: ${cards.length} cards${cards[0] ? `; first: ${cards[0].name} (${cards[0].list?.name})` : ""}`.slice(0, 240) };
  },
  "trello:create_card": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const listId = String((input as Record<string, unknown>).listId ?? "");
    const name = String((input as Record<string, unknown>).name ?? "New card");
    if (!listId) return { statusCode: 400, ok: false, message: "Trello: create_card requires listId" };
    const c = cfgOf(integration);
    const key = typeof c.key === "string" ? c.key : "";
    const r = await fetchPostJson(`https://api.trello.com/1/cards?key=${encodeURIComponent(key)}&token=${encodeURIComponent(tokenOf(integration))}&idList=${encodeURIComponent(listId)}&name=${encodeURIComponent(name)}`, integration, "trello", {});
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Trello: create_card failed — ${r.err}` };
    const d = r.data as { id?: string; name?: string };
    return { statusCode: 201, ok: true, message: `Trello: card "${d.name ?? name}" created (${d.id ?? "n/a"})` };
  },
  "trello:move_card": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const cardId = String((input as Record<string, unknown>).cardId ?? input.id ?? "");
    const listId = String((input as Record<string, unknown>).listId ?? "");
    if (!cardId || !listId) return { statusCode: 400, ok: false, message: "Trello: move_card requires cardId and listId" };
    const c = cfgOf(integration);
    const key = typeof c.key === "string" ? c.key : "";
    const r = await fetchPostJson(`https://api.trello.com/1/cards/${encodeURIComponent(cardId)}?key=${encodeURIComponent(key)}&token=${encodeURIComponent(tokenOf(integration))}&idList=${encodeURIComponent(listId)}`, integration, "trello", {});
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Trello: move_card failed — ${r.err}` };
    return { statusCode: 200, ok: true, message: `Trello: card ${cardId} moved to list ${listId}` };
  },
};

/* ------------------------------------------------------------------ */
/*  Monday.com                                                         */
/* ------------------------------------------------------------------ */

const monday = {
  "monday:list_items": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const boardId = String((input as Record<string, unknown>).boardId ?? input.id ?? "");
    if (!boardId) return { statusCode: 400, ok: false, message: "Monday: list_items requires boardId" };
    const query = `query { boards(ids: ${boardId}) { items_page(limit: 20) { items { name column_values { text } } } } }`;
    const r = await fetchPostJson("https://api.monday.com/v2", integration, "monday", { query });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Monday: list_items failed — ${r.err}` };
    const d = r.data as { data?: { boards?: Array<{ items_page?: { items?: Array<{ name?: string }> } }> } };
    const items = d.data?.boards?.[0]?.items_page?.items ?? [];
    return { statusCode: 200, ok: true, message: `Monday: ${items.length} items${items[0] ? `; first: ${items[0].name}` : ""}`.slice(0, 240) };
  },
  "monday:create_item": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const boardId = String((input as Record<string, unknown>).boardId ?? input.id ?? "");
    const itemName = String((input as Record<string, unknown>).itemName ?? input.name ?? "New item");
    if (!boardId) return { statusCode: 400, ok: false, message: "Monday: create_item requires boardId" };
    const query = `mutation { create_item(board_id: ${boardId}, item_name: "${itemName.replace(/"/g, '\\"')}") { id name } }`;
    const r = await fetchPostJson("https://api.monday.com/v2", integration, "monday", { query });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Monday: create_item failed — ${r.err}` };
    const d = r.data as { data?: { create_item?: { id?: number; name?: string } } };
    return { statusCode: 201, ok: true, message: `Monday: item "${d.data?.create_item?.name ?? itemName}" created (${d.data?.create_item?.id ?? "n/a"})` };
  },
  "monday:update_item": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const boardId = String((input as Record<string, unknown>).boardId ?? "");
    const itemId = String((input as Record<string, unknown>).itemId ?? input.id ?? "");
    if (!boardId || !itemId) return { statusCode: 400, ok: false, message: "Monday: update_item requires boardId and itemId" };
    const query = `mutation { change_column_value(board_id: ${boardId}, item_id: ${itemId}, column_id: "text", value: "updated") { id } }`;
    const r = await fetchPostJson("https://api.monday.com/v2", integration, "monday", { query });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Monday: update_item failed — ${r.err}` };
    return { statusCode: 200, ok: true, message: `Monday: item ${itemId} updated` };
  },
};

/* ------------------------------------------------------------------ */
/*  Xero                                                               */
/* ------------------------------------------------------------------ */

const xero = {
  "xero:list_invoices": async ({ integration }: AdapterContext): Promise<AdapterResult> => {
    const r = await fetchJson("https://api.xero.com/api.xro/2.0/Invoices?order=Date DESC&unitdp=2", {
      headers: providerHeaders(integration, "xero"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Xero: list_invoices failed — ${r.err}` };
    const d = r.data as { Invoices?: Array<{ InvoiceNumber?: string; Total?: number; Status?: string }> };
    const invoices = d.Invoices ?? [];
    return { statusCode: 200, ok: true, message: `Xero: ${invoices.length} invoices${invoices[0] ? `; first: #${invoices[0].InvoiceNumber} $${invoices[0].Total} (${invoices[0].Status})` : ""}`.slice(0, 240) };
  },
  "xero:create_invoice": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const contactId = String((input as Record<string, unknown>).contactId ?? "");
    const description = String((input as Record<string, unknown>).description ?? "N0VA1O service");
    const amount = Number((input as Record<string, unknown>).amount ?? 0);
    if (!contactId) return { statusCode: 400, ok: false, message: "Xero: create_invoice requires contactId" };
    const invoice = { Type: "ACCREC", Contact: { ContactID: contactId }, LineItems: [{ Description: description, Quantity: "1", UnitAmount: String(amount), AccountCode: "200" }], Status: "DRAFT" };
    const r = await fetchPostJson("https://api.xero.com/api.xro/2.0/Invoices", integration, "xero", { Invoices: [invoice] });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Xero: create_invoice failed — ${r.err}` };
    const d = r.data as { Invoices?: Array<{ InvoiceID?: string; InvoiceNumber?: string }> };
    const inv = d.Invoices?.[0];
    return { statusCode: 201, ok: true, message: `Xero: invoice ${inv?.InvoiceNumber ?? "created"} (${inv?.InvoiceID ?? "n/a"})` };
  },
  "xero:get_balance": async ({ integration }: AdapterContext): Promise<AdapterResult> => {
    const r = await fetchJson("https://api.xero.com/api.xro/2.0/Accounts?where=Type==%22BANK%22", {
      headers: providerHeaders(integration, "xero"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Xero: get_balance failed — ${r.err}` };
    const d = r.data as { Accounts?: Array<{ Name?: string; BankAccountNumber?: string }> };
    const accounts = d.Accounts ?? [];
    return { statusCode: 200, ok: true, message: `Xero: ${accounts.length} bank accounts${accounts[0] ? `; ${accounts[0].Name} (${accounts[0].BankAccountNumber})` : ""}`.slice(0, 240) };
  },
};

/* ------------------------------------------------------------------ */
/*  QuickBooks                                                         */
/* ------------------------------------------------------------------ */

const quickbooks = {
  "quickbooks:list_invoices": async ({ integration }: AdapterContext): Promise<AdapterResult> => {
    const c = cfgOf(integration);
    const realmId = typeof c.realmId === "string" ? c.realmId : "";
    const r = await fetchJson(`https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent("SELECT * FROM Invoice MAXRESULTS 10")}`, {
      headers: providerHeaders(integration, "quickbooks"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `QuickBooks: list_invoices failed — ${r.err}` };
    const d = r.data as { QueryResponse?: { Invoice?: Array<{ DocNumber?: string; TotalAmt?: number }> } };
    const invoices = d.QueryResponse?.Invoice ?? [];
    return { statusCode: 200, ok: true, message: `QuickBooks: ${invoices.length} invoices${invoices[0] ? `; #${invoices[0].DocNumber} $${invoices[0].TotalAmt}` : ""}`.slice(0, 240) };
  },
  "quickbooks:create_invoice": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const c = cfgOf(integration);
    const realmId = typeof c.realmId === "string" ? c.realmId : "";
    const customerId = String((input as Record<string, unknown>).customerId ?? input.id ?? "");
    const amount = Number((input as Record<string, unknown>).amount ?? 0);
    if (!customerId) return { statusCode: 400, ok: false, message: "QuickBooks: create_invoice requires customerId" };
    const invoice = { CustomerRef: { value: customerId }, Line: [{ Amount: amount, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: "1", name: "Services" } } }] };
    const r = await fetchPostJson(`https://quickbooks.api.intuit.com/v3/company/${realmId}/invoice`, integration, "quickbooks", invoice);
    if (!r.ok) return { statusCode: r.status, ok: false, message: `QuickBooks: create_invoice failed — ${r.err}` };
    const d = r.data as { Invoice?: { Id?: string; DocNumber?: string } };
    return { statusCode: 201, ok: true, message: `QuickBooks: invoice created (${d.Invoice?.Id ?? "n/a"})` };
  },
};

export const CLOUD_ADAPTERS: Record<string, (ctx: AdapterContext) => Promise<AdapterResult>> = {
  ...gdrive, ...gcal, ...gsheets, ...gforms, ...gtasks,
  ...onedrive, ...teams,
  ...dropbox, ...box,
  ...salesforce, ...pipedrive,
  ...trello, ...monday,
  ...xero, ...quickbooks,
};
