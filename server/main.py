import contextlib
import json
import os
import sys
import asyncio
import traceback
import uuid
from dotenv import load_dotenv

# Windows defaults stdout to cp1252; reconfigure so the unicode chars in startup logs don't crash.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from concurrent.futures import TimeoutError as ConnectionTimeoutError
from retell import Retell
from custom_types import (
    MAX_CHAT_BODY_BYTES,
    ConfigResponse,
    MetadataResponse,
    ResponseRequiredRequest,
    TextChatRequest,
    SummaryRequest,
)
from typing import Optional, List
from socket_manager import manager
from llm import LlmClient, generate_summary
from app_helpers import BodySizeLimit, validate_environment_variables
from voice_events import VoiceEvents

# Re-export previously module-level public names so existing
# `from main import validate_environment_variables` imports keep working.
__all__ = ["validate_environment_variables"]


load_dotenv(override=True)

# Validate environment on startup
validate_environment_variables()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    # Local dev origin only; everything else (art3m1s.me apex + any depth of
    # subdomain like v3., www., eatsafely.projects.) is matched by the regex.
    allow_origins=["http://localhost:3000"],
    allow_origin_regex=r"^https://([a-z0-9-]+\.)*art3m1s\.me$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(BodySizeLimit, max_bytes=MAX_CHAT_BODY_BYTES, paths=("/chat",))


@app.exception_handler(RequestValidationError)
async def validation_error_without_input(request: Request, exc: RequestValidationError):
    """FastAPI's default 422, minus the `input` it echoes back for each error.

    For an oversized /chat body that input is the whole rejected list:
    encoding a million tiny messages took ~2 s of event-loop time and came back
    as a 29 MB response.
    """
    errors = [{k: v for k, v in err.items() if k != "input"} for err in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})


retell = Retell(api_key=os.getenv("RETELL_API_KEY"))


@app.get("/ping")
async def ping():
    return {"message": "pong"}


@app.post("/chat")
async def chat_endpoint(request: TextChatRequest):
    """
    Text chat endpoint with SSE streaming.
    Accepts messages and streams back responses using Server-Sent Events.
    """
    
    async def generate_sse():
        # Create a unique session ID for this chat
        session_id = str(uuid.uuid4())[:8]
        llm_client = LlmClient(call_id=f"text-{session_id}", mode="text")
        
        # Convert TextChatMessage to dict format expected by LLM
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
        
        try:
            async for chunk in llm_client.draft_text_response(
                messages, supports_replace=request.supports_replace
            ):
                # Format as SSE
                data = json.dumps(chunk.model_dump())
                yield f"data: {data}\n\n"
        except Exception as e:
            error_data = json.dumps({"type": "error", "content": str(e)})
            yield f"data: {error_data}\n\n"
    
    return StreamingResponse(
        generate_sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


@app.post("/summary")
async def summary_endpoint(request: SummaryRequest):
    """
    Generate a recruiter-focused summary of the conversation.
    """
    try:
        summary = await generate_summary(request.transcript)
        return {"summary": summary}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


# Handle webhook from Retell server. This is used to receive events from Retell server.
# Including call_started, call_ended, call_analyzed
@app.post("/webhook")
async def handle_webhook(request: Request):
    try:
        post_data = await request.json()
        valid_signature = retell.verify(
            json.dumps(post_data, separators=(",", ":"), ensure_ascii=False),
            api_key=str(os.getenv("RETELL_API_KEY")),
            signature=str(request.headers.get("X-Retell-Signature")),
        )
        if not valid_signature:
            print(
                "Received Unauthorized",
                post_data["event"],
                post_data["data"]["call_id"],
            )
            return JSONResponse(status_code=401, content={"message": "Unauthorized"})
        if post_data["event"] == "call_started":
            print("Call started event", post_data["data"]["call_id"])
        elif post_data["event"] == "call_ended":
            print("Call ended event", post_data["data"]["call_id"])
        elif post_data["event"] == "call_analyzed":
            print("Call analyzed event", post_data["data"]["call_id"])
        else:
            print("Unknown event", post_data["event"])
        return JSONResponse(status_code=200, content={"received": True})
    except Exception as err:
        print(f"Error in webhook: {err}")
        return JSONResponse(
            status_code=500, content={"message": "Internal Server Error"}
        )


# Start a websocket server to exchange text input and output with Retell server. Retell server
# will send over transcriptions and other information. This server here will be responsible for
# generating responses with LLM and send back to Retell server.
@app.websocket(f"/{os.environ.get('OBFUSCATED_WS_PATH', 'ws-default')}" + "/{call_id}")
async def websocket_handler(websocket: WebSocket, call_id: str):
    # Initialize tasks set before try block for proper cleanup
    tasks = set()
    # Where this call's page moves and captions go (voice_events.py). Set from
    # the call details; None when the browser named no channel.
    voice_events: VoiceEvents | None = None

    try:
        print(f"Attempting to accept websocket for call_id={call_id}")
        await websocket.accept()
        print("WebSocket accepted", call_id)
        llm_client = LlmClient(call_id, mode="voice")

        # Send optional config to Retell server
        config = ConfigResponse(
            response_type="config",
            config={
                "auto_reconnect": True,
                "call_details": True,
            },
            response_id=1,
        )
        print("Sent initial config", flush=True)
        await websocket.send_json(config.__dict__)
        response_id = 0

        async def handle_message(request_json):
            try:
                nonlocal response_id
                nonlocal llm_client
                nonlocal voice_events
                # There are 5 types of interaction_type: call_details, pingpong, update_only, response_required, and reminder_required.
                # Not all of them need to be handled, only response_required and reminder_required.
                print("handle_message received:", request_json.get("interaction_type"))
                if request_json["interaction_type"] == "call_details":
                    # Keep Retell's call details (agent id, call type, the
                    # metadata the browser attached) for this call's traces.
                    call = request_json.get("call")
                    llm_client.call_details = call if isinstance(call, dict) else {}
                    # The channel name keeps this call's events from other
                    # visitors, so it isn't printed here. (It does reach the
                    # trace metadata and Retell's call record, owner-only.)
                    voice_events = VoiceEvents.for_call(llm_client.call_details)
                    print(f"Voice events {'on' if voice_events else 'off'} for {call_id}", flush=True)
                    # Send first message to signal ready of server
                    first_event = llm_client.draft_begin_message()
                    print("Sent first_event", flush=True)
                    await websocket.send_json(first_event.__dict__)
                    return
                if request_json["interaction_type"] == "ping_pong":
                    await websocket.send_json(
                        {
                            "response_type": "ping_pong",
                            "timestamp": request_json["timestamp"],
                        }
                    )
                    return
                if request_json["interaction_type"] == "update_only":
                    # The call panel's captions. v3 calls stopped sending the
                    # browser its own transcript updates.
                    if voice_events is not None:
                        voice_events.transcript(request_json.get("transcript"))
                    return
                if (
                    request_json["interaction_type"] == "response_required"
                    or request_json["interaction_type"] == "reminder_required"
                ):
                    response_id = request_json["response_id"]
                    request = ResponseRequiredRequest(
                        interaction_type=request_json["interaction_type"],
                        response_id=response_id,
                        transcript=request_json["transcript"],
                    )
                    print(
                        f"Received {request_json['interaction_type']} response_id={response_id}",
                        flush=True,
                    )

                    stream = llm_client.draft_response(request)
                    try:
                        async for event in stream:
                            await websocket.send_json(event.__dict__)
                            # Retell drops this metadata on v3 calls instead of
                            # passing it to the browser, so the page move goes
                            # out over Pusher too. Not once a newer turn has
                            # started: this reply is being thrown away.
                            if (
                                voice_events is not None
                                and isinstance(event, MetadataResponse)
                                and request.response_id == response_id
                            ):
                                voice_events.navigation(event.metadata)
                            if request.response_id < response_id:
                                print(
                                    "Detected newer response_id, abandoning current stream"
                                )
                                break  # new response needed, abandon this one
                    except asyncio.CancelledError:
                        # The call ended mid-turn (the finally below cancels
                        # this task). Hand the cancellation to the stream, so
                        # its trace reads "cancelled" rather than being closed
                        # later by the garbage collector as "abandoned".
                        with contextlib.suppress(BaseException):
                            await stream.athrow(asyncio.CancelledError())
                        raise
                    finally:
                        # Close now, not at garbage collection, so a barge-in's
                        # trace is recorded promptly as "abandoned".
                        await stream.aclose()
            except Exception as e:
                print(
                    f"Exception in handle_message: {e}\n{traceback.format_exc()}\nPayload: {request_json}",
                    flush=True,
                )

        async for data in websocket.iter_json():
            # Create task and add to tracking set
            task = asyncio.create_task(handle_message(data))
            tasks.add(task)
            
            # Remove completed tasks from the set
            task.add_done_callback(lambda t: tasks.discard(t))

    except WebSocketDisconnect:
        print(f"LLM WebSocket disconnected for {call_id}")
    except ConnectionTimeoutError as e:
        print("Connection timeout error for {call_id}")
    except Exception as e:
        print(f"Error in LLM WebSocket: {e} for {call_id}")
        await websocket.close(1011, "Server error")
    finally:
        # Cancel all pending tasks to prevent memory leaks
        for task in tasks:
            if not task.done():
                task.cancel()
        
        # Wait for all tasks to complete cancellation
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        # Let the last captions reach the browser; bounded, never raises.
        if voice_events is not None:
            await voice_events.aclose()

        print(f"LLM WebSocket connection closed for {call_id}")
