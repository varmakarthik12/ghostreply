# 👻 GhostReply

An AI agent that **impersonates a human host** across messaging, conversation platforms. When someone messages the host's account, GhostReply replies automatically — in the host's voice — using a persona you define and an LLM backend.

---

## Install

### Prerequisites

- Go 1.22+ (`brew install go` / `apt install golang`)
- GCC (`brew install gcc` / `apt install gcc`) — required for SQLite (CGO)

### Build from source

```bash
git clone https://github.com/varmakarthik12/ghostreply.git
cd ghostreply

# 1. Build the React UI (required before go build)
cd ui && npm install && npm run build && cd ..

# 2. Build the Go binary (embeds the UI)
go build -o ghostreply ./cmd/ghostreply
```

### Run

```bash
./ghostreply
```

The database is created automatically at `~/.ghostreply/ghostreply.db` if `--db-path` is not given. On startup you'll see:

```
=== GhostReply ===
Token: 94194AB36A...
Port:  8080
DB:    /Users/you/.ghostreply/ghostreply.db  (default)
LLM:   http://localhost:11434
Open   http://localhost:8080
```

Open **http://localhost:8080** and paste the token to log in. The same token is reused on restart as long as the database file exists (it is stored there).

---

## Flags

| Flag        | Required | Description                                                              |
| ----------- | -------- | ------------------------------------------------------------------------ |
| `--db-path` | no       | SQLite file path. Default: `~/.ghostreply/ghostreply.db` (auto-created) |
| `--port`    | no       | HTTP port (default `8080`)                                               |
| `--llm-url` | no       | LLM endpoint (default `http://localhost:11434`)                          |
| `--token`   | no       | Override the auto-generated API token                                    |

### Environment variables

| Variable           | Description                                               |
| ------------------ | --------------------------------------------------------- |
| `GHOSTREPLY_TOKEN` | Alternative to `--token`                                  |
| `LLM_KEY`          | API key for OpenAI-compatible endpoints                   |
| `OPENAI_API_KEY`   | Backwards-compatible alias for `LLM_KEY`                  |

---

## Quick setup (after opening the UI)

1. **Integrations** → Add an integration (platform name + account label)
2. **System Prompts** → Write a persona (e.g. _"You are Alex, a 28-year-old dev. Reply casually and briefly."_)
3. **Model Configs** → Set the model (e.g. `llama3.2` or `gpt-4o`)
4. **Chat Test** → Select the integration, enter a Chat ID, send a message — see the reply

---

## Webhook

Your messaging proxy should POST to:

```
POST http://localhost:8080/api/webhook
Content-Type: application/json

{"text": "hey what's up", "platform": "telegram", "chat_id": "user123"}
```

Response:

```json
{ "reply": "not much, you?" }
```

The webhook endpoint is **unauthenticated** — it is designed to be called by your internal proxy only.

---

## LLM backends

**Ollama (default)**

```bash
# Install: https://ollama.com
ollama pull llama3.2
./ghostreply
```

**OpenAI-compatible API**

```bash
LLM_KEY=sk-... ./ghostreply --llm-url https://api.openai.com
```

Then set model to `gpt-4o` in Model Configs.

---

## How summaries work

The background worker runs every 5 minutes. When a conversation exceeds the `summary_threshold` (default 50 messages) or `token_threshold` (default 4000 tokens), it:

1. Collects all previous summaries (oldest → newest) to build full context
2. Generates one new summary that incorporates everything
3. **Deletes all old summaries** (the new one contains them all)
4. **Deletes all summarized messages** from the database

The result is always a single, up-to-date summary per conversation plus only the most recent messages — keeping the LLM context lean without losing history.

---

## Development

```bash
# Run Go tests
CGO_ENABLED=1 go test ./...

# UI hot-reload (requires running Go server on :8080)
cd ui && npm run dev
# → opens http://localhost:5173 with API requests proxied to :8080

# Rebuild UI and Go binary
cd ui && npm run build && cd ..
go build -o ghostreply ./cmd/ghostreply
```
