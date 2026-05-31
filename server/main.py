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
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from concurrent.futures import TimeoutError as ConnectionTimeoutError
from retell import Retell
from custom_types import (
    ConfigResponse,
    ResponseRequiredRequest,
    TextChatRequest,
    SummaryRequest,
)
from typing import Optional, List
from socket_manager import manager
from llm import LlmClient, generate_summary


load_dotenv(override=True)

# Validate required environment variables at startup
def validate_environment_variables():
    """Validate that all required environment variables are set."""
    required_vars = {
        "RETELL_API_KEY": "Retell API key for voice services",
        "OPENAI_API_KEY": "OpenAI API key for embeddings and LLM",
        "PINECONE_API_KEY": "Pinecone API key for vector database",
    }
    
    optional_vars = {
        "OBFUSCATED_WS_PATH": "WebSocket path obfuscation (defaults to 'ws-default')",
        "LLM_DEBUG": "Enable debug logging for LLM (0 or 1, defaults to 0)",
    }
    
    missing_required = []
    for var, description in required_vars.items():
        if not os.getenv(var):
            missing_required.append(f"  - {var}: {description}")
    
    if missing_required:
        error_msg = "Missing required environment variables:\n" + "\n".join(missing_required)
        error_msg += "\n\nPlease set these variables in your .env file or environment."
        raise ValueError(error_msg)
    
    # Log optional variables status
    print("Environment variables validated successfully:")
    for var in required_vars:
        print(f"  ✓ {var} is set")
    
    for var, description in optional_vars.items():
        value = os.getenv(var)
        if value:
            print(f"  ✓ {var} is set to: {value}")
        else:
            print(f"  ℹ {var} not set ({description})")

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
            async for chunk in llm_client.draft_text_response(messages):
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
    
    try:
        print(f"Attempting to accept websocket for call_id={call_id}")
        await websocket.accept()
        print("WebSocket accepted", call_id)
        llm_client = LlmClient(call_id, mode="voice")
        call_metadata = None  # Will store metadata from call_details

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
                # There are 5 types of interaction_type: call_details, pingpong, update_only, response_required, and reminder_required.
                # Not all of them need to be handled, only response_required and reminder_required.
                print("handle_message received:", request_json.get("interaction_type"))
                if request_json["interaction_type"] == "call_details":
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

                    async for event in llm_client.draft_response(request):
                        await websocket.send_json(event.__dict__)
                        if request.response_id < response_id:
                            print(
                                "Detected newer response_id, abandoning current stream"
                            )
                            break  # new response needed, abandon this one
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
        
        print(f"LLM WebSocket connection closed for {call_id}")
