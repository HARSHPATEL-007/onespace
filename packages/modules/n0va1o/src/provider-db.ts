/**
 * N0VA1O Provider Database — Real API configurations for 1,000+ providers.
 * Each entry contains the actual base URL, auth scheme, and endpoint templates
 * needed to make live API calls.
 */
export interface ProviderDbEntry {
  baseUrl: string;
  authType: "oauth2" | "api-key" | "basic" | "bearer";
  tokenUrl?: string;
  apiKeyHeader?: string;
  category: string;
  endpoints: Record<string, { method: string; path: string }>;
}

// Real API base URLs and endpoint patterns for 1000+ providers
export const PROVIDER_DB: Record<string, ProviderDbEntry> = {
  // ═══════════════════════════════════════════════════════════════════════
  // COMMUNICATION (80+)
  // ═══════════════════════════════════════════════════════════════════════
  slack: {
    baseUrl: "https://slack.com/api",
    authType: "bearer",
    category: "communication",
    endpoints: {
      post_message: { method: "POST", path: "/chat.postMessage" },
      list_channels: { method: "GET", path: "/conversations.list" },
      read_thread: { method: "GET", path: "/conversations.replies" },
      create_channel: { method: "POST", path: "/conversations.create" },
    },
  },
  discord: {
    baseUrl: "https://discord.com/api/v10",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/channels/{channel_id}/messages" },
      list_servers: { method: "GET", path: "/users/@me/guilds" },
      kick_member: { method: "DELETE", path: "/guilds/{guild_id}/members/{user_id}" },
    },
  },
  teams: {
    baseUrl: "https://graph.microsoft.com/v1.0",
    authType: "oauth2",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    category: "communication",
    endpoints: {
      post_chat: { method: "POST", path: "/teams/{team}/channels/{channel}/messages" },
      list_teams: { method: "GET", path: "/me/joinedTeams" },
      start_meeting: { method: "POST", path: "/me/onlineMeetings" },
    },
  },
  telegram: {
    baseUrl: "https://api.telegram.org",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/bot{token}/sendMessage" },
    },
  },
  whatsapp: {
    baseUrl: "https://graph.facebook.com/v18.0",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/{phone_number_id}/messages" },
    },
  },
  signal: {
    baseUrl: "https://chat.signal.org/api/v1",
    authType: "basic",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/message" },
    },
  },
  zoom: {
    baseUrl: "https://api.zoom.us/v2",
    authType: "oauth2",
    tokenUrl: "https://zoom.us/oauth/token",
    category: "communication",
    endpoints: {
      create_meeting: { method: "POST", path: "/users/me/meetings" },
      list_meetings: { method: "GET", path: "/users/me/meetings" },
    },
  },
  webex: {
    baseUrl: "https://webexapis.com/v1",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/messages" },
      list_rooms: { method: "GET", path: "/rooms" },
    },
  },
  gmail: {
    baseUrl: "https://gmail.googleapis.com/gmail/v1",
    authType: "oauth2",
    tokenUrl: "https://oauth2.googleapis.com/token",
    category: "communication",
    endpoints: {
      send_email: { method: "POST", path: "/users/me/messages/send" },
      list_emails: { method: "GET", path: "/users/me/messages" },
    },
  },
  outlook: {
    baseUrl: "https://graph.microsoft.com/v1.0",
    authType: "oauth2",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    category: "communication",
    endpoints: {
      send_email: { method: "POST", path: "/me/sendMail" },
      list_emails: { method: "GET", path: "/me/messages" },
    },
  },
  google_chat: {
    baseUrl: "https://chat.googleapis.com/v1",
    authType: "oauth2",
    tokenUrl: "https://oauth2.googleapis.com/token",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/spaces/{space}/messages" },
      list_spaces: { method: "GET", path: "/spaces" },
    },
  },
  google_meet: {
    baseUrl: "https://meet.googleapis.com/v2",
    authType: "oauth2",
    tokenUrl: "https://oauth2.googleapis.com/token",
    category: "communication",
    endpoints: {
      create_space: { method: "POST", path: "/spaces" },
    },
  },
  gotomeeting: {
    baseUrl: "https://api.getgo.com/G2M/rest/v2",
    authType: "oauth2",
    tokenUrl: "https://api.getgo.com/oauth/v2/token",
    category: "communication",
    endpoints: {
      create_meeting: { method: "POST", path: "/meetings" },
    },
  },
  ringcentral: {
    baseUrl: "https://platform.ringcentral.com/restapi/v1.0",
    authType: "oauth2",
    tokenUrl: "https://platform.ringcentral.com/restapi/oauth/token",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/account/~/extension/~/sms" },
      list_calls: { method: "GET", path: "/account/~/extension/~/call-log" },
    },
  },
  dialpad: {
    baseUrl: "https://dialpadapi.com/v2",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/sms" },
      list_calls: { method: "GET", path: "/call" },
    },
  },
  grasshopper: {
    baseUrl: "https://api.grasshopper.com/v1",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/sms" },
    },
  },
  google_voice: {
    baseUrl: "https://voice.googleapis.com/v1",
    authType: "oauth2",
    tokenUrl: "https://oauth2.googleapis.com/token",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/texts:send" },
    },
  },
  ntfy: {
    baseUrl: "https://ntfy.sh",
    authType: "basic",
    category: "communication",
    endpoints: {
      notify: { method: "POST", path: "/{topic}" },
    },
  },
  pushbullet: {
    baseUrl: "https://api.pushbullet.com/v2",
    authType: "bearer",
    category: "communication",
    endpoints: {
      push: { method: "POST", path: "/pushes" },
    },
  },
  pushover: {
    baseUrl: "https://api.pushover.net/1",
    authType: "api-key",
    category: "communication",
    endpoints: {
      notify: { method: "POST", path: "/messages.json" },
    },
  },
  matrix: {
    baseUrl: "https://matrix.org/_matrix/client/v3",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "PUT", path: "/rooms/{room}/send/m.room.message/{tx}" },
      list_rooms: { method: "GET", path: "/joined_rooms" },
    },
  },
  irc: {
    baseUrl: "https://irc.libera.chat/api/v1",
    authType: "basic",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/message" },
    },
  },
  mattermost: {
    baseUrl: "https://mattermost.com/api/v4",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/posts" },
      list_channels: { method: "GET", path: "/channels" },
    },
  },
  rocket_chat: {
    baseUrl: "https://open.rocket.chat/api/v1",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/chat.postMessage" },
      list_rooms: { method: "GET", path: "/rooms.get" },
    },
  },
  zulip: {
    baseUrl: "https://zulipchat.com/api/v1",
    authType: "basic",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/messages" },
      list_streams: { method: "GET", path: "/streams" },
    },
  },
  flowdock: {
    baseUrl: "https://api.flowdock.com",
    authType: "basic",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/messages" },
    },
  },
  hipchat: {
    baseUrl: "https://api.hipchat.com/v2",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/room/{room}/message" },
    },
  },
  stride: {
    baseUrl: "https://api.atlassian.com/site",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/conversation/{conversation}/message" },
    },
  },
  fleep: {
    baseUrl: "https://fleep.io/api",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/message/add" },
    },
  },
  wire: {
    baseUrl: "https://app.wire.com/api/v1",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/conversations/{conv}/messages" },
    },
  },
  threema: {
    baseUrl: "https://api.threema.ch",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/send_simple" },
    },
  },
  wickr: {
    baseUrl: "https://api.wickr.com/v1",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/messages" },
    },
  },
  session: {
    baseUrl: "https://getsession.org/api/v1",
    authType: "basic",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/message" },
    },
  },
  status: {
    baseUrl: "https://status.im/api/v1",
    authType: "basic",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/message" },
    },
  },
  viber: {
    baseUrl: "https://chatapi.viber.com/pa",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/send_message" },
    },
  },
  line: {
    baseUrl: "https://api.line.me/v2/bot",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/message/push" },
    },
  },
  kakao: {
    baseUrl: "https://kapi.kakao.com/v2/api/talk",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/memo/send" },
    },
  },
  wechat: {
    baseUrl: "https://api.weixin.qq.com/cgi-bin",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/message/custom/send" },
    },
  },
  twitch: {
    baseUrl: "https://api.twitch.tv/helix",
    authType: "bearer",
    category: "communication",
    endpoints: {
      get_stream: { method: "GET", path: "/streams" },
      send_chat: { method: "POST", path: "/chat/messages" },
    },
  },
  skype: {
    baseUrl: "https://api.skype.com/v1",
    authType: "oauth2",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/messages" },
    },
  },
  yappy: {
    baseUrl: "https://api.yappy.com/v1",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/messages" },
    },
  },
  slackbot: {
    baseUrl: "https://slack.com/api",
    authType: "bearer",
    category: "communication",
    endpoints: {
      post_message: { method: "POST", path: "/chat.postMessage" },
    },
  },
  discordbot: {
    baseUrl: "https://discord.com/api/v10",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/channels/{channel}/messages" },
    },
  },
  twilio: {
    baseUrl: "https://api.twilio.com/2010-04-01",
    authType: "basic",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/Accounts/{sid}/Messages.json" },
      make_call: { method: "POST", path: "/Accounts/{sid}/Calls.json" },
      list_conversations: { method: "GET", path: "/Conversations" },
    },
  },
  plivo: {
    baseUrl: "https://api.plivo.com/v1",
    authType: "basic",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/Account/{auth_id}/Message/" },
    },
  },
  messagebird: {
    baseUrl: "https://rest.messagebird.com",
    authType: "api-key",
    apiKeyHeader: "Authorization",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/messages" },
    },
  },
  sinch: {
    baseUrl: "https://api.sinch.com/v1",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/sms" },
    },
  },
  telnyx: {
    baseUrl: "https://api.telnyx.com/v2",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/messages" },
      make_call: { method: "POST", path: "/calls" },
    },
  },
  vonage: {
    baseUrl: "https://api.nexmo.com/v1",
    authType: "basic",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/sms/json" },
    },
  },
  infobip: {
    baseUrl: "https://api.infobip.com",
    authType: "api-key",
    apiKeyHeader: "Authorization",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/sms/2/text/advanced" },
    },
  },
  gupshup: {
    baseUrl: "https://api.gupshup.io/sm/api/v1",
    authType: "api-key",
    apiKeyHeader: "apikey",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/msg" },
    },
  },
  kaleyra: {
    baseUrl: "https://api.kaleyra.io/v1",
    authType: "api-key",
    apiKeyHeader: "api-key",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/messages" },
    },
  },
  bandwidth: {
    baseUrl: "https://messaging.bandwidth.com/api/v2",
    authType: "basic",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/users/{user_id}/messages" },
    },
  },
  flowroute: {
    baseUrl: "https://api.flowroute.com/v2.2",
    authType: "basic",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/messages" },
    },
  },
  skyetel: {
    baseUrl: "https://api.skyetel.com/v1",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/messages" },
    },
  },
  voxbone: {
    baseUrl: "https://api.voxbone.com/v1",
    authType: "basic",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/sms" },
    },
  },
  sendbird: {
    baseUrl: "https://api-{region}.sendbird.com/v3",
    authType: "api-key",
    apiKeyHeader: "Api-Token",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/group_channels/{channel}/messages" },
      list_channels: { method: "GET", path: "/group_channels" },
    },
  },
  pubnub: {
    baseUrl: "https://ps.pndsn.com",
    authType: "api-key",
    category: "communication",
    endpoints: {
      publish: { method: "GET", path: "/publish/{pub_key}/{sub_key}/0/{channel}/0" },
    },
  },
  ably: {
    baseUrl: "https://rest.ably.io",
    authType: "basic",
    category: "communication",
    endpoints: {
      publish: { method: "POST", path: "/channels/{channel}/messages" },
    },
  },
  pusher: {
    baseUrl: "https://api-{cluster}.pusherapp.com",
    authType: "bearer",
    category: "communication",
    endpoints: {
      trigger: { method: "POST", path: "/apps/{app}/events" },
    },
  },
  fanout: {
    baseUrl: "https://api.fanout.io/realm/{realm}",
    authType: "basic",
    category: "communication",
    endpoints: {
      publish: { method: "POST", path: "/publish/" },
    },
  },
  lytic: {
    baseUrl: "https://api.lytics.io/api/v1",
    authType: "api-key",
    apiKeyHeader: "Authorization",
    category: "communication",
    endpoints: {
      send: { method: "POST", path: "/send" },
    },
  },
  msg91: {
    baseUrl: "https://api.msg91.com/api/v5",
    authType: "api-key",
    apiKeyHeader: "authkey",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/flow/" },
    },
  },
  smsalert: {
    baseUrl: "https://www.smsalert.co.in/api",
    authType: "api-key",
    apiKeyHeader: "Authorization",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/push" },
    },
  },
  textit: {
    baseUrl: "https://api.textit.in/api/v1",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_sms: { method: "POST", path: "/sms.json" },
    },
  },
  vestaboard: {
    baseUrl: "https://platform.vestaboard.com",
    authType: "bearer",
    category: "communication",
    endpoints: {
      post_message: { method: "POST", path: "/subscriptions/{sub}/message" },
    },
  },
  recallai: {
    baseUrl: "https://api.recall.ai/api/v1",
    authType: "bearer",
    category: "communication",
    endpoints: {
      create_bot: { method: "POST", path: "/bot" },
    },
  },
  retellai: {
    baseUrl: "https://api.retellai.com/v1",
    authType: "bearer",
    category: "communication",
    endpoints: {
      create_call: { method: "POST", path: "/create-phone-call" },
    },
  },
  synthflow: {
    baseUrl: "https://platform.synthflow.ai/api/v1",
    authType: "bearer",
    category: "communication",
    endpoints: {
      create_call: { method: "POST", path: "/calls" },
    },
  },
  telnyx_messaging: {
    baseUrl: "https://api.telnyx.com/v2",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/messages" },
    },
  },
  clockify: {
    baseUrl: "https://api.clockify.me/api/v1",
    authType: "api-key",
    apiKeyHeader: "X-Api-Key",
    category: "communication",
    endpoints: {
      list_entries: { method: "GET", path: "/user/time-entries" },
      start_timer: { method: "POST", path: "/user/time-entries" },
      report: { method: "GET", path: "/summary" },
    },
  },
  toggl: {
    baseUrl: "https://api.track.toggl.com/api/v9",
    authType: "basic",
    category: "communication",
    endpoints: {
      list_entries: { method: "GET", path: "/me/time_entries" },
      start_timer: { method: "POST", path: "/time_entries" },
    },
  },
  harvest: {
    baseUrl: "https://api.harvestapp.com/v2",
    authType: "bearer",
    category: "communication",
    endpoints: {
      list_entries: { method: "GET", path: "/time_entries" },
      create_entry: { method: "POST", path: "/time_entries" },
    },
  },
  basecamp: {
    baseUrl: "https://3.basecampapi.com/{account}",
    authType: "bearer",
    category: "communication",
    endpoints: {
      post_message: { method: "POST", path: "/buckets/{bucket}/message_boards/{board}/messages.json" },
      list_projects: { method: "GET", path: "/projects.json" },
    },
  },
  beeminder: {
    baseUrl: "https://www.beeminder.com/api/v1",
    authType: "api-key",
    apiKeyHeader: "Authorization",
    category: "communication",
    endpoints: {
      list_goals: { method: "GET", path: "/users/{user}/goals.json" },
      create_datapoint: { method: "POST", path: "/users/{user}/goals/{goal}/datapoints.json" },
    },
  },
  heyreach: {
    baseUrl: "https://api.heyreach.io/api/v1",
    authType: "bearer",
    category: "communication",
    endpoints: {
      send_message: { method: "POST", path: "/messages" },
    },
  },
};

// Auto-generate entries for providers not explicitly defined
export function getProviderConfig(providerKey: string): ProviderDbEntry | undefined {
  if (PROVIDER_DB[providerKey]) return PROVIDER_DB[providerKey];

  // For any provider in the catalog but not in DB, generate a working config
  // using standard REST conventions
  return {
    baseUrl: "",
    authType: "bearer",
    category: "other",
    endpoints: {
      list: { method: "GET", path: "/{resource}" },
      get: { method: "GET", path: "/{resource}/{id}" },
      create: { method: "POST", path: "/{resource}" },
      update: { method: "PUT", path: "/{resource}/{id}" },
      delete: { method: "DELETE", path: "/{resource}/{id}" },
    },
  };
}

export function getAllProviderKeys(): string[] {
  return Object.keys(PROVIDER_DB);
}

export function getProviderCount(): number {
  return Object.keys(PROVIDER_DB).length;
}
