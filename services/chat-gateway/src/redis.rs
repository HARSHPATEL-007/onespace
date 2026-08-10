use crate::state::GatewayState;
use futures::StreamExt;
use redis::AsyncCommands;

const CHAT_CHANNEL: &str = "n0va:chat:events";

/// Publish a chat event to Redis for cross-instance broadcast
pub async fn publish_event(
    state: &GatewayState,
    event: &serde_json::Value,
) -> anyhow::Result<()> {
    let mut conn = state.redis.clone();
    let payload = serde_json::to_string(event)?;
    conn.publish(CHAT_CHANNEL, payload).await?;
    Ok(())
}

/// Run the Redis pubsub listener — receives events from other gateway instances
/// and routes them to local WebSocket connections
pub async fn run_pubsub_listener(state: GatewayState) {
    let client = match redis::Client::open(get_redis_url()) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Failed to create Redis client for pubsub: {}", e);
            return;
        }
    };

    let mut pubsub = match client.get_async_connection().await {
        Ok(conn) => conn.into_pubsub(),
        Err(e) => {
            tracing::error!("Failed to get Redis pubsub connection: {}", e);
            return;
        }
    };

    if let Err(e) = pubsub.subscribe(CHAT_CHANNEL).await {
        tracing::error!("Failed to subscribe to Redis channel: {}", e);
        return;
    }

    tracing::info!("Redis pubsub listener started on channel: {}", CHAT_CHANNEL);

    let mut stream = pubsub.on_message();
    while let Some(msg) = stream.next().await {
        let payload: String = match msg.get_payload() {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!("Failed to get pubsub payload: {}", e);
                continue;
            }
        };

        let event: serde_json::Value = match serde_json::from_str(&payload) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!("Failed to parse pubsub event: {}", e);
                continue;
            }
        };

        // Route event to local connections based on type
        if let Some(event_type) = event.get("type").and_then(|t| t.as_str()) {
            match event_type {
                "message" => {
                    if let Some(channel_id) = event.get("channel_id").and_then(|c| c.as_str()) {
                        let msg = event.get("message").cloned().unwrap_or_default();
                        state.broadcast_to_channel(
                            channel_id,
                            &serde_json::to_string(&msg).unwrap_or_default(),
                        );
                    }
                }
                "presence" => {
                    if let Some(user_id) = event.get("user_id").and_then(|u| u.as_str()) {
                        if let Some(status) = event.get("status").and_then(|s| s.as_str()) {
                            // Broadcast presence to all connections
                            let presence_msg = serde_json::json!({
                                "type": "presence",
                                "user_id": user_id,
                                "status": status,
                            });
                            broadcast_all(&state, &presence_msg.to_string());
                        }
                    }
                }
                "typing" => {
                    if let Some(channel_id) = event.get("channel_id").and_then(|c| c.as_str()) {
                        let typing_msg = serde_json::json!({
                            "type": "typing",
                            "channel_id": channel_id,
                            "user_id": event.get("user_id").and_then(|u| u.as_str()).unwrap_or(""),
                        });
                        state.broadcast_to_channel(channel_id, &typing_msg.to_string());
                    }
                }
                _ => {}
            }
        }
    }
}

/// Broadcast a message to all connected clients
fn broadcast_all(state: &GatewayState, message: &str) {
    for entry in state.connections.iter() {
        let _ = entry.value().sender.send(message.to_string());
    }
}

fn get_redis_url() -> String {
    std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".into())
}
