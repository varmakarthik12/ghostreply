# Step 1: Build the frontend UI
FROM node:20-alpine AS ui-builder
WORKDIR /app/ui
ARG VERSION
ENV APP_VERSION=$VERSION
COPY ui/package*.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

# Step 2: Build the Go backend
FROM golang:1.25-alpine AS backend-builder
WORKDIR /app
RUN apk add --no-cache git
ARG VERSION
ARG COMMIT
ARG BUILD_DATE
COPY go.mod go.sum ./
RUN go mod download
# Copy the built UI assets from the ui-builder stage
COPY --from=ui-builder /app/ui/dist ./ui/dist
# Copy the rest of the backend files
COPY ui/assets.go ./ui/
COPY cmd/ ./cmd/
COPY internal/ ./internal/
# Build the binary statically with injected version metadata
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w -X github.com/varmakarthik12/ghostreply/internal/api.Version=${VERSION} -X github.com/varmakarthik12/ghostreply/internal/api.Commit=${COMMIT} -X github.com/varmakarthik12/ghostreply/internal/api.BuildDate=${BUILD_DATE} -X main.Version=${VERSION} -X main.Commit=${COMMIT} -X main.BuildDate=${BUILD_DATE}" \
    -o ghostreply ./cmd/ghostreply

# Step 3: Final execution image
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app

# Docker labels & metadata
ARG VERSION
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.title="GhostReply"
LABEL org.opencontainers.image.description="GhostReply Auto-Reply & Conversational Memory Service"
LABEL org.opencontainers.image.source="https://github.com/varmakarthik12/ghostreply"

# Create a database directory that is writable by any container user
RUN mkdir /data && chmod 777 /data
VOLUME ["/data"]

COPY --from=backend-builder /app/ghostreply /app/ghostreply

# Expose the port
EXPOSE 8080

# Default environment variables
ENV GHOSTREPLY_PORT=8080
ENV GHOSTREPLY_DB_PATH=/data/ghostreply.db
ENV GHOSTREPLY_TOKEN=""
ENV GHOSTREPLY_VERSION="${VERSION}"

# Run the app
ENTRYPOINT ["/app/ghostreply"]
