# WebSocket Handler

Documentation for the main WebSocket endpoint handling voice conversations.

## File Location

`main.py` (lines 116-221)

## Purpose

Real-time bidirectional communication with Retell platform:
- Receives transcription updates
- Sends LLM responses (streaming)
- Handles tool calls and metadata events
- Publishes each call's navigation and live transcript to the browser over Pusher (`voice_events.py`), since v3 web calls don't forward them

## Endpoint

```
WebSocket /{OBFUSCATED_WS_PATH}/{call_id}
```

Default: `ws://localhost:8000/ws-default/{call_id}`

## Connection Flow

```
1. Retell connects to WebSocket
2. Server sends ConfigResponse
3. Retell sends call_details
4. Server sends greeting (ResponseResponse)
5. Loop: Retell sends transcript → Server sends response
6. Connection closes on call end
```

## Message Types

### Retell → Server

| Type | Purpose | Response Needed |
|------|---------|-----------------|
| `call_details` | Call metadata | Yes (greeting) |
| `ping_pong` | Heartbeat | Yes (echo) |
| `update_only` | Transcript update | No |
| `response_required` | User spoke | Yes (LLM response) |
| `reminder_required` | User silent | Yes (prompt) |

### Server → Retell

| Type | Purpose |
|------|---------|
| `ConfigResponse` | Initial configuration |
| `PingPongResponse` | Heartbeat reply |
| `ResponseResponse` | Text content (streaming) |
| `ToolCallInvocationResponse` | Tool being called |
| `ToolCallResultResponse` | Tool result |
| `MetadataResponse` | Frontend navigation (also published to the call's Pusher channel) |

## Implementation

### Connection Setup

```python
@app.websocket(f"/{os.environ.get('OBFUSCATED_WS_PATH', 'ws-default')}" + "/{call_id}")
async def websocket_handler(websocket: WebSocket, call_id: str):
    await websocket.accept()
    llm_client = LlmClient(call_id)
    
    # Send initial config
    config = ConfigResponse(
        response_type="config",
        config={"auto_reconnect": True, "call_details": True},
        response_id=1,
    )
    await websocket.send_json(config.__dict__)
```

### Message Handling

```python
async def handle_message(request_json):
    if request_json["interaction_type"] == "call_details":
        first_event = llm_client.draft_begin_message()
        await websocket.send_json(first_event.__dict__)
        
    elif request_json["interaction_type"] == "ping_pong":
        await websocket.send_json({
            "response_type": "ping_pong",
            "timestamp": request_json["timestamp"],
        })
        
    elif request_json["interaction_type"] == "response_required":
        request = ResponseRequiredRequest(...)
        async for event in llm_client.draft_response(request):
            await websocket.send_json(event.__dict__)
```

### Task Management

Concurrent message handling with cleanup:

```python
tasks = set()

async for data in websocket.iter_json():
    task = asyncio.create_task(handle_message(data))
    tasks.add(task)
    task.add_done_callback(lambda t: tasks.discard(t))

# Cleanup on disconnect
finally:
    for task in tasks:
        if not task.done():
            task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
```

## Response ID Tracking

Abandons outdated responses when user interrupts:

```python
if request.response_id < response_id:
    break  # new response needed, abandon this one
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `OBFUSCATED_WS_PATH` | `ws-default` | Secret path segment; the only thing guarding this route |

There is no signature or `call_id` check on this socket, so treat the path like a key.
Startup logs say whether `OBFUSCATED_WS_PATH` is set but never print its value. If it is
unset, startup prints a warning, because the route falls back to `/ws-default/{call_id}`,
which anyone who reads this repo knows. Production sets it from Secret Manager in `deploy.sh`.

## Error Handling

```python
except WebSocketDisconnect:
    print(f"LLM WebSocket disconnected for {call_id}")
except ConnectionTimeoutError:
    print(f"Connection timeout for {call_id}")
except Exception as e:
    print(f"Error in WebSocket: {e}")
    await websocket.close(1011, "Server error")
```

## Modifications

### Add Custom Config

```python
config = ConfigResponse(
    response_type="config",
    config={
        "auto_reconnect": True,
        "call_details": True,
        "response_timeout": 30,
    },
    response_id=1,
)
```

### Log All Messages

```python
async def handle_message(request_json):
    print(f"Received: {request_json['interaction_type']}")
    # ... existing handling
```

### Add Connection Metrics

```python
connection_start = time.time()

# On disconnect
duration = time.time() - connection_start
print(f"Call {call_id} duration: {duration}s")
```

## Related Files

- [../modules/llm.md](../modules/llm.md) - LLM client used for responses
- `custom_types.py` - Type definitions for messages
- [webhook.md](webhook.md) - Call lifecycle events
