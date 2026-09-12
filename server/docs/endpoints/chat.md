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
  supports_replace?: boolean; // true if the client handles `replace` chunks (default false)
}

interface TextChatMessage {
  role: "user" | "assistant";
  content: string;
}
```

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
  type: "content" | "metadata" | "done" | "error" | "status" | "replace";
  content?: string;      // Text (for "content", "replace", "status" or "error")
  metadata?: {           // Navigation metadata (for type: "metadata")
    type: "navigation";
    page: "landing" | "personal" | "education" | "project";
    project_id?: string;
  };
}
```

### Stream Events

1. **content** - Text tokens streamed incrementally. Append each to the reply.
2. **replace** - Throw away every `content` chunk so far and show this chunk's
   `content` instead. Sent when the guardrail blocks the turn, and only to a
   request that set `supports_replace: true`. `content` chunks may follow it and
   append as usual (none do today).
3. **status** - What the agent is doing ("Thinking...", "Searching projects...").
4. **metadata** - Navigation commands from tool calls
5. **done** - Signals end of response. Never sent before the guardrail's verdict
   is in, so a reply marked done will not be replaced afterwards. When a short
   answer finishes first, `done` waits for the verdict (1-3 s seen live, 5 s cap).
6. **error** - Error message

### Example SSE Stream

```
data: {"type": "content", "content": "I've worked on "}

data: {"type": "content", "content": "several AI projects. "}

data: {"type": "metadata", "metadata": {"type": "navigation", "page": "project"}}

data: {"type": "content", "content": "Let me show you one."}

data: {"type": "done"}
```

### When the guardrail blocks a turn

The answer starts streaming before the guardrail has decided. If it then trips,
the agent run is cancelled and a `replace` withdraws what already went out:

```
data: {"type": "status", "content": "Thinking..."}

data: {"type": "content", "content": "Dear hiring"}

data: {"type": "content", "content": " manager, I am"}

data: {"type": "replace", "content": "Yeah, that one's outside what I do here. ..."}

data: {"type": "done"}
```

The withdrawn chunks did reach the browser. A client that ignored `replace`
would show the answer with no refusal at all, which is why it is opt-in: without
`supports_replace: true` the refusal is appended as a `content` chunk instead,
after a blank line. The Next.js proxy (`client/src/app/api/chat/route.ts`) passes
the flag through only when the page sent it.
See [../modules/guardrail.md](../modules/guardrail.md#how-a-trip-reaches-the-visitor).

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
      } else if (data.type === "replace") {
        // Swap the whole response for data.content
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
