#!/bin/bash
set -e
echo '=== GhostReply Setup ==='

# 1. Create .gitignore for node
printf '%s\n' 'node_modules/' 'dist/' 'build/' '.DS_Store' '*.db' '*.db-wal' '*.db-shm' '.env' > .gitignore.node

# 2. Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: "3.9"
services:
  ghostreply:
    build: .
    ports:
      - "8080:8080"
    environment:
      - GHOSTREPLY_TOKEN=${GHOSTREPLY_TOKEN}
      - GHOSTREPLY_DB_PATH=/data/ghostreply.db
      - GHOSTREPLY_OLLAMA_URL=http://host.docker.internal:11434
    volumes:
      - ghostreply_data:/data
    restart: unless-stopped
volumes:
  ghostreply_data:
EOF

# 3. Create Dockerfile
cat > Dockerfile << 'EOF'
# Stage 1: Build React
FROM node:20-alpine AS ui-builder
WORKDIR /app/ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

# Stage 2: Build Go binary
FROM golang:1.23-alpine AS go-builder
RUN apk add --no-cache gcc musl-dev
WORKDIR /app
COPY go.* ./
RUN go mod download
COPY . .
COPY --from=ui-builder /app/ui/dist ./ui/dist
RUN go build -o ghostreply ./cmd/ghostreply

# Stage 3: Final image
FROM alpine:latest
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=go-builder /app/ghostreply .
EXPOSE 8080
CMD ["./ghostreply"]
EOF

# 4. Create .github/workflows/ci.yml
mkdir -p .github/workflows
cat > .github/workflows/ci.yml << 'EOF'
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    
    - name: Set up Go
      uses: actions/setup-go@v5
      with:
        go-version: '1.23'
    
    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
    
    - name: Install Go dependencies
      run: go mod download
    
    - name: Build Go binary
      run: go build -v ./cmd/ghostreply
    
    - name: Install UI dependencies
      working-directory: ./ui
      run: npm ci
    
    - name: Build UI
      working-directory: ./ui
      run: npm run build
    
    - name: Run Go tests
      run: go test -v ./... -coverprofile=coverage.out
    
    - name: Run UI tests
      working-directory: ./ui
      run: npm test -- --passWithNoTests --coverage
    
    - name: Upload coverage
      uses: codecov/codecov-action@v4
      with:
        files: ./coverage.out
EOF

echo 'Done with scaffolding files'
