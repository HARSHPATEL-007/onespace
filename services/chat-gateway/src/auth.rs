use crate::state::GatewayState;
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,           // user ID
    pub workspace_id: String,  // active workspace
    pub exp: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenPayload {
    pub user_id: String,
    pub workspace_id: String,
}

/// Validate a JWT token and extract user/workspace info
pub fn validate_token(token: &str, secret: &str) -> Result<TokenPayload, jsonwebtoken::errors::Error> {
    let decoding_key = DecodingKey::from_secret(secret.as_bytes());
    let mut validation = Validation::new(Algorithm::HS256);
    validation.required_spec_claims.clear(); // Be lenient with claims

    let claims = decode::<Claims>(token, &decoding_key, &validation)?;
    Ok(TokenPayload {
        user_id: claims.claims.sub,
        workspace_id: claims.claims.workspace_id,
    })
}
