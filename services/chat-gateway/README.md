# N0VA Chat Gateway (Rust)

High-performance WebSocket gateway for N0VA Chat. Handles real-time message delivery, presence, and typing indicators.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         N0VA CHAT — HYBRID ARCHITECTURE                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                        Next.js Frontend                         │  │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │  │
│   │  │  ChatPanel   │  │  Channel    │  │  Message Composer       │ │  │
│   │  │  Component   │  │  List       │  │  + Reactions            │ │  │
│   │  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │  │
│   │         │                │                      │               │  │
│   │         └────────────────┴──────────────────────┘               │  │
│   │                          │                                       │  │
│   │              WebSocket (primary) / SSE (fallback)                │  │
│   └──────────────────────────┼───────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                   Rust Chat Gateway (Actix-web)                 │  │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │  │
│   │  │  WebSocket   │  │  Message    │  │  Presence               │ │  │
│   │  │  Handler     │  │  Router     │  │  Tracker                │ │  │
│   │  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │  │
│   │         │                │                      │               │  │
│   │         └────────────────┴──────────────────────┘               │  │
│   │                          │                                       │  │
│   │              ┌───────────┴───────────┐                          │  │
│   │              │    Redis Pub/Sub      │                          │  │
│   │              │  (Event Bridge)       │                          │  │
│   │              └───────────┬───────────┘                          │  │
│   │                          │                                       │  │
│   └──────────────────────────┼───────────────────────────────────────┘  │
│                              │                                          │
│              ┌───────────────┼───────────────┐                          │
│              │               │               │                          │
│              ▼               ▼               ▼                          │
│   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│   │  PostgreSQL  │  │    Redis     │  │  Next.js     │                  │
│   │  (Source of  │  │   (Cache +   │  │  SSE Fallback│                  │
│   │   Truth)     │  │    Pub/Sub)  │  │  Endpoint    │                  │
│   └─────────────┘  └──────────────┘  └──────────────┘                  │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                     Next.js Backend (API)                        │  │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │  │
│   │  │  Server      │  │  REST API   │  │  SSE Stream             │ │  │
│   │  │  Actions     │  │  Routes     │  │  (fallback)             │ │  │
│   │  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │  │
│   │         │                │                      │               │  │
│   │         └────────────────┴──────────────────────┘               │  │
│   │                          │                                       │  │
│   └──────────────────────────┼───────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│                     ┌──────────────┐                                    │
│                     │  PostgreSQL  │                                    │
│                     └──────────────┘                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Rust WebSocket Gateway (`services/chat-gateway/`)

Handles:
- WebSocket connection lifecycle (connect, disconnect, reconnect)
- Message routing (direct to user, broadcast to channel)
- Presence tracking (online, away, typing)
- Heartbeat/ping-pong for connection health
- Redis pub/sub for cross-instance communication

### 2. Next.js Frontend (`apps/web/`)

Handles:
- UI rendering (ChatPanel, ChannelList, MessageComposer)
- WebSocket client connection with auto-reconnect
- SSE fallback when WebSocket unavailable
- Optimistic UI updates

### 3. Next.js Backend (Server Actions + API Routes)

Handles:
- Channel CRUD (create, rename, delete)
- Message CRUD (send, edit, delete, react)
- Permission checks (RBAC via `@n0va/authz`)
- Audit logging
- SSE stream endpoint (fallback)

### 4. Redis (Event Bridge)

Handles:
- Cross-gateway-instance message broadcasting
- Presence state sharing
- Typing indicator propagation
- SSE fallback event distribution

### 5. PostgreSQL (via Prisma)

Handles:
- Channel data (ChatChannel, ChatMember)
- Message data (ChatMessage with reactions)
- Read receipts (ChatMember.lastReadAt)
- Audit trail

## Data Flow

### Sending a Message
```
1. User types message → Next.js ChatPanel
2. Next.js sends via WebSocket to Rust Gateway
3. Rust Gateway:
   a. Validates JWT token
   b. Checks channel membership
   c. Writes message to PostgreSQL (via REST call to Next.js API)
   d. Publishes event to Redis
4. Redis broadcasts to all Gateway instances
5. Each Gateway pushes to connected WebSocket clients
6. Recipient's Next.js UI updates in real-time
```

### Receiving a Message
```
1. Rust Gateway receives message event from Redis
2. Looks up connected WebSocket clients for target channel
3. Pushes message to each connected client
4. Next.js ChatPanel renders message
5. If WebSocket disconnected → SSE fallback delivers on reconnect
```

### Presence Tracking
```
1. Client connects → Rust Gateway registers presence
2. Gateway publishes "user.online" to Redis
3. All Gateways update local presence state
4. Connected clients receive presence update
5. Client disconnects → Gateway publishes "user.offline"
```

## Running Locally

```bash
# Start Redis
docker run -d --name n0va-redis -p 6379:6379 redis:7-alpine

# Start the Rust Gateway
cd services/chat-gateway
cargo run

# Start Next.js (from root)
cd ../../
pnpm dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_HOST` | `0.0.0.0` | Gateway bind address |
| `GATEWAY_PORT` | `8080` | Gateway port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | — | NextAuth JWT secret (for token validation) |
| `NEXTJS_API_URL` | `http://localhost:3000` | Next.js API base URL |

## WebSocket Protocol

### Connection
```
ws://localhost:8080/ws?token=<JWT_TOKEN>
```

### Client → Server Messages

```json
// Subscribe to channel
{"type": "subscribe", "channel_id": "abc123"}

// Unsubscribe from channel
{"type": "unsubscribe", "channel_id": "abc123"}

// Send message
{"type": "message", "channel_id": "abc123", "body": "Hello!"}

// Typing indicator
{"type": "typing", "channel_id": "abc123"}

// Ping (keepalive)
{"type": "ping"}
```

### Server → Client Messages

```json
// New message
{"type": "message", "message": {...}}

// Presence update
{"type": "presence", "user_id": "user1", "status": "online"}

// Typing indicator
{"type": "typing", "channel_id": "abc123", "user_id": "user1"}

// Pong (keepalive response)
{"type": "pong"}

// Error
{"type": "error", "message": "..."}
```
