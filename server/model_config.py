"""Single source of truth for which OpenAI models this server calls.

Model names used to live at each call site — `llm.py`, `guardrail.py`,
`summary.py` — plus a couple of log lines and `debug_agent.py` that repeated the
literal for display. Bumping a model meant finding every copy, and the ones that
were only ever printed drifted silently when someone missed one.

Everything is overridable by environment variable so a model can be swapped (or
rolled back) per deploy without a code change, which also makes it cheap to A/B
a new model against the current one.

An env var that is *set but blank* is an error rather than a fallback to the
default: that shape is nearly always a broken deploy (an unset secret expanding
to ""), and for `GUARDRAIL_MODEL` in particular a silent fallback would hide a
misconfigured security gate. `or` alone cannot tell the two cases apart, so
`_model_from_env` checks for blank before defaulting.
"""

import os

from dotenv import load_dotenv

# Load `.env` here rather than relying on the entrypoint to do it first. These
# constants resolve at import time, and `main.py` imports `llm` (and so this
# module) several lines *before* its own `load_dotenv()` — so without this, a
# model set in `server/.env` would never reach them while the startup log, which
# runs after dotenv, still reported the override as active. `override=True`
# matches main.py and debug_agent.py: `.env` wins over the ambient environment.
load_dotenv(override=True)

__all__ = [
    "AGENT_MODEL",
    "GUARDRAIL_MODEL",
    "SUMMARY_MODEL",
    "REASONING_EFFORT",
]


def _model_from_env(var: str, default: str) -> str:
    """Read a model name from `var`, falling back to `default` when unset.

    Raises RuntimeError if `var` is set to a blank value — see module docstring.
    """
    raw = os.getenv(var)
    if raw is not None and not raw.strip():
        raise RuntimeError(
            f"{var} is set but empty. Unset it to use the default "
            f"({default!r}), or give it a real model name — a blank value is a "
            f"broken deploy, not a request for the default."
        )
    return (raw or default).strip()


# The conversational agent behind both the voice call and the /chat endpoint.
AGENT_MODEL = _model_from_env("AGENT_MODEL", "gpt-5.6-terra")

# The jailbreak classifier in guardrail.py. This is the only gate in front of the
# agent, so treat a change here as a security change. Terra rather than Luna:
# the guardrail eval measured Luna at reasoning=none allowing 18/27 of the cases
# it should block (homework, cover letters, "capital of France"), against 7/27
# for the gpt-4o-mini it replaced. It caught blatant injection but not the
# rubric's actual line, which is who the answer is about. Payloads here are
# capped at MAX_TOTAL_CONTEXT_CHARS, so the stronger model costs little.
GUARDRAIL_MODEL = _model_from_env("GUARDRAIL_MODEL", "gpt-5.6-terra")

# The post-call recruiter summary. Off the critical path — nobody is waiting on
# it — so it is the safest place to try a different model first.
SUMMARY_MODEL = _model_from_env("SUMMARY_MODEL", "gpt-5.6-luna")

# Reasoning is disabled everywhere. Voice needs it off for time-to-first-token,
# the guardrail is on the visitor's critical path with a hard timeout, and
# holding text mode to the same setting keeps the two chat modes from drifting
# apart in style or cost. Raise this per-agent only with a latency measurement
# to back it up.
REASONING_EFFORT = "none"
