use dashmap::DashMap;
use std::sync::Arc;

/// Represents a connected WebSocket client
#[derive(Debug, Clone)]
pub struct Connection {
    pub user_id: String,
    pub workspace_id: String,
    /// Display name of the user, resolved at connect time
    pub author_name: String,
    pub sender: tokio::sync::mpsc::UnboundedSender<String>,
}

/// Shared state across all gateway instances
#[derive(Clone)]
pub struct GatewayState {
    /// Active WebSocket connections: user_id -> Connection
    pub connections: Arc<DashMap<String, Connection>>,
    /// Channel subscriptions: channel_id -> set of user_ids
    pub channel_subscriptions: Arc<DashMap<String, Vec<String>>>,
    /// Presence state: user_id -> status
    pub presence: Arc<DashMap<String, String>>,
    /// JWT secret for token validation
    pub jwt_secret: String,
    /// PostgreSQL pool (for direct DB ops)
    pub db: sqlx::PgPool,
    /// Redis client for pub/sub
    pub redis: redis::aio::ConnectionManager,
    /// Next.js API base URL
    pub nextjs_api_url: String,
}

impl GatewayState {
    pub async fn new(
        database_url: &str,
        redis_url: &str,
        jwt_secret: &str,
        nextjs_api_url: &str,
    ) -> anyhow::Result<Self> {
        let db = sqlx::postgres::PgPoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await?;

        let redis_client = redis::Client::open(redis_url.to_string())?;
        let redis = redis::aio::ConnectionManager::new(redis_client).await?;

        Ok(Self {
            connections: Arc::new(DashMap::new()),
            channel_subscriptions: Arc::new(DashMap::new()),
            presence: Arc::new(DashMap::new()),
            jwt_secret: jwt_secret.to_string(),
            db,
            redis,
            nextjs_api_url: nextjs_api_url.to_string(),
        })
    }

    /// Send a message to a specific user if they're connected
    pub fn send_to_user(&self, user_id: &str, message: &str) {
        if let Some(conn) = self.connections.get(user_id) {
            let _ = conn.sender.send(message.to_string());
        }
    }

    /// Broadcast a message to all users subscribed to a channel
    pub fn broadcast_to_channel(&self, channel_id: &str, message: &str) {
        if let Some(subscribers) = self.channel_subscriptions.get(channel_id) {
            for user_id in subscribers.value() {
                self.send_to_user(user_id, message);
            }
        }
    }

    /// Subscribe a user to a channel's message stream
    pub fn subscribe_to_channel(&self, channel_id: &str, user_id: &str) {
        let mut subs = self.channel_subscriptions
            .entry(channel_id.to_string())
            .or_insert_with(Vec::new);
        if !subs.contains(&user_id.to_string()) {
            subs.push(user_id.to_string());
        }
    }

    /// Unsubscribe a user from a channel
    pub fn unsubscribe_from_channel(&self, channel_id: &str, user_id: &str) {
        if let Some(mut subs) = self.channel_subscriptions.get_mut(channel_id) {
            subs.retain(|id| id != user_id);
        }
    }

    /// Remove a connection and clean up subscriptions
    pub fn remove_connection(&self, user_id: &str) {
        self.connections.remove(user_id);
        // Remove from all channel subscriptions
        for mut entry in self.channel_subscriptions.iter_mut() {
            entry.value_mut().retain(|id| id != user_id);
        }
        self.presence.remove(user_id);
    }
}
