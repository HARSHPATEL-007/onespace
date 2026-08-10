use serde::{Deserialize, Serialize};

/// Messages sent from client to server
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    /// Subscribe to a channel's message stream
    Subscribe {
        channel_id: String,
    },
    /// Unsubscribe from a channel
    Unsubscribe {
        channel_id: String,
    },
    /// Send a message to a channel
    Message {
        channel_id: String,
        body: String,
    },
    /// Typing indicator
    Typing {
        channel_id: String,
    },
    /// Ping keepalive
    Ping,
}

/// Messages sent from server to client
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    /// New message in a channel
    Message {
        message: MessagePayload,
    },
    /// Presence update for a user
    Presence {
        user_id: String,
        status: String,
    },
    /// Typing indicator
    Typing {
        channel_id: String,
        user_id: String,
    },
    /// Pong keepalive response
    Pong,
    /// Error message
    Error {
        message: String,
    },
    /// Initial connection success
    Connected {
        user_id: String,
    },
}

#[derive(Debug, Serialize, Clone)]
pub struct MessagePayload {
    pub id: String,
    pub channel_id: String,
    pub workspace_id: String,
    pub created_by_id: String,
    pub author_name: String,
    pub body: String,
    pub created_at: String,
}

impl ServerMessage {
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| {
            r#"{"type":"error","message":"serialization error"}"#.to_string()
        })
    }
}

impl ClientMessage {
    pub fn from_json(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(s)
    }
}
