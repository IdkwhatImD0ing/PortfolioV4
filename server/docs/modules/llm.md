# LlmClient Module

Documentation for the LLM client class that handles voice responses.

## File Location

`llm.py` (`LlmClient`, plus the `screened_stream` helper that runs the guardrail)

## Purpose

The `LlmClient` class manages:
- OpenAI Agents SDK integration
- Tool registration and execution
- Streaming response generation
- Security guardrail integration

## Class Definition

```python
class LlmClient:
    def __init__(self, call_id: str, mode: str = "voice", debug=None):
        self.call_id = call_id
        self.mode = mode

        # The prompt varies by mode; reasoning is "none" in both, for minimum
        # TTFT on voice and to keep the two modes from drifting apart.
        system_prompt = voice_system_prompt if mode == "voice" else text_system_prompt
        reasoning_effort = "none"

        # No input_guardrails: screened_stream runs the guardrail beside the run.
        self.agent = Agent(
            name="portfolio_agent",
            instructions=system_prompt,
            model=AGENT_MODEL,  # "gpt-5.6-terra"
            tools=self.prepare_functions(),
            model_settings=ModelSettings(
                verbosity="low",
                reasoning=Reasoning(
                    effort=reasoning_effort,
                    summary="auto",
                ),
            ),
        )
        self.debug = debug or os.getenv("LLM_DEBUG", "0") == "1"
```

> **Model name:** every model this server calls is declared in
> `model_config.py`, not at the call site. `llm.py` imports `AGENT_MODEL` and
> `REASONING_EFFORT` from there; the stream log and `debug_agent.py` import the
> same constant rather than repeating the literal. Each name is overridable by
> an env var of the same name, so a model can be swapped or rolled back per
> deploy without a code change.

> **SDK requirement:** `effort="none"` requires `openai>=2.25` (added alongside
> `gpt-5.4`). The pinned versions in `requirements.txt` are
> `openai==2.32.0` and `openai-agents==0.14.4`. Older `openai` builds (≤ 1.x)
> only accept `minimal | low | medium | high` and will raise a Pydantic
> `literal_error` for `"none"`.

## Key Methods

### draft_begin_message()

Returns the initial greeting response.

```python
def draft_begin_message(self):
    return ResponseResponse(
        response_id=0,
        content=begin_sentence,  # "Hey, I'm Bill. How can I help you?"
        content_complete=True,
        end_call=False,
    )
```

### prepare_prompt()

Converts Retell transcript to OpenAI message format.

```python
def prepare_prompt(self, request: ResponseRequiredRequest):
    prompt = [{"role": "system", "content": system_prompt}]
    
    for utterance in request.transcript:
        if utterance.role == "agent":
            prompt.append({"role": "assistant", "content": utterance.content})
        else:
            prompt.append({"role": "user", "content": utterance.content})
    
    # Add voice instruction to last user message
    if last_user_message:
        last_user_message += "\nThis is a VOICE conversation..."
    
    return prompt
```

### draft_response()

Main streaming response generator.

```python
async def draft_response(self, request: ResponseRequiredRequest):
    prompt = self.prepare_prompt(request)
    messages = [m for m in prompt if m.get("role") != "system"]
    
    # The agent streams at once; the guardrail judges the turn beside it
    # (before it on an idle reminder). The real code enters this and the
    # trace through one AsyncExitStack.
    async with screened_stream(
        self.agent, messages, screen_first=self._screens_first(request)
    ) as events:
        async for event in events:
            if isinstance(event, GuardrailTripped):
                # Close open tool calls, stop mid-answer and apologise
                # (see Error Handling below)
                yield ResponseResponse(content=guardrail_interruption_message, content_complete=True)
                return

            if isinstance(event, RawResponsesStreamEvent):
                # Handle text deltas
                yield ResponseResponse(content=delta, ...)

            elif isinstance(event, RunItemStreamEvent):
                if event.name == "tool_called":
                    # Handle tool invocation
                    yield ToolCallInvocationResponse(...)
                    yield MetadataResponse(...)  # For navigation

                elif event.name == "tool_output":
                    yield ToolCallResultResponse(...)

    yield ResponseResponse(content_complete=True)
```

On an idle reminder (`reminder_required`), `_screens_first` is true, so `screened_stream`
judges the turn before the model starts instead of beside it. If the guardrail trips and the
agent already replied to the turn being re-judged, `_refusal_for` says
`reminder_checkin_message` instead of repeating the refusal. See
[guardrail.md](guardrail.md#what-the-classifier-receives).

### prepare_functions()

Returns the list of available tools.

```python
def prepare_functions(self) -> List[Any]:
    return [
        display_education_page,
        display_hackathons_page,
        display_homepage,
        display_landing_page,
        display_resume_page,
        display_architecture_page,
        display_experience_page,
        display_skills_page,
        display_personal_page,
        display_projects_page,
        display_project,
        search_projects,
        get_project_details,
    ]
```

## Event Types

### RawResponsesStreamEvent

Text content deltas from the LLM:

```python
if getattr(data, "type", "") == "response.output_text.delta":
    delta_content = getattr(data, "delta", "")
    yield ResponseResponse(content=delta_content, content_complete=False)
```

### RunItemStreamEvent

Tool calls and outputs:

```python
if event.name == "tool_called":
    # Tool is being invoked
    yield ToolCallInvocationResponse(
        tool_call_id=call_id,
        name=name,
        arguments=args,
    )

elif event.name == "tool_output":
    # Tool has returned
    yield ToolCallResultResponse(
        tool_call_id=call_id,
        content=str(output),
    )
```

### Text Chat Status Events

In text chat mode (`draft_text_response`), the LLM client emits `status` events
to the frontend so users can see what the agent is doing:

- `"Thinking..."` — emitted immediately when the stream starts
- `"Searching projects..."` — emitted when `search_projects` is called
- `"<message>"` — emitted when `get_project_details` is called (uses the tool's `message` arg)

Status events use `TextChatStreamChunk(type="status", content="...")`. The frontend
accumulates these as a list of steps with the profile avatar. Each step shows a spinner
while active; when the next status or first content chunk arrives, previous steps switch
to a checkmark. After the stream ends, completed steps linger briefly then fade out.

## Navigation Message Pattern

Navigation display tools do not have a `message` parameter. They only emit navigation metadata when called:

```python
if name == "display_education_page":
    yield MetadataResponse(
        metadata={"type": "navigation", "page": "education"}
    )
```

## Error Handling

### Guardrail Trigger

`screened_stream(agent, messages)` runs the agent's streamed run and the input
guardrail side by side. When the guardrail trips it cancels the run and yields a
`GuardrailTripped` marker as its last item. Each path handles that marker:

```python
# Text chat: withdraw whatever streamed, show the refusal instead.
yield TextChatStreamChunk(type="replace", content=guardrail_refusal_message)

# Voice: speech can't be withdrawn, so stop and apologise.
yield ResponseResponse(
    content=guardrail_interruption_message if spoke else self._refusal_for(request),
    content_complete=True,
)
```

`screened_stream` also waits for the verdict before it ends, so `done` (text) and
the closing `content_complete=True` (voice) never go out while a turn is still
being judged. See [guardrail.md](guardrail.md#how-a-trip-reaches-the-visitor)
for why this replaced the SDK's `input_guardrails` hook.

`_refusal_for` gives `prompts.guardrail_refusal_message` in every case but one: a
voice reminder that trips after the agent already replied says
`prompts.reminder_checkin_message` instead. All three messages live in `prompts.py`
and deliberately name the hobbies — the old copy listed only "background,
education, projects, and professional experience", which told visitors that music
and cooking were off-limits (issue #10).

### General Errors

```python
except Exception as e:
    print(f"Error: {e}\n{traceback.format_exc()}")
    yield ResponseResponse(content="", content_complete=True)
```

## Debug Logging

Enable with `LLM_DEBUG=1`:

```python
self._log(f"draft_response: call_id={self.call_id} messages={len(messages)}")

def _log(self, *args, **kwargs):
    if self.debug:
        print(*args, **kwargs, flush=True)
```

## Model Configuration

```python
model_settings=ModelSettings(
    verbosity="low",
    reasoning=Reasoning(
        effort=reasoning_effort,  # "none" in both voice and text
        summary="auto",
    ),
)
```

Valid `effort` values on `gpt-5.6-terra`:
`none | low | medium | high | xhigh | max` (`medium` is the model default).
`"none"` skips the reasoning phase entirely, which is what both modes use to
minimize time-to-first-token.

## Modifications

### Change Model

Set the env var — no code change, and it rolls back the same way:

```bash
AGENT_MODEL=gpt-5.6-sol
```

To change the default, edit `model_config.py` (not the call site — the log line
and `debug_agent.py` both read the same constant):

```python
AGENT_MODEL = _model_from_env("AGENT_MODEL", "gpt-5.6-sol")
```

### Add Custom Tool

1. Define the tool function (see [../tools/navigation.md](../tools/navigation.md))
2. Add to `prepare_functions()`
3. Handle in `draft_response()` if needed

### Adjust Reasoning

```python
reasoning=Reasoning(
    effort="high",  # More reasoning
    summary="detailed",
)
```

## Related Files

- [guardrail.md](guardrail.md) - Security guardrail
- [prompts.md](prompts.md) - System prompt
- [../tools/](../tools/) - Tool definitions
- `custom_types.py` - Response types
