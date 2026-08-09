# N0VA1O — Infinite Integration Gateway

**Transcendent Edition v2026.07**

> One Gateway. Infinite Possibilities.

N0VA1O collapses the N×M integration problem down to 1. A unified MCP gateway enabling framework-agnostic AI agents to securely connect to 1,000+ third-party applications.

## Architecture

```
n0va1o/
├── packages/
│   ├── core/         # MCP Gateway, transport layer, intent router, auth
│   ├── sdk/          # Client SDK (TypeScript)
│   ├── connectors/   # Platform connectors (Google Drive, Slack, Salesforce)
│   ├── sandbox/      # Ephemeral code execution + virtual filesystem
│   ├── hitl/         # Human-in-the-Loop interrogation rooms
│   └── recipes/      # Workflow-to-recipe compiler
└── examples/
    └── full-workflow.ts  # Complete end-to-end demo
```

## Packages

| Package | Purpose | Key Features |
|---------|---------|--------------|
| `@n0va1o/core` | Gateway core | Agent registry, session management, tool discovery, audit logging, webhooks |
| `@n0va1o/sdk` | Client SDK | Agent CRUD, session lifecycle, tool discovery, sandbox execution |
| `@n0va1o/connectors` | Platform integrations | OAuth flows, webhook subscriptions, protocol translation |
| `@n0va1o/sandbox` | Code execution | MicroVM provisioning, virtual filesystem, large payload offloading |
| `@n0va1o/hitl` | Human oversight | Risk assessment, interrogation rooms, approval workflows |
| `@n0va1o/recipes` | Workflow compiler | Capture, compile, schedule, execute deterministic recipes |

## Quick Start

```typescript
import { createClient } from '@n0va1o/sdk';

const client = createClient({
  apiKey: 'n0va_sk_...',
  tenantId: 'tenant_001',
  endpoint: 'https://n0va1o.io',
  transport: 'websocket',
});

// Register an agent
const agent = await client.registerAgent({
  name: 'Finance Agent',
  type: 'workflow_orchestrator',
  permissions: ['storage.read', 'sheets.write', 'slack.post'],
  autonomyLevel: 'high',
  sandboxEnabled: true,
});

// Create a session
const session = await client.createSession({
  agentId: agent.agentId,
  context: { userId: 'user_001', tenantId: 'tenant_001', sessionType: 'interactive' },
});

// Discover tools by intent
const tools = await client.discoverTools(
  'Find Q3 invoices and upload to sheets',
  agent.agentId
);
```

## Core Capabilities

### Intent-Driven Tool Discovery
```typescript
const discovery = await client.discoverTools(
  'Find Q3 invoices in Drive, convert to CSV, notify Slack',
  agentId,
  5
);
// Returns: { intent, confidence, tools[], suggestedWorkflow, contextTokensSaved }
```

### Ephemeral Sandboxes
```typescript
import { SandboxRuntime } from '@n0va1o/sandbox';

const runtime = new SandboxRuntime();
const env = await runtime.provision(sessionId, { cpuQuota: 4, ramQuota: 8192 });
const result = await runtime.execute(env.id, 'print("Hello from sandbox")', 'python');
```

### Human-in-the-Loop
```typescript
import { createInterrogationRoom } from '@n0va1o/hitl';

const ir = createInterrogationRoom(['admin@company.com']);
const room = await ir.initiate(sessionId, agentId, proposedAction, reasoning, data, autonomy);
// Human reviews → approve/reject/modify with digital signature
const resolved = await ir.resolve(room.requestId, 'approved', 'admin@company.com');
```

### Recipe Compilation
```typescript
import { createCompiler } from '@n0va1o/recipes';

const compiler = createCompiler();
// Capture workflow → compile to deterministic API
const recipe = compiler.compileFromSession(sessionId, 'Invoice_Sync', 'Auto-sync invoices');
const result = await compiler.executeRecipe(recipe.recipeId);
// Bypasses LLM inference: <100ms p99 vs 2-5s LLM-driven
```

## Security Model

- **Zero-Trust Auth**: AES-256-GCM envelope encryption, JIT provisioning, token rotation
- **Schema Modifiers**: Pre-LLM redaction of dangerous parameters
- **HITL Escalation**: Risk-based approval with digital signatures
- **Audit Trail**: Immutable Merkle tree + blockchain anchoring
- **Compliance**: GDPR, SOC 2, HIPAA, FedRAMP, PCI DSS, NIS2

## Transport Modes

| Transport | Latency | Use Case |
|-----------|---------|----------|
| stdio | <1ms | Local IDE (Cursor, VS Code) |
| HTTP SSE | <50ms | Cloud/remote deployment |
| WebSocket | <10ms | Real-time bidirectional |

## License

N0VA Workspace — Transcendent Edition
