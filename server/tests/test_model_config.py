"""Tests for model_config: env overrides, blank rejection, and dotenv ordering."""

import importlib
import os
import sys
from unittest.mock import patch

import pytest

_MODEL_VARS = ("AGENT_MODEL", "GUARDRAIL_MODEL", "SUMMARY_MODEL")


def _reload_model_config():
    """Re-import model_config so its import-time constants re-resolve."""
    sys.modules.pop("model_config", None)
    return importlib.import_module("model_config")


@pytest.fixture
def clean_model_env(monkeypatch):
    """Drop the model vars so a test starts from the declared defaults.

    `model_config` reads `.env` at import. Tests must not depend on whether the
    developer running them happens to have a `server/.env`, so the file read is
    neutered for the duration unless a test patches it itself.
    """
    for var in _MODEL_VARS:
        monkeypatch.delenv(var, raising=False)

    with patch("dotenv.dotenv_values", return_value={}):
        yield

    # Clear before reloading: a test that set a blank value would otherwise make
    # this teardown raise the very error it was asserting.
    for var in _MODEL_VARS:
        os.environ.pop(var, None)
    with patch("dotenv.dotenv_values", return_value={}):
        _reload_model_config()


def test_defaults_when_unset(clean_model_env):
    mc = _reload_model_config()

    assert mc.AGENT_MODEL == "gpt-5.6-terra"
    assert mc.GUARDRAIL_MODEL == "gpt-4o-mini"
    assert mc.SUMMARY_MODEL == "gpt-5.6-luna"
    assert mc.REASONING_EFFORT == "none"


def test_env_var_overrides_default(clean_model_env, monkeypatch):
    monkeypatch.setenv("AGENT_MODEL", "gpt-5.6-sol")
    mc = _reload_model_config()

    assert mc.AGENT_MODEL == "gpt-5.6-sol"
    assert mc.GUARDRAIL_MODEL == "gpt-4o-mini"  # others untouched


def test_surrounding_whitespace_is_stripped(clean_model_env, monkeypatch):
    monkeypatch.setenv("SUMMARY_MODEL", "  gpt-5.6-terra\n")
    assert _reload_model_config().SUMMARY_MODEL == "gpt-5.6-terra"


@pytest.mark.parametrize("blank", ["", "   ", "\n"])
def test_blank_env_var_raises(clean_model_env, monkeypatch, blank):
    """A var set to blank is a broken deploy, not a request for the default.

    It matters most for GUARDRAIL_MODEL: defaulting silently there would hide a
    misconfigured security gate.
    """
    monkeypatch.setenv("GUARDRAIL_MODEL", blank)

    with pytest.raises(RuntimeError, match="GUARDRAIL_MODEL is set but empty"):
        _reload_model_config()


def test_dotenv_reaches_constants_whoever_imports_first(clean_model_env):
    """`.env` must reach the constants without the entrypoint going first.

    Regression test: main.py imports llm (and so model_config) several lines
    before its own load_dotenv(), so a model set in server/.env used to resolve
    to the default while the startup log — which runs after dotenv — still
    showed the override as active. model_config reads the file itself to close
    that gap. Path resolution is relative to model_config.py rather than the
    process cwd, so server/.env is found however the server was launched.
    """
    with patch("dotenv.dotenv_values", return_value={"AGENT_MODEL": "gpt-5.6-sol"}):
        mc = _reload_model_config()

    assert mc.AGENT_MODEL == "gpt-5.6-sol"


def test_dotenv_outranks_ambient_env(clean_model_env, monkeypatch):
    """`.env` beats the environment, matching main.py's load_dotenv(override=True)."""
    monkeypatch.setenv("AGENT_MODEL", "gpt-5.6-luna")

    with patch("dotenv.dotenv_values", return_value={"AGENT_MODEL": "gpt-5.6-sol"}):
        mc = _reload_model_config()

    assert mc.AGENT_MODEL == "gpt-5.6-sol"


def test_dotenv_read_does_not_mutate_the_environment(clean_model_env):
    """Reading .env must not write to os.environ.

    Regression test for a second-order bug: an earlier revision called
    load_dotenv(override=True) here, which replaced the dummy API keys that
    conftest.py installs before importing app modules. That flipped
    test_guardrail_eval.py's "is this a real key" check partway through
    collection and pointed its live-API suite at production during an ordinary
    `pytest` run. Config this module reads must stay scoped to this module.
    """
    sentinel = "test-openai-key-sentinel"
    os.environ["OPENAI_API_KEY"] = sentinel

    dotenv_contents = {
        "AGENT_MODEL": "gpt-5.6-sol",
        "OPENAI_API_KEY": "sk-a-real-looking-production-key",
    }
    with patch("dotenv.dotenv_values", return_value=dotenv_contents):
        mc = _reload_model_config()

    assert mc.AGENT_MODEL == "gpt-5.6-sol"  # .env still reaches the model names
    assert os.environ["OPENAI_API_KEY"] == sentinel  # but nothing else moved
    assert "AGENT_MODEL" not in os.environ
