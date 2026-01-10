# syntax=docker/dockerfile:1

FROM rust:latest AS build
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update -qq && apt-get install --no-install-recommends -y ca-certificates curl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/target/release/chunk-gateway /usr/local/bin/chunk-gateway

ENV BIND_ADDR=0.0.0.0
ENV PORT=4000

EXPOSE 4000

CMD ["chunk-gateway"]
