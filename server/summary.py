from typing import List

from openai.types.shared import Reasoning

from agents import (
    Agent,
    ModelSettings,
    Runner,
)

from custom_types import TextChatMessage
from firetrace import traced_run
from model_config import REASONING_EFFORT, SUMMARY_MODEL

__all__ = [
    "generate_summary",
]


async def generate_summary(transcript: List[TextChatMessage]) -> str:
    """
    Generate a recruiter-focused summary of the conversation.
    """
    # Convert Pydantic models to dicts for the LLM
    messages = [{"role": msg.role, "content": msg.content} for msg in transcript]

    # Create a specialized agent for summarization
    summary_agent = Agent(
        name="summary_agent",
        instructions="""You are an expert technical recruiter's assistant. Your task is to analyze the conversation
        transcript between a user (recruiter/visitor) and Bill Zhang's AI portfolio assistant.

        Generate a 'Recruiter Cheat Sheet' based on the conversation. The output must be in Markdown format
        and include the following sections:

        ## 📋 Recruiter Cheat Sheet

        ### 🎯 Key Takeaways
        - [Bullet points of main topics discussed]

        ### 🛠️ Skills & Technologies
        - [List of technical skills mentioned or demonstrated]

        ### 🚀 Relevant Projects
        - [List of projects discussed with brief context]

        ### 💡 Why Interview Bill?
        - [A short, compelling pitch based on the conversation highlights]

        If the conversation was short or lacked substance, provide a general summary of who Bill is based on his portfolio context,
        but prioritize the actual conversation content. Keep it professional, concise, and easy to read.""",
        model=SUMMARY_MODEL,
        model_settings=ModelSettings(reasoning=Reasoning(effort=REASONING_EFFORT)),
    )

    try:
        # Run the agent to get a single response. One FireTrace trace per
        # summary; the request has no call id, so there is no sessionId here.
        with traced_run(
            "portfolio_summary_generation",
            model=SUMMARY_MODEL,
            input={"transcript": messages},
            metadata={"message_count": str(len(messages))},
            tags=("summary",),
        ) as run:
            result = await Runner.run(summary_agent, messages)
            run.set_output({"summary": result.final_output})
        return result.final_output
    except Exception as e:
        print(f"Error generating summary: {e}")
        return "## Error\n\nFailed to generate summary. Please try again."
