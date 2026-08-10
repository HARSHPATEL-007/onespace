# Build stage
FROM rust:1.75-slim AS builder
WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Create dummy main.rs for dependency caching
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release || true

# Copy actual source
COPY src/ src/
RUN touch src/main.rs && cargo build --release

# Runtime stage
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/chat-gateway /usr/local/bin/chat-gateway

EXPOSE 8080
CMD ["chat-gateway"]
