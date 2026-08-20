use crate::auth::validate_token;
use crate::messages::{ClientMessage, MessagePayload, ServerMessage};
use crate::redis::publish_event;
use crate::state::GatewayState;

use actix_web::{web, HttpRequest, HttpResponse};
use actix_ws;
use chrono::Utc;
use futures::StreamExt;
use sqlx::Row;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::time::interval;

/// How often to send ping frames to detect dead connections
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(10);
/// If no pong received within this time, disconnect
const CLIENT_TIMEOUT: Duration = Duration::from_secs(30);

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Handle a new WebSocket connection
pub async fn handle_ws(
    req: HttpRequest,
    stream: web::Payload,
    state: web::Data<GatewayState>,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract and validate JWT token from query params
    let token = req
        .query_string()
        .split('&')
        .find_map(|p| {
            let mut parts = p.splitn(2, '=');
            if parts.next() == Some("token") {
                parts.next().map(|v| url_decode(v))
            } else {
                None
            }
        })
        .unwrap_or_default();

    let claims = match validate_token(&token, &state.jwt_secret) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Invalid WebSocket token: {}", e);
            return Ok(HttpResponse::Unauthorized().finish());
        }
    };

    let user_id = claims.user_id.clone();
    let workspace_id = claims.workspace_id.clone();

    tracing::info!(
        "WebSocket connection request: user={} workspace={}",
        user_id,
        workspace_id
    );

    // Upgrade to WebSocket
    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, stream)?;

    // Create a channel for sending messages to this client
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // Resolve the user's display name so typing indicators and presence
    // events carry a human-readable name instead of the user id.
    let author_name = fetch_author_name(&state.db, &user_id, &workspace_id)
        .await
        .unwrap_or_else(|_| user_id.clone());

    // Register connection
    let conn = crate::state::Connection {
        user_id: user_id.clone(),
        workspace_id: workspace_id.clone(),
        author_name,
        sender: tx,
    };
    state.connections.insert(user_id.clone(), conn);
    state
        .presence
        .insert(user_id.clone(), "online".to_string());

    // Broadcast presence update
    let presence_event = serde_json::json!({
        "type": "presence",
        "user_id": user_id,
        "status": "online",
        "workspace_id": workspace_id,
    });
    let _ = publish_event(&state, &presence_event).await;

    // Send connection acknowledgment
    let connected_msg = ServerMessage::Connected {
        user_id: user_id.clone(),
    };
    let _ = session.text(connected_msg.to_json()).await;

    // Spawn a task to handle outgoing messages (from channel -> WebSocket)
    let mut send_session = session.clone();
    let send_user_id = user_id.clone();
    actix_rt::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if send_session.text(msg).await.is_err() {
                break;
            }
        }
        tracing::debug!("Send channel closed for user: {}", send_user_id);
    });

    // Spawn heartbeat task
    let mut heartbeat = interval(HEARTBEAT_INTERVAL);
    let last_pong = Arc::new(AtomicU64::new(now_millis()));
    let hb_last_pong = last_pong.clone();
    let mut hb_session = session.clone();
    let hb_user_id = user_id.clone();
    actix_rt::spawn(async move {
        loop {
            heartbeat.tick().await;
            let idle = now_millis().saturating_sub(hb_last_pong.load(Ordering::Relaxed));
            if idle > CLIENT_TIMEOUT.as_millis() as u64 {
                tracing::info!("Client {} timed out, closing connection", hb_user_id);
                let _ = hb_session.close(None).await;
                break;
            }
            if hb_session.ping(b"").await.is_err() {
                break;
            }
        }
    });

    // Main message processing loop
    let ws_user_id = user_id.clone();
    let ws_workspace_id = workspace_id.clone();
    let ws_state = state.clone();
    actix_rt::spawn(async move {
        while let Some(result) = msg_stream.next().await {
            match result {
                Ok(actix_ws::Message::Text(text)) => {
                    let text = text.to_string();
                    match ClientMessage::from_json(&text) {
                        Ok(client_msg) => {
                            handle_client_message(
                                &ws_state,
                                &ws_user_id,
                                client_msg,
                                &mut session,
                            )
                            .await;
                        }
                        Err(e) => {
                            tracing::warn!("Invalid message from {}: {}", ws_user_id, e);
                            let err = ServerMessage::Error {
                                message: "Invalid message format".into(),
                            };
                            let _ = session.text(err.to_json()).await;
                        }
                    }
                }
                Ok(actix_ws::Message::Ping(bytes)) => {
                    let _ = session.pong(&bytes).await;
                }
                Ok(actix_ws::Message::Pong(_)) => {
                    last_pong.store(now_millis(), Ordering::Relaxed);
                }
                Ok(actix_ws::Message::Close(_)) => {
                    tracing::info!("Client {} closed connection", ws_user_id);
                    break;
                }
                Ok(actix_ws::Message::Binary(_)) => {
                    // Ignore binary messages
                }
                Ok(actix_ws::Message::Nop) => {
                    // No-op frame
                }
                Ok(actix_ws::Message::Continuation(_)) => {
                    // Ignore continuation frames
                }
                Err(e) => {
                    tracing::warn!("WebSocket error for {}: {}", ws_user_id, e);
                    break;
                }
            }
        }

        // Cleanup on disconnect
        ws_state.remove_connection(&ws_user_id);

        // Broadcast offline presence
        let offline_event = serde_json::json!({
            "type": "presence",
            "user_id": ws_user_id,
            "status": "offline",
            "workspace_id": ws_workspace_id,
        });
        let _ = publish_event(&ws_state, &offline_event).await;
    });

    Ok(response)
}

/// Process a message received from a WebSocket client
async fn handle_client_message(
    state: &GatewayState,
    user_id: &str,
    msg: ClientMessage,
    session: &mut actix_ws::Session,
) {
    match msg {
        ClientMessage::Subscribe { channel_id } => {
            state.subscribe_to_channel(&channel_id, user_id);
            tracing::debug!("User {} subscribed to channel {}", user_id, channel_id);
        }
        ClientMessage::Unsubscribe { channel_id } => {
            state.unsubscribe_from_channel(&channel_id, user_id);
            tracing::debug!("User {} unsubscribed from channel {}", user_id, channel_id);
        }
        ClientMessage::Message { channel_id, body } => {
            // Persist message to PostgreSQL
            match persist_message(state, user_id, &channel_id, &body).await {
                Ok(message) => {
                    let event = serde_json::json!({
                        "type": "message",
                        "channel_id": channel_id,
                        "message": message,
                    });
                    // Publish to Redis for cross-instance broadcast
                    let _ = publish_event(state, &event).await;
                    // Also deliver locally immediately
                    let server_msg = ServerMessage::Message {
                        message: MessagePayload {
                            id: message.id,
                            channel_id: message.channel_id,
                            workspace_id: message.workspace_id,
                            created_by_id: message.created_by_id,
                            author_name: message.author_name,
                            body: message.body,
                            created_at: message.created_at,
                        },
                    };
                    state.broadcast_to_channel(&channel_id, &server_msg.to_json());
                }
                Err(e) => {
                    tracing::error!("Failed to persist message: {}", e);
                    let err = ServerMessage::Error {
                        message: "Failed to send message".into(),
                    };
                    let _ = session.text(err.to_json()).await;
                }
            }
        }
        ClientMessage::Typing { channel_id } => {
            // Broadcast typing indicator with the user's display name
            if let Some(conn) = state.connections.get(user_id) {
                let event = serde_json::json!({
                    "type": "typing",
                    "channel_id": channel_id,
                    "user_id": user_id,
                    "author_name": conn.author_name,
                });
                let _ = publish_event(state, &event).await;
                // Deliver locally immediately
                state.broadcast_to_channel(
                    &channel_id,
                    &serde_json::to_string(&event).unwrap_or_default(),
                );
            }
        }
        ClientMessage::Ping => {
            let _ = session.text(ServerMessage::Pong.to_json()).await;
        }
    }
}

/// Resolve a user's display name from the workspace membership.
async fn fetch_author_name(
    db: &sqlx::PgPool,
    user_id: &str,
    workspace_id: &str,
) -> anyhow::Result<String> {
    let row = sqlx::query(
        r#"
        SELECT u.name
        FROM "WorkspaceMember" wm
        JOIN "User" u ON u.id = wm."userId"
        WHERE wm."userId" = $1 AND wm."workspaceId" = $2
        "#,
    )
    .bind(user_id)
    .bind(workspace_id)
    .fetch_optional(db)
    .await?;

    Ok(row
        .and_then(|r| r.get::<Option<String>, _>("name"))
        .unwrap_or_else(|| "Unknown".to_string()))
}

/// Persist a chat message to PostgreSQL
async fn persist_message(
    state: &GatewayState,
    user_id: &str,
    channel_id: &str,
    body: &str,
) -> anyhow::Result<MessagePayload> {
    // Get author name from workspace member
    let member_row = sqlx::query(
        r#"
        SELECT u.name, u.email
        FROM "WorkspaceMember" wm
        JOIN "User" u ON u.id = wm."userId"
        WHERE wm."userId" = $1 AND wm."workspaceId" = (
            SELECT "workspaceId" FROM "ChatChannel" WHERE id = $2
        )
        "#,
    )
    .bind(user_id)
    .bind(channel_id)
    .fetch_optional(&state.db)
    .await?;

    let author_name = member_row
        .and_then(|r| r.get::<Option<String>, _>("name"))
        .unwrap_or_else(|| "Unknown".to_string());

    // Get workspace_id from channel
    let channel_row = sqlx::query(r#"SELECT "workspaceId" FROM "ChatChannel" WHERE id = $1"#)
        .bind(channel_id)
        .fetch_one(&state.db)
        .await?;
    let workspace_id: String = channel_row.get("workspaceId");
    let row = sqlx::query(
        r#"
        INSERT INTO "ChatMessage" (id, "channelId", "workspaceId", "createdById", "authorName", body, "createdAt", "updatedAt", reactions, "parentId")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $10, $8, $9)
        RETURNING id, "channelId", "workspaceId", "createdById", "authorName", body, "createdAt"
        "#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(channel_id)
    .bind(&workspace_id)
    .bind(user_id)
    .bind(&author_name)
    .bind(body)
    .bind(Utc::now())
    .bind(serde_json::json!([]))
    .bind(Option::<String>::None)
    .bind(Utc::now())
    .fetch_one(&state.db)
    .await?;

    // Update channel's updatedAt
    sqlx::query(r#"UPDATE "ChatChannel" SET "updatedAt" = $1 WHERE id = $2"#)
        .bind(Utc::now())
        .bind(channel_id)
        .execute(&state.db)
        .await?;

    // Update member's lastReadAt
    sqlx::query(
        r#"
        UPDATE "ChatMember"
        SET "lastReadAt" = $1
        WHERE "channelId" = $2 AND "userId" = $3
        "#,
    )
    .bind(Utc::now())
    .bind(channel_id)
    .bind(user_id)
    .execute(&state.db)
    .await
    .ok(); // Ignore errors if member record doesn't exist

    Ok(MessagePayload {
        id: row.get("id"),
        channel_id: row.get("channelId"),
        workspace_id: row.get("workspaceId"),
        created_by_id: row.get("createdById"),
        author_name: row.get("authorName"),
        body: row.get("body"),
        created_at: row
            .get::<chrono::NaiveDateTime, _>("createdAt")
            .and_utc()
            .to_rfc3339(),
    })
}

/// Simple URL decode for query parameter extraction
fn url_decode(s: &str) -> String {
    percent_encoding::percent_decode_str(s)
        .decode_utf8_lossy()
        .to_string()
}
