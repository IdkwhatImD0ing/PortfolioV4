import os

from fastapi import HTTPException


class BodySizeLimit:
    """Refuse a request body past `max_bytes` on the given paths with a 413.

    Counts bytes as they arrive instead of trusting Content-Length, which a
    chunked request doesn't send. FastAPI re-raises an HTTPException thrown
    while it reads the body, so the caller gets a 413 before any parsing.
    """

    def __init__(self, app, max_bytes: int, paths: tuple[str, ...]):
        self.app = app
        self.max_bytes = max_bytes
        self.paths = paths

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] not in self.paths:
            await self.app(scope, receive, send)
            return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise HTTPException(status_code=413, detail="Request body too large")
            return message

        await self.app(scope, limited_receive, send)


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

    # This output lands in Cloud Run logs on every boot. OBFUSCATED_WS_PATH is
    # the only thing guarding the Retell LLM websocket (no signature or call_id
    # check), so its value must never be printed.
    secret_optional_vars = {"OBFUSCATED_WS_PATH"}

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
        if not value:
            print(f"  ℹ {var} not set ({description})")
        elif var in secret_optional_vars:
            print(f"  ✓ {var} is set")
        else:
            print(f"  ✓ {var} is set to: {value}")

    # Unset is fine for local dev and tests, but it means the websocket answers
    # on a path anyone who reads this repo knows.
    if not os.getenv("OBFUSCATED_WS_PATH"):
        print(
            "  ⚠ WARNING: OBFUSCATED_WS_PATH is not set, so the Retell LLM websocket "
            "is served at the public default path /ws-default/{call_id}. Anyone can "
            "connect to it. Set OBFUSCATED_WS_PATH before exposing this server."
        )

    # Print what model_config actually resolved, not the raw env vars. Reading
    # the env here would report an override that the constants may not have
    # picked up, which is precisely the failure this is meant to make visible.
    from model_config import (
        AGENT_MODEL,
        GUARDRAIL_MODEL,
        REASONING_EFFORT,
        SUMMARY_MODEL,
        supports_reasoning,
    )

    def _effort(model: str) -> str:
        # A model without a reasoning phase is never sent the parameter, so
        # reporting REASONING_EFFORT for it would misdescribe the request.
        return REASONING_EFFORT if supports_reasoning(model) else "n/a for this model"

    print("Models in use:")
    print(f"  · agent:     {AGENT_MODEL} (reasoning: {_effort(AGENT_MODEL)})")
    print(f"  · guardrail: {GUARDRAIL_MODEL} (reasoning: {_effort(GUARDRAIL_MODEL)})")
    print(f"  · summary:   {SUMMARY_MODEL} (reasoning: {_effort(SUMMARY_MODEL)})")
