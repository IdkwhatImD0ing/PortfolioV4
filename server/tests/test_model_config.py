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
    developer running them happens to have a `server/.env`, so load_dotenv is
    neutered for the duration unless a test patches it itself.
    """
    for var in _MODEL_VARS:
        monkeypatch.delenv(var, raising=False)

    with patch("dotenv.load_dotenv", return_value=False):
        yield

    # Clear before reloading: a test that set a blank value would otherwise make
    # this teardown raise the very error it was asserting.
    for var in _MODEL_VARS:
        os.environ.pop(var, None)
    with patch("dotenv.load_dotenv", return_value=False):
        _reload_model_config()


def test_defaults_when_unset(clean_model_env):
    mc = _reload_model_config()

    assert mc.AGENT_MODEL == "gpt-5.6-terra"
    assert mc.GUARDRAIL_MODEL == "gpt-5.6-terra"
    assert mc.SUMMARY_MODEL == "gpt-5.6-luna"
    assert mc.REASONING_EFFORT == "none"


def test_env_var_overrides_default(clean_model_env, monkeypatch):
    monkeypatch.setenv("AGENT_MODEL", "gpt-5.6-sol")
    mc = _reload_model_config()

    assert mc.AGENT_MODEL == "gpt-5.6-sol"
    assert mc.GUARDRAIL_MODEL == "gpt-5.6-terra"  # others untouched


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


def test_dotenv_is_loaded_before_constants_resolve(clean_model_env):
    """`.env` must reach the constants, whoever imports this module first.

    Regression test: main.py imports llm (and so model_config) several lines
    before its own load_dotenv(), so a model set in server/.env used to resolve
    to the default while the startup log — which runs after dotenv — still
    showed the override as active. model_config loads dotenv itself to close
    that gap, and this asserts the ordering rather than the file lookup:
    load_dotenv() resolves relative to model_config.py, so it finds server/.env
    regardless of the process's working directory.
    """

    def fake_load_dotenv(*args, **kwargs):
        os.environ["AGENT_MODEL"] = "gpt-5.6-sol"
        return True

    assert "AGENT_MODEL" not in os.environ
    with patch("dotenv.load_dotenv", side_effect=fake_load_dotenv) as loader:
        mc = _reload_model_config()

    assert loader.called, "model_config must load dotenv itself"
    # override=True matches main.py and debug_agent.py: .env beats the ambient env.
    assert loader.call_args.kwargs.get("override") is True
    assert mc.AGENT_MODEL == "gpt-5.6-sol"
