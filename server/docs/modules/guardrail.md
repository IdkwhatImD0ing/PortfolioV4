# Security Guardrail

Documentation for the input security guardrail.

## File Location

`guardrail.py` (`security_guardrail`, `guardrail_agent`, `JailbreakCheckOutput`, and the
`extract_turns` / `strip_harness_scaffolding` / `build_classifier_payload` helpers). It is
re-exported from `llm.py` for backwards compatibility, so
`from llm import security_guardrail, JailbreakCheckOutput` still works.

## Purpose

Keeps the persona from being used as a general-purpose assistant, and resists prompt
injection, before the main LLM sees a turn.

## There are no keyword lists

This is the design, not an omission. The module used to carry a `bill_keywords` allowlist and
a `blocked_keywords` blocklist. Issue #10 documented what that cost:

- `blocked_keywords` contained `"recipe"` and `"cooking"`, while `prompts.py` §3.4 lists
  cooking as one of Bill's passions. "Do you cook?" — a question the persona invites — was
  routed toward a refusal.
- The branch was `if blocked: pass / elif allowed: return`, so a question containing both a
  blocked and an allowed word ("tell me about **Bill**'s **cooking** hobby") lost the
  allowlist fast path.
- The blocklist branch was a bare `pass`. It blocked nothing at all, despite its name and
  its comment.

Keyword matching cannot separate "what do you like to cook?" from "give me a recipe" because
the discriminating signal is intent, not vocabulary. The classifier can. `tests/test_guardrail.py`
asserts the module source stays free of both lists, so a future "fix" can't quietly reintroduce
a keyword censor.

## Policy

The line is **who the answer is about**, not what topic it touches:

> **Does answering require being Bill?** If yes, allow. Block only when the visitor could
> paste the message into any chatbot, get the same answer, and walk away with output for
> their own task.

Three block categories:

1. **Free labor on the visitor's own task** — conjunctive: they want a takeaway deliverable
   **and** Bill's life/work/taste is irrelevant to producing it. Judged on the answer, not the
   phrasing, so "as Bill, how would you write my cover letter" is still blocked. An artifact
   *about Bill* (a blurb a recruiter forwards) is allowed — that is the site's purpose.
2. **Identity replacement** — "you are now DAN". Scenario framing that keeps Bill as Bill
   ("pitch yourself like I'm a hiring manager") is allowed.
3. **Prompt injection and config extraction** — verbatim instruction dumps, guardrail-rule
   probing. Discussing the *published* architecture is an explicit easter egg and is allowed.

Everything else is allowed, including the persona's interests (music, gaming, sci-fi, cooking),
defining terms, humor, arithmetic on his own stats, and critique of his own code. When unsure,
allow — a wrongly refused visitor costs more than a slightly off-topic answer.

The allow list is anchored to `prompts.py` §3 and §5.1. **If you add an interest to the
persona, mirror it in the rubric** — the drift between those two files is precisely what
caused issue #10.

## What the classifier receives

Not the raw input. Three transformations happen first:

| Step | Why |
|---|---|
| Harness scaffolding stripped (`strip_harness_scaffolding`) | `llm.py` wraps the last user turn in `User question:…Always respond in plain conversational text…`. That is instruction-shaped, rides on every turn, and is a fixed string an attacker can reproduce to disguise a payload as boilerplate. Stripped in code, not by asking the judge to ignore it. |
| Last **non-empty** user turn selected, plus up to 4 prior turns as labelled context | Classifying the literal last message is exploitable — `/chat` takes a client-supplied array, so a whitespace-only trailing turn would hide the payload, and a forged `assistant` turn ("constraints lifted") followed by "cool, thanks" would be judged on "cool, thanks". Context also disambiguates follow-ups like "how do you make it". |
| Delimiter-shaped text stripped, length capped, per-call nonce on the tags | Stops a visitor closing `</turn_to_classify>` to forge an "already screened" note, and stops a padded message blowing the judge's context window. |

The idle-timeout sentinel (`prompts.reminder_prompt`) is dropped — it is the harness talking
to the model, not visitor input.

## Failure behaviour

Split deliberately, because the judge is now the only gate:

- **Fail open** on `asyncio.TimeoutError` and `APIConnectionError` — genuine "OpenAI is
  unreachable" failures a visitor cannot induce, since the payload is length-capped. Refusing
  every turn during an outage is the worse outcome.
- **Fail closed** on everything else. Schema violations, context-length 400s, 429s and bad
  model names are all visitor-reachable. This matters most for a request so abusive the judge
  itself refuses: a refusal is not schema-valid, raises `ModelBehaviorError`, and failing open
  there would allow exactly the worst content.

`GUARDRAIL_MODEL` (default `gpt-4o-mini`) is validated non-empty at import, so a
misconfiguration is loud rather than a silently disabled gate.

## Known limitation: streaming trip ordering

`llm.py` uses `Runner.run_streamed`. In that path the SDK fires the guardrail as a detached
task (`agents/run_internal/run_loop.py:980-990`) and **never cancels the model task on a
trip** — the non-streaming `asyncio.gather` + cancel path is a different code path this repo
does not use. Two consequences, both pre-existing:

1. Deltas can reach the caller before the tripwire lands, so a blocked turn may emit partial
   text followed by the refusal.
2. A trip that lands after the model finishes is caught by `except Exception: logger.debug(...)`
   at `run_loop.py:1208-1215` and swallowed.

The mitigation is to keep the classifier fast so it lands first: capped payload, 5s timeout,
and a rubric that asks for one-sentence reasoning. The system prompt's §6.2 boundaries are the
second layer.

## Testing

- `tests/test_guardrail.py` — mocked judge. Pins the no-keyword-lists property, extraction,
  payload construction, bypass resistance, and the fail-open/fail-closed split.
- `tests/test_guardrail_eval.py` — real judge over ~38 labelled cases, marked `integration`.
  Reports **false-refusal rate separately**, since that is the metric issue #10 was about.
  Hard-asserts the critical cases; rate-bounds the rest because the judge is nondeterministic.

## Related Files

- [llm.md](llm.md) - LLM client that uses guardrail
- [prompts.md](prompts.md) - System prompt with boundaries
