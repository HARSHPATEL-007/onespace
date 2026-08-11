/**
 * N0VA1O Provider API Configs — Endpoint definitions for 1,000+ providers.
 * Each config maps tool names to HTTP endpoints with auth and parameter mapping.
 */
import type { RequestConfig } from "./adapter-engine";

export interface ProviderEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  paramMapping?: Record<string, string>;
  bodyMapping?: Record<string, string>;
}

export interface ProviderApiConfig {
  baseUrl: string;
  authType: RequestConfig["authType"];
  apiKeyHeader?: string;
  endpoints: Record<string, ProviderEndpoint>;
}

// Core provider configs with real API endpoint definitions
export const PROVIDER_API_CONFIGS: Record<string, ProviderApiConfig> = {
  // ── Communication ──
  slack: {
    baseUrl: "https://slack.com/api",
    authType: "bearer",
    endpoints: {
      post_message: { method: "POST", path: "/chat.postMessage" },
      list_channels: { method: "GET", path: "/conversations.list", paramMapping: { types: "types", limit: "limit" } },
      read_thread: { method: "GET", path: "/conversations.replies", paramMapping: { channel: "channel", ts: "ts" } },
      create_channel: { method: "POST", path: "/conversations.create" },
    },
  },
  discord: {
    baseUrl: "https://discord.com/api/v10",
    authType: "bearer",
    endpoints: {
      send_message: { method: "POST", path: "/channels/{channel}/messages" },
      list_servers: { method: "GET", path: "/users/@me/guilds" },
      kick_member: { method: "DELETE", path: "/guilds/{guild}/members/{user}" },
    },
  },
  teams: {
    baseUrl: "https://graph.microsoft.com/v1.0",
    authType: "bearer",
    endpoints: {
      post_chat: { method: "POST", path: "/teams/{teamId}/channels/{channelId}/messages" },
      list_teams: { method: "GET", path: "/me/joinedTeams" },
      start_meeting: { method: "POST", path: "/me/onlineMeetings" },
    },
  },
  telegram: {
    baseUrl: "https://api.telegram.org",
    authType: "api-key",
    apiKeyHeader: "X-Bot-Token",
    endpoints: {
      send_message: { method: "POST", path: "/bot{token}/sendMessage" },
    },
  },

  // ── Documents & Storage ──
  gdrive: {
    baseUrl: "https://www.googleapis.com/drive/v3",
    authType: "bearer",
    endpoints: {
      list_files: { method: "GET", path: "/files", paramMapping: { q: "q", page_size: "pageSize" } },
      read_doc: { method: "GET", path: "/files/{fileId}/export", paramMapping: { mime_type: "mimeType" } },
      upload_file: { method: "POST", path: "/files", paramMapping: { upload_type: "uploadType" } },
      delete_file: { method: "DELETE", path: "/files/{fileId}" },
    },
  },
  gsheets: {
    baseUrl: "https://sheets.googleapis.com/v4",
    authType: "bearer",
    endpoints: {
      read_range: { method: "GET", path: "/spreadsheets/{spreadsheetId}/values/{range}" },
      append_row: { method: "POST", path: "/spreadsheets/{spreadsheetId}/values/{range}:append", paramMapping: { value_input_option: "valueInputOption" } },
      write_range: { method: "PUT", path: "/spreadsheets/{spreadsheetId}/values/{range}", paramMapping: { value_input_option: "valueInputOption" } },
    },
  },
  dropbox: {
    baseUrl: "https://api.dropboxapi.com/2",
    authType: "bearer",
    endpoints: {
      list_files: { method: "POST", path: "/files/list_folder" },
      upload_file: { method: "POST", path: "/files/upload" },
      share_link: { method: "POST", path: "/sharing/create_shared_link_with_settings" },
    },
  },
  box: {
    baseUrl: "https://api.box.com/2.0",
    authType: "bearer",
    endpoints: {
      list_files: { method: "GET", path: "/folders/{folderId}/items" },
      upload_file: { method: "POST", path: "/files/content" },
      delete_file: { method: "DELETE", path: "/files/{fileId}" },
    },
  },
  onedrive: {
    baseUrl: "https://graph.microsoft.com/v1.0",
    authType: "bearer",
    endpoints: {
      list_files: { method: "GET", path: "/me/drive/root/children" },
      upload_file: { method: "PUT", path: "/me/drive/root:/{name}:/content" },
    },
  },

  // ── CRM ──
  hubspot: {
    baseUrl: "https://api.hubapi.com/crm/v3",
    authType: "bearer",
    endpoints: {
      list_contacts: { method: "GET", path: "/objects/contacts", paramMapping: { properties: "properties", limit: "limit" } },
      create_contact: { method: "POST", path: "/objects/contacts" },
      list_deals: { method: "GET", path: "/objects/deals" },
      create_deal: { method: "POST", path: "/objects/deals" },
    },
  },
  salesforce: {
    baseUrl: "",
    authType: "bearer",
    endpoints: {
      query: { method: "GET", path: "/services/data/v58.0/query", paramMapping: { q: "q" } },
      create_record: { method: "POST", path: "/services/data/v58.0/sobjects/{type}" },
      update_record: { method: "PATCH", path: "/services/data/v58.0/sobjects/{type}/{id}" },
      delete_record: { method: "DELETE", path: "/services/data/v58.0/sobjects/{type}/{id}" },
    },
  },
  pipedrive: {
    baseUrl: "https://api.pipedrive.com/v1",
    authType: "bearer",
    endpoints: {
      list_deals: { method: "GET", path: "/deals" },
      create_deal: { method: "POST", path: "/deals" },
      move_stage: { method: "PUT", path: "/deals/{id}" },
    },
  },

  // ── Finance ──
  stripe: {
    baseUrl: "https://api.stripe.com/v1",
    authType: "bearer",
    endpoints: {
      list_customers: { method: "GET", path: "/customers" },
      list_invoices: { method: "GET", path: "/invoices" },
      create_payment_link: { method: "POST", path: "/payment_links" },
      refund: { method: "POST", path: "/refunds" },
    },
  },
  xero: {
    baseUrl: "https://api.xero.com/api.xro/2.0",
    authType: "bearer",
    endpoints: {
      list_invoices: { method: "GET", path: "/Invoices" },
      create_invoice: { method: "POST", path: "/Invoices" },
      get_balance: { method: "GET", path: "/Accounts" },
    },
  },
  quickbooks: {
    baseUrl: "",
    authType: "bearer",
    endpoints: {
      list_invoices: { method: "GET", path: "/v3/company/{realmId}/query", paramMapping: { query: "query" } },
      create_invoice: { method: "POST", path: "/v3/company/{realmId}/invoice" },
    },
  },

  // ── DevOps ──
  github: {
    baseUrl: "https://api.github.com",
    authType: "bearer",
    endpoints: {
      list_repos: { method: "GET", path: "/user/repos" },
      list_issues: { method: "GET", path: "/repos/{owner}/{repo}/issues" },
      create_issue: { method: "POST", path: "/repos/{owner}/{repo}/issues" },
      merge_pr: { method: "PUT", path: "/repos/{owner}/{repo}/pulls/{pull_number}/merge" },
      open_pr: { method: "POST", path: "/repos/{owner}/{repo}/pulls" },
    },
  },
  gitlab: {
    baseUrl: "https://gitlab.com/api/v4",
    authType: "bearer",
    endpoints: {
      list_projects: { method: "GET", path: "/projects" },
      create_issue: { method: "POST", path: "/projects/{projectId}/issues" },
      run_pipeline: { method: "POST", path: "/projects/{projectId}/pipeline" },
    },
  },
  jira: {
    baseUrl: "",
    authType: "bearer",
    endpoints: {
      list_issues: { method: "GET", path: "/rest/api/2/search", paramMapping: { jql: "jql" } },
      create_issue: { method: "POST", path: "/rest/api/2/issue" },
      transition_issue: { method: "POST", path: "/rest/api/2/issue/{issueId}/transitions" },
    },
  },

  // ── AI/ML ──
  openai: {
    baseUrl: "https://api.openai.com/v1",
    authType: "bearer",
    endpoints: {
      chat: { method: "POST", path: "/chat/completions" },
      list_assistants: { method: "GET", path: "/assistants" },
      create_assistant: { method: "POST", path: "/assistants" },
    },
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    authType: "api-key",
    apiKeyHeader: "x-api-key",
    endpoints: {
      chat: { method: "POST", path: "/messages" },
    },
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    authType: "api-key",
    apiKeyHeader: "x-goog-api-key",
    endpoints: {
      chat: { method: "POST", path: "/models/{model}:generateContent" },
    },
  },
  pinecone: {
    baseUrl: "https://api.pinecone.io",
    authType: "api-key",
    apiKeyHeader: "Api-Key",
    endpoints: {
      query: { method: "POST", path: "/query" },
      upsert_vectors: { method: "POST", path: "/vectors/upsert" },
      list_indexes: { method: "GET", path: "/indexes" },
    },
  },

  // ── Productivity ──
  notion: {
    baseUrl: "https://api.notion.com/v1",
    authType: "bearer",
    endpoints: {
      search: { method: "POST", path: "/search" },
      read_page: { method: "GET", path: "/pages/{pageId}" },
      create_page: { method: "POST", path: "/pages" },
      update_page: { method: "PATCH", path: "/pages/{pageId}" },
    },
  },
  airtable: {
    baseUrl: "https://api.airtable.com/v0",
    authType: "bearer",
    endpoints: {
      list_records: { method: "GET", path: "/{baseId}/{tableName}" },
      create_record: { method: "POST", path: "/{baseId}/{tableName}" },
      update_record: { method: "PATCH", path: "/{baseId}/{tableName}" },
      delete_record: { method: "DELETE", path: "/{baseId}/{tableName}" },
    },
  },
  asana: {
    baseUrl: "https://app.asana.com/api/1.0",
    authType: "bearer",
    endpoints: {
      list_tasks: { method: "GET", path: "/tasks" },
      create_task: { method: "POST", path: "/tasks" },
      complete_task: { method: "PUT", path: "/tasks/{taskId}" },
    },
  },
  linear: {
    baseUrl: "https://api.linear.app/graphql",
    authType: "bearer",
    endpoints: {
      list_issues: { method: "POST", path: "/" },
      create_issue: { method: "POST", path: "/" },
      update_issue: { method: "POST", path: "/" },
    },
  },
  clickup: {
    baseUrl: "https://api.clickup.com/api/v2",
    authType: "bearer",
    endpoints: {
      list_tasks: { method: "GET", path: "/list/{listId}/task" },
      create_task: { method: "POST", path: "/list/{listId}/task" },
    },
  },
  trello: {
    baseUrl: "https://api.trello.com/1",
    authType: "api-key",
    apiKeyHeader: "key",
    endpoints: {
      list_cards: { method: "GET", path: "/boards/{boardId}/cards" },
      create_card: { method: "POST", path: "/cards" },
      move_card: { method: "PUT", path: "/cards/{cardId}" },
    },
  },
  monday: {
    baseUrl: "https://api.monday.com/v2",
    authType: "bearer",
    endpoints: {
      list_items: { method: "POST", path: "/" },
      create_item: { method: "POST", path: "/" },
      update_item: { method: "POST", path: "/" },
    },
  },
};

/**
 * Generate a generic API config for any provider not in the explicit map.
 * Uses standard REST conventions based on category.
 */
export function generateGenericConfig(
  providerKey: string,
  baseUrl: string,
  authType: RequestConfig["authType"] = "bearer",
): ProviderApiConfig {
  return {
    baseUrl,
    authType,
    endpoints: {
      list: { method: "GET", path: "/{resource}" },
      get: { method: "GET", path: "/{resource}/{id}" },
      create: { method: "POST", path: "/{resource}" },
      update: { method: "PUT", path: "/{resource}/{id}" },
      delete: { method: "DELETE", path: "/{resource}/{id}" },
    },
  };
}
