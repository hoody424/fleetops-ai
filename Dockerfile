# =============================================================================
# Stage 1: Cross-Compile Ultra-Lightweight Static Go Client Agents (~2 MiB)
# =============================================================================
FROM golang:1.23-alpine AS agent-builder

WORKDIR /src
COPY packages/agent-go ./
RUN mkdir -p /out && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/fleetops-agent-linux-amd64 . && \
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o /out/fleetops-agent-linux-arm64 . && \
    CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/fleetops-agent-windows-amd64.exe .

# =============================================================================
# Stage 2: Build Frontend WebUI & Backend Server
# =============================================================================
FROM node:22-bookworm-slim AS web-builder

WORKDIR /app
COPY package.json ./
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/

RUN npm install

COPY packages/server ./packages/server
COPY packages/web ./packages/web

RUN npm run build

# =============================================================================
# Stage 3: Production Control Plane Runtime (with Claude & Gemini CLIs + SSH)
# =============================================================================
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client \
    openssl \
    ca-certificates \
    curl \
    git \
    procps \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @anthropic-ai/claude-code @google/gemini-cli --omit=optional || true

WORKDIR /app

COPY --from=web-builder /app/package.json ./
COPY --from=web-builder /app/node_modules ./node_modules
COPY --from=web-builder /app/packages/server/package.json ./packages/server/
COPY --from=web-builder /app/packages/server/dist ./packages/server/dist
COPY --from=web-builder /app/packages/web/dist ./packages/web/dist
COPY --from=agent-builder /out ./dist/agents
COPY catalog ./catalog

RUN mkdir -p /data/ai-profiles

ENV NODE_ENV=production
ENV PORT=3000
ENV CATALOG_DIR=/app/catalog
ENV WEB_DIST_DIR=/app/packages/web/dist
ENV AGENTS_DIR=/app/dist/agents
ENV AI_PROFILES_DIR=/data/ai-profiles

EXPOSE 3000

CMD ["node", "packages/server/dist/index.js"]
