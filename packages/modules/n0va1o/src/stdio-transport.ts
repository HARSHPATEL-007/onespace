/**
 * N0VA1O stdio MCP transport — for local IDE integration (Cursor, VS Code, Claude Desktop).
 *
 * Reads JSON-RPC 2.0 messages from stdin (newline-delimited), writes responses to stdout.
 * This is the fastest transport (<1ms latency) for local AI agent connections.
 *
 * Usage: npx @n0va1o/sdk stdio --workspace <slug> --key <mcpKey>
 */
import { createInterface } from "node:readline";
import { prisma } from "@n0va/db";
import { N0va1oGateway } from "./gateway";
import { handleMcpMessage, type McpContext, type McpMessage } from "./mcp";

export interface StdioTransportOptions {
  workspaceSlug: string;
  mcpKey: string;
}

/**
 * Run the stdio MCP transport. Reads newline-delimited JSON-RPC from stdin,
 * writes responses to stdout. Runs until stdin closes.
 */
export async function runStdioTransport(opts: StdioTransportOptions): Promise<void> {
  const rl = createInterface({ input: process.stdin, terminal: false });

  let gateway: N0va1oGateway | null = null;
  let integration: Awaited<ReturnType<typeof resolveIntegration>> | null = null;

  rl.on("line", async (line) => {
    if (!line.trim()) return;

    let message: McpMessage;
    try {
      message = JSON.parse(line) as McpMessage;
    } catch {
      writeResponse({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }

    try {
      // Lazy init on first message
      if (!gateway || !integration) {
        integration = await resolveIntegration(opts.workspaceSlug, opts.mcpKey);
        if (!integration) {
          writeResponse({
            jsonrpc: "2.0",
            id: message.id ?? null,
            error: { code: -32001, message: "Invalid workspace or MCP key" },
          });
          return;
        }
        gateway = new N0va1oGateway();
      }

      const ctx: McpContext = {
        integration,
        workspaceId: integration.workspaceId,
        actorLabel: "stdio-client",
        gateway,
      };

      const response = await handleMcpMessage(message, ctx);
      writeResponse(response);
    } catch (err) {
      writeResponse({
        jsonrpc: "2.0",
        id: message!.id ?? null,
        error: { code: -32603, message: err instanceof Error ? err.message : "Internal error" },
      });
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });

  // Signal readiness to parent process
  process.stderr.write(JSON.stringify({ ready: true, transport: "stdio", workspace: opts.workspaceSlug }) + "\n");
}

function writeResponse(response: unknown): void {
  process.stdout.write(JSON.stringify(response) + "\n");
}

async function resolveIntegration(slug: string, mcpKey: string) {
  const workspace = await prisma.workspace.findUnique({ where: { slug } });
  if (!workspace || workspace.mcpKey !== mcpKey) return null;

  // Find the primary integration for this workspace
  return prisma.integration.findFirst({
    where: { workspaceId: workspace.id, enabled: true },
    orderBy: { updatedAt: "desc" },
  });
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const slugIdx = args.indexOf("--workspace");
  const keyIdx = args.indexOf("--key");
  if (slugIdx < 0 || keyIdx < 0) {
    console.error("Usage: npx @n0va1o/sdk stdio --workspace <slug> --key <mcpKey>");
    process.exit(1);
  }
  runStdioTransport({
    workspaceSlug: args[slugIdx + 1]!,
    mcpKey: args[keyIdx + 1]!,
  });
}
