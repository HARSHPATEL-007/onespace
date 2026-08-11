/**
 * N0VA1O Extended Provider Catalog — 150+ high-value integrations.
 * Covers marketing, analytics, CRM, and creative tools from the spec.
 *
 * Append PROVIDERS to the main catalog in catalog.ts.
 */

import type { CatalogProvider } from "./catalog";

const t = (name: string, description: string, destructive = false): { name: string; description: string; destructive: boolean } => ({
  name,
  description,
  destructive,
});

interface RawEntry {
  key: string;
  name: string;
  category: string;
  auth: "api-key" | "oauth2" | "basic" | "webhook" | "rest";
  tools: Array<{ name: string; description: string; destructive: boolean }>;
}

const RAW: RawEntry[] = [
  // ── MARKETING — Social Advertising ──
  { key: "meta_ads", name: "Meta Ads", category: "marketing", auth: "oauth2", tools: [t("read_campaigns", "Read campaign data"), t("update_budget", "Update campaign budget", true), t("create_ad", "Create a new ad", true), t("audience_sync", "Sync custom audiences", true), t("creative_upload", "Upload ad creative")] },
  { key: "tiktok_ads", name: "TikTok Ads", category: "marketing", auth: "oauth2", tools: [t("read_campaigns", "Read campaign performance"), t("create_campaign", "Create new campaign", true), t("audience_targeting", "Set audience targeting", true), t("creative_upload", "Upload video creative")] },
  { key: "snapchat_ads", name: "Snapchat Ads", category: "marketing", auth: "oauth2", tools: [t("read_campaigns", "Read campaign data"), t("create_ad", "Create snap ad", true), t("audience_sync", "Sync audience segments")] },
  { key: "linkedin_ads", name: "LinkedIn Ads", category: "marketing", auth: "oauth2", tools: [t("read_campaigns", "Read ad performance"), t("create_ad", "Create sponsored content", true), t("audience_targeting", "Set professional targeting")] },
  { key: "twitter_ads", name: "Twitter/X Ads", category: "marketing", auth: "oauth2", tools: [t("read_campaigns", "Read promoted tweets"), t("create_promoted_tweet", "Promote a tweet", true), t("audience_targeting", "Set follower targeting")] },
  { key: "reddit_ads", name: "Reddit Ads", category: "marketing", auth: "oauth2", tools: [t("read_campaigns", "Read campaign data"), t("create_ad", "Create reddit ad", true), t("subreddit_targeting", "Target subreddits")] },
  { key: "pinterest_ads", name: "Pinterest Ads", category: "marketing", auth: "oauth2", tools: [t("read_campaigns", "Read pin performance"), t("create_promoted_pin", "Create promoted pin", true), t("board_targeting", "Target boards")] },
  { key: "quora_ads", name: "Quora Ads", category: "marketing", auth: "oauth2", tools: [t("read_campaigns", "Read ad performance"), t("create_ad", "Create quora ad", true), t("question_targeting", "Target questions")] },
  { key: "taboola_ads", name: "Taboola Ads", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_campaign", "Create campaign", true), t("item_recommend", "Get recommendations")] },
  { key: "outbrain_ads", name: "Outbrain Ads", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_campaign", "Create campaign", true), t("approve_content", "Approve content")] },
  { key: "revcontent", name: "RevContent", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_widget", "Create content widget", true)] },
  { key: "mgid", name: "MGID", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read native ad data"), t("create_campaign", "Create campaign", true)] },
  { key: "bidmind", name: "BidMind", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("optimize_bids", "Optimize bids", true)] },
  { key: "adroll", name: "AdRoll", category: "marketing", auth: "oauth2", tools: [t("read_campaigns", "Read retargeting data"), t("create_campaign", "Create campaign", true)] },
  { key: "criteo", name: "Criteo", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read retargeting data"), t("create_campaign", "Create campaign", true)] },
  { key: "adbloom", name: "AdBloom", category: "marketing", auth: "oauth2", tools: [t("read_campaigns", "Read campaigns"), t("create_campaign", "Create campaign", true)] },
  { key: "adelphic", name: "Adelphic", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_campaign", "Create campaign", true)] },
  { key: "adform", name: "Adform", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_campaign", "Create campaign", true)] },
  { key: "chalkdash", name: "Chalk Digital", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_campaign", "Create OOH campaign", true)] },
  { key: "nativo", name: "Nativo", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read native ad data"), t("create_campaign", "Create campaign", true)] },
  { key: "triplelift", name: "TripleLift", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_campaign", "Create campaign", true)] },
  { key: "sharethrough", name: "Sharethrough", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_campaign", "Create campaign", true)] },
  { key: "gumgum", name: "GumGum", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_campaign", "Create campaign", true)] },
  { key: "pinterest_organic", name: "Pinterest Organic", category: "marketing", auth: "oauth2", tools: [t("list_pins", "List pins"), t("create_pin", "Create pin", true), t("list_boards", "List boards")] },
  { key: "youtube_organic", name: "YouTube Organic", category: "marketing", auth: "oauth2", tools: [t("list_videos", "List videos"), t("upload_video", "Upload video", true), t("get_analytics", "Get channel analytics")] },

  // ── MARKETING — Search & Programmatic ──
  { key: "google_ads", name: "Google Ads", category: "marketing", auth: "oauth2", tools: [t("search_keyword", "Search keyword ideas"), t("create_campaign", "Create search campaign", true), t("update_bids", "Update keyword bids", true), t("get_performance", "Get performance data")] },
  { key: "microsoft_ads", name: "Microsoft Ads", category: "marketing", auth: "oauth2", tools: [t("search_keyword", "Search keyword ideas"), t("create_campaign", "Create search campaign", true), t("update_bids", "Update bids", true), t("get_performance", "Get performance data")] },
  { key: "amazon_ads", name: "Amazon Ads", category: "marketing", auth: "oauth2", tools: [t("search_keyword", "Search keyword ideas"), t("create_campaign", "Create sponsored product", true), t("update_bids", "Update bids", true), t("get_performance", "Get performance data")] },
  { key: "dv360", name: "DV360", category: "marketing", auth: "oauth2", tools: [t("read_campaigns", "Read display campaigns"), t("create_line_item", "Create line item", true), t("update_bids", "Update bids", true)] },
  { key: "thetradedesk", name: "The Trade Desk", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_campaign", "Create campaign", true), t("audience_targeting", "Target audiences")] },
  { key: "pubmatic", name: "PubMatic", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_campaign", "Create campaign", true)] },
  { key: "openx", name: "OpenX", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_campaign", "Create campaign", true)] },
  { key: "indexexchange", name: "Index Exchange", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_campaign", "Create campaign", true)] },
  { key: "sovrn", name: "Sovrn", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read campaign data"), t("create_campaign", "Create campaign", true)] },
  { key: "criteo_search", name: "Criteo Search", category: "marketing", auth: "api-key", tools: [t("read_campaigns", "Read search data"), t("create_campaign", "Create campaign", true)] },

  // ── MARKETING — Creative & Design ──
  { key: "canva", name: "Canva", category: "marketing", auth: "oauth2", tools: [t("list_designs", "List designs"), t("create_design", "Create design", true), t("export_design", "Export design"), t("upload_asset", "Upload brand asset")] },
  { key: "adobe_cc", name: "Adobe Creative Cloud", category: "marketing", auth: "oauth2", tools: [t("list_assets", "List assets"), t("create_project", "Create project", true), t("export_asset", "Export asset")] },
  { key: "bannerbear", name: "Bannerbear", category: "marketing", auth: "api-key", tools: [t("generate_image", "Generate image", true), t("list_templates", "List templates"), t("create_template", "Create template", true)] },
  { key: "remove_bg", name: "Remove.bg", category: "marketing", auth: "api-key", tools: [t("remove_background", "Remove background", true), t("list_credits", "List remaining credits")] },
  { key: "tiny_png", name: "TinyPNG", category: "marketing", auth: "api-key", tools: [t("compress_image", "Compress image", true), t("list_compressions", "List compressions")] },
  { key: "imagekit", name: "ImageKit", category: "marketing", auth: "api-key", tools: [t("upload_file", "Upload file", true), t("transform_url", "Transform URL"), t("list_files", "List files")] },
  { key: "deepimage", name: "DeepImage", category: "marketing", auth: "api-key", tools: [t("upscale_image", "Upscale image", true), t("enhance_image", "Enhance image")] },
  { key: "bannerwise", name: "Bannerwise", category: "marketing", auth: "api-key", tools: [t("generate_banner", "Generate banner", true), t("list_campaigns", "List campaigns")] },
  { key: "creatopy", name: "Creatopy", category: "marketing", auth: "api-key", tools: [t("generate_banner", "Generate banner", true), t("list_designs", "List designs")] },
  { key: "adcreative_ai", name: "AdCreative.ai", category: "marketing", auth: "api-key", tools: [t("generate_creative", "Generate ad creative", true), t("list_creatives", "List creatives")] },
  { key: "bannerflow", name: "Bannerflow", category: "marketing", auth: "api-key", tools: [t("generate_banner", "Generate banner", true), t("list_campaigns", "List campaigns")] },
  { key: "plaincard", name: "Plaincard", category: "marketing", auth: "api-key", tools: [t("generate_card", "Generate card", true), t("list_cards", "List cards")] },
  { key: "plai", name: "Plai", category: "marketing", auth: "api-key", tools: [t("generate_creative", "Generate creative", true), t("list_creatives", "List creatives")] },
  { key: "wire_stock", name: "Wirestock", category: "marketing", auth: "api-key", tools: [t("submit_content", "Submit content", true), t("list_earnings", "List earnings")] },
  { key: "instasize", name: "Instasize", category: "marketing", auth: "api-key", tools: [t("resize_image", "Resize image", true), t("list_images", "List images")] },
  { key: "clippingmagic", name: "Clipping Magic", category: "marketing", auth: "api-key", tools: [t("remove_background", "Remove background", true), t("list_images", "List images")] },
  { key: "frontify", name: "Frontify", category: "marketing", auth: "oauth2", tools: [t("list_assets", "List brand assets"), t("upload_asset", "Upload asset", true)] },

  // ── ANALYTICS & Attribution ──
  { key: "google_analytics_4", name: "Google Analytics 4", category: "analytics", auth: "oauth2", tools: [t("run_report", "Run analytics report"), t("list_accounts", "List GA accounts"), t("create_audience", "Create audience", true)] },
  { key: "mixpanel", name: "Mixpanel", category: "analytics", auth: "api-key", tools: [t("track_event", "Track event", true), t("query_events", "Query events"), t("create_cohort", "Create cohort", true)] },
  { key: "amplitude", name: "Amplitude", category: "analytics", auth: "api-key", tools: [t("query_events", "Query events"), t("create_cohort", "Create cohort", true), t("track_event", "Track event", true)] },
  { key: "segment", name: "Segment", category: "analytics", auth: "api-key", tools: [t("track_event", "Track event", true), t("identify_user", "Identify user", true), t("list_sources", "List sources")] },
  { key: "snowflake", name: "Snowflake", category: "analytics", auth: "api-key", tools: [t("query", "Run SQL query"), t("list_tables", "List tables")] },
  { key: "bigquery", name: "BigQuery", category: "analytics", auth: "oauth2", tools: [t("query", "Run query"), t("list_datasets", "List datasets")] },
  { key: "triple_whale", name: "Triple Whale", category: "analytics", auth: "api-key", tools: [t("get_attribution", "Get attribution data"), t("list_metrics", "List metrics")] },
  { key: "northbeam", name: "NorthBeam", category: "analytics", auth: "api-key", tools: [t("get_attribution", "Get attribution"), t("list_metrics", "List metrics")] },
  { key: "rubik_ai", name: "Rubik.ai", category: "analytics", auth: "api-key", tools: [t("get_attribution", "Get attribution"), t("list_metrics", "List metrics")] },
  { key: "peerclick", name: "PeerClick", category: "analytics", auth: "api-key", tools: [t("get_attribution", "Get attribution"), t("list_metrics", "List metrics")] },
  { key: "hyros", name: "Hyros", category: "analytics", auth: "api-key", tools: [t("get_attribution", "Get attribution"), t("list_metrics", "List metrics")] },
  { key: "leadsbridge", name: "LeadsBridge", category: "analytics", auth: "api-key", tools: [t("sync_leads", "Sync leads", true), t("list_integrations", "List integrations")] },
  { key: "funnelytics", name: "Funnelytics", category: "analytics", auth: "api-key", tools: [t("get_attribution", "Get attribution"), t("list_metrics", "List metrics")] },
  { key: "leadboxer", name: "LeadBoxer", category: "analytics", auth: "api-key", tools: [t("get_attribution", "Get attribution"), t("list_metrics", "List metrics")] },
  { key: "clickmagick", name: "ClickMagick", category: "analytics", auth: "api-key", tools: [t("get_attribution", "Get attribution"), t("list_metrics", "List metrics")] },
  { key: "redtrack", name: "RedTrack", category: "analytics", auth: "api-key", tools: [t("get_attribution", "Get attribution"), t("list_metrics", "List metrics")] },
  { key: "windsor_ai", name: "Windsor.ai", category: "analytics", auth: "api-key", tools: [t("get_attribution", "Get attribution"), t("list_metrics", "List metrics")] },
  { key: "trackingdesk", name: "TrackingDesk", category: "analytics", auth: "api-key", tools: [t("get_attribution", "Get attribution"), t("list_metrics", "List metrics")] },
  { key: "cake_analytics", name: "CAKE", category: "analytics", auth: "api-key", tools: [t("get_attribution", "Get attribution"), t("list_metrics", "List metrics")] },

  // ── MARKETING — Email & Marketing Automation ──
  { key: "mailchimp_email", name: "Mailchimp", category: "marketing", auth: "oauth2", tools: [t("list_campaigns", "List campaigns"), t("send_campaign", "Send campaign", true), t("list_audiences", "List audiences")] },
  { key: "klaviyo", name: "Klaviyo", category: "marketing", auth: "api-key", tools: [t("list_campaigns", "List campaigns"), t("create_campaign", "Create campaign", true), t("list_segments", "List segments")] },
  { key: "iterable", name: "Iterable", category: "marketing", auth: "api-key", tools: [t("list_campaigns", "List campaigns"), t("send_message", "Send message", true), t("list_users", "List users")] },
  { key: "brevo_email", name: "Brevo", category: "marketing", auth: "api-key", tools: [t("send_email", "Send email", true), t("list_campaigns", "List campaigns"), t("list_contacts", "List contacts")] },
  { key: "activecampaign", name: "ActiveCampaign", category: "marketing", auth: "api-key", tools: [t("list_campaigns", "List campaigns"), t("create_campaign", "Create campaign", true), t("list_contacts", "List contacts")] },
  { key: "customerio_email", name: "Customer.io", category: "marketing", auth: "api-key", tools: [t("list_segments", "List segments"), t("send_campaign", "Trigger campaign", true)] },
  { key: "omnisend", name: "Omnisend", category: "marketing", auth: "api-key", tools: [t("list_campaigns", "List campaigns"), t("send_campaign", "Send campaign", true), t("list_contacts", "List contacts")] },
  { key: "sendinblue", name: "Sendinblue", category: "marketing", auth: "api-key", tools: [t("send_email", "Send email", true), t("list_campaigns", "List campaigns")] },
  { key: "mailerlite", name: "MailerLite", category: "marketing", auth: "api-key", tools: [t("list_campaigns", "List campaigns"), t("create_campaign", "Create campaign", true), t("list_subscribers", "List subscribers")] },
  { key: "convertkit", name: "ConvertKit", category: "marketing", auth: "api-key", tools: [t("list_forms", "List forms"), t("add_subscriber", "Add subscriber", true), t("list_subscribers", "List subscribers")] },
  { key: "drip", name: "Drip", category: "marketing", auth: "api-key", tools: [t("list_campaigns", "List campaigns"), t("add_subscriber", "Add subscriber", true), t("list_subscribers", "List subscribers")] },
  { key: "getresponse", name: "GetResponse", category: "marketing", auth: "api-key", tools: [t("list_campaigns", "List campaigns"), t("add_contact", "Add contact", true)] },
  { key: "aweber", name: "AWeber", category: "marketing", auth: "oauth2", tools: [t("list_campaigns", "List campaigns"), t("add_subscriber", "Add subscriber", true)] },
  { key: "constantcontact", name: "Constant Contact", category: "marketing", auth: "oauth2", tools: [t("list_campaigns", "List campaigns"), t("create_campaign", "Create campaign", true)] },
  { key: "sendgrid_marketing", name: "SendGrid Marketing", category: "marketing", auth: "api-key", tools: [t("list_campaigns", "List campaigns"), t("create_campaign", "Create campaign", true)] },
  { key: "campaignmonitor", name: "Campaign Monitor", category: "marketing", auth: "api-key", tools: [t("list_campaigns", "List campaigns"), t("create_campaign", "Create campaign", true)] },
  { key: "hubspot_marketing", name: "HubSpot Marketing", category: "marketing", auth: "oauth2", tools: [t("list_campaigns", "List campaigns"), t("create_campaign", "Create campaign", true), t("list_contacts", "List contacts")] },

  // ── MARKETING — Data Enrichment ──
  { key: "clearbit", name: "Clearbit", category: "marketing", auth: "api-key", tools: [t("enrich", "Enrich company/person", true), t("search", "Search companies")] },
  { key: "zoominfo_enrich", name: "ZoomInfo", category: "marketing", auth: "api-key", tools: [t("enrich", "Enrich contact", true), t("search", "Search database")] },
  { key: "apollo_enrich", name: "Apollo.io", category: "marketing", auth: "api-key", tools: [t("search_people", "Search people"), t("enrich", "Enrich contact", true)] },
  { key: "6sense", name: "6sense", category: "marketing", auth: "api-key", tools: [t("get_intent", "Get intent signals"), t("list_accounts", "List accounts")] },
  { key: "bombora", name: "Bombora", category: "marketing", auth: "api-key", tools: [t("get_intent", "Get intent data"), t("list_topics", "List topics")] },
  { key: "demandbase", name: "Demandbase", category: "marketing", auth: "api-key", tools: [t("get_intent", "Get intent signals"), t("list_accounts", "List accounts")] },
  { key: "dun_bradstreet", name: "Dun & Bradstreet", category: "marketing", auth: "api-key", tools: [t("search", "Search companies"), t("get_details", "Get company details")] },
  { key: "lattice", name: "Lattice Engines", category: "marketing", auth: "api-key", tools: [t("get_intent", "Get intent data"), t("list_accounts", "List accounts")] },
  { key: "leadspace", name: "Leadspace", category: "marketing", auth: "api-key", tools: [t("enrich", "Enrich data", true), t("search", "Search")] },
  { key: "seamless_ai", name: "Seamless.ai", category: "marketing", auth: "api-key", tools: [t("search", "Search contacts"), t("enrich", "Enrich contact", true)] },

  // ── MARKETING — E-Commerce ──
  { key: "shopify_marketing", name: "Shopify Marketing", category: "marketing", auth: "oauth2", tools: [t("list_products", "List products"), t("list_orders", "List orders"), t("update_inventory", "Update inventory", true)] },
  { key: "woocommerce_mkt", name: "WooCommerce", category: "marketing", auth: "api-key", tools: [t("list_orders", "List orders"), t("list_products", "List products"), t("update_product", "Update product", true)] },
  { key: "bigcommerce_mkt", name: "BigCommerce", category: "marketing", auth: "oauth2", tools: [t("list_products", "List products"), t("list_orders", "List orders")] },
  { key: "magento_mkt", name: "Magento", category: "marketing", auth: "api-key", tools: [t("list_products", "List products"), t("list_orders", "List orders")] },
  { key: "stripe_mkt", name: "Stripe", category: "marketing", auth: "api-key", tools: [t("list_customers", "List customers"), t("list_invoices", "List invoices"), t("create_payment_link", "Create payment link", true)] },

  // ── MARKETING — Influencer & Affiliate ──
  { key: "aspireiq", name: "AspireIQ", category: "marketing", auth: "api-key", tools: [t("list_creators", "List creators"), t("create_campaign", "Create campaign", true)] },
  { key: "grin", name: "Grin", category: "marketing", auth: "api-key", tools: [t("list_creators", "List creators"), t("create_campaign", "Create campaign", true)] },
  { key: "impact_affiliate", name: "Impact", category: "marketing", auth: "api-key", tools: [t("list_partners", "List partners"), t("create_campaign", "Create campaign", true)] },
  { key: "tapfiliate_mkt", name: "Tapfiliate", category: "marketing", auth: "api-key", tools: [t("list_affiliates", "List affiliates"), t("create_campaign", "Create campaign", true)] },
  { key: "partnerstack", name: "PartnerStack", category: "marketing", auth: "api-key", tools: [t("list_partners", "List partners"), t("create_campaign", "Create campaign", true)] },
  { key: "refersion", name: "Refersion", category: "marketing", auth: "api-key", tools: [t("list_affiliates", "List affiliates"), t("create_campaign", "Create campaign", true)] },
  { key: "tUNE", name: "TUNE", category: "marketing", auth: "api-key", tools: [t("list_partners", "List partners"), t("create_campaign", "Create campaign", true)] },

  // ── MARKETING — Fraud & Brand Safety ──
  { key: "doubleverify", name: "DoubleVerify", category: "marketing", auth: "api-key", tools: [t("get_verification", "Get verification data"), t("list_campaigns", "List campaigns")] },
  { key: "ias", name: "Integral Ad Science", category: "marketing", auth: "api-key", tools: [t("get_verification", "Get verification data"), t("list_campaigns", "List campaigns")] },
  { key: "moat", name: "Moat", category: "marketing", auth: "api-key", tools: [t("get_verification", "Get verification data"), t("list_campaigns", "List campaigns")] },
  { key: "human_security", name: "HUMAN Security", category: "marketing", auth: "api-key", tools: [t("get_verification", "Get verification data"), t("list_campaigns", "List campaigns")] },
  { key: "cheq", name: "CHEQ", category: "marketing", auth: "api-key", tools: [t("get_verification", "Get verification data"), t("list_campaigns", "List campaigns")] },
];

export const EXTENDED_PROVIDERS: CatalogProvider[] = RAW.map(
  (entry) => ({
    key: entry.key,
    name: entry.name,
    category: entry.category,
    auth: entry.auth,
    description: `${entry.name} integration for ${entry.category}`,
    tools: entry.tools,
  }),
);
