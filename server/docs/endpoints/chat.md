# Text Chat Endpoint

Documentation for the text-based chat API endpoint.

## Endpoint

`POST /chat`

## Purpose

Provides a text-based alternative to voice chat, allowing users who cannot use voice to interact with the same AI agent. Uses Server-Sent Events (SSE) for streaming responses.

## Request Format

```typescript
interface TextChatRequest {
  messages: TextChatMessage[];
}

interface TextChatMessage {
  role: "user" | "assistant";
  content: string;
}
```

### Limits

At most 50 messages, each at most 10,000 characters (`MAX_CHAT_MESSAGES` and
`MAX_CHAT_MESSAGE_CHARS` in `custom_types.py`). A larger request gets a 422 and never
reaches the guardrail or the model. A body over 4 MiB (`MAX_CHAT_BODY_BYTES`) gets a 413
before it is parsed.

The client sends at most 20 messages and trims each to 10,000 characters, keeping both ends
(`MAX_MESSAGE_CHARS` in `client/src/lib/text-chat.ts`). That constant must equal
`MAX_CHAT_MESSAGE_CHARS`, and `text-chat.test.ts` checks that it does.

`POST /summary` takes the same message type, so the 10,000-character cap applies to each of
its transcript messages too.

### Example Request

```json
{
  "messages": [
    { "role": "user", "content": "Tell me about your projects" },
    { "role": "assistant", "content": "I've worked on several projects..." },
    { "role": "user", "content": "What about AI projects?" }
  ]
}
```

## Response Format

Returns a Server-Sent Events stream with JSON chunks:

```typescript
interface TextChatStreamChunk {
  type: "content" | "metadata" | "done" | "error";
  content?: string;      // Text content (for type: "content" or "error")
  metadata?: {           // Navigation metadata (for type: "metadata")
    type: "navigation";
    page: "landing" | "personal" | "education" | "project";
    project_id?: string;
  };
}
```

### Stream Events

1. **content** - Text tokens streamed incrementally
2. **metadata** - Navigation commands from tool calls
3. **done** - Signals end of response
4. **error** - Error message

### Example SSE Stream

```
data: {"type": "content", "content": "I've worked on "}

data: {"type": "content", "content": "several AI projects. "}

data: {"type": "metadata", "metadata": {"type": "navigation", "page": "project"}}

data: {"type": "content", "content": "Let me show you one."}

data: {"type": "done"}
```

## Frontend Integration

```typescript
const response = await fetch("/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value);
  const lines = text.split("\n");
  
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = JSON.parse(line.slice(6));
      
      if (data.type === "content") {
        // Append to response
      } else if (data.type === "metadata") {
        // Handle navigation
      }
    }
  }
}
```

## Features

- **Streaming**: Responses are streamed token-by-token for real-time display
- **Navigation**: Supports the same navigation tools as voice chat
- **Guardrails**: Uses the same security guardrails as voice chat
- **Session Management**: Each request creates a unique session ID

## Implementation Details

### Location

`server/main.py` - Endpoint definition
`server/llm.py` - `draft_text_response()` method

### How It Works

1. Request received with conversation history
2. Creates `LlmClient` with unique session ID
3. Converts messages to format expected by `draft_text_response()`
4. Streams `TextChatStreamChunk` objects as SSE events
5. Handles tool calls and emits navigation metadata

## Comparison with Voice Chat

| Feature | Voice Chat | Text Chat |
|---------|-----------|-----------|
| Endpoint | WebSocket | REST + SSE |
| Protocol | Retell | Standard HTTP |
| Input | Audio | Text |
| Output | Audio + Transcript | Text |
| Navigation | Metadata events | Metadata in stream |
| Guardrails | Yes | Yes |

## Related Files

- [websocket.md](websocket.md) - Voice chat WebSocket documentation
- [../modules/llm.md](../modules/llm.md) - LLM client documentation
