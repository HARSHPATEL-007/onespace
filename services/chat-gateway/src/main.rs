mod auth;
mod messages;
mod redis;
mod state;
mod ws;

use actix_web::{middleware, web, App, HttpServer};
use state::GatewayState;
use std::env;

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            env::var("RUST_LOG").unwrap_or_else(|_| "info,chat_gateway=debug".into()),
        )
        .init();

    let host = env::var("GATEWAY_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = env::var("GATEWAY_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".into());
    let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    let nextjs_api_url =
        env::var("NEXTJS_API_URL").unwrap_or_else(|_| "http://localhost:3000".into());

    // Initialize shared state
    let state = GatewayState::new(&database_url, &redis_url, &jwt_secret, &nextjs_api_url).await?;

    // Start Redis pub/sub listener in background
    let redis_state = state.clone();
    tokio::spawn(async move {
        redis::run_pubsub_listener(redis_state).await;
    });

    tracing::info!("N0VA Chat Gateway starting on {}:{}", host, port);

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .wrap(middleware::Logger::default())
            .wrap(middleware::Compress::default())
            .route("/health", web::get().to(health_check))
            .route("/ws", web::get().to(ws::handle_ws))
    })
    .bind((host, port))?
    .run()
    .await?;

    Ok(())
}

async fn health_check() -> actix_web::HttpResponse {
    actix_web::HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "n0va-chat-gateway",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}
