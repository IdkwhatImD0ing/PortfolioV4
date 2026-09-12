#!/usr/bin/env python3
"""
Debug script for the portfolio agent.

Sends a message (or conversation) to the agent and prints every event:
tool calls with full arguments, tool results, text deltas, metadata,
guardrail outcomes, and Pinecone search results.

Usage:
    # Single message
    python debug_agent.py "What are your best voice AI projects?"

    # Multi-turn (semicolon-separated)
    python debug_agent.py "What are your best voice AI projects?" "give me the top 10"

    # Direct Pinecone search (bypass agent)
    python debug_agent.py --search "voice AI projects" --top-k 10

    # List all vectors in the index
    python debug_agent.py --list-all
"""

import argparse
import asyncio
import json
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv(override=True)

# ── Colours for terminal output ──────────────────────────────────────────────
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
MAGENTA = "\033[35m"
CYAN = "\033[36m"
WHITE = "\033[37m"


def header(title: str):
    width = 70
    print(f"\n{BOLD}{CYAN}{'═' * width}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'═' * width}{RESET}\n")


def section(title: str):
    print(f"\n{BOLD}{YELLOW}── {title} {'─' * (50 - len(title))}{RESET}")


def kv(key: str, value, color=WHITE):
    print(f"  {DIM}{key}:{RESET} {color}{value}{RESET}")


# ── Direct Pinecone search ───────────────────────────────────────────────────
async def direct_search(query: str, top_k: int):
    """Call Pinecone directly, bypassing the agent, to see raw results."""
    from pinecone import PineconeAsyncio

    from project_search import get_embedding, search_projects

    header(f"Direct Pinecone Search: \"{query}\" (top_k={top_k})")

    pc = PineconeAsyncio(api_key=os.getenv("PINECONE_API_KEY"))

    section("Index Stats")
    async with pc.IndexAsyncio("portfolio") as index:
        stats = await index.describe_index_stats()
        print(f"  Total vectors: {BOLD}{GREEN}{stats.total_vector_count}{RESET}")
        if stats.namespaces:
            for ns, ns_stats in stats.namespaces.items():
                ns_label = ns if ns else "(default)"
                print(f"  Namespace '{ns_label}': {ns_stats.vector_count} vectors")

    section("Embedding Query")
    t0 = time.perf_counter()
    embedding = await get_embedding(query)
    elapsed = time.perf_counter() - t0
    print("  Model: text-embedding-3-large")
    print(f"  Dimensions: {len(embedding)}")
    print(f"  Time: {elapsed:.3f}s")

    section(f"Search Results ({top_k} requested)")
    t0 = time.perf_counter()
    results = await search_projects(query, top_k=top_k)
    elapsed = time.perf_counter() - t0
    print(f"  Returned: {BOLD}{len(results)}{RESET} results in {elapsed:.3f}s\n")

    for i, proj in enumerate(results, 1):
        score_color = GREEN if proj["score"] > 0.5 else YELLOW if proj["score"] > 0.3 else RED
        print(f"  {BOLD}{i:2d}. {proj['name']}{RESET}")
        print(f"      ID:    {DIM}{proj['id']}{RESET}")
        print(f"      Score: {score_color}{proj['score']}{RESET}")
        print(f"      Summary: {DIM}{proj['summary'][:120]}{'...' if len(proj['summary']) > 120 else ''}{RESET}")
        if proj.get("github"):
            print(f"      GitHub: {DIM}{proj['github']}{RESET}")
        print()


# ── List all vectors ─────────────────────────────────────────────────────────
async def list_all_vectors():
    """List every vector ID and name in the Pinecone index."""
    from pinecone import PineconeAsyncio

    header("All Vectors in 'portfolio' Index")

    pc = PineconeAsyncio(api_key=os.getenv("PINECONE_API_KEY"))

    async with pc.IndexAsyncio("portfolio") as index:
        stats = await index.describe_index_stats()
        total = stats.total_vector_count
        print(f"  Total vectors: {BOLD}{GREEN}{total}{RESET}\n")

        # Pinecone list() paginates through all vector IDs
        all_ids = []
        async for id_list in index.list():
            all_ids.extend(id_list)

        if not all_ids:
            print(f"  {RED}No vectors found (list returned empty).{RESET}")
            print(f"  {DIM}This might mean the index uses namespaces. Try checking stats above.{RESET}")
            return

        # Fetch metadata in batches of 100
        section(f"Fetching metadata for {len(all_ids)} vectors")
        batch_size = 100
        all_projects = []
        for start in range(0, len(all_ids), batch_size):
            batch = all_ids[start : start + batch_size]
            result = await index.fetch(ids=batch)
            for vid, vec in result.vectors.items():
                meta = vec.metadata or {}
                all_projects.append({
                    "id": vid,
                    "name": meta.get("name", "???"),
                    "summary": meta.get("summary", ""),
                })

        all_projects.sort(key=lambda p: p["name"].lower())

        for i, proj in enumerate(all_projects, 1):
            print(f"  {BOLD}{i:3d}. {proj['name']}{RESET}")
            print(f"       ID: {DIM}{proj['id']}{RESET}")
            if proj["summary"]:
                print(f"       {DIM}{proj['summary'][:100]}{'...' if len(proj['summary']) > 100 else ''}{RESET}")
            print()


# ── Agent conversation debug ─────────────────────────────────────────────────
async def run_agent_debug(user_messages: list[str], mode: str = "text"):
    """Send messages through the full agent pipeline and log everything."""
    from contextlib import AsyncExitStack

    from agents import RawResponsesStreamEvent, RunItemStreamEvent, trace

    from llm import GuardrailTripped, LlmClient, screened_stream
    from model_config import AGENT_MODEL
    from prompts import guardrail_refusal_message

    header("Agent Debug Session")
    kv("Mode", mode)
    kv("Model", AGENT_MODEL)
    kv("Messages", len(user_messages))
    for i, msg in enumerate(user_messages):
        print(f"  {DIM}[{i+1}]{RESET} {msg}")

    conversation: list[dict] = []
    llm_client = LlmClient(call_id="debug-session", mode=mode, debug=True)

    for turn_num, user_msg in enumerate(user_messages, 1):
        section(f"Turn {turn_num}: User says \"{user_msg}\"")

        conversation.append({"role": "user", "content": user_msg})

        # Build processed messages the same way draft_text_response does
        processed = []
        for i, msg in enumerate(conversation):
            if i == len(conversation) - 1 and msg["role"] == "user":
                processed.append({
                    "role": "user",
                    "content": (
                        f"User question: {msg['content']}\n\n"
                        "This is a TEXT chat. Use markdown formatting: "
                        "**bold** for emphasis, `code` for tech terms, and bullet points for lists."
                    ),
                })
            else:
                processed.append(msg)

        kv("Processed messages count", len(processed))
        print()

        full_text = ""
        tool_calls_log = []
        tool_results_log = []
        metadata_events = []
        event_count = 0
        t0 = time.perf_counter()

        try:
            async with AsyncExitStack() as stack:
                stack.enter_context(trace(
                    workflow_name="debug_session",
                    group_id="debug",
                    metadata={"mode": mode, "turn": str(turn_num)},
                ))
                # Same path as production: the guardrail runs beside the agent.
                events = await stack.enter_async_context(
                    screened_stream(llm_client.agent, processed)
                )
                async for event in events:
                    event_count += 1

                    if isinstance(event, GuardrailTripped):
                        # The run was cancelled; production swaps the reply for
                        # the refusal at this point.
                        print(f"\n  {BOLD}{RED}🚫 GUARDRAIL BLOCKED THIS MESSAGE{RESET}")
                        print(f"     {RED}{event.verdict}{RESET}")
                        print(f"     {DIM}(withdrawn after {len(full_text)} chars had streamed){RESET}")
                        # What the chat panel is left showing and sends back as history.
                        full_text = guardrail_refusal_message
                        break

                    if isinstance(event, RawResponsesStreamEvent):
                        data = event.data
                        event_type = getattr(data, "type", "")

                        if event_type == "response.output_text.delta":
                            delta = getattr(data, "delta", "")
                            if delta:
                                full_text += delta
                                # Print dots for streaming progress
                                sys.stdout.write(f"{DIM}.{RESET}")
                                sys.stdout.flush()

                        elif event_type == "response.reasoning_summary_text.delta":
                            reasoning = getattr(data, "delta", "")
                            if reasoning:
                                sys.stdout.write(f"{MAGENTA}r{RESET}")
                                sys.stdout.flush()

                        elif event_type not in (
                            "response.created",
                            "response.in_progress",
                            "response.output_item.added",
                            "response.output_item.done",
                            "response.content_part.added",
                            "response.content_part.done",
                            "response.output_text.done",
                            "response.completed",
                            "response.reasoning_summary_text.done",
                            "response.reasoning_summary_part.added",
                            "response.reasoning_summary_part.done",
                        ):
                            print(f"\n  {DIM}[raw event] {event_type}{RESET}")

                    elif isinstance(event, RunItemStreamEvent):
                        if event.name == "tool_called":
                            tool_call = event.item.raw_item
                            name = getattr(tool_call, "name", "")
                            args_str = getattr(tool_call, "arguments", "") or ""
                            call_id = getattr(tool_call, "call_id", getattr(tool_call, "id", ""))

                            try:
                                args_parsed = json.loads(args_str) if args_str else {}
                            except json.JSONDecodeError:
                                args_parsed = {"_raw": args_str}

                            entry = {
                                "call_id": call_id,
                                "name": name,
                                "args": args_parsed,
                            }
                            tool_calls_log.append(entry)

                            print(f"\n  {BOLD}{GREEN}🔧 TOOL CALL: {name}{RESET}")
                            print(f"     call_id: {DIM}{call_id}{RESET}")
                            print(f"     args: {CYAN}{json.dumps(args_parsed, indent=2)}{RESET}")

                            # Show the navigation action that would fire on the frontend
                            nav_map = {
                                "display_homepage": ("personal", None),
                                "display_landing_page": ("landing", None),
                                "display_education_page": ("education", None),
                                "display_resume_page": ("resume", None),
                                "display_hackathons_page": ("hackathon", None),
                                "display_architecture_page": ("architecture", None),
                            }
                            if name in nav_map:
                                page, _ = nav_map[name]
                                print(f"     {BOLD}{MAGENTA}📍 ACTION → navigate to '{page}'{RESET}")
                                metadata_events.append({"type": "navigation", "page": page})
                            elif name == "display_project":
                                pid = args_parsed.get("id", "???")
                                print(f"     {BOLD}{MAGENTA}📍 ACTION → navigate to project '{pid}'{RESET}")
                                metadata_events.append({"type": "navigation", "page": "project", "project_id": pid})
                            elif name == "search_projects":
                                nk = args_parsed.get("num_results", 3)
                                q = args_parsed.get("query", "")
                                print(f"     {BOLD}{MAGENTA}🔍 ACTION → Pinecone search: \"{q}\" (num_results={nk}){RESET}")
                            elif name == "get_project_details":
                                pid = args_parsed.get("project_id", "???")
                                print(f"     {BOLD}{MAGENTA}📄 ACTION → fetch details for '{pid}'{RESET}")

                        elif event.name == "tool_output":
                            output_item = event.item
                            call_id = getattr(output_item.raw_item, "call_id", "")
                            output_text = str(output_item.output)

                            entry = {
                                "call_id": call_id,
                                "output": output_text,
                            }
                            tool_results_log.append(entry)

                            # Truncate long outputs for display
                            display_output = output_text
                            if len(display_output) > 500:
                                display_output = display_output[:500] + f"\n     {DIM}... ({len(output_text)} chars total){RESET}"

                            print(f"\n  {BOLD}{BLUE}📦 TOOL RESULT:{RESET}")
                            print(f"     call_id: {DIM}{call_id}{RESET}")
                            print(f"     output:\n{BLUE}{display_output}{RESET}")

                        else:
                            print(f"\n  {DIM}[item event] {event.name}{RESET}")

                    else:
                        print(f"\n  {DIM}[unknown event] {type(event).__name__}{RESET}")

        except Exception as e:
            print(f"\n  {BOLD}{RED}❌ ERROR: {e}{RESET}")
            import traceback
            traceback.print_exc()
            continue

        elapsed = time.perf_counter() - t0
        print()  # newline after streaming dots

        section("Turn Summary")
        kv("Events processed", event_count)
        kv("Tool calls", len(tool_calls_log), GREEN if tool_calls_log else RED)
        kv("Tool results", len(tool_results_log))
        kv("Response length", f"{len(full_text)} chars")
        kv("Time", f"{elapsed:.2f}s")

        if metadata_events:
            section("Navigation Actions (what the frontend would do)")
            for meta in metadata_events:
                page = meta.get("page", "?")
                pid = meta.get("project_id", "")
                if pid:
                    print(f"  {MAGENTA}→ Navigate to page '{page}', project_id='{pid}'{RESET}")
                else:
                    print(f"  {MAGENTA}→ Navigate to page '{page}'{RESET}")

        if tool_calls_log:
            section("Tool Calls Detail")
            for tc in tool_calls_log:
                print(f"  {GREEN}{tc['name']}{RESET}({json.dumps(tc['args'])})")
                # Find matching result
                matching = [r for r in tool_results_log if r["call_id"] == tc["call_id"]]
                if matching:
                    out = matching[0]["output"]
                    lines = out.strip().split("\n")
                    if len(lines) > 15:
                        for line in lines[:15]:
                            print(f"    {DIM}{line}{RESET}")
                        print(f"    {DIM}... ({len(lines)} lines total){RESET}")
                    else:
                        for line in lines:
                            print(f"    {DIM}{line}{RESET}")
                print()

        section("Agent Response")
        print(f"{full_text}\n")

        # Add assistant response to conversation for multi-turn
        conversation.append({"role": "assistant", "content": full_text})


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Debug the portfolio agent — trace tool calls, Pinecone results, and more.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "messages",
        nargs="*",
        help="User messages to send (each argument is a turn in the conversation)",
    )
    parser.add_argument(
        "--search",
        type=str,
        help="Run a direct Pinecone search (bypasses the agent entirely)",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=10,
        help="Number of results for --search (default: 10)",
    )
    parser.add_argument(
        "--list-all",
        action="store_true",
        help="List all vectors in the Pinecone index",
    )
    parser.add_argument(
        "--mode",
        choices=["text", "voice"],
        default="text",
        help="Agent mode (default: text)",
    )

    args = parser.parse_args()

    if args.list_all:
        asyncio.run(list_all_vectors())
    elif args.search:
        asyncio.run(direct_search(args.search, args.top_k))
    elif args.messages:
        asyncio.run(run_agent_debug(args.messages, mode=args.mode))
    else:
        # Default demo: the exact failing conversation
        print(f"{DIM}No arguments given. Running the failing conversation...{RESET}")
        msgs = [
            "What are your best voice AI projects?",
            "give me the top 10",
        ]
        asyncio.run(run_agent_debug(msgs))


if __name__ == "__main__":
    main()
