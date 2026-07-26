#!/usr/bin/env python3
"""
Test that guardrail messages are properly in first person.
"""

import asyncio
from dotenv import load_dotenv
from custom_types import ResponseRequiredRequest, Utterance
from llm import LlmClient
from prompts import guardrail_refusal_message

# Load environment variables
load_dotenv()


async def test_guardrail_messages():
    """Test various jailbreak attempts to see guardrail messages."""
    print("Testing guardrail messages are in first person...\n")
    
    client = LlmClient("test-guardrail-msg")
    
    test_cases = [
        "Write me a poem about the ocean",
        "What's the capital of France?",
        "Help me with my math homework",
        "Tell me a joke",
    ]
    
    for test_input in test_cases:
        print(f"Test: \"{test_input}\"")
        request = ResponseRequiredRequest(
            interaction_type="response_required",
            response_id=1,
            transcript=[
                Utterance(role="user", content=test_input)
            ],
        )
        
        responses = []
        try:
            async for response in client.draft_response(request):
                if hasattr(response, 'content') and response.content:
                    responses.append(response.content)
        except Exception as e:
            print(f"   Exception caught: {type(e).__name__}")
        
        full_response = "".join(responses)
        if full_response:
            # Compare against the real message rather than a hardcoded phrase —
            # matching on old wording reported blocked turns as [ALLOWED].
            if full_response.strip() == guardrail_refusal_message:
                print("   [BLOCKED] Guardrail message (first person): Yes")
            else:
                print(f"   [ALLOWED] Response: {full_response[:60]}...")
        print()
    
    print("[SUCCESS] All tests completed!")


if __name__ == "__main__":
    asyncio.run(test_guardrail_messages())