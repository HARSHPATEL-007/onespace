/**
 * N0VA1O provider catalog — the unified integration registry.
 * Connectors are grouped by category and expose typed tools that the MCP
 * gateway scopes per team (allowlist / blocklist / destructive-by-default).
 *
 * Total: 1,000+ providers across 13 categories.
 */

import { EXTENDED_PROVIDERS } from "./catalog-extended";
import { MASS_PROVIDERS } from "./catalog-mass";

export type AuthType = "api-key" | "oauth2" | "basic" | "webhook" | "rest";

export interface CatalogTool {
  name: string;
  description: string;
  destructive?: boolean;
}

export interface CatalogProvider {
  key: string;
  name: string;
  category: string;
  auth: AuthType;
  description: string;
  tools: CatalogTool[];
}

export interface Category {
  key: string;
  label: string;
}

export const CATEGORIES: Category[] = [
  { key: "productivity", label: "PM & Productivity" },
  { key: "crm", label: "CRM & Sales" },
  { key: "ai-ml", label: "AI / ML" },
  { key: "devops", label: "DevOps & DevTools" },
  { key: "education", label: "Education" },
  { key: "schedule", label: "Scheduling" },
  { key: "communication", label: "Communication" },
  { key: "documents", label: "Documents & Storage" },
  { key: "finance", label: "Finance & Legal" },
  { key: "marketing", label: "Marketing & Advertising" },
  { key: "analytics", label: "Analytics & BI" },
  { key: "business", label: "Business Operations" },
  { key: "other", label: "Other" },
];

const t = (name: string, description: string, destructive = false): CatalogTool => ({
  name,
  description,
  destructive,
});

export const PROVIDERS: CatalogProvider[] = [
  // ---------- communication ----------
  { key: "slack", name: "Slack", category: "communication", auth: "oauth2", description: "Team messaging, channels and DMs.", tools: [t("post_message", "Send a message to a channel or user."), t("list_channels", "List channels the app can see."), t("read_thread", "Read recent messages in a thread."), t("create_channel", "Create a new channel.", true)] },
  { key: "discord", name: "Discord", category: "communication", auth: "oauth2", description: "Community servers and voice channels.", tools: [t("send_message", "Send a message to a channel."), t("list_servers", "List accessible servers."), t("kick_member", "Remove a member from a server.", true)] },
  { key: "teams", name: "Microsoft Teams", category: "communication", auth: "oauth2", description: "Chats, teams and meetings.", tools: [t("post_chat", "Post a chat message."), t("list_teams", "List teams and channels."), t("start_meeting", "Create a meeting link.")] },
  { key: "twilio", name: "Twilio", category: "communication", auth: "api-key", description: "SMS, voice and WhatsApp APIs.", tools: [t("send_sms", "Send an SMS message."), t("make_call", "Trigger an outbound call."), t("list_conversations", "List recent conversations.")] },
  { key: "webhook", name: "Generic webhook", category: "communication", auth: "webhook", description: "Post events to any HTTPS endpoint.", tools: [t("deliver", "Deliver a JSON event to the configured URL.")] },
  { key: "ntfy", name: "ntfy", category: "communication", auth: "api-key", description: "Push notifications to phones and desktops.", tools: [t("notify", "Push a notification to a topic.")] },

  // ---------- documents & storage ----------
  { key: "gdrive", name: "Google Drive", category: "documents", auth: "oauth2", description: "Files, folders and shared drives.", tools: [t("list_files", "List files in a folder."), t("upload_file", "Upload a file.", true), t("read_doc", "Read the text of a document."), t("delete_file", "Move a file to trash.", true)] },
  { key: "dropbox", name: "Dropbox", category: "documents", auth: "oauth2", description: "Cloud file storage.", tools: [t("list_files", "List files in a folder."), t("upload_file", "Upload a file.", true), t("share_link", "Create a share link.")] },
  { key: "onedrive", name: "OneDrive", category: "documents", auth: "oauth2", description: "Microsoft cloud storage.", tools: [t("list_files", "List files in a folder."), t("upload_file", "Upload a file.", true)] },
  { key: "box", name: "Box", category: "documents", auth: "oauth2", description: "Enterprise content management.", tools: [t("list_files", "List files in a folder."), t("upload_file", "Upload a file.", true), t("delete_file", "Trash a file.", true)] },
  { key: "s3", name: "Amazon S3", category: "documents", auth: "api-key", description: "Object storage buckets.", tools: [t("list_objects", "List objects in a bucket."), t("put_object", "Write an object.", true), t("delete_object", "Delete an object.", true)] },
  { key: "figma", name: "Figma", category: "documents", auth: "oauth2", description: "Design files and teams.", tools: [t("get_file", "Read a design file."), t("list_comments", "List comments on a file."), t("post_comment", "Add a comment.")] },
  { key: "docusign", name: "DocuSign", category: "documents", auth: "oauth2", description: "E-signatures and agreements.", tools: [t("send_envelope", "Send an envelope for signature.", true), t("list_envelopes", "List recent envelopes."), t("get_status", "Get envelope status.")] },
  { key: "pandadoc", name: "PandaDoc", category: "documents", auth: "api-key", description: "Document generation and e-sign.", tools: [t("create_document", "Create a document from template.", true), t("send_document", "Send for signature.", true)] },
  { key: "outline", name: "Outline", category: "documents", auth: "api-key", description: "Team knowledge base.", tools: [t("list_documents", "List knowledge base documents."), t("search", "Search the knowledge base."), t("create_document", "Create a doc.", true)] },
  { key: "slite", name: "Slite", category: "documents", auth: "oauth2", description: "Shared company docs.", tools: [t("search", "Search docs."), t("list_docs", "List documents.")] },

  // ---------- productivity / PM ----------
  { key: "notion", name: "Notion", category: "productivity", auth: "oauth2", description: "Docs, wikis and databases.", tools: [t("search", "Search pages and databases."), t("read_page", "Read page content."), t("create_page", "Create a page.", true), t("update_page", "Update page properties.", true)] },
  { key: "airtable", name: "Airtable", category: "productivity", auth: "oauth2", description: "Spreadsheet-database hybrid.", tools: [t("list_records", "List records in a table."), t("create_record", "Create a record.", true), t("update_record", "Update a record.", true), t("delete_record", "Delete a record.", true)] },
  { key: "asana", name: "Asana", category: "productivity", auth: "oauth2", description: "Work management.", tools: [t("list_tasks", "List tasks in a project."), t("create_task", "Create a task.", true), t("complete_task", "Complete a task.", true)] },
  { key: "linear", name: "Linear", category: "productivity", auth: "oauth2", description: "Issue tracking for product teams.", tools: [t("list_issues", "List issues."), t("create_issue", "Create an issue.", true), t("update_issue", "Update issue state.", true)] },
  { key: "jira", name: "Jira", category: "productivity", auth: "oauth2", description: "Atlassian issue tracking.", tools: [t("list_issues", "List issues in a project."), t("create_issue", "Create an issue.", true), t("transition_issue", "Move issue to another status.", true)] },
  { key: "clickup", name: "ClickUp", category: "productivity", auth: "oauth2", description: "All-in-one project management.", tools: [t("list_tasks", "List tasks."), t("create_task", "Create a task.", true)] },
  { key: "monday", name: "Monday.com", category: "productivity", auth: "oauth2", description: "Work operating system.", tools: [t("list_items", "List board items."), t("create_item", "Create an item.", true), t("update_item", "Update item columns.", true)] },
  { key: "trello", name: "Trello", category: "productivity", auth: "oauth2", description: "Kanban boards.", tools: [t("list_cards", "List cards on a board."), t("create_card", "Create a card.", true), t("move_card", "Move a card between lists.", true)] },
  { key: "todoist", name: "Todoist", category: "productivity", auth: "oauth2", description: "Personal task lists.", tools: [t("list_tasks", "List tasks."), t("create_task", "Create a task.", true), t("complete_task", "Complete a task.", true)] },
  { key: "gcal", name: "Google Calendar", category: "schedule", auth: "oauth2", description: "Events and scheduling.", tools: [t("list_events", "List upcoming events."), t("create_event", "Create an event.", true), t("cancel_event", "Cancel an event.", true)] },
  { key: "calendly", name: "Calendly", category: "schedule", auth: "oauth2", description: "Booking and availability.", tools: [t("list_event_types", "List booking types."), t("create_scheduling_link", "Create a booking link.", true), t("list_bookings", "List scheduled bookings.")] },
  { key: "calcom", name: "Cal.com", category: "schedule", auth: "oauth2", description: "Open source scheduling.", tools: [t("list_bookings", "List bookings."), t("create_booking", "Create a booking.", true)] },
  { key: "scheduleonce", name: "ScheduleOnce", category: "schedule", auth: "api-key", description: "Enterprise scheduling.", tools: [t("list_events", "List scheduled events."), t("create_event", "Book an appointment.", true)] },
  { key: "motion", name: "Motion", category: "schedule", auth: "oauth2", description: "AI scheduling and tasks.", tools: [t("list_tasks", "List tasks."), t("create_task", "Create a task.", true)] },
  { key: "clockify", name: "Clockify", category: "productivity", auth: "api-key", description: "Time tracking.", tools: [t("list_entries", "List time entries."), t("start_timer", "Start a timer.", true), t("report", "Time report for a range.")] },
  { key: "toggl", name: "Toggl Track", category: "productivity", auth: "api-key", description: "Time tracking.", tools: [t("list_entries", "List time entries."), t("start_timer", "Start a timer.", true)] },
  { key: "harvest", name: "Harvest", category: "productivity", auth: "oauth2", description: "Time tracking and invoicing.", tools: [t("list_entries", "List time entries."), t("create_entry", "Log time.", true)] },
  { key: "shortcut", name: "Shortcut", category: "productivity", auth: "api-key", description: "Agile project management.", tools: [t("list_stories", "List stories."), t("create_story", "Create a story.", true)] },
  { key: "wrike", name: "Wrike", category: "productivity", auth: "oauth2", description: "Project collaboration.", tools: [t("list_tasks", "List tasks."), t("create_task", "Create a task.", true)] },
  { key: "basecamp", name: "Basecamp", category: "productivity", auth: "oauth2", description: "Team projects and campfires.", tools: [t("list_projects", "List projects."), t("post_message", "Post a project message.", true)] },
  { key: "codas", name: "Coda", category: "productivity", auth: "oauth2", description: "Docs with apps.", tools: [t("list_docs", "List documents."), t("read_doc", "Read a doc."), t("update_cell", "Update a table cell.", true)] },
  { key: "gsheets", name: "Google Sheets", category: "productivity", auth: "oauth2", description: "Spreadsheets.", tools: [t("read_range", "Read a cell range."), t("append_row", "Append a row.", true), t("write_range", "Write a cell range.", true)] },
  { key: "gforms", name: "Google Forms", category: "productivity", auth: "oauth2", description: "Forms and surveys.", tools: [t("list_forms", "List forms."), t("list_responses", "List form responses.")] },
  { key: "gtasks", name: "Google Tasks", category: "productivity", auth: "oauth2", description: "Task lists.", tools: [t("list_tasks", "List tasks."), t("create_task", "Create a task.", true)] },

  // ---------- crm & sales ----------
  { key: "hubspot", name: "HubSpot", category: "crm", auth: "oauth2", description: "CRM, marketing and sales.", tools: [t("list_contacts", "List contacts."), t("create_contact", "Create a contact.", true), t("list_deals", "List deals."), t("create_deal", "Create a deal.", true)] },
  { key: "salesforce", name: "Salesforce", category: "crm", auth: "oauth2", description: "Enterprise CRM.", tools: [t("query", "Run a SOQL query."), t("create_record", "Create an object record.", true), t("update_record", "Update a record.", true), t("delete_record", "Delete a record.", true)] },
  { key: "pipedrive", name: "Pipedrive", category: "crm", auth: "oauth2", description: "Sales pipeline CRM.", tools: [t("list_deals", "List deals."), t("create_deal", "Create a deal.", true), t("move_stage", "Move a deal stage.", true)] },
  { key: "zoho", name: "Zoho CRM", category: "crm", auth: "oauth2", description: "CRM suite.", tools: [t("list_leads", "List leads."), t("create_lead", "Create a lead.", true)] },
  { key: "attio", name: "Attio", category: "crm", auth: "oauth2", description: "Modern relationship CRM.", tools: [t("list_records", "List records."), t("create_record", "Create a record.", true)] },
  { key: "apollo", name: "Apollo.io", category: "crm", auth: "api-key", description: "Prospecting and enrichment.", tools: [t("search_people", "Search people."), t("enrich", "Enrich a contact.")] },
  { key: "zoominfo", name: "ZoomInfo", category: "crm", auth: "api-key", description: "B2B contact data.", tools: [t("enrich", "Enrich a company or person."), t("search", "Search the database.")] },
  { key: "highlevel", name: "GoHighLevel", category: "crm", auth: "api-key", description: "Agency CRM.", tools: [t("list_contacts", "List contacts."), t("create_contact", "Create a contact.", true)] },
  { key: "close", name: "Close CRM", category: "crm", auth: "api-key", description: "Sales communication CRM.", tools: [t("list_leads", "List leads."), t("create_lead", "Create a lead.", true), t("log_call", "Log a call.", true)] },
  { key: "odoo", name: "Odoo", category: "crm", auth: "api-key", description: "ERP and CRM.", tools: [t("list_leads", "List leads."), t("create_lead", "Create a lead.", true)] },
  { key: "d365", name: "Dynamics 365", category: "crm", auth: "oauth2", description: "Microsoft CRM/ERP.", tools: [t("list_contacts", "List contacts."), t("create_contact", "Create a contact.", true)] },

  // ---------- finance & legal ----------
  { key: "stripe", name: "Stripe", category: "finance", auth: "api-key", description: "Payments and billing.", tools: [t("list_customers", "List customers."), t("list_invoices", "List invoices."), t("create_payment_link", "Create a payment link.", true), t("refund", "Refund a charge.", true)] },
  { key: "xero", name: "Xero", category: "finance", auth: "oauth2", description: "Accounting.", tools: [t("list_invoices", "List invoices."), t("create_invoice", "Create an invoice.", true), t("get_balance", "Read account balances.")] },
  { key: "quickbooks", name: "QuickBooks", category: "finance", auth: "oauth2", description: "Small business accounting.", tools: [t("list_invoices", "List invoices."), t("create_invoice", "Create an invoice.", true)] },
  { key: "freshbooks", name: "FreshBooks", category: "finance", auth: "oauth2", description: "Invoicing and accounting.", tools: [t("list_invoices", "List invoices."), t("create_invoice", "Create an invoice.", true)] },
  { key: "paddle", name: "Paddle", category: "finance", auth: "api-key", description: "Merchant of record.", tools: [t("list_subscriptions", "List subscriptions."), t("list_transactions", "List transactions."), t("cancel_subscription", "Cancel a subscription.", true)] },
  { key: "recurly", name: "Recurly", category: "finance", auth: "api-key", description: "Subscription billing.", tools: [t("list_accounts", "List accounts."), t("list_invoices", "List invoices.")] },
  { key: "brex", name: "Brex", category: "finance", auth: "api-key", description: "Corporate cards and cash.", tools: [t("list_transactions", "List card transactions."), t("list_balances", "Read account balances.")] },
  { key: "wise", name: "Wise", category: "finance", auth: "api-key", description: "International transfers.", tools: [t("get_rates", "Get exchange rates."), t("create_transfer", "Create a transfer.", true)] },
  { key: "clio", name: "Clio", category: "finance", auth: "oauth2", description: "Legal practice management.", tools: [t("list_matters", "List matters."), t("list_bills", "List bills."), t("create_bill", "Create a bill.", true)] },
  { key: "ironclad", name: "Ironclad", category: "finance", auth: "oauth2", description: "Contract lifecycle.", tools: [t("list_templates", "List contract templates."), t("launch_workflow", "Launch a contract workflow.", true)] },

  // ---------- ai / ml ----------
  { key: "openai", name: "OpenAI", category: "ai-ml", auth: "api-key", description: "LLMs and assistants.", tools: [t("chat", "Run a chat completion."), t("list_assistants", "List assistants."), t("create_assistant", "Create an assistant.", true)] },
  { key: "anthropic", name: "Anthropic", category: "ai-ml", auth: "api-key", description: "Claude models.", tools: [t("chat", "Run a Claude completion.")] },
  { key: "gemini", name: "Google Gemini", category: "ai-ml", auth: "api-key", description: "Gemini models.", tools: [t("chat", "Run a Gemini completion.")] },
  { key: "mistral", name: "Mistral AI", category: "ai-ml", auth: "api-key", description: "Open-weight LLMs.", tools: [t("chat", "Run a Mistral completion.")] },
  { key: "deepseek", name: "DeepSeek", category: "ai-ml", auth: "api-key", description: "Reasoning LLMs.", tools: [t("chat", "Run a DeepSeek completion.")] },
  { key: "groq", name: "Groq", category: "ai-ml", auth: "api-key", description: "Fast inference.", tools: [t("chat", "Run a Groq completion.")] },
  { key: "openrouter", name: "OpenRouter", category: "ai-ml", auth: "api-key", description: "Unified model router.", tools: [t("chat", "Run a model completion."), t("list_models", "List available models.")] },
  { key: "ollama", name: "Ollama", category: "ai-ml", auth: "rest", description: "Local models.", tools: [t("chat", "Run a local model completion."), t("list_models", "List local models.")] },
  { key: "huggingface", name: "Hugging Face", category: "ai-ml", auth: "api-key", description: "Model hub and inference.", tools: [t("inference", "Run a hosted model."), t("search_models", "Search the hub.")] },
  { key: "replicate", name: "Replicate", category: "ai-ml", auth: "api-key", description: "Cloud model runtime.", tools: [t("run_model", "Run a model prediction."), t("list_predictions", "List predictions.")] },
  { key: "falai", name: "Fal.ai", category: "ai-ml", auth: "api-key", description: "Media model APIs.", tools: [t("run_model", "Run a model."), t("queue_status", "Check a job status.")] },
  { key: "pinecone", name: "Pinecone", category: "ai-ml", auth: "api-key", description: "Vector database.", tools: [t("upsert_vectors", "Upsert vectors.", true), t("query", "Query the index."), t("list_indexes", "List indexes.")] },
  { key: "deepgram", name: "Deepgram", category: "ai-ml", auth: "api-key", description: "Speech-to-text.", tools: [t("transcribe", "Transcribe audio.")] },
  { key: "elevenlabs", name: "ElevenLabs", category: "ai-ml", auth: "api-key", description: "Text-to-speech.", tools: [t("synthesize", "Synthesize speech."), t("list_voices", "List voices.")] },
  { key: "revai", name: "Rev AI", category: "ai-ml", auth: "api-key", description: "Speech and transcription.", tools: [t("transcribe", "Transcribe media."), t("get_transcript", "Get a transcript.")] },
  { key: "tavily", name: "Tavily", category: "ai-ml", auth: "api-key", description: "Search for agents.", tools: [t("search", "Search the web.")] },
  { key: "perplexity", name: "Perplexity", category: "ai-ml", auth: "api-key", description: "Answer engine.", tools: [t("search", "Ask a research question.")] },
  { key: "jigsawstack", name: "JigsawStack", category: "ai-ml", auth: "api-key", description: "AI utilities.", tools: [t("scrape", "Scrape a page."), t("extract", "Extract structured data.")] },
  { key: "exa", name: "Exa", category: "ai-ml", auth: "api-key", description: "Neural web search.", tools: [t("search", "Semantic search."), t("get_contents", "Fetch page contents.")] },
  { key: "ragie", name: "Ragie", category: "ai-ml", auth: "api-key", description: "RAG as a service.", tools: [t("retrieve", "Retrieve chunks."), t("upsert_document", "Index a document.", true)] },

  // ---------- devops & devtools ----------
  { key: "github", name: "GitHub", category: "devops", auth: "oauth2", description: "Code, issues and CI.", tools: [t("list_repos", "List repositories."), t("list_issues", "List issues."), t("create_issue", "Create an issue.", true), t("merge_pr", "Merge a pull request.", true), t("open_pr", "Open a pull request.", true)] },
  { key: "gitlab", name: "GitLab", category: "devops", auth: "oauth2", description: "DevOps platform.", tools: [t("list_projects", "List projects."), t("create_issue", "Create an issue.", true), t("run_pipeline", "Trigger a pipeline.", true)] },
  { key: "bitbucket", name: "Bitbucket", category: "devops", auth: "oauth2", description: "Atlassian code hosting.", tools: [t("list_repos", "List repositories."), t("create_pr", "Create a PR.", true)] },
  { key: "vercel", name: "Vercel", category: "devops", auth: "api-key", description: "Deployments.", tools: [t("list_deployments", "List deployments."), t("create_deployment", "Deploy a project.", true), t("list_projects", "List projects.")] },
  { key: "cloudflare", name: "Cloudflare", category: "devops", auth: "api-key", description: "CDN and DNS.", tools: [t("list_zones", "List zones."), t("list_dns", "List DNS records."), t("create_dns", "Create a DNS record.", true)] },
  { key: "datadog", name: "Datadog", category: "devops", auth: "api-key", description: "Monitoring.", tools: [t("search_metrics", "Query metrics."), t("list_incidents", "List incidents."), t("create_monitor", "Create a monitor.", true)] },
  { key: "sentry", name: "Sentry", category: "devops", auth: "api-key", description: "Error tracking.", tools: [t("list_issues", "List recent issues."), t("get_issue", "Read an issue."), t("resolve_issue", "Resolve an issue.", true)] },
  { key: "pagerduty", name: "PagerDuty", category: "devops", auth: "api-key", description: "On-call and incidents.", tools: [t("list_incidents", "List incidents."), t("create_incident", "Open an incident.", true), t("acknowledge", "Acknowledge an incident.", true)] },
  { key: "circleci", name: "CircleCI", category: "devops", auth: "api-key", description: "CI/CD.", tools: [t("list_pipelines", "List pipelines."), t("trigger_pipeline", "Trigger a pipeline.", true)] },
  { key: "buildkite", name: "Buildkite", category: "devops", auth: "api-key", description: "CI/CD.", tools: [t("list_builds", "List builds."), t("trigger_build", "Trigger a build.", true)] },
  { key: "grafana", name: "Grafana", category: "devops", auth: "api-key", description: "Dashboards and alerting.", tools: [t("query", "Query a data source."), t("list_dashboards", "List dashboards.")] },
  { key: "postman", name: "Postman", category: "devops", auth: "api-key", description: "API development.", tools: [t("list_collections", "List collections."), t("run_collection", "Run a collection.", true)] },
  { key: "algolia", name: "Algolia", category: "devops", auth: "api-key", description: "Search APIs.", tools: [t("search", "Search an index."), t("list_indexes", "List indexes."), t("add_object", "Index an object.", true)] },
  { key: "supabase", name: "Supabase", category: "devops", auth: "api-key", description: "Postgres backend.", tools: [t("query", "Run a SQL query."), t("list_tables", "List tables."), t("insert_row", "Insert a row.", true)] },
  { key: "neon", name: "Neon", category: "devops", auth: "api-key", description: "Serverless Postgres.", tools: [t("query", "Run a SQL query."), t("create_branch", "Create a branch.", true)] },
  { key: "railway", name: "Railway", category: "devops", auth: "oauth2", description: "Deployment platform.", tools: [t("list_projects", "List projects."), t("list_deployments", "List deployments.")] },
  { key: "render", name: "Render", category: "devops", auth: "api-key", description: "Cloud hosting.", tools: [t("list_services", "List services."), t("deploy", "Trigger a deploy.", true)] },
  { key: "dockerhub", name: "Docker Hub", category: "devops", auth: "api-key", description: "Container registry.", tools: [t("search_images", "Search images."), t("list_repos", "List repositories.")] },
  { key: "npm", name: "npm", category: "devops", auth: "api-key", description: "Package registry.", tools: [t("search_packages", "Search packages."), t("get_metadata", "Read package metadata.")] },
  { key: "svix", name: "Svix", category: "devops", auth: "api-key", description: "Webhook delivery.", tools: [t("list_endpoints", "List endpoints."), t("send_event", "Send a webhook event.", true)] },
  { key: "doppler", name: "Doppler", category: "devops", auth: "api-key", description: "Secrets management.", tools: [t("get_secrets", "Read secrets."), t("list_configs", "List configs.")] },
  { key: "1password", name: "1Password", category: "devops", auth: "api-key", description: "Password vault.", tools: [t("list_items", "List vault items."), t("get_item", "Read an item.")] },
  { key: "postmark", name: "Postmark", category: "devops", auth: "api-key", description: "Transactional email.", tools: [t("send_email", "Send an email.", true), t("list_templates", "List templates.")] },
  { key: "resend", name: "Resend", category: "devops", auth: "api-key", description: "Email for developers.", tools: [t("send_email", "Send an email.", true)] },
  { key: "fly", name: "Fly.io", category: "devops", auth: "api-key", description: "App deployment.", tools: [t("list_apps", "List apps."), t("deploy", "Deploy an app.", true)] },
  { key: "netlify", name: "Netlify", category: "devops", auth: "oauth2", description: "Web hosting.", tools: [t("list_sites", "List sites."), t("create_deploy", "Deploy a site.", true)] },
  { key: "digitalocean", name: "DigitalOcean", category: "devops", auth: "oauth2", description: "Cloud infrastructure.", tools: [t("list_droplets", "List droplets."), t("create_droplet", "Create a droplet.", true)] },
  { key: "statuspage", name: "Statuspage", category: "devops", auth: "api-key", description: "Status pages.", tools: [t("list_incidents", "List incidents."), t("create_incident", "Open an incident.", true)] },
  { key: "uptimerobot", name: "UptimeRobot", category: "devops", auth: "api-key", description: "Uptime monitoring.", tools: [t("list_monitors", "List monitors."), t("create_monitor", "Create a monitor.", true)] },

  // ---------- education ----------
  { key: "canvas", name: "Canvas", category: "education", auth: "oauth2", description: "LMS.", tools: [t("list_courses", "List courses."), t("list_assignments", "List assignments."), t("submit_grade", "Submit a grade.", true)] },
  { key: "classroom", name: "Google Classroom", category: "education", auth: "oauth2", description: "Classrooms and coursework.", tools: [t("list_courses", "List courses."), t("list_announcements", "List announcements."), t("create_announcement", "Post an announcement.", true)] },
  { key: "blackboard", name: "Blackboard", category: "education", auth: "oauth2", description: "LMS.", tools: [t("list_courses", "List courses."), t("list_grades", "List grades.")] },
  { key: "d2l", name: "D2L Brightspace", category: "education", auth: "oauth2", description: "LMS.", tools: [t("list_courses", "List courses."), t("list_grades", "List grades.")] },
  { key: "clever", name: "Clever", category: "education", auth: "oauth2", description: "Education identity.", tools: [t("list_districts", "List districts."), t("list_teachers", "List teachers.")] },
  { key: "edflow", name: "Eduflow", category: "education", auth: "api-key", description: "Learning activities.", tools: [t("list_courses", "List courses."), t("list_activities", "List activities.")] },
  { key: "moodle", name: "Moodle", category: "education", auth: "api-key", description: "Open LMS.", tools: [t("list_courses", "List courses."), t("list_enrolments", "List enrolments.")] },
  { key: "kahoot", name: "Kahoot!", category: "education", auth: "oauth2", description: "Quizzes and games.", tools: [t("list_quizzes", "List quizzes."), t("create_quiz", "Create a quiz.", true)] },

  // ---------- other ----------
  { key: "zapier", name: "Zapier", category: "other", auth: "oauth2", description: "Automation hub.", tools: [t("run_zap", "Trigger a zap.", true), t("list_zaps", "List zaps.")] },
  { key: "make", name: "Make", category: "other", auth: "oauth2", description: "Visual automation.", tools: [t("run_scenario", "Trigger a scenario.", true), t("list_scenarios", "List scenarios.")] },
  { key: "n8n", name: "n8n", category: "other", auth: "api-key", description: "Workflow automation.", tools: [t("run_workflow", "Execute a workflow.", true), t("list_workflows", "List workflows.")] },
  { key: "customerio", name: "Customer.io", category: "other", auth: "api-key", description: "Customer messaging.", tools: [t("list_segments", "List segments."), t("send_campaign", "Trigger a campaign.", true)] },
  { key: "segment", name: "Segment", category: "other", auth: "api-key", description: "Customer data platform.", tools: [t("track", "Track an event.", true), t("list_sources", "List sources.")] },
  { key: "intercom", name: "Intercom", category: "other", auth: "oauth2", description: "Messenger and support.", tools: [t("list_conversations", "List conversations."), t("reply", "Reply to a conversation.", true)] },
  { key: "zendesk", name: "Zendesk", category: "other", auth: "oauth2", description: "Support tickets.", tools: [t("list_tickets", "List tickets."), t("create_ticket", "Create a ticket.", true), t("update_ticket", "Update a ticket.", true)] },
  { key: "freshdesk", name: "Freshdesk", category: "other", auth: "oauth2", description: "Support tickets.", tools: [t("list_tickets", "List tickets."), t("create_ticket", "Create a ticket.", true)] },
  { key: "servicenow", name: "ServiceNow", category: "other", auth: "oauth2", description: "ITSM.", tools: [t("list_incidents", "List incidents."), t("create_incident", "Create an incident.", true)] },
  { key: "shopify", name: "Shopify", category: "other", auth: "oauth2", description: "Commerce.", tools: [t("list_orders", "List orders."), t("get_product", "Read a product."), t("update_inventory", "Update inventory.", true)] },
  { key: "woocommerce", name: "WooCommerce", category: "other", auth: "api-key", description: "WordPress commerce.", tools: [t("list_orders", "List orders."), t("list_products", "List products.")] },
  { key: "mailchimp", name: "Mailchimp", category: "other", auth: "oauth2", description: "Email marketing.", tools: [t("list_campaigns", "List campaigns."), t("send_campaign", "Send a campaign.", true), t("list_audiences", "List audiences.")] },
  { key: "brevo", name: "Brevo", category: "other", auth: "api-key", description: "Email and SMS marketing.", tools: [t("send_email", "Send an email.", true), t("list_campaigns", "List campaigns.")] },
  { key: "typeform", name: "Typeform", category: "other", auth: "oauth2", description: "Forms and surveys.", tools: [t("list_forms", "List forms."), t("list_responses", "List responses.")] },
  ...EXTENDED_PROVIDERS,
  ...MASS_PROVIDERS,
];

const PROVIDER_INDEX = new Map(PROVIDERS.map((p) => [p.key, p]));
const CATEGORY_INDEX = new Map(CATEGORIES.map((c) => [c.key, c]));

export function findProvider(key: string): CatalogProvider | undefined {
  return PROVIDER_INDEX.get(key);
}

export function categoryLabel(key: string): string {
  return CATEGORY_INDEX.get(key)?.label ?? "Other";
}

export function categoryProviders(category: string): CatalogProvider[] {
  return PROVIDERS.filter((p) => p.category === category);
}

/** Default tools for a provider (non-destructive first). */
export function providerTools(key: string): CatalogTool[] {
  return findProvider(key)?.tools ?? [t("ping", "Health-check the connection.")];
}

/** MCP tool scoping: destructive tools are blocked by default; blocklists win. */
export function scopeTools(
  available: CatalogTool[],
  opts: { allowlist?: string[]; blocklist?: string[] },
): CatalogTool[] {
  const allow = new Set(opts.allowlist ?? []);
  const block = new Set(opts.blocklist ?? []);
  const allowActive = allow.size > 0;
  return available.filter((tool) => {
    if (block.has(tool.name)) return false;
    if (tool.destructive) return allow.has(tool.name);
    return allowActive ? allow.has(tool.name) : true;
  });
}

export function isDestructiveTool(providerKey: string, tool: string): boolean {
  return findProvider(providerKey)?.tools.some((t_) => t_.name === tool && t_.destructive) ?? false;
}

/* ---------- intent-driven discovery (spec §3.4) ---------- */

export interface DiscoveredTool {
  providerKey: string;
  providerName: string;
  category: string;
  name: string;
  description: string;
  /** Relevance score in [0, 1]; higher is more relevant to the query. */
  relevance: number;
  /** Human-readable explanation of why this tool matched. */
  reason: string;
}

export interface DiscoverOptions {
  /** Max number of tools to return (default 5). */
  maxTools?: number;
  /** Restrict discovery to these provider keys (default: all providers). */
  providers?: string[];
  /** If true, rank provider name matches slightly higher. */
  providerBias?: boolean;
}

/**
 * Intent-driven tool discovery — rank every catalog tool by relevance to a
 * natural-language query using a lightweight TF-based cosine scorer over the
 * tool name, description, provider name and category. Returns the top-N tools
 * with normalized relevance scores.
 *
 * This is the catalog-side half of spec §3.4: instead of injecting all ~500
 * tools into the agent context window, callers ask for the 3-4 most relevant.
 */
export function discoverTools(query: string, opts: DiscoverOptions = {}): DiscoveredTool[] {
  const maxTools = Math.max(1, opts.maxTools ?? 5);
  const providerFilter = opts.providers && opts.providers.length > 0 ? new Set(opts.providers) : null;

  const terms = tokenize(query);
  const idf = buildIdf();

  const results: DiscoveredTool[] = [];
  for (const provider of PROVIDERS) {
    if (providerFilter && !providerFilter.has(provider.key)) continue;
    const providerText = [provider.name, provider.category, provider.description].join(" ");
    for (const tool of provider.tools) {
      const toolText = `${tool.name.replace(/_/g, " ")} ${tool.description}`;
      const score = scoreDoc(terms, idf, toolText, opts.providerBias ? providerText : undefined);
      if (score <= 0) continue;
      results.push({
        providerKey: provider.key,
        providerName: provider.name,
        category: provider.category,
        name: tool.name,
        description: tool.description,
        relevance: score,
        reason: buildReason(terms, tool, provider),
      });
    }
  }

  results.sort((a, b) => b.relevance - a.relevance);

  const top = results.slice(0, maxTools);
  const first = top[0];
  if (!first) return top;
  const maxScore = first.relevance;
  if (maxScore > 0) {
    for (const t of top) t.relevance = Math.round((t.relevance / maxScore) * 100) / 100;
  }
  return top;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "i", "me", "my", "we", "our", "you", "your",
  "it", "its", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "may", "might", "shall",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "about",
  "between", "through", "during", "before", "after", "above", "below", "between",
  "out", "off", "over", "under", "again", "further", "then", "once", "here", "there",
  "when", "where", "why", "how", "all", "both", "each", "few", "more", "most", "other",
  "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too",
  "very", "s", "t", "can", "just", "don", "should", "now", "need", "like", "get",
  "make", "want", "the", "that", "this", "these", "those",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

function buildIdf(): Map<string, number> {
  const docFreq = new Map<string, number>();
  let n = 0;
  for (const provider of PROVIDERS) {
    for (const tool of provider.tools) {
      n += 1;
      const terms = new Set(tokenize(`${tool.name} ${tool.description}`));
      for (const term of terms) {
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
      }
    }
  }
  const idf = new Map<string, number>();
  for (const [term, df] of docFreq) {
    idf.set(term, Math.log((n + 1) / (df + 1)));
  }
  return idf;
}

function termFreq(terms: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

function scoreDoc(
  queryTerms: string[],
  idf: Map<string, number>,
  toolText: string,
  providerText?: string,
): number {
  if (queryTerms.length === 0) return 0;
  const toolTerms = tokenize(toolText);
  const tf = termFreq(toolTerms);
  let dot = 0;
  let toolMag = 0;
  let queryMag = 0;
  const seen = new Set<string>();
  for (const q of queryTerms) {
    const w = idf.get(q) ?? 1;
    queryMag += w * w;
    if (seen.has(q)) continue;
    seen.add(q);
    const freq = tf.get(q) ?? 0;
    if (freq > 0) dot += freq * w * w;
  }
  for (const [term, freq] of tf) {
    const w = idf.get(term) ?? 1;
    toolMag += freq * freq * w * w;
  }
  // Bonus: provider-level text match (category/name/description).
  let providerBonus = 0;
  if (providerText) {
    const pt = tokenize(providerText);
    const ptFreq = termFreq(pt);
    for (const q of queryTerms) {
      const w = idf.get(q) ?? 1;
      if (ptFreq.has(q)) providerBonus += 0.5 * w;
    }
  }
  const denom = Math.sqrt(queryMag) * Math.sqrt(toolMag) || 1;
  return (dot / denom) + providerBonus;
}

function buildReason(terms: string[], tool: CatalogTool, provider: CatalogProvider): string {
  const matched = terms.filter((t) =>
    tool.name.toLowerCase().includes(t) || tool.description.toLowerCase().includes(t),
  );
  if (matched.length > 0) {
    const uniq = [...new Set(matched)].slice(0, 3);
    return `Matches "${uniq.join(", ")}" — ${provider.name} ${tool.name.replace(/_/g, " ")}`;
  }
  return `Related to ${provider.name} ${tool.name.replace(/_/g, " ")}`;
}
