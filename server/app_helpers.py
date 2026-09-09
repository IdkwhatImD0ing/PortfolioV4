import os


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

    # Print what model_config actually resolved, not the raw env vars. Reading
    # the env here would report an override that the constants may not have
    # picked up, which is precisely the failure this is meant to make visible.
    from model_config import AGENT_MODEL, GUARDRAIL_MODEL, REASONING_EFFORT, SUMMARY_MODEL

    print(f"Models in use (reasoning effort: {REASONING_EFFORT}):")
    print(f"  · agent:     {AGENT_MODEL}")
    print(f"  · guardrail: {GUARDRAIL_MODEL}")
    print(f"  · summary:   {SUMMARY_MODEL}")
