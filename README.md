# 👻 GhostReply

[![Release](https://img.shields.io/github/v/release/varmakarthik12/ghostreply)](https://github.com/varmakarthik12/ghostreply/releases)

**GhostReply** is a powerful, autonomous AI agent designed to manage your messaging conversations with human-like precision. It doesn't just "reply"—it learns your voice, remembers your past interactions, and maintains the context of your relationships across time.

Built for privacy-conscious users, GhostReply runs locally or on your own server, connecting your favorite messaging platforms to local LLMs (via Ollama) or cloud providers.

---

## ✨ Key Features

- 🧠 **Infinite Memory**: Automatically summarizes long conversations into high-level "background memory," ensuring the AI stays consistent with your past shared experiences.
- 🎭 **Persona Engine**: Define your tone, quirks, and background. GhostReply stays in character, matching your texting style (brief, detailed, casual, etc.).
- 📉 **Smart Context Management**: Automatically prunes old messages after summarizing them, keeping your LLM context windows lean and fast without losing "knowledge."
- 🛡️ **Spam Protection**: Configurable guards to prevent the assistant from sending too many consecutive messages or getting caught in loops.
- 📊 **Operations Dashboard**: A beautiful, real-time UI to monitor every interaction, view token usage, and manually cancel in-progress replies.
- 🔗 **Unified Identity (Cross-Platform Memory)**: Link multiple accounts across different platforms (e.g., Telegram, Discord, WhatsApp) to a single person. GhostReply aggregates summaries from all linked conversations so the AI remembers your shared history regardless of the platform.
- 🔌 **Agnostic Integration**: Simple HTTP API makes it easy to bridge with any messaging proxy.
- 🖼️ **Multimodal Support**: Understands images (snaps, photos, GIFs) and voice notes. GhostReply analyses the media using a dedicated vision or audio model and incorporates the description into the reply context so the AI can respond naturally.
- 🤖 **Per-Type Model Configuration**: Use completely different models, hosts, API keys, and context windows for Chat, Summarization, Image analysis, and Voice transcription — all independently configurable per scope (global, integration, or conversation).

---

## 🚀 Installation

### 1. Using Go Install
If you have Go installed, you can install the binary directly:
```bash
go install github.com/varmakarthik12/ghostreply/cmd/ghostreply@latest
```
*Note: This requires the UI assets to be pre-built in the repository.*

### 2. Build from Source
Perfect for developers who want the latest features:
```bash
git clone https://github.com/varmakarthik12/ghostreply.git
cd ghostreply

# 1. Build the React UI
cd ui && npm install && npm run build && cd ..

# 2. Build the Go binary
go build -o ghostreply ./cmd/ghostreply
```

### 3. Using Docker
You can also run GhostReply in an isolated container.

#### Build the Docker Image
```bash
docker build -t ghostreply .
```

#### Manually Create a Volume
Create a persistent Docker volume to store the SQLite database so that your configurations, active sessions, and conversation memory are persisted:
```bash
docker volume create ghostreply-data
```

#### Run the Container
Run the container, mounting the volume (the SQLite database file `ghostreply.db` is created in `/data` by default) and configuring the required ports/environment variables:
```bash
docker run -d \
  --name ghostreply \
  -p 8080:8080 \
  -v ghostreply-data:/data \
  -e GHOSTREPLY_TOKEN="YOUR_SECRET_TOKEN" \
  ghcr.io/varmakarthik12/ghostreply
```

---

## 🛠️ Getting Started

1. **Launch**: Run `./ghostreply`.
2. **Access**: Open **http://localhost:8080** in your browser.
3. **Login**: Use the auto-generated token displayed in your terminal.
4. **Configure**:
   - **Integrations**: Define where the messages are coming from.
   - **Personas**: Write a detailed "System Prompt" describing who you are.
   - **Model Configs**: Connect to Ollama (default) or OpenAI-compatible APIs and configure per-type models.

---

## ⚙️ Configuration

GhostReply can be configured using command-line flags or equivalent environment variables. If both are provided, command-line flags take precedence.

### Options

| Command-line Flag | Environment Variable | Default Value | Description |
|---|---|---|---|
| `-port` | `GHOSTREPLY_PORT` | `8080` | The port the Go server will listen on. |
| `-token` | `GHOSTREPLY_TOKEN` | *Auto-generated* | The Bearer token used to authenticate requests to the dashboard and API. |
| `-db-path` | `GHOSTREPLY_DB_PATH` | `~/.ghostreply/ghostreply.db` | SQLite database file path. |

To see the flags in your terminal, run:
```bash
./ghostreply --help
```

---

## 🔌 API Integration

GhostReply is designed to sit behind a messaging proxy. To trigger an auto-reply, your proxy should POST to the API endpoint.

### Endpoint
`POST /api/integrations/{integration_id}/conversations/{external_id}/auto-reply`

### Request Schema
```json
{
  "integration_id": "your-integration-uuid",
  "conversation_id": "unique-room-id",
  "content": "The incoming message text",
  "sender_id": "user-123",
  "sender_name": "John Doe",
  "chat_type": "private",
  "timestamp": "2026-05-09T10:00:00Z",
  "message_id": "msg-999",
  "media_data": "<base64-encoded image or audio bytes>",
  "media_type": "image/jpeg",
  "history": [
    {
      "content": "Previous message",
      "sender_id": "assistant",
      "is_outbound": true,
      "timestamp": "2026-05-09T09:55:00Z"
    }
  ]
}
```

> **Multimodal fields** — `media_data` and `media_type` are optional. When provided:
> - `media_data`: Base64-encoded raw bytes of the image or audio file (no data-URI prefix).
> - `media_type`: MIME type, e.g. `image/jpeg`, `image/gif`, `audio/mpeg`, `audio/ogg`.
>
> GhostReply routes the data to the appropriate model (Image or Voice) based on `media_type`, summarises the content, and injects the description into the chat context before generating a reply.

### Response
```json
{
  "reply": "Hey John! I'll look into that for you."
}
```

---

## 🧠 How Memory & Summaries Work

GhostReply solves the "context window" problem by using a background worker that monitors your conversations.

1. **Threshold Trigger**: When a conversation hits your set limit (e.g., 50 messages), the worker wakes up.
2. **Recursive Summarization**: It takes all previous summaries and the newest batch of messages to create a fresh, consolidated "Background Memory."
3. **Pruning**: Once summarized, the old messages are deleted from the database, and old summaries are replaced.
4. **Injection**: The next time you get a message, this "Background Memory" is injected into the LLM prompt, allowing the agent to remember things you said weeks ago without wasting tokens on every single previous text.

---

## 🤖 Model Configuration

GhostReply uses a **per-type model configuration** system. Every task type has its own independent settings, all manageable from the **Model Configs** screen in the dashboard.

### Configuration Types

| Type | Purpose | Default fallback |
|---|---|---|
| **Chat** | Generates the actual reply | `llama3.2` |
| **Summary** | Summarizes old messages into background memory | Falls back to Chat |
| **Image** | Analyses incoming images/snaps/GIFs | Falls back to Chat |
| **Voice** | Understands incoming voice notes / audio | `whisper-1` |

### Per-Type Settings

Each type independently supports:

| Setting | Description |
|---|---|
| **Model Name** | e.g. `gpt-4o`, `llava`, `whisper-1`, `gemma3:4b` |
| **LLM URL** | Host & port, e.g. `http://localhost:11434` (Ollama) |
| **API Key** | Leave blank for local/Ollama |
| **Context Window** | Token limit for this task type (0 = 30 000 default) |

### Scope Inheritance

Model configs can be scoped at three levels. The most specific scope wins:

```
conversation → integration → global → built-in default
```

### JSON Structure (stored in `model_configs` table)

```json
{
  "chat":    { "model": "llama3.2",    "url": "",                      "api_key": "", "context_size": 30000 },
  "summary": { "model": "mistral",     "url": "",                      "api_key": "", "context_size": 8000  },
  "image":   { "model": "gpt-4o-mini", "url": "https://api.openai.com","api_key": "sk-...", "context_size": 4096  },
  "voice":   { "model": "whisper-1",   "url": "https://api.openai.com","api_key": "sk-...", "context_size": 0     },
  "request_delay":   5,
  "request_timeout": 120
}
```

### Additional Timing Settings

| Setting | Description |
|---|---|
| **Request Delay** | Seconds to wait before calling the LLM (simulates human typing delay) |
| **Request Timeout** | Maximum seconds to wait for an LLM response (default 300 s) |

---

## 🖼️ Multimodal Message Handling

GhostReply can process images and voice notes sent by the other person before generating a reply.

### Images & Snaps

When an image is included in the request (`media_type` starts with `image/`):

1. The **Image model** is called with a vision prompt.
2. The model classifies the snap as a person (selfie, portrait, group photo) or a random snap (object, scenery, meme, screenshot).
3. A concise 1–2 sentence description is generated.
4. The description is stored alongside the message and injected into the chat context as `[Received Snap/Image: <description>]`.

### Voice Notes

When an audio file is included (`media_type` starts with `audio/`):

1. The **Voice model** is called with the raw audio bytes.
2. The model summarises what was spoken, including key message, details, and tone.
3. The summary is stored and injected into the chat context as `[Voice Note: <summary>]`.

---

## 🔗 Cross-Platform Unified Memory

GhostReply can link multiple conversations across different integrations to a single "Unified Identity." This allows the AI to maintain a shared memory of a person even if you talk to them on Discord, Telegram, and WhatsApp.

### How to set it up:
1. Go to the **Unified Identities** screen in the dashboard.
2. Click **+ Link Conversation**.
3. Type an **Identity Name** (e.g., `Alex Smith`).
4. Select a conversation from the searchable list (linked to any integration).
5. Repeat for Alex's other accounts on different platforms.
6. Now, when you chat with Alex on any of these platforms, GhostReply pulls in the combined history and summaries from all of them.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
