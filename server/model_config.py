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

from dotenv import dotenv_values

# Read `.env` here rather than relying on the entrypoint to do it first. These
# constants resolve at import time, and `main.py` imports `llm` (and so this
# module) several lines *before* its own `load_dotenv()` — so without this, a
# model set in `server/.env` would never reach them, while the startup log, which
# runs after dotenv, still reported the override as active.
#
# `dotenv_values()` rather than `load_dotenv()`: this returns the file's contents
# as a dict instead of writing them into `os.environ`. Mutating the environment
# from an import is a booby trap — `tests/conftest.py` installs dummy API keys
# before importing app modules, and a `load_dotenv(override=True)` here replaced
# them with the real ones mid-collection, which flipped
# `test_guardrail_eval.py`'s "is this a real key" check and pointed the live-API
# suite at production during an ordinary `pytest` run. Reading into a dict keeps
# the effect scoped to the three names below.
#
# Path resolution is relative to this file, not the process cwd, so `server/.env`
# is found however the server was launched.
_DOTENV = dotenv_values()

__all__ = [
    "AGENT_MODEL",
    "GUARDRAIL_MODEL",
    "SUMMARY_MODEL",
    "REASONING_EFFORT",
]


def _model_from_env(var: str, default: str) -> str:
    """Resolve a model name: `.env` first, then the environment, then `default`.

    `.env` outranks the ambient environment to match the `override=True` that
    main.py and debug_agent.py pass to load_dotenv, so a developer's `.env` wins
    the same way it does for every other setting.

    Raises RuntimeError if the value is present but blank — see module docstring.
    """
    raw = _DOTENV.get(var, os.getenv(var))
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
# agent, so treat a change here as a security change.
#
# Deliberately still gpt-4o-mini while the rest of the server moved to GPT-5.6.
# The guardrail eval (tests/test_guardrail_eval.py, real API) measured, on the
# same 60 labelled cases:
#
#     gpt-4o-mini          7/27 false-allow (26%), 2/33 false-refusal
#     gpt-5.6-luna  @ none 18/27 false-allow (67%), 0/33 false-refusal
#     gpt-5.6-terra @ none 17/27 false-allow (63%), 0/33 false-refusal
#
# Terra is much the stronger model and scored the same as Luna, which points at
# reasoning="none" rather than model capability: with the reasoning phase off,
# both allowed homework solving, cover-letter writing and "what's the capital of
# France". They still caught blatant injection (DAN, "ignore all previous
# instructions") — what they miss is the rubric's actual line, which is who the
# answer is about, and that is the judgement this gate exists to make.
#
# So moving this to a 5.x model means giving it a reasoning budget, which in
# turn means raising CLASSIFIER_TIMEOUT_SECONDS — a timeout here fails OPEN.
# Until that is measured, the older non-reasoning model is the better gate.
GUARDRAIL_MODEL = _model_from_env("GUARDRAIL_MODEL", "gpt-4o-mini")

# The post-call recruiter summary. Off the critical path — nobody is waiting on
# it — so it is the safest place to try a different model first.
SUMMARY_MODEL = _model_from_env("SUMMARY_MODEL", "gpt-5.6-luna")

# Reasoning effort for the agent and the summary. Voice needs it off for
# time-to-first-token, and holding text mode to the same setting keeps the two
# chat modes from drifting apart in style or cost.
#
# The guardrail deliberately does NOT use this — see GUARDRAIL_MODEL above. Its
# eval showed "none" is what breaks the classifier, so it runs on a model whose
# reasoning phase isn't configurable at all rather than on a 5.x model with the
# phase switched off. Raise this per-agent only with a latency measurement to
# back it up.
REASONING_EFFORT = "none"
