# 👻 GhostReply

[![Go Report Card](https://goreportcard.com/badge/github.com/varmakarthik12/ghostreply)](https://goreportcard.com/report/github.com/varmakarthik12/ghostreply)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
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

---

## 🚀 Installation

### 1. Using Homebrew
Install GhostReply via our official tap:
```bash
brew tap varmakarthik12/ghostreply https://github.com/varmakarthik12/ghostreply
brew install ghostreply
```

### 2. Using Go Install
If you have Go installed, you can install the binary directly:
```bash
go install github.com/varmakarthik12/ghostreply/cmd/ghostreply@latest
```
*Note: This requires the UI assets to be pre-built in the repository.*

### 3. Build from Source
Perfect for developers who want the latest features:
```bash
git clone https://github.com/varmakarthik12/ghostreply.git
cd ghostreply

# 1. Build the React UI
cd ui && npm install && npm run build && cd ..

# 2. Build the Go binary
go build -o ghostreply ./cmd/ghostreply
```

---

## 🛠️ Getting Started

1. **Launch**: Run `./ghostreply`.
2. **Access**: Open **http://localhost:8080** in your browser.
3. **Login**: Use the auto-generated token displayed in your terminal.
4. **Configure**:
   - **Integrations**: Define where the messages are coming from.
   - **Personas**: Write a detailed "System Prompt" describing who you are.
   - **Models**: Connect to Ollama (default) or OpenAI-compatible APIs.

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

