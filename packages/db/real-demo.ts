/**
 * N0VA1O Real API Demo — exercises live provider APIs.
 *
 * Run: pnpm --filter @n0va/db exec tsx packages/db/real-demo.ts
 *
 * Set GITHUB_TOKEN to a real GitHub personal access token to hit live APIs.
 * Without a token, it runs in demo mode showing what would happen.
 */

import { generateConnectLink } from "../modules/n0va1o/src/gateway.ts";
import { discoverTools } from "../modules/n0va1o/src/catalog.ts";
import { ADAPTERS } from "../modules/n0va1o/src/adapters.ts";

function header(title: string): void {
  console.log("");
  console.log("============================================================");
  console.log("  " + title);
  console.log("============================================================");
}

function section(title: string): void {
  console.log("");
  console.log("--- " + title + " ---");
}

async function main(): Promise<void> {
  header("N0VA1O — Real API Demo");
  const token = process.env["GITHUB_TOKEN"];
  const mode = token ? "LIVE" : "DEMO (set GITHUB_TOKEN for live API calls)";
  console.log("Mode: " + mode);

  // 1. OAuth connect link generation
  section("1. OAuth Connect Link (Real)");
  const link = generateConnectLink("github", "http://localhost:3100/api/n0va1o/callback", "workspace-123");
  console.log("  Provider: " + link.provider);
  console.log("  Auth URL: " + link.authUrl.slice(0, 120) + "...");
  console.log("  State: " + link.state);
  console.log("  Expires in: " + link.expiresIn + "s");

  // 2. Intent-driven discovery
  section("2. Intent-Driven Tool Discovery");
  const query = "list all repositories and issues for my project";
  const discovered = discoverTools(query, { maxTools: 3 });
  console.log("  Query: \"" + query + "\"");
  for (const tool of discovered) {
    console.log("  -> " + tool.providerKey + ":" + tool.name + " (" + (tool.relevance * 100).toFixed(0) + "% match)");
  }

  // 3. Real API call via adapter
  section("3. GitHub API Call (Live Adapter)");
  const integration = {
    id: "demo-conn",
    provider: "github",
    name: "Demo GitHub",
    enabled: true,
    mcpEnabled: true,
    config: { token: token ?? "demo-token" },
    workspaceId: "demo-workspace",
    retryMax: 3,
    rateLimitPerMin: 120,
    timeoutMs: 15000,
    allowlistTools: [],
    blocklistTools: [],
    lastSyncAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never;

  // list_repos
  const listRepos = ADAPTERS["github:list_repos"];
  if (listRepos) {
    const result = await listRepos({ integration, input: { owner: "octocat" } });
    console.log("  github:list_repos -> " + result.message);
  }

  // get_repo
  const getRepo = ADAPTERS["github:get_repo"];
  if (getRepo) {
    const result = await getRepo({ integration, input: { owner: "octocat", repo: "Hello-World" } });
    console.log("  github:get_repo  -> " + result.message);
  }

  // 4. OpenAI (if key present)
  if (process.env["OPENAI_API_KEY"]) {
    section("4. OpenAI API Call (Live)");
    const openaiChat = ADAPTERS["openai:chat"];
    if (openaiChat) {
      const cfg = { ...(integration.config as object), token: process.env["OPENAI_API_KEY"] };
      const aiIntegration = { ...integration, config: cfg } as never;
      const result = await openaiChat({ integration: aiIntegration, input: { prompt: "Say hello in one sentence" } });
      console.log("  openai:chat -> " + result.message);
    }
  } else {
    section("4. OpenAI API Call");
    console.log("  Skipped (set OPENAI_API_KEY to test live)");
  }

  header("Real API Demo Complete");
  console.log("  Mode: " + mode);
  console.log("  Adapters available: " + Object.keys(ADAPTERS).join(", "));
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
