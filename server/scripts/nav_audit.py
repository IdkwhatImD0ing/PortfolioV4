"""Navigation audit: does each question move the page where a visitor expects?

Asks the real agent a list of ordinary visitor questions and checks which
section of the page each one ends on. A miss is a question whose answer never
navigates, or navigates somewhere else: "where do you currently work?" with no
way to reach the Experience section, say.

The agent runs exactly as in production (voice prompt, tools, model, settings)
except for the guardrail, which isn't what's under test. Tool calls are mapped
to sections through server/navigation.py and the client's own PAGE_TO_SECTION,
read from client/src/lib/voice-bus.ts, so the audit can't drift from the site.

Makes real OpenAI (and, for project questions, Pinecone) calls: roughly one to
three model requests per question per run.

    uv run python scripts/nav_audit.py              # voice, 2 runs per question
    uv run python scripts/nav_audit.py --runs 3 --mode text
    uv run python scripts/nav_audit.py --only experience

Add a case whenever a question should have moved the page and didn't.
"""

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))
os.chdir(SERVER)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(SERVER / ".env")

from agents import RunItemStreamEvent, Runner, set_tracing_disabled  # noqa: E402

from custom_types import ResponseRequiredRequest, Utterance  # noqa: E402
from llm import LlmClient  # noqa: E402
from navigation import tool_call_to_metadata  # noqa: E402

VOICE_BUS = SERVER.parent / "client" / "src" / "lib" / "voice-bus.ts"
GREETING = "Hey, I'm Bill. How can I help you?"

# (question, sections the page may end on). Section ids are the DOM ids in
# client/src/components/sections.
CASES: list[tuple[str, set[str]]] = [
    ("Where do you currently work?", {"experience"}),
    ("What's your work experience?", {"experience"}),
    ("What do you do at Pinterest?", {"experience"}),
    ("Where did you work before Pinterest?", {"experience"}),
    ("Tell me about yourself.", {"about"}),
    ("Who are you?", {"about"}),
    ("Where did you go to school?", {"education"}),
    ("What did you study in college?", {"education"}),
    ("Can I see your resume?", {"resume"}),
    ("Do you have a CV I can download?", {"resume"}),
    ("What projects have you built?", {"projects"}),
    ("Tell me about Dispatch AI.", {"projects"}),
    ("Show me GitPT.", {"projects"}),
    ("How many hackathons have you won?", {"hackathons"}),
    ("Show me where you've competed in hackathons.", {"hackathons"}),
    ("What programming languages do you know?", {"skills"}),
    ("What's your tech stack?", {"skills"}),
    ("How does this website work?", {"architecture"}),
    ("What's under the hood of this voice agent?", {"architecture"}),
    ("What do you do for fun?", {"personal"}),
    ("What are your hobbies outside of work?", {"personal"}),
    ("Take me back to the top of the page.", {"hero"}),
]


def page_to_section() -> dict[str, str]:
    """PAGE_TO_SECTION from voice-bus.ts: the client's page -> section map."""
    source = VOICE_BUS.read_text(encoding="utf-8")
    block = re.search(r"PAGE_TO_SECTION[^{]*\{(.*?)\};", source, re.S)
    if not block:
        raise SystemExit(f"PAGE_TO_SECTION not found in {VOICE_BUS}")
    return dict(re.findall(r"(\w+):\s*\"([\w-]+)\"", block.group(1)))


async def ask(client: LlmClient, question: str, sections: dict[str, str], mode: str):
    """One run: the sections visited, in order, and the start of the reply."""
    if mode == "voice":
        request = ResponseRequiredRequest(
            interaction_type="response_required",
            response_id=1,
            transcript=[Utterance(role="agent", content=GREETING), Utterance(role="user", content=question)],
        )
        messages = client.prepare_prompt(request)
    else:
        messages = [{"role": "assistant", "content": GREETING}, {"role": "user", "content": question}]

    visited: list[str] = []
    tools: list[str] = []
    result = Runner.run_streamed(client.agent, messages)
    async for event in result.stream_events():
        if isinstance(event, RunItemStreamEvent) and event.name == "tool_called":
            raw = event.item.raw_item
            name = getattr(raw, "name", "")
            tools.append(name)
            meta = tool_call_to_metadata(name, getattr(raw, "arguments", "") or "")
            if meta and meta.get("page") in sections:
                visited.append(sections[meta["page"]])
    reply = str(result.final_output or "").replace("\n", " ")
    return visited, tools, reply


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--runs", type=int, default=2, help="runs per question (answers vary)")
    parser.add_argument("--mode", choices=("voice", "text"), default="voice")
    parser.add_argument("--only", help="only questions expecting this section")
    parser.add_argument("--concurrency", type=int, default=6)
    args = parser.parse_args()

    set_tracing_disabled(True)
    sections = page_to_section()
    cases = [c for c in CASES if not args.only or args.only in c[1]]
    unknown = {s for _, want in cases for s in want} - set(sections.values()) - {"hero"}
    gate = asyncio.Semaphore(args.concurrency)

    async def run(question: str):
        async with gate:
            client = LlmClient(f"nav-audit-{args.mode}", mode=args.mode)
            return await ask(client, question, sections, args.mode)

    jobs = [[run(q) for _ in range(args.runs)] for q, _ in cases]
    results = await asyncio.gather(*(asyncio.gather(*j) for j in jobs))

    passed = 0
    print(f"\nNavigation audit, {args.mode} mode, {args.runs} run(s) per question\n")
    for (question, want), runs in zip(cases, results):
        # A run passes when the page ends on an expected section.
        ok = [bool(v) and v[-1] in want for v, _, _ in runs]
        passed += all(ok)
        mark = "PASS" if all(ok) else ("FLAKY" if any(ok) else "MISS")
        print(f"{mark:5}  {question}")
        print(f"       want: {' or '.join(sorted(want))}")
        for (visited, tools, reply), good in zip(runs, ok):
            where = " -> ".join(visited) if visited else "(page didn't move)"
            print(f"       {'ok ' if good else 'no '} {where:24}  tools: {', '.join(tools) or '-'}")
            if not good:
                print(f"           said: {reply[:110]}")
    print(f"\n{passed}/{len(cases)} questions land on the right section every run.")
    if unknown:
        print(f"No navigation reaches these sections at all: {', '.join(sorted(unknown))}")


if __name__ == "__main__":
    asyncio.run(main())
