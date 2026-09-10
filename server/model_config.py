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
    "supports_reasoning",
]


def supports_reasoning(model: str) -> bool:
    """Whether `model` accepts a `reasoning` parameter.

    GPT-5.x, GPT-6.x and the o-series expose a reasoning phase; gpt-4o and
    earlier do not, and sending those a Reasoning object risks a 400. In
    guardrail.py a 400 fails CLOSED, which would refuse every visitor — and
    GUARDRAIL_MODEL is precisely the knob someone reaches for to roll back to
    gpt-4o-mini in a hurry. Rolling back must not take the gate down with it.
    """
    return model.strip().lower().startswith(("gpt-5", "gpt-6", "o1", "o3", "o4"))


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
# History worth keeping, because it is easy to misread the numbers. Against the
# OLD rubric — which led with "ALLOW is the default" and stated block cases as
# "Block only ..." exceptions nested inside allow-rules — the eval measured:
#
#     gpt-4o-mini          7/27 false-allow (26%), 2/33 false-refusal
#     gpt-5.6-luna  @ none 18/27 false-allow (67%), 0/33 false-refusal
#     gpt-5.6-terra @ none 17/27 false-allow (63%), 0/33 false-refusal
#
# Those numbers describe a prompt that no longer exists: the rubric has since
# been restructured into a priority ladder, and the judge no longer returns a
# verdict boolean at all.
#
# An earlier version of this comment concluded from the table above that
# "capability was never the axis". That was overstated, and the current numbers
# contradict it. Terra and Luna failing alike on one bad prompt does not isolate
# the prompt as the only variable — they shared the prompt, the output contract,
# the effort setting and the harness. Measured on the current rubric across 133
# cases per run, Terra is perfect over two runs while Luna needs four rubric
# clarifications to get near it and still over-blocks context-free fragments.
# Prompt structure mattered enormously; capability was not nothing.
#
# Luna is the current configuration by choice, not because it scores best.
# gpt-5.6-terra measured 0% false-refusal and 0% false-allow over two full runs
# of the 133-case eval, against Luna's 0-3% and one timeout-caused failure, at
# the same wall-clock cost (39-45s per run for both). Terra was also perfect both
# before and after the four rubric clarifications Luna needed, so it is markedly
# less sensitive to rubric wording. If the gate starts misbehaving, switching
# this to gpt-5.6-terra is the first thing to try and costs no latency.
#
# Reasoning stays at REASONING_EFFORT ("none"). Raising it means raising
# CLASSIFIER_TIMEOUT_SECONDS in the same change, since a timeout fails OPEN and
# timeouts already appear at the current 5s deadline under the eval's six-way
# concurrency.
GUARDRAIL_MODEL = _model_from_env("GUARDRAIL_MODEL", "gpt-5.6-luna")

# The post-call recruiter summary. Off the critical path — nobody is waiting on
# it — so it is the safest place to try a different model first.
SUMMARY_MODEL = _model_from_env("SUMMARY_MODEL", "gpt-5.6-luna")

# Reasoning effort, applied to every agent whose model has a reasoning phase.
# Voice needs it off for time-to-first-token; holding text mode to the same
# setting keeps the two chat modes from drifting apart in style or cost; and the
# guardrail keeps it to stay comparable with the earlier measurements above,
# which isolates the rubric rewrite as the variable under test.
#
# guardrail.py applies this only when supports_reasoning() says the configured
# model takes the parameter, so overriding GUARDRAIL_MODEL back to gpt-4o-mini
# stays safe. Raise this per-agent only with a latency measurement behind it —
# on the guardrail path a slow judge fails OPEN.
REASONING_EFFORT = "none"
